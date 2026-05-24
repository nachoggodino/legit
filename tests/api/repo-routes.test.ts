import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig, makeTestRepo } from "../fixtures/config";

const getCurrentUser = vi.fn();
const loadConfig = vi.fn();
const writeMarkdownDocument = vi.fn();
const readMarkdownDocument = vi.fn();
const renameMarkdownDocument = vi.fn();
const deleteMarkdownDocument = vi.fn();
const scanLinkImpact = vi.fn();
const requestOpenAiCompatibleEdit = vi.fn();
const resolveDocumentPath = vi.fn();

const repo = makeTestRepo({ commit: { mode: "direct", targetBranch: "main", branchPrefix: "legit/" } });

vi.mock("@/server/auth", () => ({
  getCurrentUser,
  canReadRepo: (_repo: unknown, user: { role?: string } | null) => Boolean(user),
  canEditRepo: (user: { role?: string } | null) => user?.role === "editor" || user?.role === "admin",
  canUseAi: (config: { ai: { enabled: boolean } }, user: { role?: string } | null) => config.ai.enabled && Boolean(user),
}));

vi.mock("@/server/config", () => ({
  loadConfig,
}));

vi.mock("@/server/docs", async () => {
  const actual = await vi.importActual<typeof import("@/server/docs")>("@/server/docs");
  return {
    ...actual,
    deleteMarkdownDocument,
    readMarkdownDocument,
    renameMarkdownDocument,
    scanLinkImpact,
    writeMarkdownDocument,
    resolveDocumentPath,
  };
});

vi.mock("@/server/ai", async () => {
  const actual = await vi.importActual<typeof import("@/server/ai")>("@/server/ai");
  return {
    ...actual,
    requestOpenAiCompatibleEdit,
  };
});

describe("repo API route protections", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentUser.mockResolvedValue({ id: "editor", role: "editor" });
    loadConfig.mockReturnValue(makeTestConfig({
      ai: {
        enabled: true,
        baseUrlEnv: "AI_BASE_URL",
        apiKeyEnv: "AI_API_KEY",
        defaultModel: "gpt-4o",
        maxContextTokens: 150000,
        allowAnonymous: false,
      },
      repos: [repo],
    }));
    readMarkdownDocument.mockReset();
    writeMarkdownDocument.mockReset();
    renameMarkdownDocument.mockReset();
    deleteMarkdownDocument.mockReset();
    scanLinkImpact.mockReset();
    requestOpenAiCompatibleEdit.mockReset();
    resolveDocumentPath.mockReset();
  });

  it("reads documents for authenticated users", async () => {
    readMarkdownDocument.mockReturnValue({ path: "index.md", source: "# Hello" });
    const { GET } = await import("@/app/api/repos/[repoSlug]/documents/route");
    const request = new Request("https://docs.example.com/api/repos/research/documents?path=index.md");

    const response = await GET(request, { params: Promise.resolve({ repoSlug: "research" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "index.md", source: "# Hello" });
    expect(readMarkdownDocument).toHaveBeenCalledWith(repo, "index.md");
  });

  it("returns not found for missing repos", async () => {
    const { GET } = await import("@/app/api/repos/[repoSlug]/documents/route");
    const request = new Request("https://docs.example.com/api/repos/missing/documents?path=index.md");

    const response = await GET(request, { params: Promise.resolve({ repoSlug: "missing" }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Repository not found." });
  });

  it("rejects cross-origin document mutations before writing", async () => {
    const { POST } = await import("@/app/api/repos/[repoSlug]/documents/route");
    const request = new Request("https://docs.example.com/api/repos/research/documents", {
      method: "POST",
      headers: { origin: "https://evil.example.com", "content-type": "application/json" },
      body: JSON.stringify({ path: "index.md", source: "# Hello" }),
    });

    const response = await POST(request, { params: Promise.resolve({ repoSlug: "research" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid request origin." });
    expect(writeMarkdownDocument).not.toHaveBeenCalled();
  });

  it("requires editor role on create, edit, rename, and delete mutations", async () => {
    getCurrentUser.mockResolvedValue({ id: "viewer", role: "viewer" });
    const route = await import("@/app/api/repos/[repoSlug]/documents/route");
    const cases = [
      { method: "POST", handler: route.POST, body: { path: "index.md", source: "# Hello" } },
      { method: "PUT", handler: route.PUT, body: { path: "index.md", source: "# Hello" } },
      { method: "PATCH", handler: route.PATCH, body: { fromPath: "index.md", toPath: "renamed.md", confirmed: true } },
      { method: "DELETE", handler: route.DELETE, body: { path: "index.md", confirmed: true } },
    ];

    for (const item of cases) {
      const request = new Request("https://docs.example.com/api/repos/research/documents", {
        method: item.method,
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify(item.body),
      });

      const response = await item.handler(request, { params: Promise.resolve({ repoSlug: "research" }) });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Editor role required." });
    }

    expect(writeMarkdownDocument).not.toHaveBeenCalled();
  });

  it("creates, updates, renames, scans, and deletes documents as an editor", async () => {
    writeMarkdownDocument.mockResolvedValueOnce({ path: "new.md", committed: true });
    writeMarkdownDocument.mockResolvedValueOnce({ path: "index.md", committed: true });
    renameMarkdownDocument.mockResolvedValue({ path: "renamed.md", committed: true });
    deleteMarkdownDocument.mockResolvedValue({ path: "old.md", deleted: true });
    scanLinkImpact.mockResolvedValue([{ path: "link.md", line: 3 }]);
    const route = await import("@/app/api/repos/[repoSlug]/documents/route");

    const post = await route.POST(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "POST",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "new.md", source: "# New" }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(post.status).toBe(201);
    expect(await post.json()).toEqual({ path: "new.md", committed: true });
    expect(writeMarkdownDocument).toHaveBeenCalledWith(repo, "new.md", "# New", { create: true, actorId: "editor" });

    const put = await route.PUT(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "PUT",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "index.md", source: "# Updated" }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(await put.json()).toEqual({ path: "index.md", committed: true });
    expect(writeMarkdownDocument).toHaveBeenLastCalledWith(repo, "index.md", "# Updated", { actorId: "editor" });

    const scanRename = await route.PATCH(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "PATCH",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ fromPath: "index.md", scanOnly: true }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(await scanRename.json()).toEqual({ impacts: [{ path: "link.md", line: 3 }] });

    const patch = await route.PATCH(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "PATCH",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ fromPath: "index.md", toPath: "renamed.md", confirmed: true }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(await patch.json()).toEqual({ path: "renamed.md", committed: true });
    expect(renameMarkdownDocument).toHaveBeenCalledWith(repo, "index.md", "renamed.md", { actorId: "editor", confirmed: true });

    const scanDelete = await route.DELETE(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "DELETE",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "old.md", scanOnly: true }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(await scanDelete.json()).toEqual({ impacts: [{ path: "link.md", line: 3 }] });

    const deleted = await route.DELETE(
      new Request("https://docs.example.com/api/repos/research/documents", {
        method: "DELETE",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "old.md", confirmed: true }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(await deleted.json()).toEqual({ path: "old.md", deleted: true });
    expect(deleteMarkdownDocument).toHaveBeenCalledWith(repo, "old.md", { actorId: "editor", confirmed: true });
  });

  it("rejects cross-origin AI edit requests before calling the provider", async () => {
    const { POST } = await import("@/app/api/repos/[repoSlug]/ai/edit/route");
    const request = new Request("https://docs.example.com/api/repos/research/ai/edit", {
      method: "POST",
      headers: { origin: "https://evil.example.com", "content-type": "application/json" },
      body: JSON.stringify({ path: "index.md", source: "# Hello", instruction: "Shorten" }),
    });

    const response = await POST(request, { params: Promise.resolve({ repoSlug: "research" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid request origin." });
    expect(requestOpenAiCompatibleEdit).not.toHaveBeenCalled();
  });

  it("validates and completes AI edit requests", async () => {
    requestOpenAiCompatibleEdit.mockResolvedValue("# Edited");
    const { POST } = await import("@/app/api/repos/[repoSlug]/ai/edit/route");

    const missingInstruction = await POST(
      new Request("https://docs.example.com/api/repos/research/ai/edit", {
        method: "POST",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "index.md", source: "# Hello", instruction: "   " }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );
    expect(missingInstruction.status).toBe(400);
    expect(await missingInstruction.json()).toEqual({ error: "Instruction is required." });

    const response = await POST(
      new Request("https://docs.example.com/api/repos/research/ai/edit", {
        method: "POST",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "index.md", source: "# Hello", instruction: "Shorten" }),
      }),
      { params: Promise.resolve({ repoSlug: "research" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: "# Edited" });
    expect(requestOpenAiCompatibleEdit).toHaveBeenCalled();
  });

  it("requires editor role and AI access for AI edits", async () => {
    const { POST } = await import("@/app/api/repos/[repoSlug]/ai/edit/route");
    const request = () =>
      new Request("https://docs.example.com/api/repos/research/ai/edit", {
        method: "POST",
        headers: { origin: "https://docs.example.com", "content-type": "application/json" },
        body: JSON.stringify({ path: "index.md", source: "# Hello", instruction: "Shorten" }),
      });

    getCurrentUser.mockResolvedValueOnce({ id: "viewer", role: "viewer" });
    const viewer = await POST(request(), { params: Promise.resolve({ repoSlug: "research" }) });
    expect(viewer.status).toBe(403);

    getCurrentUser.mockResolvedValueOnce(null);
    const anonymous = await POST(request(), { params: Promise.resolve({ repoSlug: "research" }) });
    expect(anonymous.status).toBe(403);

    loadConfig.mockReturnValueOnce(makeTestConfig({
      ai: {
        enabled: false,
        baseUrlEnv: "AI_BASE_URL",
        apiKeyEnv: "AI_API_KEY",
        defaultModel: "gpt-4o",
        maxContextTokens: 150000,
        allowAnonymous: false,
      },
      repos: [repo],
    }));
    const aiDisabled = await POST(request(), { params: Promise.resolve({ repoSlug: "research" }) });
    expect(aiDisabled.status).toBe(401);
  });

  it("rejects SVG and unknown asset types", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-assets-"));
    const svgPath = path.join(root, "logo.svg");
    fs.writeFileSync(svgPath, "<svg />", "utf8");
    resolveDocumentPath.mockReturnValue({ docsRoot: root, relativePath: "logo.svg", absolutePath: svgPath });

    const { GET } = await import("@/app/api/repos/[repoSlug]/assets/route");
    const request = new Request("https://docs.example.com/api/repos/research/assets?path=logo.svg");

    const response = await GET(request, { params: Promise.resolve({ repoSlug: "research" }) });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Unsupported asset type." });
  });

  it("serves supported assets and rejects missing or unreadable assets", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-assets-"));
    const pngPath = path.join(root, "logo.png");
    fs.writeFileSync(pngPath, "png-data", "utf8");
    resolveDocumentPath.mockReturnValueOnce({ docsRoot: root, relativePath: "logo.png", absolutePath: pngPath });
    const { GET } = await import("@/app/api/repos/[repoSlug]/assets/route");

    const ok = await GET(new Request("https://docs.example.com/api/repos/research/assets?path=logo.png"), {
      params: Promise.resolve({ repoSlug: "research" }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(await ok.text()).toBe("png-data");

    resolveDocumentPath.mockReturnValueOnce({ docsRoot: root, relativePath: "missing.png", absolutePath: path.join(root, "missing.png") });
    const missing = await GET(new Request("https://docs.example.com/api/repos/research/assets?path=missing.png"), {
      params: Promise.resolve({ repoSlug: "research" }),
    });
    expect(missing.status).toBe(404);

    resolveDocumentPath.mockImplementationOnce(() => {
      throw new Error("Path escapes docs root.");
    });
    const invalid = await GET(new Request("https://docs.example.com/api/repos/research/assets?path=../secret.png"), {
      params: Promise.resolve({ repoSlug: "research" }),
    });
    expect(invalid.status).toBe(400);
  });
});

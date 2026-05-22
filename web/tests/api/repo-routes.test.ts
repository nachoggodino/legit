import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestConfig, makeTestRepo } from "../fixtures/config";

const getCurrentUser = vi.fn();
const loadConfig = vi.fn();
const writeMarkdownDocument = vi.fn();
const requestOpenAiCompatibleEdit = vi.fn();
const resolveDocumentPath = vi.fn();

const repo = makeTestRepo({ commit: { mode: "direct", targetBranch: "main", branchPrefix: "copisaurus/" } });

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
    writeMarkdownDocument.mockReset();
    requestOpenAiCompatibleEdit.mockReset();
    resolveDocumentPath.mockReset();
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
});

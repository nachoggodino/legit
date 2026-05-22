import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deleteMarkdownDocument,
  readMarkdownDocument,
  renameMarkdownDocument,
  scanLinkImpact,
  writeMarkdownDocument,
} from "@/server/docs";

const repo = { id: "repo", docsPath: "docs" };
const commitRepo = {
  id: "repo",
  docsPath: "docs",
  slug: "repo",
  name: "Repo",
  provider: "github" as const,
  repoUrl: "https://github.com/example/repo",
  defaultBranch: "main",
  visibility: "private" as const,
  commit: { mode: "direct" as const, targetBranch: "main", branchPrefix: "copisaurus/" },
};

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-editor-"));
  fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });
  return root;
}

describe("Markdown file operations", () => {
  it("creates, edits, loads, renames, and deletes markdown documents with confirmation", async () => {
    const reposRoot = makeRoot();
    await writeMarkdownDocument(repo, "new/page.md", "# New", { reposRoot, create: true });
    expect(readMarkdownDocument(repo, "new/page.md", { reposRoot }).source).toBe("# New");

    await writeMarkdownDocument(repo, "new/page.md", "# Edited", { reposRoot });
    expect(readMarkdownDocument(repo, "new/page.md", { reposRoot }).source).toBe("# Edited");

    await expect(renameMarkdownDocument(repo, "new/page.md", "renamed.md", { reposRoot })).rejects.toThrow("confirmation");
    await renameMarkdownDocument(repo, "new/page.md", "renamed.md", { reposRoot, confirmed: true });
    expect(fs.existsSync(path.join(reposRoot, "repo", "docs", "renamed.md"))).toBe(true);

    await expect(deleteMarkdownDocument(repo, "renamed.md", { reposRoot })).rejects.toThrow("confirmation");
    await deleteMarkdownDocument(repo, "renamed.md", { reposRoot, confirmed: true });
    expect(fs.existsSync(path.join(reposRoot, "repo", "docs", "renamed.md"))).toBe(false);
  });

  it("rejects traversal and non-markdown paths", async () => {
    const reposRoot = makeRoot();
    await expect(writeMarkdownDocument(repo, "../x.md", "# X", { reposRoot, create: true })).rejects.toThrow();
    await expect(writeMarkdownDocument(repo, "x.txt", "# X", { reposRoot, create: true })).rejects.toThrow();
  });

  it("commits document writes when a repository has commit config", async () => {
    const reposRoot = makeRoot();
    const calls: string[][] = [];
    const result = await writeMarkdownDocument(commitRepo, "committed.md", "# Committed", {
      reposRoot,
      create: true,
      commitRunner: async (args) => {
        calls.push(args);
        if (args[0] === "status") return "A docs/committed.md";
        if (args[0] === "rev-parse") return "abc123";
        return "";
      },
    });

    expect(result.commit).toEqual({
      committed: true,
      commit: "abc123",
      mode: "direct",
      branch: null,
      remoteUrl: null,
      phase7Pending: false,
    });
    expect(calls).toEqual([
      ["add", "--", "docs/committed.md"],
      ["status", "--porcelain", "--", "docs/committed.md"],
      ["commit", "-m", "create docs committed"],
      ["rev-parse", "HEAD"],
    ]);
  });

  it("returns link impact scan results from ripgrep output", async () => {
    const reposRoot = makeRoot();
    const output = JSON.stringify({
      type: "match",
      data: { path: { text: "index.md" }, line_number: 3, lines: { text: "[Old](old.md)" } },
    });
    const impacts = await scanLinkImpact(repo, "old.md", {
      reposRoot,
      runner: async () => ({ stdout: output }),
    });
    expect(impacts).toEqual([{ path: "index.md", line: 3, snippet: "[Old](old.md)" }]);
  });
});

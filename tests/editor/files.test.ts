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
  ai: { enabled: true },
  commit: { mode: "direct" as const, targetBranch: "main", branchPrefix: "legit/" },
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
      commitEnv: { LEGIT_GITHUB_TOKEN: "secret-token" },
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
      commitUrl: "https://github.com/example/repo/commit/abc123",
      mode: "direct",
      branch: null,
      branchUrl: null,
      pullRequestUrl: null,
    });
    expect(calls).toEqual([
      ["fetch", "origin", "main"],
      ["checkout", "main"],
      ["pull", "--ff-only", "origin", "main"],
      ["add", "--", "docs/committed.md"],
      ["status", "--porcelain", "--", "docs/committed.md"],
      ["commit", "-m", "create docs committed"],
      ["rev-parse", "HEAD"],
      ["push", "origin", "HEAD:main"],
    ]);
  });

  it("rolls back created documents when commit workflow fails", async () => {
    const reposRoot = makeRoot();

    await expect(
      writeMarkdownDocument(commitRepo, "failed-create.md", "# Failed", {
        reposRoot,
        create: true,
        commitRunner: async (args) => {
          if (args[0] === "push") throw new Error("protected branch");
          if (args[0] === "status") return "A docs/failed-create.md";
          if (args[0] === "rev-parse") return "abc123";
          return "";
        },
      }),
    ).rejects.toThrow();

    expect(fs.existsSync(path.join(reposRoot, "repo", "docs", "failed-create.md"))).toBe(false);
  });

  it("rolls back edited, renamed, and deleted documents when commit workflow fails", async () => {
    const reposRoot = makeRoot();
    const docsRoot = path.join(reposRoot, "repo", "docs");
    fs.writeFileSync(path.join(docsRoot, "edit.md"), "# Original", "utf8");
    fs.writeFileSync(path.join(docsRoot, "rename.md"), "# Rename", "utf8");
    fs.writeFileSync(path.join(docsRoot, "delete.md"), "# Delete", "utf8");
    const failingRunner = async (args: string[]) => {
      if (args[0] === "push") throw new Error("auth failed");
      if (args[0] === "status") return "M docs/file.md";
      if (args[0] === "rev-parse") return "abc123";
      return "";
    };

    await expect(writeMarkdownDocument(commitRepo, "edit.md", "# Changed", { reposRoot, commitRunner: failingRunner })).rejects.toThrow();
    expect(fs.readFileSync(path.join(docsRoot, "edit.md"), "utf8")).toBe("# Original");

    await expect(renameMarkdownDocument(commitRepo, "rename.md", "renamed.md", { reposRoot, confirmed: true, commitRunner: failingRunner })).rejects.toThrow();
    expect(fs.readFileSync(path.join(docsRoot, "rename.md"), "utf8")).toBe("# Rename");
    expect(fs.existsSync(path.join(docsRoot, "renamed.md"))).toBe(false);

    await expect(deleteMarkdownDocument(commitRepo, "delete.md", { reposRoot, confirmed: true, commitRunner: failingRunner })).rejects.toThrow();
    expect(fs.readFileSync(path.join(docsRoot, "delete.md"), "utf8")).toBe("# Delete");
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

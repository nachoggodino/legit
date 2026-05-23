import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqliteDatabase, importRepositoriesFromConfig } from "@/server/db";
import { buildRipgrepArgs, searchRepositoryDocs, upsertDocumentMetadata } from "@/server/search";

const repo = { id: "repo", docsPath: "docs" };
const configRepo = {
  id: "repo",
  slug: "repo",
  name: "Repo",
  provider: "github" as const,
  repoUrl: "https://github.com/example/repo",
  defaultBranch: "main",
  docsPath: "docs",
  visibility: "private" as const,
  ai: { enabled: true },
  commit: { mode: "direct" as const, targetBranch: "main", branchPrefix: "copisaurus/" },
};

describe("ripgrep search wrapper", () => {
  it("uses safe argument arrays with user input after --", () => {
    const args = buildRipgrepArgs("hello; rm -rf /", { maxResults: 5 });
    expect(args).toContain("--");
    expect(args[args.indexOf("--") + 1]).toBe("hello; rm -rf /");
    expect(args).toContain("--glob");
    expect(args).toContain("*.md");
  });

  it("scans only the docs path and applies max results", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });
    const calls: unknown[] = [];
    const output = [1, 2, 3]
      .map((line) => JSON.stringify({ type: "match", data: { path: { text: `file${line}.md` }, line_number: line, lines: { text: "needle" } } }))
      .join("\n");

    const results = await searchRepositoryDocs(repo, "needle", {
      reposRoot: root,
      maxResults: 2,
      runner: async (args, options) => {
        calls.push({ args, options });
        return { stdout: output };
      },
    });

    expect(results).toHaveLength(2);
    expect(calls).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({ cwd: path.join(root, "repo", "docs") }),
      }),
    ]);
  });

  it("throws on malformed ripgrep JSON", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });

    await expect(
      searchRepositoryDocs(repo, "needle", {
        reposRoot: root,
        runner: async () => ({ stdout: "{not-json}" }),
      }),
    ).rejects.toThrow("malformed JSON");
  });

  it("enriches search results with indexed document metadata", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });
    const { db, sqlite } = createSqliteDatabase(":memory:");
    importRepositoriesFromConfig(db, [configRepo]);
    upsertDocumentMetadata(db, "repo", "index.md", "# Indexed Title\n\nBody");

    const results = await searchRepositoryDocs(repo, "Body", {
      reposRoot: root,
      db,
      runner: async () => ({
        stdout: JSON.stringify({ type: "match", data: { path: { text: "index.md" }, line_number: 3, lines: { text: "Body" } } }),
      }),
    });

    sqlite.close();
    expect(results[0].title).toBe("Indexed Title");
  });
});

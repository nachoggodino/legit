import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSqliteDatabase, documentMetadata, importRepositoriesFromConfig } from "@/server/db";
import { buildRipgrepArgs, readCandidateFiles, reindexRepositoryDocuments, searchRepositoryDocs, upsertDocumentMetadata } from "@/server/search";

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
  commit: { mode: "direct" as const, targetBranch: "main", branchPrefix: "legit/" },
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

  it("returns no results for blank queries and ignores non-match events", async () => {
    const runner = vi.fn(async () => ({ stdout: "" }));
    await expect(searchRepositoryDocs(repo, "   ", { runner })).resolves.toEqual([]);
    expect(runner).not.toHaveBeenCalled();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });
    const output = [
      JSON.stringify({ type: "begin", data: { path: { text: "index.md" } } }),
      JSON.stringify({ type: "match", data: { path: { text: "image.png" }, line_number: 1, lines: { text: "needle" } } }),
      JSON.stringify({ type: "match", data: { path: { text: "index.md" }, lines: { text: "needle" } } }),
    ].join("\n");

    await expect(
      searchRepositoryDocs(repo, "needle", {
        reposRoot: root,
        runner: async () => ({ stdout: output }),
      }),
    ).resolves.toEqual([{ repoId: "repo", path: "index.md", line: 1, snippet: "needle" }]);
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

  it("reads candidate files with byte limits", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    fs.mkdirSync(path.join(root, "repo", "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "repo", "docs", "index.md"), "# Title\n\nLong body", "utf8");

    expect(readCandidateFiles(repo, ["index.md"], { reposRoot: root, maxBytes: 7 })).toEqual([
      { path: "index.md", source: "# Title" },
    ]);
  });

  it("reindexes markdown documents and skips missing docs roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-search-"));
    const { db, sqlite } = createSqliteDatabase(":memory:");

    try {
      importRepositoriesFromConfig(db, [configRepo]);
      expect(reindexRepositoryDocuments(db, repo, { reposRoot: root })).toBe(0);

      fs.mkdirSync(path.join(root, "repo", "docs", "guide"), { recursive: true });
      fs.writeFileSync(path.join(root, "repo", "docs", "index.md"), "---\ntitle: Frontmatter\n---\n# Indexed\n\nSummary text.", "utf8");
      fs.writeFileSync(path.join(root, "repo", "docs", "guide", "start.md"), "# Start\n\n```ts\ncode\n```\n\nUsable summary.", "utf8");

      expect(reindexRepositoryDocuments(db, repo, { reposRoot: root, commit: "abc123" })).toBe(2);
      const rows = db.select().from(documentMetadata).all();
      expect(rows.map((row) => row.path).sort()).toEqual(["guide/start.md", "index.md"]);
      expect(rows.find((row) => row.path === "index.md")?.summary).toBe("Summary text.");
      expect(rows.find((row) => row.path === "guide/start.md")?.summary).toBe("Usable summary.");
    } finally {
      sqlite.close();
    }
  });
});

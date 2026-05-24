import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadRouteDocument } from "@/server/docs";
import { createSqliteDatabase } from "@/server/db";
import { resolveRepoPath } from "@/server/git";
import { makeTestConfig, makeTestRepo } from "../fixtures/config";

describe("loadRouteDocument", () => {
  it("returns an existing document without triggering sync", async () => {
    const repo = makeTestRepo({ visibility: "public" });
    const config = makeTestConfig({ repos: [repo] });
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legit-doc-load-"));
    const docsRoot = path.join(reposRoot, repo.id, "docs");
    const syncRepository = vi.fn();

    fs.mkdirSync(docsRoot, { recursive: true });
    fs.writeFileSync(path.join(docsRoot, "index.md"), "# Ready", "utf8");

    const resolved = await loadRouteDocument(config, repo, [], {
      reposRoot,
      deps: { syncRepository: syncRepository as never },
    });

    expect(resolved?.relativePath).toBe("index.md");
    expect(syncRepository).not.toHaveBeenCalled();
  });

  it("syncs once when repo content is not present locally", async () => {
    const repo = makeTestRepo({ visibility: "public" });
    const config = makeTestConfig({ repos: [repo] });
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legit-doc-load-"));
    const dbHandle = createSqliteDatabase(":memory:");

    try {
      const resolved = await loadRouteDocument(config, repo, [], {
        reposRoot,
        deps: {
          getRuntimeDatabase: () => ({ db: dbHandle.db, sqlite: dbHandle.sqlite }),
          syncRepository: vi.fn(async () => {
            const docsRoot = path.join(resolveRepoPath(repo.id, reposRoot), repo.docsPath);
            fs.mkdirSync(docsRoot, { recursive: true });
            fs.writeFileSync(path.join(docsRoot, "index.md"), "# Synced", "utf8");
            return { repoId: repo.id, commit: "commit123" };
          }) as never,
        },
      });

      expect(resolved?.relativePath).toBe("index.md");
      expect(resolved?.absolutePath).toBe(path.join(resolveRepoPath(repo.id, reposRoot), repo.docsPath, "index.md"));
    } finally {
      dbHandle.sqlite.close();
    }
  });

  it("does not sync for a real missing document inside an existing docs tree", async () => {
    const repo = makeTestRepo({ visibility: "public" });
    const config = makeTestConfig({ repos: [repo] });
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legit-doc-load-"));
    const docsRoot = path.join(reposRoot, repo.id, "docs");
    const syncRepository = vi.fn();

    fs.mkdirSync(docsRoot, { recursive: true });
    fs.writeFileSync(path.join(docsRoot, "index.md"), "# Ready", "utf8");

    const resolved = await loadRouteDocument(config, repo, ["missing"], {
      reposRoot,
      deps: { syncRepository: syncRepository as never },
    });

    expect(resolved).toBeNull();
    expect(syncRepository).not.toHaveBeenCalled();
  });
});

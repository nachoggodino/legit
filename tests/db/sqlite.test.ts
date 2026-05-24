import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  createSqliteDatabase,
  getRepositoryById,
  getRepositoryBySlug,
  importRepositoriesFromConfig,
  listRepositories,
  listRepositorySyncStatuses,
  resolveDatabasePath,
} from "@/server/db";
import type { RepositoryConfig } from "@/server/config";

const repo: RepositoryConfig = {
  id: "research",
  slug: "research",
  name: "Research Wiki",
  provider: "gitlab",
  repoUrl: "https://gitlab.example.com/group/research",
  defaultBranch: "main",
  docsPath: "docs",
  visibility: "private",
  ai: { enabled: true },
  commit: {
    mode: "merge-request",
    targetBranch: "main",
    branchPrefix: "legit/",
  },
};

describe("SQLite initialization", () => {
  it("creates the initial schema and imports repositories", () => {
    const handle = createSqliteDatabase(":memory:");

    try {
      importRepositoriesFromConfig(handle.db, [repo]);

      const repos = listRepositories(handle.db);
      const syncRows = handle.sqlite.prepare("SELECT repo_id, status FROM repo_sync_state").all();
      const tables = handle.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('document_metadata', 'audit_events')")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(repos).toHaveLength(1);
      expect(repos[0].slug).toBe("research");
      expect(getRepositoryBySlug(handle.db, "research")?.id).toBe("research");
      expect(getRepositoryById(handle.db, "research")?.slug).toBe("research");
      expect(listRepositorySyncStatuses(handle.db)[0]).toMatchObject({
        id: "research",
        slug: "research",
        status: "idle",
        lastSyncedCommit: null,
      });
      expect(syncRows).toEqual([{ repo_id: "research", status: "idle" }]);
      expect(tables.sort()).toEqual(["audit_events", "document_metadata"]);
    } finally {
      handle.sqlite.close();
    }
  });

  it("uses a build-safe default database path during production builds", () => {
    const originalBuildPhase = process.env.LEGIT_BUILD_PHASE;
    const originalPhase = process.env.NEXT_PHASE;
    const originalPath = process.env.LEGIT_DATABASE_PATH;

    try {
      process.env.LEGIT_BUILD_PHASE = "1";
      delete process.env.LEGIT_DATABASE_PATH;

      expect(resolveDatabasePath()).toBe(path.join(os.tmpdir(), "legit-build.db"));
    } finally {
      if (originalBuildPhase === undefined) {
        delete process.env.LEGIT_BUILD_PHASE;
      } else {
        process.env.LEGIT_BUILD_PHASE = originalBuildPhase;
      }

      if (originalPhase === undefined) {
        delete process.env.NEXT_PHASE;
      } else {
        process.env.NEXT_PHASE = originalPhase;
      }

      if (originalPath === undefined) {
        delete process.env.LEGIT_DATABASE_PATH;
      } else {
        process.env.LEGIT_DATABASE_PATH = originalPath;
      }
    }
  });

  it("prefers explicit database paths over defaults", () => {
    const originalPath = process.env.LEGIT_DATABASE_PATH;

    try {
      process.env.LEGIT_DATABASE_PATH = "/tmp/custom-legit.db";
      expect(resolveDatabasePath()).toBe("/tmp/custom-legit.db");
    } finally {
      if (originalPath === undefined) {
        delete process.env.LEGIT_DATABASE_PATH;
      } else {
        process.env.LEGIT_DATABASE_PATH = originalPath;
      }
    }
  });
});

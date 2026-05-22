import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSqliteDatabase, getRepoSyncState, importRepositoriesFromConfig } from "@/server/db";
import { createSyncScheduler, requestManualRepoSync, syncRepository, withRepoLock } from "@/server/sync";
import { AuthorizationError, type AuthUser } from "@/server/auth/types";
import type { CopisaurusConfig, RepositoryConfig } from "@/server/config";

const repo: RepositoryConfig = {
  id: "research",
  slug: "research",
  name: "Research Wiki",
  provider: "gitlab",
  repoUrl: "https://gitlab.example.com/group/research.git",
  defaultBranch: "main",
  docsPath: "docs",
  visibility: "private",
  commit: { mode: "merge-request", targetBranch: "main", branchPrefix: "copisaurus/" },
};

const config: CopisaurusConfig = {
  app: { name: "Copisaurus" },
  auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } },
  ai: {
    enabled: false,
    baseUrlEnv: "AI_BASE_URL",
    apiKeyEnv: "AI_API_KEY",
    defaultModel: "gpt-4o",
    maxContextTokens: 150000,
    allowAnonymous: false,
  },
  sync: { intervalSeconds: 5, pullOnStartup: true, reindexOnChange: true },
  repos: [repo],
};

const admin: AuthUser = { id: "admin", email: "admin@example.com", role: "admin" };

describe("repo sync", () => {
  it("prevents concurrent work for the same repo", async () => {
    let releaseLock!: () => void;
    const first = withRepoLock("research", () => new Promise<void>((resolve) => {
      releaseLock = resolve;
    }));

    await expect(withRepoLock("research", async () => undefined)).rejects.toThrow(/in progress/i);
    releaseLock();
    await first;
  });

  it("records successful sync state", async () => {
    const handle = createSqliteDatabase(":memory:");
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-sync-"));

    try {
      importRepositoriesFromConfig(handle.db, [repo]);
      await syncRepository(handle.db, repo, {
        reposRoot,
        env: { COPISAURUS_GITLAB_TOKEN: "secret" },
        runner: async (args) => (args[0] === "rev-parse" ? "commit123" : ""),
      });

      expect(getRepoSyncState(handle.db, repo.id)).toMatchObject({
        status: "succeeded",
        lastSyncedCommit: "commit123",
        lastError: null,
      });
    } finally {
      handle.sqlite.close();
    }
  });

  it("records failed sync state without leaking credentials", async () => {
    const handle = createSqliteDatabase(":memory:");
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-sync-"));

    try {
      importRepositoriesFromConfig(handle.db, [repo]);

      await expect(
        syncRepository(handle.db, repo, {
          reposRoot,
          env: { COPISAURUS_GITLAB_TOKEN: "secret" },
          runner: async () => {
            throw new Error("failed https://oauth2:secret@gitlab.example.com/group/research.git");
          },
        }),
      ).rejects.toThrow("oauth2:***@gitlab.example.com");

      const state = getRepoSyncState(handle.db, repo.id);
      expect(state?.status).toBe("failed");
      expect(state?.lastError).toContain("oauth2:***@gitlab.example.com");
      expect(state?.lastError).not.toContain("secret");
    } finally {
      handle.sqlite.close();
    }
  });

  it("requires admin for manual sync", async () => {
    const handle = createSqliteDatabase(":memory:");
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-sync-"));

    try {
      await expect(
        requestManualRepoSync(repo.id, {
          db: handle.db,
          config,
          reposRoot,
          requireAdminUser: async () => {
            throw new AuthorizationError("Admin role required.");
          },
          runner: async () => "unused",
        }),
      ).rejects.toThrow(AuthorizationError);

      await expect(
        requestManualRepoSync(repo.id, {
          db: handle.db,
          config,
          reposRoot,
          requireAdminUser: async () => admin,
          env: { COPISAURUS_GITLAB_TOKEN: "secret" },
          runner: async (args) => (args[0] === "rev-parse" ? "commit456" : ""),
        }),
      ).resolves.toEqual({ repoId: repo.id, commit: "commit456" });
    } finally {
      handle.sqlite.close();
    }
  });

  it("runs startup and periodic sync through injectable timers", async () => {
    const handle = createSqliteDatabase(":memory:");
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-sync-"));
    const intervals: Array<() => void> = [];

    try {
      const scheduler = createSyncScheduler(config, handle.db, {
        reposRoot,
        env: { COPISAURUS_GITLAB_TOKEN: "secret" },
        runner: async (args) => (args[0] === "rev-parse" ? "commit789" : ""),
        timers: {
          setInterval(callback) {
            intervals.push(callback);
            return callback;
          },
          clearInterval(handle) {
            const index = intervals.indexOf(handle as () => void);
            if (index >= 0) {
              intervals.splice(index, 1);
            }
          },
        },
      });

      scheduler.start();
      expect(intervals).toHaveLength(1);
      await new Promise((resolve) => setImmediate(resolve));
      intervals[0]();
      await new Promise((resolve) => setImmediate(resolve));
      scheduler.stop();
      expect(intervals).toHaveLength(0);
    } finally {
      handle.sqlite.close();
    }
  });

  it("catches scheduled sync failures and records failed state", async () => {
    const handle = createSqliteDatabase(":memory:");
    const reposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-sync-"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const scheduler = createSyncScheduler(config, handle.db, {
        reposRoot,
        env: { COPISAURUS_GITLAB_TOKEN: "secret" },
        runner: async () => {
          throw new Error("failed https://oauth2:secret@gitlab.example.com/group/research.git");
        },
      });

      await expect(scheduler.runOnce()).resolves.toBeUndefined();
      const state = getRepoSyncState(handle.db, repo.id);
      expect(state?.status).toBe("failed");
      expect(state?.lastError).toContain("oauth2:***@gitlab.example.com");
      expect(state?.lastError).not.toContain("secret");
      expect(consoleError).toHaveBeenCalledWith("Scheduled repository sync failed", {
        error: expect.stringContaining("oauth2:***@gitlab.example.com"),
      });
    } finally {
      consoleError.mockRestore();
      handle.sqlite.close();
    }
  });
});

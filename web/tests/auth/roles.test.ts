import { describe, expect, it } from "vitest";
import { assignRoleForEmail, canEditRepo, canReadRepo, canUseAi, resolveRoleForAuthenticatedUser } from "@/server/auth/roles";
import { createSqliteDatabase, users } from "@/server/db";
import type { AuthUser } from "@/server/auth/types";
import type { CopisaurusConfig, RepositoryConfig } from "@/server/config";

const config: CopisaurusConfig = {
  app: { name: "Copisaurus" },
  auth: {
    defaultRole: "viewer",
    admins: {
      emails: ["admin@example.com"],
      domains: ["ops.example.com"],
    },
  },
  ai: {
    enabled: true,
    baseUrlEnv: "AI_BASE_URL",
    apiKeyEnv: "AI_API_KEY",
    defaultModel: "gpt-4o",
    maxContextTokens: 150000,
    allowAnonymous: false,
  },
  sync: { intervalSeconds: 120, pullOnStartup: true, reindexOnChange: true },
  repos: [],
};

const publicRepo = { visibility: "public" } as RepositoryConfig;
const privateRepo = { visibility: "private" } as RepositoryConfig;
const viewer: AuthUser = { id: "u1", email: "viewer@example.com", role: "viewer" };
const editor: AuthUser = { id: "u2", email: "editor@example.com", role: "editor" };
const admin: AuthUser = { id: "u3", email: "admin@example.com", role: "admin" };

describe("auth roles and permissions", () => {
  it("assigns admin role from configured emails and domains", () => {
    expect(assignRoleForEmail("ADMIN@example.com", config)).toBe("admin");
    expect(assignRoleForEmail("person@ops.example.com", config)).toBe("admin");
    expect(assignRoleForEmail("person@example.com", config)).toBe("viewer");
  });

  it("checks public and private repository read access", () => {
    expect(canReadRepo(publicRepo, null)).toBe(true);
    expect(canReadRepo(privateRepo, null)).toBe(false);
    expect(canReadRepo(privateRepo, viewer)).toBe(true);
  });

  it("checks viewer, editor, and admin permissions", () => {
    expect(canEditRepo(viewer)).toBe(false);
    expect(canEditRepo(editor)).toBe(true);
    expect(canEditRepo(admin)).toBe(true);
    expect(canUseAi(config, null)).toBe(false);
    expect(canUseAi(config, viewer)).toBe(true);
    expect(canUseAi(config, viewer, { ai: { enabled: false } })).toBe(false);
  });

  it("does not implicitly bootstrap the first authenticated user as admin", () => {
    const handle = createSqliteDatabase(":memory:");
    const bootstrapConfig: CopisaurusConfig = {
      ...config,
      auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } },
    };

    try {
      handle.db.insert(users).values({ id: "u1", email: "first@example.com" }).run();
      expect(resolveRoleForAuthenticatedUser(handle.db, "u1", "first@example.com", bootstrapConfig)).toBe("viewer");

      handle.db.insert(users).values({ id: "u2", email: "second@example.com" }).run();
      expect(resolveRoleForAuthenticatedUser(handle.db, "u2", "second@example.com", bootstrapConfig)).toBe("viewer");
    } finally {
      handle.sqlite.close();
    }
  });

  it("allows explicit bootstrap admin emails from the environment", () => {
    const handle = createSqliteDatabase(":memory:");
    const original = process.env.COPISAURUS_BOOTSTRAP_ADMIN_EMAILS;

    try {
      process.env.COPISAURUS_BOOTSTRAP_ADMIN_EMAILS = "owner@example.com, second@example.com";
      handle.db.insert(users).values({ id: "u1", email: "owner@example.com" }).run();

      expect(resolveRoleForAuthenticatedUser(handle.db, "u1", "owner@example.com", config)).toBe("admin");
      expect(resolveRoleForAuthenticatedUser(handle.db, "u1", "other@example.com", config)).toBe("viewer");
    } finally {
      if (original === undefined) {
        delete process.env.COPISAURUS_BOOTSTRAP_ADMIN_EMAILS;
      } else {
        process.env.COPISAURUS_BOOTSTRAP_ADMIN_EMAILS = original;
      }
      handle.sqlite.close();
    }
  });
});

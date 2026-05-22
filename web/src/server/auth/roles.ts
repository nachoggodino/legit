import type { CopisaurusConfig, RepositoryConfig } from "@/server/config";
import { users, type DbClient } from "@/server/db";
import { eq } from "drizzle-orm";
import type { AuthUser, Role } from "./types";

const roleRank: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "editor" || value === "viewer";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assignRoleForEmail(email: string, config: CopisaurusConfig): Role {
  const normalizedEmail = normalizeEmail(email);
  const domain = normalizedEmail.split("@")[1] ?? "";
  const adminEmails = new Set(config.auth.admins.emails.map(normalizeEmail));
  const adminDomains = new Set(config.auth.admins.domains.map((value) => value.trim().toLowerCase().replace(/^@/, "")));

  if (adminEmails.has(normalizedEmail) || adminDomains.has(domain)) {
    return "admin";
  }

  return config.auth.defaultRole;
}

export function hasConfiguredAdmins(config: CopisaurusConfig): boolean {
  return config.auth.admins.emails.length > 0 || config.auth.admins.domains.length > 0;
}

export function hasPersistedAdmin(db: DbClient): boolean {
  return Boolean(db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).get());
}

export function getBootstrapAdminEmails(env = process.env): Set<string> {
  return new Set(
    (env.COPISAURUS_BOOTSTRAP_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function isBootstrapAdminEmail(email: string, env = process.env): boolean {
  return getBootstrapAdminEmails(env).has(normalizeEmail(email));
}

export function resolveRoleForAuthenticatedUser(
  db: DbClient,
  userId: string,
  email: string,
  config: CopisaurusConfig,
): Role {
  const configuredRole = assignRoleForEmail(email, config);

  if (configuredRole === "admin") {
    return "admin";
  }

  if (isBootstrapAdminEmail(email)) {
    return "admin";
  }

  const persisted = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();

  if (persisted?.role === "admin" || persisted?.role === "editor") {
    return persisted.role;
  }

  return persisted?.role ?? configuredRole;
}

export function hasRoleAtLeast(user: Pick<AuthUser, "role"> | null | undefined, role: Role): boolean {
  return Boolean(user && roleRank[user.role] >= roleRank[role]);
}

export function canReadRepo(repo: Pick<RepositoryConfig, "visibility">, user?: Pick<AuthUser, "role"> | null): boolean {
  return repo.visibility === "public" || hasRoleAtLeast(user, "viewer");
}

export function canUseAi(
  config: Pick<CopisaurusConfig, "ai">,
  user?: Pick<AuthUser, "role"> | null,
): boolean {
  return config.ai.enabled && (config.ai.allowAnonymous || hasRoleAtLeast(user, "viewer"));
}

export function canEditRepo(user?: Pick<AuthUser, "role"> | null): boolean {
  return hasRoleAtLeast(user, "editor");
}

import { buildAuthProviderStatuses } from "@/server/auth/providers";
import { isConfigWritable, loadConfig, resolveConfigPath } from "@/server/config";
import { auditEvents, getRuntimeDatabase, importRepositoriesFromConfig, listRepositorySyncStatuses, users } from "@/server/db";
import { redactGitUrl } from "@/server/git";
import { desc } from "drizzle-orm";

export type AdminDashboardData = ReturnType<typeof getAdminDashboardData>;

const SENSITIVE_METADATA_KEYS = [/token/i, /secret/i, /password/i, /authorization/i, /cookie/i, /api[-_]?key/i];

function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_METADATA_KEYS.some((pattern) => pattern.test(key)) ? "[redacted]" : sanitizeAuditMetadata(entry),
      ]),
    );
  }
  return value;
}

function formatAuditMetadata(metadata: unknown): string {
  return metadata ? JSON.stringify(sanitizeAuditMetadata(metadata)) : "";
}

export function getAdminDashboardData() {
  const config = loadConfig();
  const { db } = getRuntimeDatabase();
  importRepositoriesFromConfig(db, config.repos);

  return {
    configPath: resolveConfigPath(),
    configWritable: isConfigWritable(),
    configuredRepos: config.repos,
    aiProviderStatus: {
      enabled: config.ai.enabled,
      model: process.env.AI_MODEL ?? config.ai.defaultModel,
      baseUrlConfigured: Boolean(process.env[config.ai.baseUrlEnv]),
      apiKeyConfigured: Boolean(process.env[config.ai.apiKeyEnv]),
      baseUrlEnv: config.ai.baseUrlEnv,
      apiKeyEnv: config.ai.apiKeyEnv,
    },
    repos: listRepositorySyncStatuses(db).map((repo) => ({
      ...repo,
      lastError: repo.lastError ? redactGitUrl(repo.lastError) : null,
    })),
    authProviderStatuses: buildAuthProviderStatuses(),
    users: db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(users.email)
      .all(),
    auditEvents: db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(50)
      .all()
      .map((event) => ({
        ...event,
        metadata: formatAuditMetadata(event.metadata),
      })),
  };
}

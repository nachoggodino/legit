import { z } from "zod";

export const RESERVED_REPO_SLUGS = new Set([
  "api",
  "admin",
  "login",
  "logout",
  "settings",
  "assets",
  "_next",
]);

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
    message: "Use lowercase letters, numbers, and hyphens only.",
  })
  .refine((slug) => !RESERVED_REPO_SLUGS.has(slug), {
    message: "This repository slug is reserved.",
  });

const relativePathSchema = z
  .string()
  .min(1)
  .max(240)
  .transform((value) => value.replace(/\\/g, "/").replace(/\/+$/g, ""))
  .refine((value) => value.length > 0, {
    message: "Path cannot be empty.",
  })
  .refine((value) => !value.startsWith("/"), {
    message: "Path must be relative.",
  })
  .refine((value) => !/^[a-zA-Z]:\//.test(value), {
    message: "Path must not include a drive prefix.",
  })
  .refine((value) => !value.split("/").some((segment) => segment === "" || segment === "." || segment === ".."), {
    message: "Path must not contain empty, current-directory, or parent-directory segments.",
  })
  .refine((value) => !value.split("/").some((segment) => segment.startsWith(".")), {
    message: "Path must not contain hidden segments.",
  });

const gitRefSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !value.startsWith("/") && !value.endsWith("/"), {
    message: "Git ref must not start or end with a slash.",
  })
  .refine((value) => !value.includes("..") && !value.includes("//"), {
    message: "Git ref must not contain traversal-like segments.",
  })
  .refine((value) => !/[\s~^:?*[\\\]]/.test(value), {
    message: "Git ref contains invalid characters.",
  });

const commitSchema = z.object({
  mode: z.enum(["direct", "branch", "merge-request"]).default("merge-request"),
  targetBranch: gitRefSchema.default("main"),
  branchPrefix: z
    .string()
    .min(1)
    .max(160)
    .refine((value) => !value.startsWith("/") && value.endsWith("/"), {
      message: "Branch prefix must be relative and end with a slash.",
    })
    .refine((value) => !value.includes("..") && !value.includes("//"), {
      message: "Branch prefix must not contain traversal-like segments.",
    })
    .refine((value) => !/[\s~^:?*[\\\]]/.test(value), {
      message: "Branch prefix contains invalid characters.",
    })
    .default("copisaurus/"),
});

const defaultCommitConfig = {
  mode: "merge-request" as const,
  targetBranch: "main",
  branchPrefix: "copisaurus/",
};

const repoAiSchema = z
  .object({
    enabled: z.boolean().default(true),
  })
  .default({ enabled: true });

export const repositoryConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  slug: slugSchema,
  name: z.string().min(1),
  provider: z.enum(["github", "gitlab"]),
  repoUrl: z.string().url(),
  defaultBranch: gitRefSchema.default("main"),
  docsPath: relativePathSchema.default("docs"),
  visibility: z.enum(["private", "public"]).default("private"),
  ai: repoAiSchema,
  commit: commitSchema.default(defaultCommitConfig),
});

export const copisaurusConfigSchema = z
  .object({
    app: z
      .object({
        name: z.string().min(1).default("Copisaurus"),
      })
      .default({ name: "Copisaurus" }),
    auth: z
      .object({
        defaultRole: z.enum(["admin", "editor", "viewer"]).default("viewer"),
        admins: z
          .object({
            emails: z.array(z.string().email()).default([]),
            domains: z
              .array(
                z
                  .string()
                  .min(1)
                  .transform((value) => value.trim().toLowerCase().replace(/^@/, ""))
                  .refine((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value), {
                    message: "Admin domains must be valid domain names.",
                  }),
              )
              .default([]),
          })
          .default({ emails: [], domains: [] }),
      })
      .default({ defaultRole: "viewer", admins: { emails: [], domains: [] } }),
    ai: z
      .object({
        enabled: z.boolean().default(false),
        baseUrlEnv: z.string().min(1).default("AI_BASE_URL"),
        apiKeyEnv: z.string().min(1).default("AI_API_KEY"),
        defaultModel: z.string().min(1).default("gpt-4o"),
        maxContextTokens: z.number().int().positive().default(150000),
        allowAnonymous: z.boolean().default(false),
      })
      .default({
        enabled: false,
        baseUrlEnv: "AI_BASE_URL",
        apiKeyEnv: "AI_API_KEY",
        defaultModel: "gpt-4o",
        maxContextTokens: 150000,
        allowAnonymous: false,
      }),
    sync: z
      .object({
        intervalSeconds: z.number().int().positive().default(120),
        pullOnStartup: z.boolean().default(true),
        reindexOnChange: z.boolean().default(true),
      })
      .default({ intervalSeconds: 120, pullOnStartup: true, reindexOnChange: true }),
    repos: z.array(repositoryConfigSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    const slugs = new Set<string>();

    config.repos.forEach((repo, index) => {
      if (ids.has(repo.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate repository id: ${repo.id}`,
          path: ["repos", index, "id"],
        });
      }
      ids.add(repo.id);

      if (slugs.has(repo.slug)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate repository slug: ${repo.slug}`,
          path: ["repos", index, "slug"],
        });
      }
      slugs.add(repo.slug);
    });
  });

export type CopisaurusConfig = z.infer<typeof copisaurusConfigSchema>;
export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;

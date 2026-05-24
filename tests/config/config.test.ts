import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ConfigLoadError, isConfigWritable, loadConfigForShell, parseConfigFile, parseConfigText, updateSafeRepositoryConfig } from "@/server/config";
import { resolveConfigPath } from "@/server/config/load";

const validConfig = `
app:
  name: Legit
auth:
  defaultRole: viewer
  admins:
    emails:
      - admin@example.com
ai:
  enabled: false
  baseUrlEnv: AI_BASE_URL
  apiKeyEnv: AI_API_KEY
  defaultModel: gpt-4o
  maxContextTokens: 150000
  allowAnonymous: false
sync:
  intervalSeconds: 120
  pullOnStartup: true
  reindexOnChange: true
repos:
  - id: research
    slug: research
    name: Research Wiki
    provider: gitlab
    repoUrl: https://gitlab.example.com/group/research
    defaultBranch: main
    docsPath: docs
    visibility: private
    commit:
      mode: merge-request
      targetBranch: main
      branchPrefix: legit/
`;

describe("config parsing", () => {
  it("parses a valid Legit config", () => {
    const config = parseConfigText(validConfig);

    expect(config.app.name).toBe("Legit");
    expect(config.repos).toHaveLength(1);
    expect(config.repos[0]).toMatchObject({
      id: "research",
      slug: "research",
      provider: "gitlab",
      visibility: "private",
    });
  });

  it("rejects invalid config values", () => {
    expect(() =>
      parseConfigText(`
repos:
  - id: bad
    slug: Bad Slug
    name: Broken
    provider: bitbucket
    repoUrl: not-a-url
`),
    ).toThrow(ZodError);
  });

  it("rejects reserved repository slugs", () => {
    expect(() =>
      parseConfigText(`
repos:
  - id: admin-docs
    slug: admin
    name: Admin Docs
    provider: github
    repoUrl: https://github.com/example/admin-docs
`),
    ).toThrow(/reserved/i);
  });

  it.each(["/docs", "../docs", "docs/../private", "docs//private", ".docs", "docs/.private", "C:/docs"])(
    "rejects unsafe docsPath value %s",
    (docsPath) => {
      expect(() =>
        parseConfigText(`
repos:
  - id: unsafe-path
    slug: unsafe-path
    name: Unsafe Path
    provider: github
    repoUrl: https://github.com/example/unsafe-path
    docsPath: ${JSON.stringify(docsPath)}
`),
      ).toThrow();
    },
  );

  it("normalizes trailing slashes and Windows separators in docsPath", () => {
    const config = parseConfigText(`
repos:
  - id: normalized-path
    slug: normalized-path
    name: Normalized Path
    provider: github
    repoUrl: https://github.com/example/normalized-path
    docsPath: 'docs\\guides/'
`);

    expect(config.repos[0].docsPath).toBe("docs/guides");
  });

  it.each(["bad branch", "../main", "feature..main", "/main", "main/", "main:prod"])(
    "rejects unsafe defaultBranch value %s",
    (defaultBranch) => {
      expect(() =>
        parseConfigText(`
repos:
  - id: unsafe-branch
    slug: unsafe-branch
    name: Unsafe Branch
    provider: github
    repoUrl: https://github.com/example/unsafe-branch
    defaultBranch: ${JSON.stringify(defaultBranch)}
`),
      ).toThrow();
    },
  );

  it.each(["direct", "branch", "merge-request"])("accepts commit mode %s", (mode) => {
    const config = parseConfigText(validConfig.replace("mode: merge-request", `mode: ${mode}`));
    expect(config.repos[0].commit.mode).toBe(mode);
  });

  it("validates, backs up, atomically writes, and rereads safe config edits", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "copi-config-"));
    const configPath = path.join(dir, "legit.yaml");
    fs.writeFileSync(configPath, validConfig, "utf8");
    const previousConfigPath = process.env.LEGIT_CONFIG_PATH;
    process.env.LEGIT_CONFIG_PATH = configPath;

    try {
      const result = updateSafeRepositoryConfig({
        id: "research",
        name: "Research Docs",
        slug: "research-docs",
        visibility: "public",
        defaultBranch: "main",
        docsPath: "docs/reference",
        aiEnabled: true,
        commit: { mode: "branch", targetBranch: "main", branchPrefix: "legit/" },
      });

      expect(fs.existsSync(result.backupPath)).toBe(true);
      const reread = parseConfigText(fs.readFileSync(configPath, "utf8"));
      expect(reread.repos[0]).toMatchObject({ name: "Research Docs", slug: "research-docs", docsPath: "docs/reference" });
      expect(reread.repos[0].commit.mode).toBe("branch");
      expect(reread.ai.enabled).toBe(false);
      expect(reread.repos[0].ai.enabled).toBe(true);
    } finally {
      process.env.LEGIT_CONFIG_PATH = previousConfigPath;
    }
  });

  it("rejects duplicate and reserved slugs during safe config edits", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "copi-config-dupe-"));
    const configPath = path.join(dir, "legit.yaml");
    fs.writeFileSync(
      configPath,
      validConfig.replace(
        "repos:\n  - id: research",
        "repos:\n  - id: docs\n    slug: docs\n    name: Docs\n    provider: github\n    repoUrl: https://github.com/example/docs\n  - id: research",
      ),
      "utf8",
    );
    const previousConfigPath = process.env.LEGIT_CONFIG_PATH;
    process.env.LEGIT_CONFIG_PATH = configPath;

    try {
      expect(() =>
        updateSafeRepositoryConfig({
          id: "research",
          name: "Research",
          slug: "docs",
          visibility: "private",
          defaultBranch: "main",
          docsPath: "docs",
          aiEnabled: false,
          commit: { mode: "merge-request", targetBranch: "main", branchPrefix: "legit/" },
        }),
      ).toThrow(/Duplicate repository slug/i);

      expect(() =>
        updateSafeRepositoryConfig({
          id: "research",
          name: "Research",
          slug: "admin",
          visibility: "private",
          defaultBranch: "main",
          docsPath: "docs",
          aiEnabled: false,
          commit: { mode: "merge-request", targetBranch: "main", branchPrefix: "legit/" },
        }),
      ).toThrow(/reserved/i);
    } finally {
      process.env.LEGIT_CONFIG_PATH = previousConfigPath;
    }
  });

  it("detects read-only config paths", () => {
    expect(isConfigWritable("/path/that/does/not/exist/legit.yaml")).toBe(false);
  });

  it("parses config files from disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "copi-config-file-"));
    const configPath = path.join(dir, "legit.yaml");
    fs.writeFileSync(configPath, validConfig, "utf8");

    expect(parseConfigFile(configPath).repos[0].id).toBe("research");
  });

  it("falls back to the root legit.example.yaml during local development", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousConfigPath = process.env.LEGIT_CONFIG_PATH;
    const env = process.env as Record<string, string | undefined>;

    try {
      env.NODE_ENV = "test";
      delete env.LEGIT_CONFIG_PATH;

      expect(resolveConfigPath()).toBe(path.resolve(process.cwd(), "legit.example.yaml"));
    } finally {
      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNodeEnv;
      }

      if (previousConfigPath === undefined) {
        delete env.LEGIT_CONFIG_PATH;
      } else {
        env.LEGIT_CONFIG_PATH = previousConfigPath;
      }
    }
  });

  it("fails closed for missing production config and shell loading", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousConfigPath = process.env.LEGIT_CONFIG_PATH;
    const env = process.env as Record<string, string | undefined>;

    try {
      env.NODE_ENV = "production";
      env.LEGIT_CONFIG_PATH = "/tmp/legit-missing-config.yaml";

      expect(() => resolveConfigPath()).toThrow(ConfigLoadError);
      expect(loadConfigForShell()).toBeNull();
    } finally {
      if (previousNodeEnv === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNodeEnv;
      }

      if (previousConfigPath === undefined) {
        delete env.LEGIT_CONFIG_PATH;
      } else {
        env.LEGIT_CONFIG_PATH = previousConfigPath;
      }
    }
  });
});

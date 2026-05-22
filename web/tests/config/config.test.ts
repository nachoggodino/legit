import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseConfigText } from "@/server/config";

const validConfig = `
app:
  name: Copisaurus
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
      branchPrefix: copisaurus/
`;

describe("config parsing", () => {
  it("parses a valid Copisaurus config", () => {
    const config = parseConfigText(validConfig);

    expect(config.app.name).toBe("Copisaurus");
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
});

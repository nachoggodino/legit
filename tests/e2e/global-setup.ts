import fs from "node:fs";

export default async function globalSetup() {
  fs.rmSync("/tmp/legit-e2e-repos", { recursive: true, force: true });
  fs.mkdirSync("/tmp/legit-e2e-repos/public/docs/guide", { recursive: true });
  fs.mkdirSync("/tmp/legit-e2e-repos/private/docs", { recursive: true });
  fs.writeFileSync("/tmp/legit-e2e-repos/public/docs/index.md", "# Public Home\n\nWelcome to docs.\n\n## Start\n\nSearch phrase.");
  fs.writeFileSync("/tmp/legit-e2e-repos/public/docs/guide/index.md", "# Guide\n\nGuide body.");
  fs.writeFileSync("/tmp/legit-e2e-repos/private/docs/index.md", "# Private Home\n\nAuthenticated content.");
  fs.writeFileSync(
    "/tmp/legit-e2e.yaml",
    [
      "app:",
      "  name: Legit",
      "auth:",
      "  defaultRole: viewer",
      "  admins:",
      "    emails: []",
      "    domains: []",
      "ai:",
      "  enabled: false",
      "  allowAnonymous: false",
      "sync:",
      "  intervalSeconds: 120",
      "  pullOnStartup: false",
      "  reindexOnChange: true",
      "repos:",
      "  - id: public",
      "    slug: public",
      "    name: Public Docs",
      "    provider: github",
      "    repoUrl: https://github.com/example/public",
      "    defaultBranch: main",
      "    docsPath: docs",
      "    visibility: public",
      "    commit:",
      "      mode: direct",
      "      targetBranch: main",
      "      branchPrefix: legit/",
      "  - id: private",
      "    slug: private",
      "    name: Private Docs",
      "    provider: github",
      "    repoUrl: https://github.com/example/private",
      "    defaultBranch: main",
      "    docsPath: docs",
      "    visibility: private",
      "    commit:",
      "      mode: direct",
      "      targetBranch: main",
      "      branchPrefix: legit/",
      "",
    ].join("\n"),
  );
}

import fs from "node:fs";

export default async function globalSetup() {
  fs.rmSync("/tmp/copisaurus-e2e-repos", { recursive: true, force: true });
  fs.mkdirSync("/tmp/copisaurus-e2e-repos/public/docs/guide", { recursive: true });
  fs.writeFileSync("/tmp/copisaurus-e2e-repos/public/docs/index.md", "# Public Home\n\nWelcome to docs.\n\n## Start\n\nSearch phrase.");
  fs.writeFileSync("/tmp/copisaurus-e2e-repos/public/docs/guide/index.md", "# Guide\n\nGuide body.");
  fs.writeFileSync(
    "/tmp/copisaurus-e2e.yaml",
    [
      "app:",
      "  name: Copisaurus",
      "auth:",
      "  defaultRole: viewer",
      "  admins:",
      "    emails: []",
      "    domains: []",
      "ai:",
      "  enabled: false",
      "  allowAnonymous: false",
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
      "      branchPrefix: copisaurus/",
      "",
    ].join("\n"),
  );
}

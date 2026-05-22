import { expect, test } from "@playwright/test";
import fs from "node:fs";

test.beforeAll(() => {
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
});

test("renders the migration shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Migration foundation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("renders a public docs page anonymously", async ({ page }) => {
  await page.goto("/public");

  await expect(page.getByRole("heading", { name: "Public Home" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Docs navigation" })).toContainText("guide");
});

test("search UI basic flow", async ({ page }) => {
  await page.goto("/public");

  await page.getByLabel("Search docs").fill("Search phrase");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.locator(".search-popover")).toContainText("index.md");
});

test("editor modal stays hidden for anonymous public readers", async ({ page }) => {
  await page.goto("/public");

  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

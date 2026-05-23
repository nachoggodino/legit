import { expect, test } from "@playwright/test";

test("renders the migration shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documentation repositories" })).toBeVisible();
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

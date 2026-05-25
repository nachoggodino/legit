import { expect, test } from "@playwright/test";

test("renders the migration shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documentation repositories" })).toBeVisible();
  await expect(page.locator(".repo-card", { hasText: "Public Docs" })).toBeVisible();
  await expect(page.locator(".repo-card", { hasText: "Private Docs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("renders a public docs page anonymously", async ({ page }) => {
  await page.goto("/public");

  await expect(page.getByRole("heading", { name: "Public Home" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Docs navigation" })).toContainText("Guide");
});

test("search UI basic flow", async ({ page }) => {
  await page.goto("/public");

  await page.getByLabel("Search docs").fill("Search phrase");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.locator(".search-popover")).toContainText("index.md");
});

test("navigates between indexed markdown documents", async ({ page }) => {
  await page.goto("/public");

  await page.locator("summary", { hasText: "Guide" }).click();
  await page.getByRole("link", { name: "Guide" }).click();

  await expect(page).toHaveURL(/\/public\/guide$/);
  await expect(page.getByRole("heading", { name: "Guide" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Docs navigation" })).toContainText("Home");
});

test("search results link to matching markdown documents", async ({ page }) => {
  await page.goto("/public");

  await page.getByLabel("Search docs").fill("Guide body");
  await page.getByRole("button", { name: "Search" }).click();
  await page.locator(".search-popover a", { hasText: "guide/index.md" }).click();

  await expect(page).toHaveURL(/\/public\/guide$/);
  await expect(page.getByRole("heading", { name: "Guide" })).toBeVisible();
});

test("theme toggle persists the selected theme", async ({ page }) => {
  await page.goto("/");

  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to .* theme/i }).click();
  const selectedTheme = initialTheme === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", selectedTheme);

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", selectedTheme);
});

test("editor modal stays hidden for anonymous public readers", async ({ page }) => {
  await page.goto("/public");

  await expect(page.getByRole("button", { name: "Edit page" })).toHaveCount(0);
});

test("private docs redirect anonymous readers to sign in", async ({ page }) => {
  await page.goto("/private");

  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  await expect(page).not.toHaveURL(/\/private$/);
});

test("unknown repositories render a 404", async ({ page }) => {
  await page.goto("/missing-repo");

  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

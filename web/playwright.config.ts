import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "COREPACK_HOME=/tmp/corepack AUTH_SECRET=copisaurus-e2e-secret COPISAURUS_CONFIG_PATH=/tmp/copisaurus-e2e.yaml COPISAURUS_DATABASE_PATH=/tmp/copisaurus-e2e.db COPISAURUS_REPOS_ROOT=/tmp/copisaurus-e2e-repos corepack pnpm dev --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
  },
});

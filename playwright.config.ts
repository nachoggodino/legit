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
      "COREPACK_HOME=/tmp/corepack AUTH_SECRET=legit-e2e-secret LEGIT_DISABLE_SYNC_SCHEDULER=true LEGIT_CONFIG_PATH=/tmp/legit-e2e.yaml LEGIT_DATABASE_PATH=/tmp/legit-e2e.db LEGIT_REPOS_ROOT=/tmp/legit-e2e-repos corepack pnpm dev --port 3107",
    url: "http://127.0.0.1:3107",
    reuseExistingServer: false,
  },
});

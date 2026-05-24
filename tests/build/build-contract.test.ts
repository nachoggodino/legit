import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("production build contract", () => {
  it("keeps Docker builds on the build-safe Next.js script", () => {
    const dockerfile = fs.readFileSync(path.resolve(__dirname, "../../Dockerfile"), "utf8");

    expect(packageJson.scripts.build).toContain("LEGIT_BUILD_PHASE=1");
    expect(packageJson.scripts.build).toContain("LEGIT_DATABASE_PATH=/tmp/legit-build.db");
    expect(dockerfile).toContain("RUN pnpm build");
  });
});

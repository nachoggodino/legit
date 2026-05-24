import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

process.env.TMPDIR = "/tmp";
process.env.TEMP = "/tmp";
process.env.TMP = "/tmp";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      exclude: ["tests/**"],
      thresholds: {
        statements: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

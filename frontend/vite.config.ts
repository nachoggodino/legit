/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
  resolve: {
    alias: {
      "@site": path.resolve(__dirname, "."),
      "@docusaurus/useDocusaurusContext": path.resolve(
        __dirname,
        "src/test/mocks/useDocusaurusContext.ts"
      ),
      "react-router-dom": path.resolve(
        __dirname,
        "src/test/mocks/react-router-dom.ts"
      ),
    },
  },
});

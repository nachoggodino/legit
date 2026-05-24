import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "web/.next/**",
      "web/coverage/**",
      "web/node_modules/**",
      "web/test-results/**",
    ],
  },
];

export default eslintConfig;

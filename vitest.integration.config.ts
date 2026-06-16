import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "**/*-integration.test.ts",
      "**/*.integration.test.ts",
      "**/split-brain-reconciliation.test.ts",
      "**/security-hardening.test.ts",
      "**/api-authorization.test.ts",
      "**/rate-limit-db.test.ts"
    ],
    exclude: [...configDefaults.exclude, "tests/e2e/**", "playwright-report/**", "test-results/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

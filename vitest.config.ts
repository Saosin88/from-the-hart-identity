import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    reporters: process.env.CI
      ? ["default", ["junit", { outputFile: "junit.xml" }]]
      : "default",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
    },
  },
});

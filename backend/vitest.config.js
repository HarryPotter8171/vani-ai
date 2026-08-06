import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/globalSetup.js"],
    setupFiles: ["./tests/setup.js"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Integration tests share one in-memory Mongo instance; keep them in a
    // single fork so writes/reads across test files never race each other.
    fileParallelism: false,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "controllers/**",
        "services/**",
        "utils/**",
        "middleware/**",
        "models/**",
        "agents/**",
        "mcp/**",
        "browser/**",
        "tools/**",
      ],
      exclude: [
        "**/*.test.js",
        "tests/**",
        "scripts/**",
      ],
    },
  },
});

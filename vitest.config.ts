import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/ui/**/*",
        "src/cli.ts",
        "**/*.d.ts",
        // Pure type-export files (no runtime code — v8 still counts them at 0%).
        "src/types/domain.ts",
        "src/types/feedback.ts",
        "src/storage/adapter.ts",
      ],
      // Per ADR 0010 §3 the project targets 80% lines/statements/functions.
      // Branches naturally lag because every defensive `if (err)` and
      // unreachable error path counts — 65% is a pragmatic floor that flags
      // real gaps without forcing tests for impossible states.
      thresholds: {
        lines: 80,
        branches: 65,
        functions: 80,
        statements: 80,
      },
    },
  },
});

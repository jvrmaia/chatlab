import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/ui/**/*.test.tsx"],
    globals: false,
    environment: "jsdom",
    testTimeout: 10_000,
  },
});

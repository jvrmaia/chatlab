import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "docs-site/**",
      "docs/_capture/**",
      "*.js",
      "src/ui/postcss.config.cjs",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Reset-on-prop-change effects (e.g. clearing selectedChat state) are an established
      // React pattern in this codebase; the architectural alternative (key prop) would require
      // non-trivial restructuring with no correctness benefit.
      "react-hooks/set-state-in-effect": "off",
      // strict tsconfig already enforces no-any; rule would be redundant noise
      "@typescript-eslint/no-explicit-any": "off",
      // Allow underscore-prefixed parameters to signal intentional non-use
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `as unknown as T` is the sanctioned escape hatch for mock types in tests — allow it
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
);

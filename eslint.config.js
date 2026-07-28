import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `.claude/**` covers the throwaway git worktrees agents build in — each
    // carries its own `dist/`, which the top-level `dist/**` pattern does not reach.
    ignores: [
      "dist/**",
      "out/**",
      "node_modules/**",
      "test/fixtures/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The build scripts are plain ESM run by Electron's main process, so they
    // are outside the TypeScript config that would otherwise declare these.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
);

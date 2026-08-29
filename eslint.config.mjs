// Plain ESM rather than TypeScript: ESLint can only load a `.ts` config
// through the extra `jiti` dependency, which this config does not otherwise need.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["lib/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node built-ins for the plain-JS tooling scripts; the TypeScript sources
    // get these from @types/node instead.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-floating-promises": "off",
      eqeqeq: ["error", "always"],
      "no-console": "off",
      "prefer-const": "error",
    },
  },
);

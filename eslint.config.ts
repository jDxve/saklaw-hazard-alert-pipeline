import js from "@eslint/js";
import tseslint from "typescript-eslint";

// ESLint loads a TypeScript config through jiti, which is why it is a
// devDependency — without it, eslint exits with "The 'jiti' library is
// required for loading TypeScript configuration files."
export default tseslint.config(
  {
    ignores: ["lib/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node built-ins for the tooling scripts, which run outside the
    // Functions runtime and so are not covered by the src tsconfig.
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", __dirname: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
    },
  },
);

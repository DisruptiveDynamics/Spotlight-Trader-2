/** Root ESLint config for Spotlight Trader monorepo */
/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "import", "unused-imports"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:markdown/recommended",
  ],
  settings: { 
    "import/resolver": { 
      typescript: true,
      node: true,
    } 
  },
  rules: {
    // Keep noise low; allow underscore-prefixed intentional ignores
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    
    // Import ordering and organization
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
        groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
      },
    ],
    
    // Restrict relative import depth (max 2 levels: ../.. is ok, ../../.. is not)
    "import/no-relative-parent-imports": "off", // We'll use custom rule below
    
    // Prefer named exports for better refactoring
    "import/prefer-default-export": "off",
    "import/no-default-export": "off",
    
    // Require descriptions for ts-expect-error
    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-check": false,
        minimumDescriptionLength: 3,
      },
    ],
    
    // Prevent empty catch blocks
    "no-empty": ["error", { allowEmptyCatch: false }],
    
    // Case block declarations should be wrapped in braces
    "no-case-declarations": "error",
  },
  overrides: [
    // JSON / JSONC
    {
      files: ["**/*.json", "**/*.jsonc"],
      parser: "jsonc-eslint-parser",
      extends: ["plugin:jsonc/recommended-with-json"],
    },
    // Markdown fenced code blocks
    { files: ["**/*.md"], processor: "markdown/markdown" },
    // Node scripts
    { files: ["**/*.config.{js,cjs,mjs}", "scripts/**.{js,ts}"], env: { node: true } },
    // AudioWorklet globals (fixes no-undef in worklets)
    {
      files: ["**/public/worklets/**/*.js"],
      globals: { AudioWorkletProcessor: "readonly", registerProcessor: "readonly" },
    },
  ],
  ignorePatterns: ["dist", "build", "coverage", "node_modules", "**/*.d.ts"],
};

/** Root ESLint config for Spotlight Trader monorepo */
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
  settings: { "import/resolver": { typescript: true } },
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
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
        groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
      },
    ],
  },
  overrides: [
    // JSON / JSONC
    {
      files: ["**/*.json", "**/*.jsonc"],
      parser: "eslint-jsonc",
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

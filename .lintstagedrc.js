/** Lint-staged configuration for pre-commit hooks */
module.exports = {
  // TypeScript & JavaScript files
  "**/*.{ts,tsx,js,jsx,mjs,cjs}": ["eslint --fix --cache --max-warnings 0", "prettier --write"],

  // JSON & JSONC files
  "**/*.{json,jsonc}": ["eslint --fix --cache --max-warnings 0", "prettier --write"],

  // Markdown files
  "**/*.md": ["eslint --fix --cache --max-warnings 0", "prettier --write"],

  // CSS & SCSS
  "**/*.{css,scss}": ["prettier --write"],

  // YAML files
  "**/*.{yml,yaml}": ["prettier --write"],

  // HTML files
  "**/*.html": ["prettier --write"],
};

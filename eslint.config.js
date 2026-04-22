const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

const TS_FILES = [
  "bin/**/*.{ts,tsx,mts}",
  "lib/**/*.{ts,tsx,mts}",
  "sources/**/*.{ts,tsx,mts}",
  "tests/**/*.{ts,tsx,mts}",
];

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  {
    ...js.configs.recommended,
    files: ["bin/*", "*.{js,cjs}", "tests/**/*.{js,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { sourceType: "module" },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: TS_FILES,
    languageOptions: {
      ...(config.languageOptions || {}),
      globals: { ...globals.node },
    },
  })),
  {
    files: TS_FILES,
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

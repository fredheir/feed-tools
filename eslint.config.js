import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const TS_FILES = [
  "bin/**/*.{ts,tsx,mts}",
  "lib/**/*.{ts,tsx,mts}",
  "sources/**/*.{ts,tsx,mts}",
  "tests/**/*.{ts,tsx,mts}",
];

export default [
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  {
    ...js.configs.recommended,
    files: ["bin/*", "*.{js,mjs}", "tests/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { "no-console": "off" },
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
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

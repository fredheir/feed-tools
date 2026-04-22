const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  {
    ...js.configs.recommended,
    files: ["bin/*", "lib/**/*.js", "sources/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: [
      "bin/**/*.ts",
      "bin/**/*.tsx",
      "bin/**/*.mts",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "lib/**/*.mts",
      "sources/**/*.ts",
      "sources/**/*.tsx",
      "sources/**/*.mts",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "tests/**/*.mts",
    ],
    languageOptions: {
      ...(config.languageOptions || {}),
      globals: {
        ...globals.node,
      },
    },
  })),
  {
    files: [
      "bin/**/*.ts",
      "bin/**/*.tsx",
      "bin/**/*.mts",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "lib/**/*.mts",
      "sources/**/*.ts",
      "sources/**/*.tsx",
      "sources/**/*.mts",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "tests/**/*.mts",
    ],
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

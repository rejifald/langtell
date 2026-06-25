// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", ".fallow/"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Architectural boundary: the zero-dependency core must never import the
    // heavy engines. They stay reachable only through their own subpaths, so
    // `import * as langtell` / `import { compile }` never pulls franc's tables.
    files: [
      "src/index.ts",
      "src/compile.ts",
      "src/fuse.ts",
      "src/text.ts",
      "src/html.ts",
      "src/headers.ts",
      "src/types.ts",
      "src/classify.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/franc", "**/franc.js", "franc", "**/chrome-ai", "**/chrome-ai.js"],
              message:
                "Core must stay zero-dependency: keep franc/chrome-ai behind their subpaths; never import them from the core.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test-d.ts"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    files: ["**/*.config.ts", "**/*.config.mjs", "eslint.config.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

import tseslint from "typescript-eslint";
import eslintPluginYml from "eslint-plugin-yml";
import eslintPluginAstro from "eslint-plugin-astro";

/** Narrow rule: blocks only `as any` (TSAsExpression → TSAnyKeyword), not every `any` annotation. */
function createNoAsAnyRule() {
  return {
    meta: {
      type: "problem",
      docs: { description: "Disallow `as any` type assertions" },
      schema: [],
      messages: {
        noAsAny:
          "Unexpected `as any`. Fix the call-site type or use `unknown`; `as any` on workspace-internal APIs silently drops properties and causes runtime bugs.",
      },
    },
    create(context) {
      return {
        TSAsExpression(node) {
          if (node.typeAnnotation && node.typeAnnotation.type === "TSAnyKeyword") {
            context.report({ node, messageId: "noAsAny" });
          }
        },
      };
    },
  };
}

export default tseslint.config(
  // typescript-eslint recommended rules for .ts files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["packages/**/*.ts"],
    ignores: ["packages/**/*.d.ts", "packages/**/*.template.ts", "packages/**/*.template.mjs"],
  })),
  // .ts files — custom rules
  {
    files: ["packages/**/*.ts"],
    ignores: ["packages/**/*.d.ts", "packages/**/*.template.ts", "packages/**/*.template.mjs"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "local-rules": {
        rules: {
          "no-as-any": createNoAsAnyRule(),
        },
      },
    },
    rules: {
      "local-rules/no-as-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // eslint-plugin-astro: parser + plugin setup for .astro files
  ...eslintPluginAstro.configs["flat/base"],
  // typescript-eslint recommended rules for .astro files
  // Strip languageOptions so the astro parser from flat/base is preserved
  ...tseslint.configs.recommended.map(({ languageOptions: _lo, ...config }) => ({
    ...config,
    files: ["**/*.astro"],
    ignores: ["**/*.template.astro"],
    rules: {
      ...config.rules,
      "no-var": "off",
    },
  })),
  // .astro files — custom overrides
  {
    files: ["**/*.astro"],
    ignores: ["**/*.template.astro"],
    plugins: {
      "local-rules": {
        rules: {
          "no-as-any": createNoAsAnyRule(),
        },
      },
    },
    rules: {
      "local-rules/no-as-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-var": "off",
    },
  },
  // .astro inline script virtual files — disable no-var for browser-compatible var usage
  {
    files: ["**/*.astro/*.js", "**/*.astro/*.ts"],
    rules: {
      "no-var": "off",
    },
  },
  // RFC-0493: YAML quoting enforcement via eslint-plugin-yml
  ...eslintPluginYml.configs["flat/base"],
  {
    files: ["**/*.yaml"],
    rules: {
      "yml/plain-scalar": ["error", "always"],
    },
  },
);

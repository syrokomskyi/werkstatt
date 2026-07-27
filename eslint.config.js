import tseslint from "typescript-eslint";
import eslintPluginYml from "eslint-plugin-yml";

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

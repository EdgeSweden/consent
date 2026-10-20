// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Browser bundles. Plan: CSP, and the zero-runtime-dependency rule in AGENTS.md (Safety).
const browserFiles = ["src/core/**/*.ts", "src/gate/**/*.ts", "src/gtag/**/*.ts", "src/index.ts"];

const cspMessage = "Not CSP-clean (plan: CSP).";

// A string literal or a template literal without substitutions whose value matches `pattern`.
const staticString = (pattern) =>
  `:matches(Literal[value=${pattern}], TemplateLiteral[expressions.length=0][quasis.0.value.cooked=${pattern}])`;

export default tseslint.config(
  {
    ignores: ["dist/", "coverage/", "playwright-report/", "test-results/", "examples/*/dist/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: browserFiles,
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-restricted-properties": [
        "error",
        ...[
          "innerHTML",
          "outerHTML",
          "insertAdjacentHTML",
          "setHTMLUnsafe",
          "createContextualFragment",
          "parseFromString",
          "srcdoc",
          "cssText",
        ].map((property) => ({ property, message: cspMessage })),
        { object: "document", property: "write", message: cspMessage },
        { object: "document", property: "writeln", message: cspMessage },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `CallExpression[callee.property.name=/^setAttribute(NS)?$/] > ${staticString("/^style$/i")}.arguments`,
          message: `${cspMessage} Use style.setProperty for one custom property at a time.`,
        },
        {
          selector: `CallExpression[callee.property.name=/^createElement(NS)?$/] > ${staticString("/^style$/i")}.arguments`,
          message: `${cspMessage} The stylesheet ships as a bundled asset.`,
        },
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name='style']",
          message: `${cspMessage} Use style.setProperty.`,
        },
        {
          selector:
            "AssignmentExpression > MemberExpression.left > MemberExpression.object[property.name='style']",
          message: `${cspMessage} Use style.setProperty.`,
        },
        {
          selector: "NewExpression[callee.name='Function'], CallExpression[callee.name='Function']",
          message: cspMessage,
        },
        {
          // no-restricted-imports does not see import(); only a statically relative one is allowed.
          selector:
            "ImportExpression:not([source.value=/^\\./]):not([source.quasis.0.value.cooked=/^\\./])",
          message:
            "Browser entries have zero runtime dependencies; dynamic imports must be relative.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^[^.]",
              message:
                "Browser entries have zero runtime dependencies; zod and Astro belong to ./astro only.",
            },
          ],
        },
      ],
    },
  },
);

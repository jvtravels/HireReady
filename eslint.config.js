import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      ".tempo/",
      "tempo/**",
      ".vercel/**",
      ".next/**",
      "public/**",
      "scripts/**",
      // loadtest/ runs in Node (no browser globals); lint-on-it produces
      // noise since the eslint config targets browser + Next code paths.
      "loadtest/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Codebase-health guardrails — enforce hygiene rules the team picked
      // during the 10/10 audit push. Ratchet limits downward over time.
      //
      // max-lines: warn when a single file crosses ~1500 LOC. Not an error
      // (we have legitimate outliers like SessionReportView) but visible
      // in PR review. Count excludes blank lines and comments so format
      // changes don't trip it.
      "max-lines": ["warn", {
        max: 1500,
        skipBlankLines: true,
        skipComments: true,
      }],
      // Ban `as unknown as SomeType` in production code. The pattern is
      // a grep-able "give up on types here" signal and masked the resume-
      // data drift bug we just fixed. Test files are exempt via the
      // override below — mocks legitimately need it.
      "no-restricted-syntax": ["warn", {
        selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
        message: "Avoid `as unknown as X` in production code — define a discriminated union or type guard instead. (See resumeParser.ts StoredResume for the pattern.) This rule is off in src/__tests__/* where mocks need it.",
      }],
    },
  },
  // Test-file exemptions: mocks and fixtures legitimately need the escape
  // hatches we ban elsewhere.
  {
    files: ["src/__tests__/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
      "max-lines": "off",
    },
  },
  eslintConfigPrettier,
);

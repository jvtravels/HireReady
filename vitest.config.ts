import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "src/__tests__/**/*.{test,spec}.{ts,tsx}",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "tests/e2e/**",
      "tests/example.spec.ts",
      "node_modules",
      ".next",
    ],
    setupFiles: ["./src/__tests__/vitest-setup.ts"],
    coverage: {
      // v8 is the built-in provider — no extra deps needed.
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      include: [
        "src/**/*.{ts,tsx}",
        "server-handlers/**/*.ts",
        "data/**/*.ts",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "src/__tests__/**",
        "tests/**",
        "**/node_modules/**",
        // Next.js boilerplate / glue that tests would exercise indirectly.
        "src/index.css",
        // Large pure-data files — 100% coverage gives no signal, they're
        // consumed by imports-only which already get counted via the
        // handler under test.
        "data/role-competencies.ts",
        "data/company-guidance.ts",
        "data/salary-lookup.ts",
        "data/salaries.ts",
        "data/city-tiers.ts",
        "data/company-tiers.ts",
      ],
      // Baseline thresholds — set 0.5-1 point below current values so CI
      // turns red on any regression. Bump these up each time a new test
      // batch lifts actual numbers. Current (2026-04-24 after +65 tests
      // for subscription actions, notebook sort, nextMove picker, profile
      // sanitisation): lines 19.2%, statements 18.1%, functions 16.0%,
      // branches 15.5%.
      //
      // Why not 80%? 60% of the codebase is UI JSX components that our
      // pure-function tests don't touch. The useful metric is pure logic
      // + handler coverage; enforcing 80% globally would force snapshot
      // tests on every component. Raise when Playwright + MSW integration
      // tests cover the UI paths.
      thresholds: {
        lines: 18,
        statements: 17,
        functions: 15,
        branches: 14,
      },
    },
  },
});

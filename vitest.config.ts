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
  },
});

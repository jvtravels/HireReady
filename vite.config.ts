import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const tempoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const { tempoAnnotate } = await import("tempo-sdk");

  return {
    root: tempoRoot,
    plugins: [
      tempoAnnotate(),
      react(),
      tsconfigPaths({
        projectDiscovery: "lazy",
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "pdf": ["pdfjs-dist"],
            "vendor-analytics": ["@vercel/analytics"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/__tests__/setup.ts"],
      pool: "forks",
      exclude: ["tests/e2e/**", "tests/example.spec.ts", "node_modules/**"],
    },
  };
});

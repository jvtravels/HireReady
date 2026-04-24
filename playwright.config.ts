import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
    {
      // Tablet coverage — iPad hits the 768px breakpoint bucket, distinct
      // from phone-portrait (375–414) and desktop (1280+). Caught a
      // dashboard grid regression during dogfooding that neither 'mobile'
      // nor 'chromium' would have.
      name: "tablet",
      use: { ...devices["iPad Pro 11"] },
    },
    {
      // Android mid-range — larger viewport than iPhone 13 and different
      // default font metrics. Catches Android-specific layout bugs that
      // iOS Safari absorbs silently.
      name: "android",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

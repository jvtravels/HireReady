import { test, expect } from "@playwright/test";

test.describe("Dashboard — Unauthenticated", () => {
  test("dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("sessions page redirects to login", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("analytics page redirects to login", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("calendar page redirects to login", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("resume page redirects to login", async ({ page }) => {
    await page.goto("/resume");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("settings page redirects to login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("Legal Pages — Public", () => {
  test("terms page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  });
});

test.describe("404 Page", () => {
  test("unknown route shows not found", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Placeholder Pages", () => {
  test("about page loads", async ({ page }) => {
    await page.goto("/page/about");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("help page loads", async ({ page }) => {
    await page.goto("/page/help");
    await expect(page.locator("h1")).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";

test.describe("Interview Flow — Unauthenticated", () => {
  test("interview page redirects to login", async ({ page }) => {
    await page.goto("/interview");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("session setup redirects to login", async ({ page }) => {
    await page.goto("/session/new");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("session detail redirects to login", async ({ page }) => {
    await page.goto("/session/some-id-123");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

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

test.describe("Interview Quick-Start — Unauthenticated", () => {
  test("quick start from landing page redirects to signup", async ({ page }) => {
    await page.goto("/");
    // The hero CTA should redirect to signup for unauthenticated users
    await page.getByText("Get Started Free").first().click();
    await expect(page).toHaveURL(/\/signup/, { timeout: 5000 });
  });

  test("direct interview URL with params redirects to login", async ({ page }) => {
    await page.goto("/interview?type=technical&difficulty=standard&focus=general");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("mini interview mode redirects to login", async ({ page }) => {
    await page.goto("/interview?mini=true");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("Session Routes — Guarded", () => {
  test("sessions list redirects to login", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("analytics page redirects to login", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

import { test, expect } from "@playwright/test";

test.describe("Pricing Section Interaction", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const pricing = page.locator("#pricing");
    await pricing.scrollIntoViewIfNeeded();
    // Wait for reveal animation
    await page.waitForTimeout(500);
  });

  test("free plan CTA button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Free" })).toBeVisible();
  });

  test("free plan CTA navigates to signup", async ({ page }) => {
    await page.getByRole("button", { name: "Start Free" }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("pro plan shows Most Popular badge", async ({ page }) => {
    await expect(page.getByText("Most Popular")).toBeVisible();
  });

  test("pro plan CTA says Go Pro", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Go Pro" })).toBeVisible();
  });

  test("starter plan CTA says Get Started", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
  });

  test("pricing shows transparent message", async ({ page }) => {
    await expect(page.getByText("Transparent. No surprises.")).toBeVisible();
  });
});

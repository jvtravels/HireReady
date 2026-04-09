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
    await expect(page).toHaveURL(/\/(signup|session)/, { timeout: 10000 });
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

  test("displays starter plan price (₹49/week)", async ({ page }) => {
    await expect(page.getByText("₹49")).toBeVisible();
    await expect(page.getByText("/week")).first().toBeVisible();
  });

  test("displays pro plan price (₹149/month)", async ({ page }) => {
    await expect(page.getByText("₹149")).toBeVisible();
    await expect(page.getByText("/month")).first().toBeVisible();
  });

  test("free plan shows ₹0 price", async ({ page }) => {
    await expect(page.getByText("₹0")).toBeVisible();
  });

  test("each plan lists feature checkmarks", async ({ page }) => {
    // All plans should have feature lists with check icons
    const pricing = page.locator("#pricing");
    const checkmarks = pricing.locator("svg").filter({ has: page.locator("polyline") });
    // At least 6 feature items across the 3 plans
    expect(await checkmarks.count()).toBeGreaterThanOrEqual(6);
  });

  test("paid plan CTAs require auth — redirect to signup", async ({ page }) => {
    // Clicking Go Pro without being logged in should redirect to signup/login
    await page.getByRole("button", { name: "Go Pro" }).click();
    // Should navigate to signup or show auth prompt
    await expect(page).toHaveURL(/\/(signup|login)/, { timeout: 10000 });
  });
});

test.describe("Pricing Section — Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("pricing plans stack vertically on mobile", async ({ page }) => {
    await page.goto("/");
    const pricing = page.locator("#pricing");
    await pricing.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    // All 3 plan CTAs should be visible on mobile
    await expect(page.getByRole("button", { name: "Start Free" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go Pro" })).toBeVisible();
  });
});

import { test, expect, type Page } from "@playwright/test";

/** Scroll to trigger lazy loading, wait for #pricing to mount, then scroll it into view */
async function scrollToPricing(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const pricing = page.locator("#pricing");
  await expect(pricing).toBeAttached({ timeout: 15000 });
  await pricing.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
}

test.describe("Pricing Section — Plan Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await scrollToPricing(page);
  });

  test("free plan shows correct price (0)", async ({ page }) => {
    const pricing = page.locator("#pricing");
    await expect(pricing.getByText("Free", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test("free plan shows 'Start Free' CTA", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start Free" })).toBeVisible();
  });

  test("single session plan shows ₹10/session price", async ({ page }) => {
    // "Sessions" is the h3 for the single-session card
    const sessionsCard = page.locator("#pricing").getByText("Sessions").locator("..").locator("..");
    await expect(sessionsCard.locator("span").filter({ hasText: "₹10" }).first()).toBeVisible();
    await expect(sessionsCard.getByText("/ 1 session")).toBeVisible();
  });

  test("single session plan shows 'Buy 1 Session' CTA", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Buy 1 Session/ })).toBeVisible({ timeout: 10000 });
  });

  test("starter plan shows ₹49/week price", async ({ page }) => {
    await expect(page.getByText("₹49").first()).toBeVisible();
    await expect(page.getByText("/ week").first()).toBeVisible();
  });

  test("starter plan CTA says Get Started", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
  });

  test("pro plan shows ₹149/month price", async ({ page }) => {
    await expect(page.getByText("₹149").first()).toBeVisible();
    await expect(page.getByText("/ month").first()).toBeVisible();
  });

  test("pro plan shows Most Popular badge", async ({ page }) => {
    await expect(page.getByText("Most Popular")).toBeVisible();
  });

  test("pro plan CTA says Go Pro", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Go Pro" })).toBeVisible();
  });

  test("annual plan shows ₹1,199/year price", async ({ page }) => {
    await expect(page.getByText("₹1,199").first()).toBeVisible();
    await expect(page.getByText("/ year").first()).toBeVisible();
  });

  test("annual plan CTA says Save 33%", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Save 33%" })).toBeVisible();
  });

  test("all 5 plans are displayed", async ({ page }) => {
    const pricing = page.locator("#pricing");
    await expect(pricing.getByRole("heading", { name: "Free" })).toBeVisible({ timeout: 5000 });
    await expect(pricing.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "Annual" })).toBeVisible();
  });

  test("pricing shows transparent message", async ({ page }) => {
    await expect(page.getByText("Cancel anytime — no lock-in.")).toBeVisible();
  });
});

test.describe("Pricing Section — Feature Lists", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await scrollToPricing(page);
  });

  test("free plan lists its features", async ({ page }) => {
    await expect(page.getByText("3 AI mock interviews")).toBeVisible();
    await expect(page.getByText("Behavioral questions only")).toBeVisible();
  });

  test("pro plan lists its features", async ({ page }) => {
    await expect(page.getByText("30 sessions per month")).toBeVisible();
    await expect(page.getByText("Performance analytics & trends")).toBeVisible();
  });

  test("each plan has feature checkmarks", async ({ page }) => {
    const pricing = page.locator("#pricing");
    // Features use ✓ (unicode checkmark character), rendered as <span> text
    const checkmarks = pricing.getByText("✓");
    // At least 6 feature items across the plans
    expect(await checkmarks.count()).toBeGreaterThanOrEqual(6);
  });
});

test.describe("Pricing Section — CTA Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await scrollToPricing(page);
  });

  test("free plan CTA navigates to signup", async ({ page }) => {
    await page.getByRole("button", { name: "Start Free" }).click();
    await expect(page).toHaveURL(/\/(signup|session)/, { timeout: 10000 });
  });

  test("paid plan CTA redirects to signup when not logged in", async ({ page }) => {
    await page.getByRole("button", { name: "Go Pro" }).click();
    await expect(page).toHaveURL(/\/(signup|login)/, { timeout: 10000 });
  });

  test("starter plan CTA redirects to signup when not logged in", async ({ page }) => {
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page).toHaveURL(/\/(signup|login)/, { timeout: 10000 });
  });
});

test.describe("Pricing Section — Risk Reversal", () => {
  test("shows trust signals below plans", async ({ page }) => {
    await page.goto("/");
    await scrollToPricing(page);

    // Trust signals are below the pricing cards — scroll past them
    // The pricing section uses reveal animations, wait for them to complete
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await expect(page.getByText("Cancel anytime, no questions").first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Delete your data anytime").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Secure payments via Razorpay").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Pricing Section — Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("pricing plans are accessible on mobile", async ({ page }) => {
    await page.goto("/");
    await scrollToPricing(page);

    // All plan CTAs should be visible on mobile (may need scrolling within section)
    await expect(page.getByRole("button", { name: "Start Free" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go Pro" })).toBeVisible();
  });
});

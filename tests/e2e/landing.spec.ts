import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero with B2C headline", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    // Animated words — check the key word appears
    await expect(h1).toContainText("interview", { timeout: 5000 });
  });

  test("shows navigation links on desktop", async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, "Nav links hidden on mobile");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "How It Works" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
  });

  test("shows Get Started Free CTA", async ({ page }) => {
    await expect(page.getByText("Get Started Free").first()).toBeVisible();
  });

  test("CTA links to signup for unauthenticated users", async ({ page }) => {
    await page.getByText("Get Started Free").first().click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("shows social proof badge", async ({ page }) => {
    await expect(page.getByText(/start practicing for free/i)).toBeVisible();
  });

  test("company logos section is visible", async ({ page }) => {
    await page.evaluate(() => window.scrollBy(0, 800));
    await expect(page.getByText("Our users have landed roles at")).toBeVisible({ timeout: 5000 });
  });

  test("pricing section has three plans", async ({ page }) => {
    const pricing = page.locator("#pricing");
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing.getByRole("heading", { name: "Free" })).toBeVisible({ timeout: 5000 });
    await expect(pricing.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "Pro" })).toBeVisible();
  });

  test("how it works section has three steps", async ({ page }) => {
    const section = page.locator("#how-it-works");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Upload your resume")).toBeVisible({ timeout: 5000 });
    await expect(section.getByText("Practice in real time")).toBeVisible();
    await expect(section.getByText("Review scored feedback")).toBeVisible();
  });

  test("features section shows B2C heading", async ({ page }) => {
    const section = page.locator("#features");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Everything you need to ace the interview")).toBeVisible({ timeout: 5000 });
  });

  test("testimonials show B2C personas", async ({ page }) => {
    await page.evaluate(() => window.scrollBy(0, 5000));
    await expect(page.getByText("People who practiced here got hired")).toBeVisible({ timeout: 5000 });
  });

  test("footer renders with brand and legal links", async ({ page }) => {
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText("HireStepX")).toBeVisible();
    await expect(footer.getByText("Privacy Policy")).toBeVisible();
    await expect(footer.getByText("Terms of Service")).toBeVisible();
  });

  test("See How It Works scrolls to section", async ({ page }) => {
    await page.getByRole("button", { name: "See How It Works" }).click();
    // Wait for smooth scroll
    await page.waitForTimeout(800);
    const section = page.locator("#how-it-works");
    await expect(section).toBeInViewport();
  });
});

test.describe("Landing Page — Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("mobile nav toggle exists", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(".mobile-nav-toggle");
    await expect(toggle).toBeVisible();
  });

  test("mobile nav opens overlay", async ({ page }) => {
    await page.goto("/");
    await page.locator(".mobile-nav-toggle").click();
    await expect(page.locator("[role=dialog]")).toBeVisible();
    await expect(page.getByText("Sign up").last()).toBeVisible();
  });

  test("mobile nav closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.locator(".mobile-nav-toggle").click();
    await expect(page.locator("[role=dialog]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[role=dialog]")).not.toBeVisible();
  });
});

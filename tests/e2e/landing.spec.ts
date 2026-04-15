import { test, expect } from "@playwright/test";

test.describe("Landing Page — Core", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with HireStepX in title", async ({ page }) => {
    await expect(page).toHaveTitle(/HireStepX/);
  });

  test("renders hero with headline containing 'interview'", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("interview", { timeout: 5000 });
  });

  test("shows Get Started Free CTA in hero", async ({ page }) => {
    await expect(page.getByText("Get Started Free").first()).toBeVisible();
  });

  test("CTA links to signup for unauthenticated users", async ({ page }) => {
    await page.getByText("Get Started Free").first().click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("shows social proof badge with launch info", async ({ page }) => {
    await expect(page.getByText(/3 free sessions, no credit card/i)).toBeVisible();
  });
});

test.describe("Landing Page — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows navigation links on desktop", async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, "Nav links hidden on mobile");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "How It Works" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
  });

  test("login link is visible on desktop", async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, "Login link hidden on mobile");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: /log\s*in/i })).toBeVisible();
  });

  test("sign up link is visible on desktop", async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, "Sign up link hidden on mobile");
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: /sign\s*up/i })).toBeVisible();
  });
});

test.describe("Landing Page — Sections", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("company logos section is visible", async ({ page }) => {
    await page.evaluate(() => window.scrollBy(0, 800));
    await expect(page.getByText("Practice for interviews at 50+ companies including")).toBeVisible({ timeout: 5000 });
  });

  test("how it works section has three steps", async ({ page }) => {
    const section = page.locator("#how-it-works");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Upload your resume")).toBeVisible({ timeout: 5000 });
    await expect(section.getByText("Practice in real time")).toBeVisible();
    await expect(section.getByText("Review scored feedback")).toBeVisible();
  });

  test("See How It Works button scrolls to section", async ({ page }) => {
    await page.getByRole("button", { name: "See How It Works" }).click();
    await page.waitForTimeout(800);
    const section = page.locator("#how-it-works");
    await expect(section).toBeInViewport();
  });

  test("features section shows heading", async ({ page }) => {
    const section = page.locator("#features");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Not generic tips. Specific, scored practice.")).toBeVisible({ timeout: 5000 });
  });

  test("pricing section has Free, Starter, and Pro plans", async ({ page }) => {
    // Trigger lazy loading by scrolling to bottom, then scroll again after lazy content mounts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for lazy-loaded pricing section to appear in DOM
    const pricing = page.locator("#pricing");
    await expect(pricing).toBeAttached({ timeout: 8000 });
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing.getByRole("heading", { name: "Free" })).toBeVisible({ timeout: 8000 });
    await expect(pricing.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(pricing.getByRole("heading", { name: "Pro" })).toBeVisible();
  });

  test("pricing section shows Sessions and Annual plans", async ({ page }) => {
    // Trigger lazy loading by scrolling to bottom, then scroll again after lazy content mounts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const pricing = page.locator("#pricing");
    await expect(pricing).toBeAttached({ timeout: 8000 });
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing.getByRole("heading", { name: "Sessions" })).toBeVisible({ timeout: 8000 });
    await expect(pricing.getByRole("heading", { name: "Annual" })).toBeVisible();
  });

  test("testimonials section heading is visible", async ({ page }) => {
    // Trigger lazy loading by scrolling to bottom, then scroll again after lazy content mounts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText("They practiced here. Then got the offer.")).toBeVisible({ timeout: 8000 });
  });
});

test.describe("Landing Page — FAQ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Trigger lazy loading by scrolling to bottom of page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for lazy content to mount, then scroll again to reach newly-rendered sections
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for FAQ heading to appear (lazy-loaded + reveal animation)
    await expect(page.getByText("Frequently asked questions")).toBeVisible({ timeout: 10000 });
    // Scroll the FAQ section into view so reveal fires on child elements
    const faqHeading = page.getByText("Frequently asked questions");
    await faqHeading.scrollIntoViewIfNeeded();
  });

  test("FAQ section displays questions", async ({ page }) => {
    await expect(page.getByText("Is HireStepX free to use?")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("How does the AI mock interview work?")).toBeVisible();
  });

  test("FAQ item expands on click", async ({ page }) => {
    const faqButton = page.getByRole("button").filter({ hasText: "Is HireStepX free to use?" });
    await expect(faqButton).toBeVisible({ timeout: 5000 });
    await faqButton.click();
    // Answer should become visible after expanding
    await expect(page.getByText(/Start with 3 full AI mock interviews/)).toBeVisible({ timeout: 3000 });
  });

  test("FAQ item collapses on second click", async ({ page }) => {
    const faqButton = page.getByRole("button").filter({ hasText: "Is HireStepX free to use?" });
    await expect(faqButton).toBeVisible({ timeout: 5000 });
    // Expand
    await faqButton.click();
    await expect(faqButton).toHaveAttribute("aria-expanded", "true");
    // Collapse
    await faqButton.click();
    // The answer container collapses via maxHeight: 0 — check aria-expanded
    await expect(faqButton).toHaveAttribute("aria-expanded", "false");
  });

  test("FAQ aria-expanded toggles correctly", async ({ page }) => {
    const faqButton = page.getByRole("button").filter({ hasText: "Is HireStepX free to use?" });
    await expect(faqButton).toBeVisible({ timeout: 5000 });
    await expect(faqButton).toHaveAttribute("aria-expanded", "false");
    await faqButton.click();
    await expect(faqButton).toHaveAttribute("aria-expanded", "true");
    await faqButton.click();
    await expect(faqButton).toHaveAttribute("aria-expanded", "false");
  });

  test("only one FAQ item is open at a time", async ({ page }) => {
    // Scope to FAQ section to avoid matching other aria-expanded buttons on the page
    const faqSection = page.getByText("Frequently asked questions").locator("..").locator("..");
    const faqButtons = faqSection.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    test.skip(count < 2, "Not enough FAQ items to test accordion");
    const first = faqButtons.nth(0);
    const second = faqButtons.nth(1);
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeVisible({ timeout: 5000 });
    // Open first FAQ
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    // Open second FAQ — first should close (accordion behavior)
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Landing Page — Footer", () => {
  test("footer renders with brand and legal links", async ({ page }) => {
    await page.goto("/");
    // Trigger lazy loading — footer is lazy-loaded via React.lazy
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for lazy content to mount, then scroll again to reach the footer
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator("footer");
    await expect(footer).toBeAttached({ timeout: 10000 });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText("HireStepX")).toBeVisible({ timeout: 5000 });
    await expect(footer.getByText("Privacy Policy")).toBeVisible();
    await expect(footer.getByText("Terms of Service")).toBeVisible();
  });

  test("privacy policy link navigates correctly", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator("footer");
    await expect(footer).toBeAttached({ timeout: 10000 });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText("Privacy Policy")).toBeVisible({ timeout: 5000 });
    await footer.getByText("Privacy Policy").click();
    await expect(page).toHaveURL(/\/privacy/);
  });

  test("terms of service link navigates correctly", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator("footer");
    await expect(footer).toBeAttached({ timeout: 10000 });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText("Terms of Service")).toBeVisible({ timeout: 5000 });
    await footer.getByText("Terms of Service").click();
    await expect(page).toHaveURL(/\/terms/);
  });
});

test.describe("Landing Page — Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("mobile nav toggle exists", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(".mobile-nav-toggle");
    await expect(toggle).toBeVisible();
  });

  test("mobile nav opens overlay with links", async ({ page }) => {
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

  test("hero CTA is visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Get Started Free").first()).toBeVisible();
  });
});

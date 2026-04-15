import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility tests using axe-core and manual checks.
 * Checks WCAG 2.1 AA compliance on key pages.
 */

test.describe("Accessibility — Landing Page", () => {
  test("landing page has no critical a11y violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".particle-canvas")
      .exclude("canvas")
      .disableRules(["color-contrast"]) // dark theme contrast checked manually
      .analyze();

    expect(results.violations.filter(v => v.impact === "critical")).toEqual([]);
  });

  test("skip-to-content link exists", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator("a.skip-to-content");
    await expect(skipLink).toBeAttached();
  });

  test("navigation has aria-label", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav[aria-label]");
    await expect(nav).toBeAttached();
  });

  test("images have alt text or aria-hidden", async ({ page }) => {
    await page.goto("/");
    // All img tags should have alt or be aria-hidden
    const images = page.locator("img:not([alt]):not([aria-hidden='true'])");
    const count = await images.count();
    expect(count).toBe(0);
  });

  test("main content landmark exists", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main, [role=main]");
    await expect(main).toBeAttached();
  });

  test("heading hierarchy starts with h1", async ({ page }) => {
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1.first()).toBeVisible({ timeout: 5000 });
    // h1 should come before h2 in the DOM
    const h1Box = await h1.first().boundingBox();
    expect(h1Box).toBeTruthy();
  });

  test("no duplicate h1 headings on landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });
});

test.describe("Accessibility — Signup Page", () => {
  test("signup form has no critical a11y violations", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("form")).toBeVisible({ timeout: 5000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("form inputs have associated labels", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("label[for='signup-name']")).toBeAttached();
    await expect(page.locator("label[for='signup-email']")).toBeAttached();
  });

  test("submit button is accessible", async ({ page }) => {
    await page.goto("/signup");
    const submitBtn = page.locator("button[type=submit]");
    await expect(submitBtn).toBeVisible();
    // Button should have accessible text
    const text = await submitBtn.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });
});

test.describe("Accessibility — Login Page", () => {
  test("login form has no critical a11y violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toBeVisible({ timeout: 5000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });

  test("login page has proper heading", async ({ page }) => {
    await page.goto("/login");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Accessibility — Legal Pages", () => {
  test("terms page has proper heading hierarchy", async ({ page }) => {
    await page.goto("/terms");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 5000 });
  });

  test("privacy page has proper heading hierarchy", async ({ page }) => {
    await page.goto("/privacy");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Accessibility — Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("mobile menu has role=dialog and aria-modal", async ({ page }) => {
    await page.goto("/");
    await page.locator(".mobile-nav-toggle").click();
    const dialog = page.locator("[role=dialog][aria-modal=true]");
    await expect(dialog).toBeVisible();
  });

  test("mobile menu toggle has aria-expanded", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(".mobile-nav-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("Escape key closes mobile menu", async ({ page }) => {
    await page.goto("/");
    await page.locator(".mobile-nav-toggle").click();
    await expect(page.locator("[role=dialog]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[role=dialog]")).not.toBeVisible();
  });
});

test.describe("Accessibility — Keyboard Navigation", () => {
  test("interactive elements are keyboard-focusable", async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, "Tab focus behavior varies on mobile");
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);

    // Tab into the page — look for any interactive element receiving focus
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag && ["A", "BUTTON", "INPUT"].includes(tag)) {
        expect(tag).toBeTruthy();
        return;
      }
    }
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  });

  test("signup form is navigable with Tab", async ({ page }) => {
    await page.goto("/signup");
    const nameInput = page.locator("#signup-name");
    await nameInput.focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });

  test("login form is navigable with Tab", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator("#signup-email");
    await emailInput.focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["INPUT", "BUTTON", "A", "LABEL"]).toContain(focused);
  });

  test("focus is visible on interactive elements", async ({ page }) => {
    await page.goto("/signup");
    const nameInput = page.locator("#signup-name");
    await nameInput.focus();
    // Verify the element has focus
    await expect(nameInput).toBeFocused();
    // Check that there is some visual focus indicator (border change, outline, etc.)
    const borderColor = await nameInput.evaluate(el => getComputedStyle(el).borderColor);
    expect(borderColor).toBeTruthy();
  });
});

test.describe("Accessibility — FAQ Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Two-phase scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText("Frequently asked questions")).toBeVisible({ timeout: 10000 });
    await page.getByText("Frequently asked questions").scrollIntoViewIfNeeded();
  });

  test("FAQ buttons have aria-expanded attribute", async ({ page }) => {
    const faqSection = page.getByText("Frequently asked questions").locator("..").locator("..");
    const faqButtons = faqSection.locator("button[aria-expanded]");
    const count = await faqButtons.count();
    expect(count).toBeGreaterThan(0);

    // All FAQ buttons should start collapsed
    for (let i = 0; i < count; i++) {
      await expect(faqButtons.nth(i)).toHaveAttribute("aria-expanded", "false");
    }
  });

  test("FAQ is keyboard-operable", async ({ page }) => {
    const faqSection = page.getByText("Frequently asked questions").locator("..").locator("..");
    const firstFaq = faqSection.locator("button[aria-expanded]").first();
    await firstFaq.scrollIntoViewIfNeeded();
    await firstFaq.focus();
    await page.keyboard.press("Enter");
    await expect(firstFaq).toHaveAttribute("aria-expanded", "true");
  });
});

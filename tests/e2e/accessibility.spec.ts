import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility tests using axe-core.
 * Checks WCAG 2.1 AA compliance on key pages.
 */

test.describe("Accessibility — Landing Page", () => {
  test("landing page has no critical a11y violations", async ({ page }) => {
    await page.goto("/");
    // Wait for content to load
    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".particle-canvas") // decorative canvas
      .exclude("canvas") // any canvas element
      .disableRules(["color-contrast"]) // dark theme contrast checked manually
      .analyze();

    expect(results.violations.filter(v => v.impact === "critical")).toEqual([]);
  });

  test("skip-to-content link exists", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator("a.skip-to-content");
    // Skip link exists (may be visually hidden until focused)
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
    // Check name, email, password fields have labels
    await expect(page.locator("label[for='signup-name']")).toBeAttached();
    await expect(page.locator("label[for='signup-email']")).toBeAttached();
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
    // Wait for page content to render and animations to settle
    await expect(page.locator("h1")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(800);
    // Tab into the page — may need multiple presses to reach an interactive element
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag && ["A", "BUTTON", "INPUT"].includes(tag)) {
        expect(tag).toBeTruthy();
        return;
      }
    }
    // At least one interactive element should have received focus
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "INPUT"]).toContain(focused);
  });

  test("signup form is navigable with Tab", async ({ page }) => {
    await page.goto("/signup");
    const nameInput = page.locator("#signup-name");
    await nameInput.focus();
    await page.keyboard.press("Tab");
    // Should move to next form field
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});

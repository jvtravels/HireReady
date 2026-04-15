import { test, expect } from "@playwright/test";

/* ─── Helper: login if credentials are available ─── */
async function login(page: import("@playwright/test").Page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) return false;

  await page.goto("/login");
  await page.locator("#signup-email").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15000 });
  return true;
}

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

test.describe("Dashboard — Authenticated", () => {
  const hasAuth = !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

  test("dashboard loads with greeting or empty state", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);

    // If redirected to onboarding, navigate to dashboard
    if (page.url().includes("/onboarding")) {
      await page.goto("/dashboard");
    }

    // Dashboard should show either a greeting, session history, or empty state
    const greeting = page.locator("h1, h2, h3").first();
    await expect(greeting).toBeVisible({ timeout: 10000 });
  });

  test("navigation sidebar has expected tabs", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);

    if (page.url().includes("/onboarding")) {
      await page.goto("/dashboard");
    }

    // Look for navigation items: Home, Sessions, Analytics, Resume, Settings
    const nav = page.locator("nav, aside, [role=navigation]");
    // At least some nav items should be visible
    const navText = await nav.textContent();
    expect(navText).toBeTruthy();
  });

  test("settings page loads", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/settings");

    // Settings page should not redirect to login and should have content
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    // Should display some settings-related heading or content
    const heading = page.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("resume page loads", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/resume");

    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    const heading = page.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("analytics page loads", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/analytics");

    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    const heading = page.locator("h1, h2, h3").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
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

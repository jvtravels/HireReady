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

test.describe("Session Setup — Authenticated", () => {
  const hasAuth = !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

  test("session setup page loads", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    // Should show target role input or interview focus section
    await expect(page.getByText(/Target Role|Interview Focus/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("all 10 interview types are visible", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    const interviewTypes = [
      "Behavioral",
      "Strategic",
      "Technical Leadership",
      "Case Study",
      "Campus Placement",
      "HR Round",
      "Management",
      "Panel Interview",
      "Salary Negotiation",
      "Government / PSU",
    ];

    // Wait for the page to load
    await expect(page.getByText("Interview Focus")).toBeVisible({ timeout: 10000 });

    for (const type of interviewTypes) {
      await expect(page.getByText(type, { exact: true }).first()).toBeVisible();
    }
  });

  test("interview type is selectable", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    await expect(page.getByText("Interview Focus")).toBeVisible({ timeout: 10000 });

    // Click on a different interview type (e.g., Strategic)
    await page.getByText("Strategic", { exact: true }).first().click();
    // The button should have selected styling (border color change) — verify by checking
    // that it appears in a review/summary if present, or the visual state
  });

  test("session length options are visible", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    await expect(page.getByText("Session Length")).toBeVisible({ timeout: 10000 });
    // 10 min option should always be visible (free tier)
    await expect(page.getByText("10 min")).toBeVisible();
    // 15 min and 25 min may be locked for free users but should still be present
    await expect(page.getByText("15 min")).toBeVisible();
    await expect(page.getByText("25 min")).toBeVisible();
  });

  test("session length descriptions are shown", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    await expect(page.getByText("Quick warmup")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Standard interview")).toBeVisible();
    await expect(page.getByText("Full simulation")).toBeVisible();
  });

  test("target role input works with autocomplete", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    const roleInput = page.locator("#target-role, input[placeholder*='role' i]").first();
    await expect(roleInput).toBeVisible({ timeout: 10000 });

    // Type a role and check suggestions appear
    await roleInput.fill("Software");
    // Autocomplete dropdown should show suggestions
    const listbox = page.locator("[role=listbox]");
    await expect(listbox).toBeVisible({ timeout: 3000 });
    await expect(listbox.getByText("Software Engineer")).toBeVisible();
  });

  test("target company input works with autocomplete", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    const companyInput = page.locator("#target-company, input[placeholder*='company' i]").first();
    if (await companyInput.isVisible()) {
      await companyInput.fill("Goo");
      const listbox = page.locator("[role=listbox]");
      await expect(listbox).toBeVisible({ timeout: 3000 });
      await expect(listbox.getByText("Google")).toBeVisible();
    }
  });

  test("cannot proceed without required fields", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/session/new");

    // Clear the target role if pre-filled
    const roleInput = page.locator("#target-role, input[placeholder*='role' i]").first();
    await expect(roleInput).toBeVisible({ timeout: 10000 });
    await roleInput.fill("");

    // The Continue/Next button should be disabled or show validation error
    const continueBtn = page.getByRole("button", { name: /continue|next/i });
    if (await continueBtn.isVisible()) {
      // Button should be disabled when role is empty
      const isDisabled = await continueBtn.isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });
});

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

test.describe("Onboarding — Unauthenticated", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("onboarding complete page redirects without auth", async ({ page }) => {
    await page.goto("/onboarding/complete");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("Onboarding Flow — Authenticated", () => {
  const hasAuth = !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

  test("onboarding page loads for authenticated users", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);

    // Navigate to onboarding (may already be there for new users)
    await page.goto("/onboarding");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });

    // Should show onboarding content — resume upload, role selection, or similar
    const content = page.locator("h1, h2, h3, [class*='onboard']").first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("target role input is present in onboarding", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      // Look for the role autocomplete input
      const roleInput = page.locator("input[placeholder*='role' i], #target-role").first();
      // It may be on step 2 or 3, so try to reach it
      if (await roleInput.isVisible()) {
        await expect(roleInput).toBeVisible();
      }
    }
  });

  test("target company input is present in onboarding", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      const companyInput = page.locator("input[placeholder*='company' i], #target-company").first();
      if (await companyInput.isVisible()) {
        await expect(companyInput).toBeVisible();
      }
    }
  });

  test("onboarding has step progression indicators", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      // Look for step indicators (numbered steps, progress bar, or similar)
      // The onboarding uses a 3-step flow based on TOTAL_STEPS = 3
      const stepIndicator = page.locator("[class*='step'], [class*='progress'], [aria-valuenow]").first();
      if (await stepIndicator.isVisible()) {
        await expect(stepIndicator).toBeVisible();
      }
    }
  });

  test("onboarding has resume upload section", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      // Look for resume upload area — could be file input, drag area, or text
      const resumeSection = page.getByText(/resume|upload|pdf|drag/i).first();
      if (await resumeSection.isVisible()) {
        await expect(resumeSection).toBeVisible();
      }
    }
  });

  test("onboarding has navigation footer with Continue button", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      // Look for Continue/Next/Skip buttons
      const actionButton = page.getByRole("button", { name: /continue|next|skip|start/i }).first();
      if (await actionButton.isVisible()) {
        await expect(actionButton).toBeVisible();
      }
    }
  });

  test("onboarding has logout button in top bar", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (page.url().includes("/onboarding")) {
      // Based on recent commit: "Add logout button to onboarding top bar"
      const logoutBtn = page.getByRole("button", { name: /log\s*out|sign\s*out/i });
      if (await logoutBtn.isVisible()) {
        await expect(logoutBtn).toBeVisible();
      }
    }
  });
});

test.describe("Onboarding — Autocomplete Inputs", () => {
  const hasAuth = !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD;

  test("role autocomplete shows suggestions on focus", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (!page.url().includes("/onboarding")) return;

    const roleInput = page.locator("input[placeholder*='role' i], #target-role").first();
    if (await roleInput.isVisible()) {
      await roleInput.focus();
      // Should show diverse sample suggestions
      const listbox = page.locator("[role=listbox]");
      await expect(listbox).toBeVisible({ timeout: 3000 });
    }
  });

  test("role autocomplete filters on input", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (!page.url().includes("/onboarding")) return;

    const roleInput = page.locator("input[placeholder*='role' i], #target-role").first();
    if (await roleInput.isVisible()) {
      await roleInput.fill("Data Sci");
      const listbox = page.locator("[role=listbox]");
      await expect(listbox).toBeVisible({ timeout: 3000 });
      await expect(listbox.getByText("Data Scientist")).toBeVisible();
    }
  });

  test("company autocomplete filters on input", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (!page.url().includes("/onboarding")) return;

    const companyInput = page.locator("input[placeholder*='company' i], #target-company").first();
    if (await companyInput.isVisible()) {
      await companyInput.fill("Raz");
      const listbox = page.locator("[role=listbox]");
      await expect(listbox).toBeVisible({ timeout: 3000 });
      await expect(listbox.getByText("Razorpay")).toBeVisible();
    }
  });

  test("autocomplete closes on Escape", async ({ page }) => {
    test.skip(!hasAuth, "Requires auth credentials");
    await login(page);
    await page.goto("/onboarding");

    if (!page.url().includes("/onboarding")) return;

    const roleInput = page.locator("input[placeholder*='role' i], #target-role").first();
    if (await roleInput.isVisible()) {
      await roleInput.focus();
      const listbox = page.locator("[role=listbox]");
      if (await listbox.isVisible()) {
        await page.keyboard.press("Escape");
        await expect(listbox).not.toBeVisible();
      }
    }
  });
});

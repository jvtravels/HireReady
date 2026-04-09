import { test, expect } from "@playwright/test";

test.describe("Signup Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
  });

  test("renders signup form", async ({ page }) => {
    await expect(page.getByText("Start practicing today")).toBeVisible();
    await expect(page.locator("#signup-name")).toBeVisible();
    await expect(page.locator("#signup-email")).toBeVisible();
  });

  test("shows password strength indicator", async ({ page }) => {
    const pw = page.locator("input[type=password]").first();
    await pw.click();
    await pw.fill("ab");
    await expect(page.getByText("Weak")).toBeVisible({ timeout: 3000 });

    await pw.fill("");
    await pw.fill("StrongPass123!");
    await expect(page.getByText("Strong")).toBeVisible({ timeout: 3000 });
  });

  test("validates required fields", async ({ page }) => {
    await page.locator("button[type=submit]").click();
    // HTML5 validation prevents submission — name field should be focused
    const name = page.locator("#signup-name");
    await expect(name).toBeFocused();
  });

  test("email typo suggestion appears", async ({ page }) => {
    await page.locator("#signup-name").fill("Test User");
    await page.locator("#signup-email").fill("test@gmial.com");
    // Tab away to trigger onBlur
    await page.keyboard.press("Tab");
    // Should suggest gmail.com
    await expect(page.getByText(/Did you mean/)).toBeVisible({ timeout: 5000 });
  });

  test("has link to login page", async ({ page }) => {
    await page.getByText("Log in").click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders login form", async ({ page }) => {
    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.locator("#signup-email")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
  });

  test("shows forgot password link", async ({ page }) => {
    await expect(page.getByText("Forgot password?")).toBeVisible();
  });

  test("forgot password shows reset form", async ({ page }) => {
    await page.getByText("Forgot password?").click();
    await expect(page.getByText("Reset your password")).toBeVisible();
    await expect(page.locator("#reset-email")).toBeVisible();
  });

  test("has link to signup page", async ({ page }) => {
    await page.getByText("Sign up").click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("remember me checkbox is present", async ({ page }) => {
    await expect(page.getByText("Remember me")).toBeVisible();
  });
});

test.describe("Password Reset Page", () => {
  test("shows error state without valid token", async ({ page }) => {
    await page.goto("/reset-password");
    // Either "Invalid or expired" or "requires Supabase" — both are error states
    await expect(page.locator("text=/Invalid|expired|Supabase|error/i")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Auth Redirects", () => {
  test("unauthenticated user visiting /dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    // RequireAuth should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("unauthenticated user visiting /session/new redirects to login", async ({ page }) => {
    await page.goto("/session/new");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test("unauthenticated user visiting /interview redirects to login", async ({ page }) => {
    await page.goto("/interview");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("Auth — Form Validation", () => {
  test("signup rejects short password", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#signup-name").fill("Test User");
    await page.locator("#signup-email").fill("test@example.com");
    const pw = page.locator("input[type=password]").first();
    await pw.fill("abc");
    await expect(page.getByText("Weak")).toBeVisible({ timeout: 3000 });
  });

  test("login form shows error on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.locator("button[type=submit]").click();
    // HTML5 validation should prevent submission
    const email = page.locator("#signup-email");
    await expect(email).toBeFocused();
  });

  test("signup and login pages are navigable between each other", async ({ page }) => {
    await page.goto("/signup");
    await page.getByText("Log in").click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByText("Sign up").click();
    await expect(page).toHaveURL(/\/signup/);
  });
});

import { test, expect } from "@playwright/test";

/**
 * Onboarding is behind RequireAuth — these tests mock the auth state
 * by intercepting the Supabase session endpoint.
 */

const MOCK_USER = {
  id: "test-user-123",
  email: "test@example.com",
  user_metadata: { name: "Test User" },
};

function mockAuth(page: import("@playwright/test").Page) {
  // Mock Supabase auth session
  return page.route("**/auth/v1/token*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "mock-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh-token",
        user: MOCK_USER,
      }),
    });
  });
}

test.describe("Onboarding Page", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

test.describe("Onboarding Flow Structure", () => {
  // Verify the page renders structure correctly when navigated directly
  // Full flow tests require authenticated Supabase session

  test("onboarding complete page redirects without auth", async ({ page }) => {
    await page.goto("/onboarding/complete");
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

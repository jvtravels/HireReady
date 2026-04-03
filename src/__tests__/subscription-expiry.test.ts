import { describe, it, expect } from "vitest";

/**
 * Tests for subscription auto-downgrade logic (mirrors AuthContext.tsx profileToUser).
 * Verifies that expired paid subscriptions are correctly downgraded to "free".
 */

type SubscriptionTier = "free" | "starter" | "pro" | "team";

function getEffectiveTier(tier: SubscriptionTier, subscriptionEnd?: string | null): SubscriptionTier {
  if (tier !== "free" && subscriptionEnd) {
    if (new Date(subscriptionEnd) < new Date()) return "free";
  }
  return tier;
}

describe("Subscription Expiry Auto-Downgrade", () => {
  it("free tier stays free regardless of end date", () => {
    expect(getEffectiveTier("free", null)).toBe("free");
    expect(getEffectiveTier("free", "2020-01-01")).toBe("free");
    expect(getEffectiveTier("free", "2099-12-31")).toBe("free");
  });

  it("active starter stays starter", () => {
    expect(getEffectiveTier("starter", "2099-12-31T23:59:59Z")).toBe("starter");
  });

  it("expired starter downgrades to free", () => {
    expect(getEffectiveTier("starter", "2020-01-01T00:00:00Z")).toBe("free");
  });

  it("active pro stays pro", () => {
    expect(getEffectiveTier("pro", "2099-12-31T23:59:59Z")).toBe("pro");
  });

  it("expired pro downgrades to free", () => {
    expect(getEffectiveTier("pro", "2020-01-01T00:00:00Z")).toBe("free");
  });

  it("active team stays team", () => {
    expect(getEffectiveTier("team", "2099-12-31T23:59:59Z")).toBe("team");
  });

  it("expired team downgrades to free", () => {
    expect(getEffectiveTier("team", "2020-06-15T12:00:00Z")).toBe("free");
  });

  it("paid tier with no end date stays active", () => {
    expect(getEffectiveTier("pro", null)).toBe("pro");
    expect(getEffectiveTier("starter", null)).toBe("starter");
    expect(getEffectiveTier("team", undefined)).toBe("team");
  });

  it("subscription expiring 1 second ago downgrades", () => {
    const justExpired = new Date(Date.now() - 1000).toISOString();
    expect(getEffectiveTier("pro", justExpired)).toBe("free");
  });

  it("subscription expiring 1 hour from now stays active", () => {
    const soonExpiring = new Date(Date.now() + 3600_000).toISOString();
    expect(getEffectiveTier("pro", soonExpiring)).toBe("pro");
  });
});

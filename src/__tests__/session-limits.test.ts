import { describe, it, expect } from "vitest";

/**
 * Tests for session limit enforcement logic (mirrors _shared.ts checkSessionLimit).
 * Tests the business rules for Free (3 total) and Starter (10/week) limits.
 */

interface SessionLimitResult {
  allowed: boolean;
  reason?: string;
}

const FREE_LIMIT = 3;
const STARTER_WEEKLY_LIMIT = 10;

function checkSessionLimit(
  tier: string,
  subscriptionEnd: string | null,
  totalSessions: number,
  sessionsThisWeek: number,
): SessionLimitResult {
  // Check expiry — treat expired paid tiers as free
  let effectiveTier = tier;
  if (effectiveTier !== "free" && subscriptionEnd) {
    if (new Date(subscriptionEnd) < new Date()) {
      effectiveTier = "free";
    }
  }

  if (effectiveTier === "pro" || effectiveTier === "team") {
    return { allowed: true };
  }

  if (effectiveTier === "free") {
    if (totalSessions >= FREE_LIMIT) {
      return { allowed: false, reason: "Free plan limit reached (3 sessions). Upgrade to continue." };
    }
  } else if (effectiveTier === "starter") {
    if (sessionsThisWeek >= STARTER_WEEKLY_LIMIT) {
      return { allowed: false, reason: "Starter plan limit reached (10/week). Upgrade to Pro for unlimited." };
    }
  }

  return { allowed: true };
}

describe("Session Limit Enforcement", () => {
  describe("Free tier", () => {
    it("allows first 3 sessions", () => {
      expect(checkSessionLimit("free", null, 0, 0).allowed).toBe(true);
      expect(checkSessionLimit("free", null, 1, 1).allowed).toBe(true);
      expect(checkSessionLimit("free", null, 2, 2).allowed).toBe(true);
    });

    it("blocks 4th session", () => {
      const result = checkSessionLimit("free", null, 3, 3);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Free plan limit");
    });

    it("blocks at 5+ sessions", () => {
      expect(checkSessionLimit("free", null, 5, 3).allowed).toBe(false);
      expect(checkSessionLimit("free", null, 100, 10).allowed).toBe(false);
    });
  });

  describe("Starter tier", () => {
    const activeEnd = "2099-12-31T23:59:59Z";

    it("allows up to 10 sessions per week", () => {
      expect(checkSessionLimit("starter", activeEnd, 50, 0).allowed).toBe(true);
      expect(checkSessionLimit("starter", activeEnd, 50, 5).allowed).toBe(true);
      expect(checkSessionLimit("starter", activeEnd, 50, 9).allowed).toBe(true);
    });

    it("blocks at 10 sessions this week", () => {
      const result = checkSessionLimit("starter", activeEnd, 50, 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Starter plan limit");
    });

    it("total session count doesn't matter, only weekly", () => {
      // 200 total sessions but only 5 this week — allowed
      expect(checkSessionLimit("starter", activeEnd, 200, 5).allowed).toBe(true);
    });
  });

  describe("Pro tier", () => {
    const activeEnd = "2099-12-31T23:59:59Z";

    it("allows unlimited sessions", () => {
      expect(checkSessionLimit("pro", activeEnd, 0, 0).allowed).toBe(true);
      expect(checkSessionLimit("pro", activeEnd, 1000, 100).allowed).toBe(true);
    });
  });

  describe("Team tier", () => {
    it("allows unlimited sessions", () => {
      expect(checkSessionLimit("team", "2099-12-31T23:59:59Z", 500, 50).allowed).toBe(true);
    });
  });

  describe("Expired subscriptions", () => {
    const expiredEnd = "2020-01-01T00:00:00Z";

    it("downgrades expired starter to free limits", () => {
      // Had 4 total sessions with expired starter — should be blocked as free
      const result = checkSessionLimit("starter", expiredEnd, 4, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Free plan limit");
    });

    it("downgrades expired pro to free limits", () => {
      const result = checkSessionLimit("pro", expiredEnd, 3, 1);
      expect(result.allowed).toBe(false);
    });

    it("expired with fewer than 3 sessions is still allowed", () => {
      const result = checkSessionLimit("starter", expiredEnd, 2, 1);
      expect(result.allowed).toBe(true);
    });

    it("null subscription_end on paid tier is treated as active", () => {
      // Some edge case — paid tier with no end date
      const result = checkSessionLimit("pro", null, 100, 50);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("exactly at free limit boundary", () => {
      expect(checkSessionLimit("free", null, 2, 2).allowed).toBe(true);
      expect(checkSessionLimit("free", null, 3, 3).allowed).toBe(false);
    });

    it("exactly at starter weekly limit boundary", () => {
      const activeEnd = "2099-12-31T23:59:59Z";
      expect(checkSessionLimit("starter", activeEnd, 50, 9).allowed).toBe(true);
      expect(checkSessionLimit("starter", activeEnd, 50, 10).allowed).toBe(false);
    });

    it("subscription expiring today is treated as expired", () => {
      // Set expiry to 1 hour ago
      const justExpired = new Date(Date.now() - 3600_000).toISOString();
      const result = checkSessionLimit("pro", justExpired, 100, 50);
      // Should be downgraded to free and blocked
      expect(result.allowed).toBe(false);
    });
  });
});

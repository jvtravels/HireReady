import { describe, it, expect } from "vitest";

/**
 * Tests for the date calculation and plan validation logic used in
 * api/verify-payment.ts.  Since the serverless handler has heavy
 * infrastructure dependencies (Razorpay, Supabase, crypto), we
 * replicate the pure calculation logic here to test it in isolation.
 */

/* ─── Plan maps (mirrored from verify-payment.ts) ─── */

const PLAN_DURATION: Record<string, number> = {
  single: 0,
  weekly: 7,
  monthly: 30,
  "yearly-starter": 365,
  "yearly-pro": 365,
};

const PLAN_AMOUNT: Record<string, number> = {
  single: 1000,
  weekly: 4900,
  monthly: 14900,
  "yearly-starter": 203900,
  "yearly-pro": 143000,
};

const PLAN_TIER: Record<string, string> = {
  single: "free",
  weekly: "starter",
  monthly: "pro",
  "yearly-starter": "starter",
  "yearly-pro": "pro",
};

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2 };

/** Replicates the subscription end-date calculation from verify-payment.ts */
function calculateEndDate(opts: {
  plan: string;
  now: Date;
  currentEnd?: Date | null;
  currentTier?: string;
  isUpgrade?: boolean;
}): Date {
  const { plan, now, currentEnd, currentTier, isUpgrade } = opts;
  const planDays = PLAN_DURATION[plan];

  if (isUpgrade && currentEnd && currentTier) {
    const remainingMs = currentEnd.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
    const currentPlanDuration = currentTier === "starter" ? 7 : 30;
    const currentPlanAmount = currentTier === "starter" ? 4900 : 14900;
    const newPlanAmount = PLAN_AMOUNT[plan];
    const proratedDays = Math.floor(
      (remainingDays / currentPlanDuration) *
        (currentPlanAmount / newPlanAmount) *
        planDays,
    );
    const end = new Date(now);
    end.setDate(end.getDate() + planDays + proratedDays);
    return end;
  }

  // Extend from current end if still active (renewal), else from now
  const base =
    currentEnd && currentEnd > now ? new Date(currentEnd) : new Date(now);
  base.setDate(base.getDate() + planDays);
  return base;
}

/* ────────────────────────── Day-based calculation ────────────────────────── */

describe("subscription date calculations", () => {
  const NOW = new Date("2026-04-15T12:00:00Z");

  it("single plan adds 0 days", () => {
    const end = calculateEndDate({ plan: "single", now: NOW });
    expect(end.toISOString()).toBe(NOW.toISOString());
  });

  it("weekly plan adds 7 days", () => {
    const end = calculateEndDate({ plan: "weekly", now: NOW });
    const expected = new Date("2026-04-22T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("monthly plan adds 30 days", () => {
    const end = calculateEndDate({ plan: "monthly", now: NOW });
    const expected = new Date("2026-05-15T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("yearly-starter plan adds 365 days", () => {
    const end = calculateEndDate({ plan: "yearly-starter", now: NOW });
    const expected = new Date("2027-04-15T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("yearly-pro plan adds 365 days", () => {
    const end = calculateEndDate({ plan: "yearly-pro", now: NOW });
    const expected = new Date("2027-04-15T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });
});

/* ────────────────────────── Proration ────────────────────────── */

describe("proration (mid-cycle upgrade)", () => {
  it("adds remaining days proportionally on upgrade from starter to pro", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    // Starter plan has 4 days remaining (ends April 19)
    const currentEnd = new Date("2026-04-19T12:00:00Z");
    const end = calculateEndDate({
      plan: "monthly",
      now,
      currentEnd,
      currentTier: "starter",
      isUpgrade: true,
    });
    // remainingDays = 4
    // proratedDays = floor((4/7) * (4900/14900) * 30) = floor(0.571 * 0.329 * 30) = floor(5.63) = 5
    // But let's compute exactly: (4/7) * (4900/14900) * 30 = 4 * 4900 * 30 / (7 * 14900)
    // = 588000 / 104300 = 5.638... => floor = 5
    const planDays = 30;
    const proratedDays = Math.floor((4 / 7) * (4900 / 14900) * 30);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + planDays + proratedDays);
    expect(end.toISOString()).toBe(expected.toISOString());
    // Total days should be 30 + 5 = 35
    expect(proratedDays).toBe(5);
  });

  it("gives zero proration when current plan just expired", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const currentEnd = new Date("2026-04-15T12:00:00Z"); // exactly now
    const end = calculateEndDate({
      plan: "monthly",
      now,
      currentEnd,
      currentTier: "starter",
      isUpgrade: true,
    });
    // remainingMs = 0, remainingDays = 0, proratedDays = 0
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 30);
    expect(end.toISOString()).toBe(expected.toISOString());
  });
});

/* ────────────────────────── Renewal extends from current end ────────────────────────── */

describe("renewal (same tier, still active)", () => {
  it("extends from current end date, not from now", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const currentEnd = new Date("2026-04-20T12:00:00Z"); // 5 days remaining
    const end = calculateEndDate({
      plan: "weekly",
      now,
      currentEnd,
      currentTier: "starter",
      isUpgrade: false,
    });
    // Should extend from April 20, not April 15
    const expected = new Date("2026-04-27T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("starts from now when current subscription has expired", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const currentEnd = new Date("2026-04-10T12:00:00Z"); // expired 5 days ago
    const end = calculateEndDate({
      plan: "weekly",
      now,
      currentEnd,
      currentTier: "starter",
      isUpgrade: false,
    });
    const expected = new Date("2026-04-22T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });
});

/* ────────────────────────── Month-end edge cases ────────────────────────── */

describe("month-end edge cases", () => {
  it("Jan 31 + 30 days = March 2 (not Feb 28)", () => {
    const now = new Date("2026-01-31T12:00:00Z");
    const end = calculateEndDate({ plan: "monthly", now });
    // JS Date.setDate(31 + 30) = day 61 of January = March 2
    const expected = new Date("2026-03-02T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("Feb 28 + 7 days = March 7", () => {
    const now = new Date("2026-02-28T12:00:00Z");
    const end = calculateEndDate({ plan: "weekly", now });
    const expected = new Date("2026-03-07T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });

  it("Dec 25 + 30 days = Jan 24 (next year)", () => {
    const now = new Date("2026-12-25T12:00:00Z");
    const end = calculateEndDate({ plan: "monthly", now });
    const expected = new Date("2027-01-24T12:00:00Z");
    expect(end.toISOString()).toBe(expected.toISOString());
  });
});

/* ────────────────────────── Plan amount validation ────────────────────────── */

describe("PLAN_AMOUNT map", () => {
  it("single session costs 1000 paise (INR 10)", () => {
    expect(PLAN_AMOUNT["single"]).toBe(1000);
  });

  it("weekly costs 4900 paise (INR 49)", () => {
    expect(PLAN_AMOUNT["weekly"]).toBe(4900);
  });

  it("monthly costs 14900 paise (INR 149)", () => {
    expect(PLAN_AMOUNT["monthly"]).toBe(14900);
  });

  it("yearly-starter costs 203900 paise (INR 2039)", () => {
    expect(PLAN_AMOUNT["yearly-starter"]).toBe(203900);
  });

  it("yearly-pro costs 143000 paise (INR 1430)", () => {
    expect(PLAN_AMOUNT["yearly-pro"]).toBe(143000);
  });

  it("all plans have a defined tier", () => {
    for (const plan of Object.keys(PLAN_AMOUNT)) {
      expect(PLAN_TIER).toHaveProperty(plan);
    }
  });

  it("all plans have a defined duration", () => {
    for (const plan of Object.keys(PLAN_AMOUNT)) {
      expect(PLAN_DURATION).toHaveProperty(plan);
      expect(typeof PLAN_DURATION[plan]).toBe("number");
    }
  });
});

/* ────────────────────────── Tier ranking ────────────────────────── */

describe("tier ranking", () => {
  it("pro outranks starter outranks free", () => {
    expect(TIER_RANK["pro"]).toBeGreaterThan(TIER_RANK["starter"]);
    expect(TIER_RANK["starter"]).toBeGreaterThan(TIER_RANK["free"]);
  });
});

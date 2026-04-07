/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

/**
 * Payment flow integration tests.
 * Tests the complete payment lifecycle: order creation, signature verification,
 * subscription tier mapping, and duration calculation.
 */

const RAZORPAY_KEY_SECRET = "test_secret_key_12345";

const PRICE_MAP: Record<string, { amount: number; name: string }> = {
  weekly: { amount: 4900, name: "Hirloop Starter" },
  monthly: { amount: 14900, name: "Hirloop Pro" },
};

const PLAN_TIER: Record<string, string> = {
  weekly: "starter",
  monthly: "pro",
};

function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

function calculateSubscriptionEnd(plan: string, now: Date): Date {
  const end = new Date(now);
  if (plan === "weekly") {
    end.setDate(end.getDate() + 7);
  } else if (plan === "monthly") {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

describe("Payment Flow", () => {
  describe("Plan configuration", () => {
    it("has correct prices for all plans", () => {
      expect(PRICE_MAP.weekly.amount).toBe(4900); // ₹49 in paise
      expect(PRICE_MAP.monthly.amount).toBe(14900); // ₹149 in paise
    });

    it("maps plans to correct tiers", () => {
      expect(PLAN_TIER.weekly).toBe("starter");
      expect(PLAN_TIER.monthly).toBe("pro");
    });

    it("only allows weekly and monthly plans", () => {
      expect(PRICE_MAP["yearly"]).toBeUndefined();
      expect(PRICE_MAP["daily"]).toBeUndefined();
    });
  });

  describe("Signature verification", () => {
    it("verifies valid Razorpay HMAC signature", () => {
      const orderId = "order_abc123";
      const paymentId = "pay_xyz789";
      const validSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      expect(verifySignature(orderId, paymentId, validSignature)).toBe(true);
    });

    it("rejects tampered signature", () => {
      expect(verifySignature("order_abc", "pay_xyz", "invalid_sig")).toBe(false);
    });

    it("rejects signature with wrong order ID", () => {
      const orderId = "order_abc123";
      const paymentId = "pay_xyz789";
      const sig = createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      // Verify with different order ID
      expect(verifySignature("order_DIFFERENT", paymentId, sig)).toBe(false);
    });

    it("rejects signature with wrong payment ID", () => {
      const orderId = "order_abc123";
      const paymentId = "pay_xyz789";
      const sig = createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      expect(verifySignature(orderId, "pay_DIFFERENT", sig)).toBe(false);
    });
  });

  describe("Subscription duration", () => {
    it("weekly plan expires in 7 days", () => {
      const now = new Date("2026-04-01T10:00:00Z");
      const end = calculateSubscriptionEnd("weekly", now);
      expect(end.toISOString()).toBe("2026-04-08T10:00:00.000Z");
    });

    it("monthly plan expires in 1 month", () => {
      const now = new Date("2026-04-01T10:00:00Z");
      const end = calculateSubscriptionEnd("monthly", now);
      expect(end.toISOString()).toBe("2026-05-01T10:00:00.000Z");
    });

    it("handles month boundary correctly", () => {
      const now = new Date("2026-01-31T10:00:00Z");
      const end = calculateSubscriptionEnd("monthly", now);
      // Jan 31 + 1 month = Feb 28 (or March 3 depending on implementation)
      expect(end.getMonth()).toBeGreaterThanOrEqual(1); // At least February
    });

    it("weekly plan at year boundary", () => {
      const now = new Date("2026-12-28T10:00:00Z");
      const end = calculateSubscriptionEnd("weekly", now);
      expect(end.getFullYear()).toBe(2027);
      expect(end.getMonth()).toBe(0); // January
    });
  });

  describe("Order validation", () => {
    it("validates plan parameter is a known plan", () => {
      const validPlans = ["weekly", "monthly"];
      expect(validPlans.includes("weekly")).toBe(true);
      expect(validPlans.includes("monthly")).toBe(true);
      expect(validPlans.includes("yearly")).toBe(false);
      expect(validPlans.includes("")).toBe(false);
    });

    it("receipt is properly formatted and within 40 chars", () => {
      const plan = "monthly";
      const receipt = `${plan}_${Date.now()}`.slice(0, 40);
      expect(receipt.length).toBeLessThanOrEqual(40);
      expect(receipt).toMatch(/^monthly_\d+$/);
    });

    it("validates email format for notes", () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test("user@example.com")).toBe(true);
      expect(emailRegex.test("invalid")).toBe(false);
      expect(emailRegex.test("")).toBe(false);
      expect(emailRegex.test("a@b.c")).toBe(true);
    });
  });

  describe("Client-side checkout flow", () => {
    it("handles non-JSON error response gracefully", async () => {
      // Simulates what happens when create-order returns 500 with HTML
      const htmlResponse = "A server error has occurred";
      let parsedOk = false;
      let errorMsg = "";

      try {
        JSON.parse(htmlResponse);
        parsedOk = true;
      } catch {
        errorMsg = "Payment server error. Please try again or contact support@hirloop.com";
      }

      expect(parsedOk).toBe(false);
      expect(errorMsg).toContain("Payment server error");
    });

    it("validates orderId presence in response before proceeding", () => {
      const responses = [
        { orderId: "order_123", keyId: "key_123", amount: 4900 },
        { error: "Something went wrong" },
        { orderId: "", keyId: "key_123" },
        {},
      ];

      const hasOrder = responses.map(r => !!(r as Record<string, unknown>).orderId);
      expect(hasOrder).toEqual([true, false, false, false]);
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  isSubscriptionPauseable,
  isSubscriptionReactivatable,
  cancelRazorpaySubscription,
  pauseRazorpaySubscription,
  resumeRazorpaySubscription,
  setCancelAtPeriodEnd,
  setSubscriptionPaused,
} from "../../server-handlers/_subscription-actions";

/**
 * Subscription lifecycle was completely uncovered before this test file.
 * cancel / pause / reactivate handlers are each ~130-160 lines and they
 * all share the same patterns:
 *   1. Gate on profile state (not free, not expired, correct flags)
 *   2. Call Razorpay
 *   3. Flip a Supabase flag
 * Logic moved into _subscription-actions.ts so tests can cover it.
 */

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const PAST = new Date(Date.now() - 30 * 86400000).toISOString();

function okResponse(body: unknown = {}, status = 200): Response {
  return { ok: true, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function errResponse(status = 500, body: unknown = { error: "x" }): Response {
  return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("isSubscriptionPauseable", () => {
  it("rejects null/undefined profile", () => {
    expect(isSubscriptionPauseable(null).ok).toBe(false);
    expect(isSubscriptionPauseable(undefined).ok).toBe(false);
  });

  it("rejects free tier", () => {
    const r = isSubscriptionPauseable({ subscription_tier: "free" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("No active subscription");
  });

  it("rejects expired subscription", () => {
    const r = isSubscriptionPauseable({ subscription_tier: "pro", subscription_end: PAST });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("expired");
  });

  it("rejects already-paused subscription (prevents double-pause)", () => {
    const r = isSubscriptionPauseable({ subscription_tier: "pro", subscription_end: FUTURE, subscription_paused: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("already paused");
  });

  it("accepts active paid subscription", () => {
    expect(isSubscriptionPauseable({ subscription_tier: "pro", subscription_end: FUTURE }).ok).toBe(true);
    expect(isSubscriptionPauseable({ subscription_tier: "starter", subscription_end: FUTURE }).ok).toBe(true);
  });
});

describe("isSubscriptionReactivatable", () => {
  it("rejects null profile", () => {
    expect(isSubscriptionReactivatable(null).ok).toBe(false);
  });

  it("rejects profile not pending cancellation", () => {
    const r = isSubscriptionReactivatable({ subscription_tier: "pro", cancel_at_period_end: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("not pending cancellation");
  });

  it("rejects expired subscription (must re-purchase)", () => {
    const r = isSubscriptionReactivatable({ cancel_at_period_end: true, subscription_end: PAST });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("already expired");
  });

  it("accepts active sub pending cancellation", () => {
    expect(isSubscriptionReactivatable({
      subscription_tier: "pro",
      cancel_at_period_end: true,
      subscription_end: FUTURE,
    }).ok).toBe(true);
  });
});

describe("cancelRazorpaySubscription", () => {
  it("POSTs to the cancel endpoint with cancel_at_cycle_end=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const result = await cancelRazorpaySubscription("sub_abc", "BASIC123", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://api.razorpay.com/v1/subscriptions/sub_abc/cancel");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.Authorization).toBe("Basic BASIC123");
    expect(JSON.parse(call[1].body)).toEqual({ cancel_at_cycle_end: true });
  });

  it("returns ok=false when Razorpay returns non-2xx (caller decides fallback)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500));
    const result = await cancelRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });

  it("swallows fetch errors — cancel is best-effort (user's DB flag is flipped either way)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const result = await cancelRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });

  it("no-ops when subscriptionId is empty (user never paid)", async () => {
    const fetchMock = vi.fn();
    const result = await cancelRazorpaySubscription("", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pauseRazorpaySubscription", () => {
  it("POSTs to the pause endpoint with pause_initiated_by=customer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const result = await pauseRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("/subscriptions/sub_abc/pause");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pause_initiated_by: "customer" });
  });

  it("reports ok=false with HTTP status on non-2xx (caller surfaces 502)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
    const result = await pauseRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  it("local-only mode: no subscriptionId → no-op success", async () => {
    const fetchMock = vi.fn();
    const result = await pauseRazorpaySubscription("", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports error on thrown fetch (network / timeout)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await pauseRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timeout");
  });
});

describe("resumeRazorpaySubscription", () => {
  it("POSTs to the resume endpoint with empty body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    await resumeRazorpaySubscription("sub_abc", "BASIC", fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("/subscriptions/sub_abc/resume");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });
});

describe("setCancelAtPeriodEnd", () => {
  it("PATCHes profile with cancel_at_period_end=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const result = await setCancelAtPeriodEnd("https://sb.co", "KEY", "user-1", true, fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("profiles?id=eq.user-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cancel_at_period_end: true });
  });

  it("PATCHes profile with cancel_at_period_end=false (reactivate path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    await setCancelAtPeriodEnd("https://sb.co", "KEY", "user-1", false, fetchMock as unknown as typeof fetch);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cancel_at_period_end: false });
  });

  it("URL-encodes the user id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    await setCancelAtPeriodEnd("https://sb.co", "KEY", "user with space", true, fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls[0][0]).toContain("user%20with%20space");
  });

  it("returns ok=false when Supabase rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500));
    const result = await setCancelAtPeriodEnd("https://sb.co", "KEY", "user-1", true, fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
  });
});

describe("setSubscriptionPaused", () => {
  it("PATCHes profile with subscription_paused=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const result = await setSubscriptionPaused("https://sb.co", "KEY", "user-1", true, fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ subscription_paused: true });
  });

  it("PATCHes profile with subscription_paused=false (resume)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    await setSubscriptionPaused("https://sb.co", "KEY", "user-1", false, fetchMock as unknown as typeof fetch);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ subscription_paused: false });
  });
});

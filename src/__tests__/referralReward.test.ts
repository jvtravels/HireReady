/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { grantReferralReward } from "../../server-handlers/_referral-reward";

/**
 * Integration test for the referral-reward path triggered by verify-payment.
 *
 * The function makes 4 Supabase REST calls in sequence:
 *   1. GET profiles?id=<payee>        → payee's referred_by code
 *   2. GET profiles?referral_code=<>  → referrer's id + session_credits
 *   3. GET referrals?reward_granted=false → open referral row id
 *   4. PATCH referrals (CAS)          → flip to rewarded
 *   5. PATCH profiles (referrer)      → bump session_credits
 *
 * We mock `fetch` to return scripted responses for each step and assert the
 * function makes the right calls in the right order. This covers the exact
 * path we shipped in commit c1d72df — previously untested.
 */

const SUPABASE_URL = "https://test.supabase.co";
const SERVICE_KEY = "test-service-key";

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("grantReferralReward", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it("returns rewarded=false when payee has no referred_by", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse([{ referred_by: null }]));

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ rewarded: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns rewarded=false when referrer doesn't exist for the code", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([])); // no referrer with that code

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ rewarded: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns rewarded=false when no open (unrewarded) referral row exists", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "referrer-1", session_credits: 0 }]))
      .mockResolvedValueOnce(makeResponse([])); // already rewarded

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ rewarded: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("grants reward on full happy path", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "referrer-1", session_credits: 2 }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1", status: "rewarded", reward_granted: true }])) // CAS win
      .mockResolvedValueOnce(makeResponse({})); // credit bump

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({
      rewarded: true,
      referrerId: "referrer-1",
      referralCode: "HSX-ABC123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Verify the CAS PATCH includes the reward_granted=false filter — this is
    // the whole point of compare-and-swap.
    const flipCall = fetchMock.mock.calls[3];
    expect(flipCall[0]).toContain("reward_granted=eq.false");
    expect(flipCall[1].method).toBe("PATCH");
    const body = JSON.parse(flipCall[1].body);
    expect(body).toEqual({ status: "rewarded", reward_granted: true });

    // Verify credit bump uses referrer's current credits + 1
    const creditCall = fetchMock.mock.calls[4];
    expect(creditCall[1].method).toBe("PATCH");
    expect(JSON.parse(creditCall[1].body)).toEqual({ session_credits: 3 });
  });

  it("aborts on lost CAS race — concurrent request wins", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "referrer-1", session_credits: 0 }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }]))
      .mockResolvedValueOnce(makeResponse([])); // PATCH returned empty — we lost the race

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ rewarded: false });
    // Specifically: we must NOT have called the credit-bump PATCH (5th call).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reports unreconciled state if credit bump fails after successful CAS", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "referrer-1", session_credits: 5 }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }])) // CAS won
      .mockResolvedValueOnce(makeResponse({}, false, 500)); // credit bump failed

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    // rewarded=false so verify-payment's response flag reflects reality.
    expect(result.rewarded).toBe(false);
    // But we DO return the referrerId so ops can reconcile manually.
    expect(result.referrerId).toBe("referrer-1");
    expect(result.referralCode).toBe("HSX-ABC123");
  });

  it("swallows thrown fetch errors — payment path must not fail from this", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ rewarded: false });
  });

  it("handles missing session_credits field (null/undefined defaults to 0)", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse([{ referred_by: "HSX-ABC123" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "referrer-1" /* no session_credits */ }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }]))
      .mockResolvedValueOnce(makeResponse([{ id: "ref-row-1" }]))
      .mockResolvedValueOnce(makeResponse({}));

    const result = await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    expect(result.rewarded).toBe(true);
    // 0 + 1 = 1
    const creditCall = fetchMock.mock.calls[4];
    expect(JSON.parse(creditCall[1].body)).toEqual({ session_credits: 1 });
  });

  it("user-supplied referral code is URL-encoded in queries", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse([{ referred_by: "HSX ABC+123" }]));
    // Second call should never happen because referrer lookup fails, but we
    // care about verifying the URL encoding of the first code use.
    fetchMock.mockResolvedValueOnce(makeResponse([]));

    await grantReferralReward(SUPABASE_URL, SERVICE_KEY, "payee-1", fetchMock as unknown as typeof fetch);

    const referrerLookup = fetchMock.mock.calls[1][0] as string;
    expect(referrerLookup).toContain("referral_code=eq.HSX%20ABC%2B123");
  });
});

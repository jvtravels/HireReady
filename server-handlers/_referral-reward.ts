/**
 * Referral reward grant — extracted from verify-payment.ts so it's unit-testable
 * without spinning up the whole VercelRequest flow.
 *
 * When a referred user completes a paid subscription, the referrer gets
 * +1 session_credit and the corresponding `referrals` row flips to
 * status=rewarded + reward_granted=true. The row flip is a compare-and-swap:
 * the PATCH filter includes `reward_granted=eq.false`, and we look at the
 * returned representation to detect whether we won the race. If another
 * concurrent verify-payment call already granted the reward, the PATCH
 * returns an empty array and we abort without double-granting.
 *
 * The function does NOT trigger on single-session (₹10) purchases — too
 * cheap to be exploit-proof. Callers should only invoke on paid tiers.
 *
 * Best-effort: any internal failure is logged and returns { rewarded: false }.
 * Never throws — the payment flow should not fail because of a referral
 * side-effect.
 */

export interface ReferralRewardResult {
  rewarded: boolean;
  referrerId?: string;
  referralCode?: string;
}

export async function grantReferralReward(
  supabaseUrl: string,
  serviceKey: string,
  payeeUserId: string,
  // Injectable for tests. Defaults to globalThis.fetch.
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ReferralRewardResult> {
  try {
    // 1. Look up the payee's referred_by code (set at signup via /api/referral POST).
    const payeeRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(payeeUserId)}&select=referred_by`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!payeeRes.ok) return { rewarded: false };
    const payeeRows = await payeeRes.json().catch(() => []);
    const referralCode: string | null = Array.isArray(payeeRows) && payeeRows[0]?.referred_by
      ? payeeRows[0].referred_by
      : null;
    if (!referralCode) return { rewarded: false };

    // 2. Find the referrer profile by their code.
    const referrerRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id,session_credits`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!referrerRes.ok) return { rewarded: false };
    const referrerRows = await referrerRes.json().catch(() => []);
    if (!Array.isArray(referrerRows) || referrerRows.length === 0) return { rewarded: false };
    const referrer = referrerRows[0];
    const referrerId: string = referrer.id;
    const currentCredits: number = typeof referrer.session_credits === "number" ? referrer.session_credits : 0;

    // 3. Find the open (not yet rewarded) referral row linking these two users.
    const recRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/referrals?referrer_id=eq.${encodeURIComponent(referrerId)}&referred_id=eq.${encodeURIComponent(payeeUserId)}&reward_granted=eq.false&select=id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!recRes.ok) return { rewarded: false };
    const recRows = await recRes.json().catch(() => []);
    if (!Array.isArray(recRows) || recRows.length === 0) {
      return { rewarded: false };
    }
    const referralRowId: string = recRows[0].id;

    // 4. Compare-and-swap: PATCH the row with a filter of reward_granted=false.
    //    PostgREST returns only the rows that matched the filter, so an empty
    //    array means another concurrent request already flipped it.
    const flipRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/referrals?id=eq.${encodeURIComponent(referralRowId)}&reward_granted=eq.false`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "rewarded", reward_granted: true }),
      },
    );
    if (!flipRes.ok) return { rewarded: false };
    const flipped = await flipRes.json().catch(() => []);
    if (!Array.isArray(flipped) || flipped.length === 0) {
      // Lost the race — another concurrent request won.
      return { rewarded: false };
    }

    // 5. Increment the referrer's session_credits. If this fails we're in a
    //    slightly bad state (row says rewarded, credit not granted). Worst
    //    case user pings support; better than double-granting on retry.
    const creditRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(referrerId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ session_credits: currentCredits + 1 }),
      },
    );
    if (!creditRes.ok) {
      console.error(`[referral-reward] credit grant FAILED after flip for referrer=${referrerId.slice(0, 8)}. Manual reconciliation needed.`);
      return { rewarded: false, referrerId, referralCode };
    }
    console.log(`[referral-reward] +1 credit → referrer=${referrerId.slice(0, 8)} (referee=${payeeUserId.slice(0, 8)}, code=${referralCode})`);
    return { rewarded: true, referrerId, referralCode };
  } catch (err) {
    console.warn("[referral-reward] threw:", (err as Error).message);
    return { rewarded: false };
  }
}

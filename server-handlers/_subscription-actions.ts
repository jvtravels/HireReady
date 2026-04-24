/**
 * Shared business logic for subscription lifecycle handlers (cancel, pause,
 * reactivate). Each handler was ~130-160 lines of duplicated scaffolding
 * (auth preamble + Razorpay call + Supabase flag flip + email). The
 * Razorpay/DB/gate logic lives here as pure helpers so it's unit-testable
 * in isolation without spinning up a VercelRequest mock.
 *
 * The handlers still own the preamble (CORS/CSRF/auth) and the email send
 * because those are request-shaped and already tested via auth suites.
 */

export interface SubscriptionProfile {
  subscription_tier?: string;
  subscription_end?: string | null;
  cancel_at_period_end?: boolean;
  subscription_paused?: boolean;
  razorpay_subscription_id?: string | null;
}

/** Is this profile eligible to be paused? Free-tier and expired subscriptions can't be paused. */
export function isSubscriptionPauseable(profile: SubscriptionProfile | null | undefined):
  { ok: true } | { ok: false; reason: string } {
  if (!profile || !profile.subscription_tier || profile.subscription_tier === "free") {
    return { ok: false, reason: "No active subscription to pause" };
  }
  if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
    return { ok: false, reason: "Subscription has expired" };
  }
  if (profile.subscription_paused) {
    return { ok: false, reason: "Subscription already paused" };
  }
  return { ok: true };
}

/** Is this profile eligible to be reactivated? Only subs mid-cancellation qualify. */
export function isSubscriptionReactivatable(profile: SubscriptionProfile | null | undefined):
  { ok: true } | { ok: false; reason: string } {
  if (!profile) {
    return { ok: false, reason: "Profile not found" };
  }
  if (!profile.cancel_at_period_end) {
    return { ok: false, reason: "Subscription is not pending cancellation" };
  }
  if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
    return { ok: false, reason: "Subscription has already expired. Please purchase a new plan." };
  }
  return { ok: true };
}

/** POST {razorpay}/subscriptions/:id/cancel with cancel_at_cycle_end=true. Best-effort — returns ok=false but doesn't throw. */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  rzpAuthBasic: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean }> {
  if (!subscriptionId || !rzpAuthBasic) return { ok: false };
  try {
    const res = await fetchImpl(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Basic ${rzpAuthBasic}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_at_cycle_end: true }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

/** POST {razorpay}/subscriptions/:id/pause. Returns {ok:false, error} on failure. */
export async function pauseRazorpaySubscription(
  subscriptionId: string,
  rzpAuthBasic: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean; error?: string }> {
  if (!subscriptionId || !rzpAuthBasic) return { ok: true }; // local-only mode
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const res = await fetchImpl(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/pause`, {
      method: "POST",
      headers: { Authorization: `Basic ${rzpAuthBasic}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pause_initiated_by: "customer" }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message || "request failed" }; }
}

/** POST {razorpay}/subscriptions/:id/resume. */
export async function resumeRazorpaySubscription(
  subscriptionId: string,
  rzpAuthBasic: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean; error?: string }> {
  if (!subscriptionId || !rzpAuthBasic) return { ok: true };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const res = await fetchImpl(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/resume`, {
      method: "POST",
      headers: { Authorization: `Basic ${rzpAuthBasic}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message || "request failed" }; }
}

/** PATCH profiles.cancel_at_period_end to the given value. */
export async function setCancelAtPeriodEnd(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  value: boolean,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean }> {
  const res = await fetchImpl(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ cancel_at_period_end: value }),
    },
  );
  return { ok: res.ok };
}

/** PATCH profiles.subscription_paused to the given value. */
export async function setSubscriptionPaused(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  value: boolean,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ ok: boolean }> {
  const res = await fetchImpl(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ subscription_paused: value }),
    },
  );
  return { ok: res.ok };
}

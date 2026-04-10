/* Vercel Edge Function — Validate and apply promo/coupon codes */
/* POST { code, plan } → { valid, discount_percent, discount_amount, final_amount } */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900, "yearly-starter": 203900, "yearly-pro": 143000 };

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const body = await req.json().catch(() => ({})) as { code?: string; plan?: string };
  const code = body.code?.trim().toUpperCase();
  const plan = body.plan;

  if (!code || !plan || !PLAN_AMOUNT[plan]) {
    return new Response(JSON.stringify({ error: "Missing code or plan" }), { status: 400, headers });
  }

  const dbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // Look up promo code
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(code)}&select=*`,
    { headers: dbHeaders },
  );
  const rows = await res.json();

  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ valid: false, error: "Invalid promo code" }), { status: 200, headers });
  }

  const promo = rows[0];

  // Check validity
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return new Response(JSON.stringify({ valid: false, error: "Promo code not yet active" }), { status: 200, headers });
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return new Response(JSON.stringify({ valid: false, error: "Promo code has expired" }), { status: 200, headers });
  }
  if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
    return new Response(JSON.stringify({ valid: false, error: "Promo code usage limit reached" }), { status: 200, headers });
  }
  if (promo.applicable_plans && promo.applicable_plans.length > 0 && !promo.applicable_plans.includes(plan)) {
    return new Response(JSON.stringify({ valid: false, error: `Code not valid for ${plan} plan` }), { status: 200, headers });
  }

  // Calculate discount
  const originalAmount = PLAN_AMOUNT[plan];
  let discountAmount = 0;

  if (promo.discount_percent > 0) {
    discountAmount = Math.round(originalAmount * promo.discount_percent / 100);
  } else if (promo.discount_amount > 0) {
    discountAmount = promo.discount_amount;
  }

  const finalAmount = Math.max(0, originalAmount - discountAmount);

  // Atomic increment usage counter with conditional check to prevent TOCTOU race.
  // Only increment if current_uses still matches what we read (optimistic lock).
  const incrRes = await fetch(
    `${SUPABASE_URL}/rest/v1/promo_codes?id=eq.${promo.id}&current_uses=eq.${promo.current_uses}`,
    {
      method: "PATCH",
      headers: { ...dbHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ current_uses: promo.current_uses + 1 }),
    },
  );
  const incrRows = await incrRes.json();
  if (!Array.isArray(incrRows) || incrRows.length === 0) {
    // Another request incremented concurrently — re-check limit
    return new Response(JSON.stringify({ valid: false, error: "Promo code is busy, please try again" }), { status: 409, headers });
  }

  return new Response(JSON.stringify({
    valid: true,
    discount_percent: promo.discount_percent,
    discount_amount: discountAmount,
    original_amount: originalAmount,
    final_amount: finalAmount,
    code,
  }), { status: 200, headers });
}

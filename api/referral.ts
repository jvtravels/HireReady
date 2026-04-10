/* Vercel Edge Function — Referral code management */
/* GET: returns the user's referral code (generates one if none exists) */
/* POST: applies a referral code during signup */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for clarity
  let code = "HSX-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req: Request): Promise<Response> {
  // Allow GET and POST
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });
  }

  const headers = withRequestId(corsHeaders(req));

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse(headers);

  const dbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    // Get or create referral code for this user
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}&select=referral_code`,
      { headers: dbHeaders },
    );
    const profiles = await profileRes.json();
    let code = Array.isArray(profiles) && profiles[0]?.referral_code;

    if (!code) {
      // Generate and save a new code
      code = generateCode();
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}`, {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ referral_code: code }),
      });
    }

    // Count successful referrals
    const refRes = await fetch(
      `${SUPABASE_URL}/rest/v1/referrals?referrer_id=eq.${encodeURIComponent(auth.userId)}&select=id,status,created_at`,
      { headers: dbHeaders },
    );
    const referrals = await refRes.json();
    const stats = {
      total: Array.isArray(referrals) ? referrals.length : 0,
      redeemed: Array.isArray(referrals) ? referrals.filter((r: { status: string }) => r.status === "redeemed" || r.status === "rewarded").length : 0,
      rewarded: Array.isArray(referrals) ? referrals.filter((r: { status: string }) => r.status === "rewarded").length : 0,
    };

    return new Response(JSON.stringify({ code, stats }), { status: 200, headers });
  }

  // POST — apply referral code
  const body = await req.json().catch(() => ({}));
  const referralCode = (body as { code?: string }).code?.trim().toUpperCase();

  if (!referralCode) {
    return new Response(JSON.stringify({ error: "Missing referral code" }), { status: 400, headers });
  }

  // Find the referrer
  const referrerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id`,
    { headers: dbHeaders },
  );
  const referrers = await referrerRes.json();
  if (!Array.isArray(referrers) || referrers.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid referral code" }), { status: 404, headers });
  }

  const referrerId = referrers[0].id;

  // Can't refer yourself
  if (referrerId === auth.userId) {
    return new Response(JSON.stringify({ error: "Cannot use your own referral code" }), { status: 400, headers });
  }

  // Check if already referred
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}&select=referred_by`,
    { headers: dbHeaders },
  );
  const existing = await existingRes.json();
  if (Array.isArray(existing) && existing[0]?.referred_by) {
    return new Response(JSON.stringify({ error: "Already used a referral code" }), { status: 409, headers });
  }

  // Apply referral
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}`, {
    method: "PATCH",
    headers: { ...dbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ referred_by: referralCode }),
  });

  // Create referral record
  await fetch(`${SUPABASE_URL}/rest/v1/referrals`, {
    method: "POST",
    headers: { ...dbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      referrer_id: referrerId,
      referral_code: referralCode,
      referred_id: auth.userId,
      status: "redeemed",
    }),
  });

  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

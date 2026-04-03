/* Vercel Serverless Function — Razorpay Payment Verification */
/* Server-side signature verification + Supabase subscription update */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

function getAllowedOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGINS.length === 0 && origin.endsWith(".vercel.app")) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

/* Rate limiting */
const rateLimitMap = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

const PLAN_DURATION: Record<string, number> = { weekly: 7, monthly: 30 };
const PLAN_TIER: Record<string, string> = { weekly: "starter", monthly: "pro" };
const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = getAllowedOrigin(req.headers.origin || "");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Payment verification not configured" });
  }

  // Rate limiting
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again shortly." });
  }

  // Verify user auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  let userId: string;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    if (!PLAN_TIER[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // 1. Verify Razorpay signature (HMAC-SHA256)
    const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Payment signature mismatch", { razorpay_order_id, userId });
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // 2. Verify plan matches the actual order amount with Razorpay
    const rzpAuth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
      headers: { Authorization: `Basic ${rzpAuth}` },
    });
    if (!orderRes.ok) {
      return res.status(400).json({ error: "Could not verify order details" });
    }
    const orderData = await orderRes.json();
    if (orderData.amount !== PLAN_AMOUNT[plan]) {
      console.error("Plan/amount mismatch", { plan, expected: PLAN_AMOUNT[plan], actual: orderData.amount, userId });
      return res.status(400).json({ error: "Plan does not match payment amount" });
    }

    // 3. Check for duplicate payment ID
    const dupCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?razorpay_payment_id=eq.${encodeURIComponent(razorpay_payment_id)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const dupRows = await dupCheck.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(409).json({ error: "Payment already processed" });
    }

    // 4. Check if user already has an active subscription at this tier or higher
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const profiles = await profileRes.json();
    if (Array.isArray(profiles) && profiles.length > 0) {
      const current = profiles[0];
      const currentEnd = current.subscription_end ? new Date(current.subscription_end) : null;
      const isActive = currentEnd && currentEnd > new Date();
      const tierRank: Record<string, number> = { free: 0, starter: 1, pro: 2, team: 3 };
      const newTier = PLAN_TIER[plan];
      // Prevent paying for same or lower tier while active
      if (isActive && (tierRank[current.subscription_tier] || 0) >= (tierRank[newTier] || 0)) {
        return res.status(400).json({ error: `You already have an active ${current.subscription_tier} plan` });
      }
    }

    // 5. Calculate subscription dates
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + PLAN_DURATION[plan]);
    const tier = PLAN_TIER[plan];

    // 6. Update profile (service role key bypasses RLS)
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          subscription_tier: tier,
          subscription_start: now.toISOString(),
          subscription_end: end.toISOString(),
          razorpay_payment_id,
        }),
      },
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "");
      console.error("Supabase update error:", updateRes.status, errText);
      return res.status(500).json({ error: "Failed to activate subscription" });
    }

    return res.status(200).json({
      success: true,
      subscriptionTier: tier,
      subscriptionStart: now.toISOString(),
      subscriptionEnd: end.toISOString(),
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

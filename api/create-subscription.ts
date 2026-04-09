/* Vercel Serverless Function — Razorpay Subscription Creation */
/* Creates a recurring subscription instead of a one-time order for auto-renewal */

import type { VercelRequest, VercelResponse } from "@vercel/node";


/* ─── Inline rate limiting via Upstash Redis ─── */
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

async function isRateLimited(ip: string, limit: number, windowMs: number): Promise<boolean> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn("[create-subscription] Rate limiting disabled: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set");
    return false;
  }
  try {
    const key = `rl:create-sub:${ip}`;
    const windowSec = Math.ceil(windowMs / 1000);
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSec]]),
    });
    if (res.ok) {
      const results = await res.json();
      return (results[0]?.result ?? 1) > limit;
    }
    return false;
  } catch (err) {
    console.error("[create-subscription] Rate limit check failed:", err);
    return false;
  }
}

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const RAZORPAY_PLAN_WEEKLY = (process.env.RAZORPAY_PLAN_WEEKLY || "").trim();
const RAZORPAY_PLAN_MONTHLY = (process.env.RAZORPAY_PLAN_MONTHLY || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

function getAllowedOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

const PLAN_MAP: Record<string, { planId: string; name: string; description: string; amount: number }> = {
  weekly:  { planId: RAZORPAY_PLAN_WEEKLY,  name: "HireStepX Starter", description: "Weekly Plan — ₹49/week · 10 sessions · Auto-renews",  amount: 4900 },
  monthly: { planId: RAZORPAY_PLAN_MONTHLY, name: "HireStepX Pro",     description: "Monthly Plan — ₹149/month · Unlimited · Auto-renews", amount: 14900 },
};

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

  const bodyContentLength = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (bodyContentLength > 1048576) return res.status(413).json({ error: "Request too large" });
  if (!origin) return res.status(403).json({ error: "Forbidden" });

  const ip = (req.headers["x-real-ip"] as string)?.trim()
    || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || "unknown";
  if (await isRateLimited(ip, 5, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payments not configured. Please contact support@hirestepx.com" });
  }

  // Verify auth
  let authenticatedUserId: string | undefined;
  const authToken = (req.headers.authorization || "").replace("Bearer ", "");
  if (authToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${authToken}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!authRes.ok) return res.status(401).json({ error: "Unauthorized" });
    try {
      const userData = await authRes.json();
      authenticatedUserId = userData.id;
    } catch {
      return res.status(401).json({ error: "Auth verification failed" });
    }
  } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const { plan, userId, email } = req.body;
    if (typeof plan !== "string" || !["weekly", "monthly"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    const planConfig = PLAN_MAP[plan];
    if (!planConfig || !planConfig.planId) {
      console.error(`[create-subscription] Missing Razorpay plan ID for "${plan}". Set RAZORPAY_PLAN_WEEKLY / RAZORPAY_PLAN_MONTHLY env vars.`);
      return res.status(503).json({ error: "Subscription plans not configured. Please contact support@hirestepx.com" });
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const resolvedUserId = authenticatedUserId || (typeof userId === "string" ? userId : "");

    const ac = new AbortController();
    const acTimer = setTimeout(() => ac.abort(), 10_000);

    const subscriptionPayload: Record<string, unknown> = {
      plan_id: planConfig.planId,
      total_count: plan === "weekly" ? 52 : 12, // 1 year of renewals
      customer_notify: 1,
      notes: {
        plan,
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        ...(typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
      },
    };

    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify(subscriptionPayload),
    });
    clearTimeout(acTimer);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Razorpay subscription error:", response.status, errText);
      return res.status(502).json({ error: "Could not create subscription. Please try again or contact support@hirestepx.com" });
    }

    const subscription = await response.json();

    return res.status(200).json({
      subscriptionId: subscription.id,
      amount: planConfig.amount,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      name: planConfig.name,
      description: planConfig.description,
      status: subscription.status,
    });
  } catch (err) {
    console.error("Subscription creation error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

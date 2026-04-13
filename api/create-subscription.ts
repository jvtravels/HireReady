/* Vercel Serverless Function — Razorpay Subscription Creation */
/* Creates a recurring subscription instead of a one-time order for auto-renewal */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  isRateLimited,
  getVercelClientIp,
  supabaseUrl,
  supabaseAnonKey,
} from "./_shared";

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const RAZORPAY_PLAN_WEEKLY = (process.env.RAZORPAY_PLAN_WEEKLY || "").trim();
const RAZORPAY_PLAN_MONTHLY = (process.env.RAZORPAY_PLAN_MONTHLY || "").trim();

const PLAN_MAP: Record<string, { planId: string; name: string; description: string; amount: number }> = {
  weekly:  { planId: RAZORPAY_PLAN_WEEKLY,  name: "HireStepX Starter", description: "Weekly Plan — ₹49/week · 10 sessions · Auto-renews",  amount: 4900 },
  monthly: { planId: RAZORPAY_PLAN_MONTHLY, name: "HireStepX Pro",     description: "Monthly Plan — ₹149/month · Unlimited · Auto-renews", amount: 14900 },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = applyCorsHeaders(req, res);
  if (handlePreflightAndMethod(req, res)) return;

  const bodyContentLength = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (bodyContentLength > 1048576) return res.status(413).json({ error: "Request too large" });
  if (!origin) return res.status(403).json({ error: "Forbidden" });

  const ip = getVercelClientIp(req);
  if (await isRateLimited(ip, "create-sub", 5, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payments not configured. Please contact support@hirestepx.com" });
  }

  // Verify auth
  const SUPABASE_URL = supabaseUrl();
  const SUPABASE_ANON_KEY = supabaseAnonKey();
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

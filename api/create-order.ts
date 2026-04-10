/* Vercel Serverless Function — Razorpay Order Creation */

import type { VercelRequest, VercelResponse } from "@vercel/node";


/* ─── Inline rate limiting (Node.js ESM can't resolve extensionless imports) ─── */
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const orderRateMap = new Map<string, { count: number; reset: number }>();

async function isRateLimited(ip: string, limit: number, windowMs: number): Promise<boolean> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const key = `rl:create-order:${ip}`;
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
    } catch { /* fall through to in-memory */ }
  }
  const now = Date.now();
  const entry = orderRateMap.get(ip);
  if (!entry || now > entry.reset) {
    orderRateMap.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

function getAllowedOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

const PRICE_MAP: Record<string, { amount: number; name: string; description: string }> = {
  weekly:           { amount: 4900,   name: "HireStepX Starter",          description: "Weekly Plan — ₹49/week · 10 sessions" },
  monthly:          { amount: 14900,  name: "HireStepX Pro",              description: "Monthly Plan — ₹149/month · Unlimited" },
  "yearly-starter": { amount: 203900, name: "HireStepX Starter Annual",   description: "Annual Starter — ₹2,039/year · 10 sessions/week" },
  "yearly-pro":     { amount: 143000, name: "HireStepX Pro Annual",       description: "Annual Pro — ₹1,430/year · Unlimited" },
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

  // Body size check
  const bodyContentLength = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (bodyContentLength > 1048576) {
    return res.status(413).json({ error: "Request too large" });
  }

  // CSRF: validate Origin header on state-changing requests
  if (!origin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Rate limiting: 5 order creations per minute per IP
  const ip = (req.headers["x-real-ip"] as string)?.trim()
    || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || "unknown";
  if (await isRateLimited(ip, 5, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error("Missing Razorpay env vars:", { hasKeyId: !!RAZORPAY_KEY_ID, hasKeySecret: !!RAZORPAY_KEY_SECRET });
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
    if (typeof plan !== "string" || !PRICE_MAP[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    const price = PRICE_MAP[plan];
    if (!price) return res.status(400).json({ error: "Invalid plan" });

    // Idempotency: prevent duplicate orders for same user+plan within 30s
    const resolvedUserId = authenticatedUserId || (typeof userId === "string" ? userId : "");
    const idempotencyKey = `order:${resolvedUserId}:${plan}`;
    if (UPSTASH_URL && UPSTASH_TOKEN && resolvedUserId) {
      try {
        const dedupRes = await fetch(`${UPSTASH_URL}/pipeline`, {
          method: "POST",
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify([["SET", idempotencyKey, "1", "NX", "EX", 30], ["GET", `${idempotencyKey}:oid`]]),
        });
        if (dedupRes.ok) {
          const results = await dedupRes.json();
          const wasSet = results[0]?.result; // null = key already existed (duplicate)
          const cachedOrderId = results[1]?.result;
          if (!wasSet && cachedOrderId) {
            // Return cached order instead of creating duplicate
            return res.status(200).json({
              orderId: cachedOrderId,
              amount: price.amount,
              currency: "INR",
              keyId: RAZORPAY_KEY_ID,
              name: price.name,
              description: price.description,
            });
          }
        }
      } catch (dedupErr) { console.warn("[create-order] Idempotency check failed:", dedupErr); }
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const receipt = `${plan}_${Date.now()}`.slice(0, 40);

    const notes: Record<string, string> = { plan };
    if (resolvedUserId.length > 0 && resolvedUserId.length <= 200) notes.userId = resolvedUserId;
    if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) notes.email = email;

    const ac = new AbortController();
    const acTimer = setTimeout(() => ac.abort(), 10_000);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({ amount: price.amount, currency: "INR", receipt, notes }),
    });
    clearTimeout(acTimer);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Razorpay error:", response.status, errText);
      const detail = response.status === 401
        ? "Payment gateway credentials are invalid. Please contact support."
        : "Could not create payment order. Please try again or contact support@hirestepx.com";
      return res.status(502).json({ error: detail });
    }

    const order = await response.json();

    // Cache order ID for idempotency dedup
    if (UPSTASH_URL && UPSTASH_TOKEN && resolvedUserId) {
      fetch(`${UPSTASH_URL}/SET/${encodeURIComponent(`${idempotencyKey}:oid`)}/${encodeURIComponent(order.id)}?EX=30`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      }).catch(() => {});
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
      name: price.name,
      description: price.description,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

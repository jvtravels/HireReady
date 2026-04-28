/* Vercel Serverless Function — Razorpay Order Creation */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  isRateLimited,
  getVercelClientIp,
  supabaseUrl,
  supabaseAnonKey,
} from "./_shared";
import { captureServerEvent } from "./_posthog";

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

const PRICE_MAP: Record<string, { amount: number; name: string; description: string }> = {
  single:           { amount: 1000,   name: "HireStepX Session",          description: "Single Session — ₹10 · 1 AI mock interview" },
  weekly:           { amount: 4900,   name: "HireStepX Starter",          description: "Weekly Plan — ₹49/week · 7 sessions" },
  monthly:          { amount: 14900,  name: "HireStepX Pro",              description: "Monthly Plan — ₹149/month · 30 sessions" },
  "yearly-starter": { amount: 203900, name: "HireStepX Starter Annual",   description: "Annual Starter — ₹2,039/year · 7 sessions/week" },
  "yearly-pro":     { amount: 143000, name: "HireStepX Pro Annual",       description: "Annual Pro — ₹1,430/year · 30 sessions/month" },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = applyCorsHeaders(req, res);
  if (handlePreflightAndMethod(req, res)) return;

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
  const ip = getVercelClientIp(req);
  if (await isRateLimited(ip, "create-order", 5, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error("Missing Razorpay env vars:", { hasKeyId: !!RAZORPAY_KEY_ID, hasKeySecret: !!RAZORPAY_KEY_SECRET });
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
    const { plan, userId, email, quantity: rawQty } = req.body;
    if (typeof plan !== "string" || !PRICE_MAP[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    const price = PRICE_MAP[plan];
    if (!price) return res.status(400).json({ error: "Invalid plan" });

    // Quantity support for single session purchases (1-10)
    const quantity = plan === "single" && typeof rawQty === "number" && rawQty >= 1 && rawQty <= 10 ? Math.floor(rawQty) : 1;
    const finalAmount = plan === "single" ? price.amount * quantity : price.amount;
    const finalDescription = plan === "single" && quantity > 1 ? `${quantity} Sessions — ₹${quantity * 10} · ${quantity} AI mock interviews` : price.description;

    // Idempotency: atomic lock to prevent duplicate orders for same user+plan within 30s
    const resolvedUserId = authenticatedUserId || (typeof userId === "string" ? userId : "");
    const idempotencyKey = `order:${resolvedUserId}:${plan}`;
    if (UPSTASH_URL && UPSTASH_TOKEN && resolvedUserId) {
      try {
        // Atomic: SET NX returns OK if key was set (we got the lock), null if it existed (duplicate)
        const lockRes = await fetch(`${UPSTASH_URL}/SET/${encodeURIComponent(idempotencyKey)}/pending/NX/EX/30`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        });
        if (lockRes.ok) {
          const lockData = await lockRes.json();
          if (lockData.result === null) {
            // Key already existed — check if there's a cached order ID
            const oidRes = await fetch(`${UPSTASH_URL}/GET/${encodeURIComponent(`${idempotencyKey}:oid`)}`, {
              headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            });
            if (oidRes.ok) {
              const oidData = await oidRes.json();
              if (oidData.result) {
                return res.status(200).json({
                  orderId: oidData.result,
                  amount: price.amount,
                  currency: "INR",
                  keyId: RAZORPAY_KEY_ID,
                  name: price.name,
                  description: price.description,
                });
              }
            }
            // Lock exists but no order yet — another request is in flight, wait briefly
            await new Promise(r => setTimeout(r, 2000));
            const retryRes = await fetch(`${UPSTASH_URL}/GET/${encodeURIComponent(`${idempotencyKey}:oid`)}`, {
              headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              if (retryData.result) {
                return res.status(200).json({
                  orderId: retryData.result,
                  amount: price.amount,
                  currency: "INR",
                  keyId: RAZORPAY_KEY_ID,
                  name: price.name,
                  description: price.description,
                });
              }
            }
            return res.status(429).json({ error: "Order already in progress. Please wait a moment." });
          }
        }
      } catch (dedupErr) { console.warn("[create-order] Idempotency check failed:", dedupErr); }
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const receipt = `${plan}_${Date.now()}`.slice(0, 40);

    const notes: Record<string, string> = { plan };
    if (plan === "single" && quantity > 1) notes.quantity = String(quantity);
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
      body: JSON.stringify({ amount: finalAmount, currency: "INR", receipt, notes }),
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

    // Payment abandonment tracking — store intent with 25h TTL.
    // Cron (/api/send-abandonment-emails) queries keys older than 1h, sends
    // recovery email, and deletes the key. verify-payment.ts deletes the
    // key on successful payment so we never email paying users.
    if (UPSTASH_URL && UPSTASH_TOKEN && resolvedUserId && typeof email === "string" && email.length > 0) {
      const intentKey = `pay_intent:${order.id}`;
      const intentValue = JSON.stringify({
        userId: resolvedUserId,
        email,
        plan,
        amount: finalAmount,
        planName: price.name,
        createdAt: Date.now(),
      });
      fetch(`${UPSTASH_URL}/SET/${encodeURIComponent(intentKey)}/${encodeURIComponent(intentValue)}?EX=90000`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      }).catch(() => {});
    }

    await captureServerEvent("checkout_started", resolvedUserId || "anonymous", {
      plan,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      quantity,
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
      name: price.name,
      description: finalDescription,
      ...(plan === "single" && quantity > 1 ? { quantity } : {}),
    });
  } catch (err) {
    console.error("Order creation error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* Vercel Serverless Function — Razorpay Order Creation */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

const orderRateMap = new Map<string, { count: number; reset: number }>();

function getAllowedOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Only allow *.vercel.app wildcard when no explicit origins configured (dev/preview)
  if (ALLOWED_ORIGINS.length === 0 && origin.endsWith(".vercel.app")) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

const PRICE_MAP: Record<string, { amount: number; name: string; description: string }> = {
  weekly:  { amount: 4900,   name: "HireReady Starter",          description: "Weekly Plan — ₹49/week · 10 sessions" },
  monthly: { amount: 14900,  name: "HireReady Pro",              description: "Monthly Plan — ₹149/month · Unlimited" },
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

  // Rate limiting: 5 order creations per minute per IP
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = orderRateMap.get(ip);
  if (entry && now < entry.reset) {
    entry.count++;
    if (entry.count > 5) {
      return res.status(429).json({ error: "Rate limit exceeded. Please try again shortly." });
    }
  } else {
    orderRateMap.set(ip, { count: 1, reset: now + 60_000 });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payments not configured" });
  }

  // Verify auth
  const authToken = (req.headers.authorization || "").replace("Bearer ", "");
  if (authToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${authToken}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!authRes.ok) return res.status(401).json({ error: "Unauthorized" });
  } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const { plan, userId, email } = req.body;
    const price = PRICE_MAP[plan];
    if (!price) return res.status(400).json({ error: "Invalid plan" });

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const receipt = `${plan}_${Date.now()}`.slice(0, 40);

    const notes: Record<string, string> = { plan };
    if (userId) notes.userId = userId;
    if (email) notes.email = email;

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: price.amount, currency: "INR", receipt, notes }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Razorpay error:", response.status, errText);
      return res.status(502).json({ error: "Could not create payment order" });
    }

    const order = await response.json();

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

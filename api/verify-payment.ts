/* Vercel Serverless Function — Razorpay Payment Verification */
/* Server-side signature verification + Supabase subscription update */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

/* ─── Inline rate limiting (Node.js ESM can't resolve extensionless imports) ─── */
const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const verifyRateMap = new Map<string, { count: number; reset: number }>();

async function isRateLimited(ip: string, limit: number, windowMs: number): Promise<boolean> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const key = `rl:verify-payment:${ip}`;
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
  const entry = verifyRateMap.get(ip);
  if (!entry || now > entry.reset) {
    verifyRateMap.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireReady <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://levelup-taupe.vercel.app").replace(/\/$/, "");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

function getAllowedOrigin(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  if (ALLOWED_ORIGINS.length === 0 && origin.endsWith(".vercel.app")) return origin;
  return "";
}

const PLAN_DURATION: Record<string, number> = { weekly: 7, monthly: 30 };
const PLAN_TIER: Record<string, string> = { weekly: "starter", monthly: "pro" };
const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900 };
const PLAN_LABEL: Record<string, string> = { weekly: "Starter (₹49/week)", monthly: "Pro (₹149/month)" };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendPaymentEmail(
  email: string,
  name: string,
  plan: string,
  tier: string,
  paymentId: string,
  startDate: string,
  endDate: string,
) {
  if (!RESEND_API_KEY) return;
  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error("Invalid email format, skipping payment email");
    return;
  }
  const planLabel = PLAN_LABEL[plan] || tier;
  const start = new Date(startDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const end = new Date(endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const amount = plan === "monthly" ? "₹149" : "₹49";

  try {
    const emailAc = new AbortController();
    const emailTimer = setTimeout(() => emailAc.abort(), 10_000);
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: emailAc.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Payment confirmed — ${planLabel} activated`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border-radius:16px;border:1px solid #2A2A2C;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2A2A2C;">
          <span style="font-size:18px;font-weight:600;color:#F0EDE8;letter-spacing:0.06em;">HireReady</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Payment Successful</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${escapeHtml(name || "there")}, your subscription has been activated. Here are your details:
          </p>

          <!-- Details card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">Plan</td>
                  <td align="right" style="padding:6px 0;font-size:13px;font-weight:600;color:#C9A96E;">${planLabel}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">Amount Paid</td>
                  <td align="right" style="padding:6px 0;font-size:13px;font-weight:600;color:#F0EDE8;">${amount}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">Valid From</td>
                  <td align="right" style="padding:6px 0;font-size:13px;color:#F0EDE8;">${start}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">Valid Until</td>
                  <td align="right" style="padding:6px 0;font-size:13px;color:#F0EDE8;">${end}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">Payment ID</td>
                  <td align="right" style="padding:6px 0;font-size:11px;color:#9A9590;font-family:monospace;">${paymentId}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#C9A96E,#B8923E);color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Start Practicing
              </a>
            </td></tr>
          </table>

          <p style="margin:16px 0 0;font-size:13px;color:#9A9590;line-height:1.6;">
            ${tier === "pro" ? "You now have unlimited interview sessions, full AI coaching feedback, performance analytics, and more." : "You now have 10 interview sessions per week, all question types, detailed feedback, and resume analysis."}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;">
          <p style="margin:0;font-size:11px;color:#6B6560;line-height:1.5;">
            This is a payment confirmation from HireReady. If you did not make this purchase, please contact us immediately by replying to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });
    clearTimeout(emailTimer);
    if (!emailRes.ok) {
      const errBody = await emailRes.text().catch(() => "");
      console.error("Resend API error:", emailRes.status, errBody);
      throw new Error(`Resend error ${emailRes.status}: ${errBody}`);
    }
  } catch (err) {
    // Non-blocking — don't fail the payment if email fails
    console.error("Failed to send payment email:", err);
    throw err; // re-throw so Promise.allSettled captures it
  }
}

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

  if (!RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Payment verification not configured" });
  }

  // Rate limiting
  const ip = (req.headers["x-real-ip"] as string)?.trim()
    || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || "unknown";
  if (await isRateLimited(ip, 10, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  // Verify user auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  let userId: string;
  let userEmail = "";
  let userName = "";
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email || "";
    userName = userData.user_metadata?.name || userData.user_metadata?.full_name || "";
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    // Validate format of Razorpay IDs (prevent injection)
    const razorpayIdPattern = /^[a-zA-Z0-9_]{6,50}$/;
    if (!razorpayIdPattern.test(razorpay_order_id) || !razorpayIdPattern.test(razorpay_payment_id) || typeof razorpay_signature !== "string" || razorpay_signature.length > 128) {
      return res.status(400).json({ error: "Invalid payment details format" });
    }

    if (typeof plan !== "string" || !PLAN_TIER[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // 1. Verify Razorpay signature (HMAC-SHA256)
    const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Payment signature mismatch for order", razorpay_order_id.slice(0, 8) + "...");
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
      console.error("Plan/amount mismatch for order", razorpay_order_id.slice(0, 8) + "...");
      return res.status(400).json({ error: "Plan does not match payment amount" });
    }

    // 3. Atomic duplicate check + subscription update
    // First check for duplicate payment AND current subscription state in one query
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end,razorpay_payment_id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const profiles = await profileRes.json();
    const current = Array.isArray(profiles) && profiles.length > 0 ? profiles[0] : null;
    if (current) {
      // Check duplicate payment on this user's profile
      if (current.razorpay_payment_id === razorpay_payment_id) {
        return res.status(409).json({ error: "Payment already processed" });
      }
      const currentEnd = current.subscription_end ? new Date(current.subscription_end) : null;
      const isActive = currentEnd && currentEnd > new Date();
      const tierRank: Record<string, number> = { free: 0, starter: 1, pro: 2, team: 3 };
      const newTier = PLAN_TIER[plan];
      if (isActive && (tierRank[current.subscription_tier] || 0) > (tierRank[newTier] || 0)) {
        return res.status(400).json({ error: `You already have an active ${current.subscription_tier} plan. Downgrading is not supported — wait for it to expire or contact support.` });
      }
    }

    // Also check payments table for any user with this payment ID (cross-user replay)
    const dupCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_payment_id=eq.${encodeURIComponent(razorpay_payment_id)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const dupRows = await dupCheck.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(409).json({ error: "Payment already processed" });
    }

    // 4. Calculate subscription dates — extend from current end if still active
    const now = new Date();
    const currentEnd = current?.subscription_end ? new Date(current.subscription_end) : null;
    const base = currentEnd && currentEnd > now ? currentEnd : now;
    const end = new Date(base);
    end.setDate(end.getDate() + PLAN_DURATION[plan]);
    const tier = PLAN_TIER[plan];

    // 5. Store payment record FIRST (critical — must succeed before activating subscription)
    const paymentRecordRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        user_id: userId,
        razorpay_payment_id,
        razorpay_order_id,
        plan,
        tier,
        amount: PLAN_AMOUNT[plan],
        currency: "INR",
        status: "completed",
        subscription_start: now.toISOString(),
        subscription_end: end.toISOString(),
      }),
    });

    if (!paymentRecordRes.ok) {
      const errText = await paymentRecordRes.text().catch(() => "");
      console.error("Payment record save failed:", paymentRecordRes.status, errText);
      return res.status(500).json({ error: "Failed to save payment record" });
    }

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

    // 6c. Send confirmation email (non-critical — don't fail payment if email fails)
    let emailSent = false;
    if (userEmail) {
      try {
        await sendPaymentEmail(userEmail, userName, plan, tier, razorpay_payment_id, now.toISOString(), end.toISOString());
        emailSent = true;
      } catch (emailErr) {
        console.error("Confirmation email failed (non-critical):", emailErr);
      }
    }

    return res.status(200).json({
      success: true,
      subscriptionTier: tier,
      subscriptionStart: now.toISOString(),
      subscriptionEnd: end.toISOString(),
      emailSent,
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

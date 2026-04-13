/* Vercel Serverless Function — Razorpay Payment Verification */
/* Server-side signature verification + Supabase subscription update */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  isRateLimited,
  getVercelClientIp,
  escapeHtml,
  supabaseUrl,
  supabaseAnonKey,
} from "./_shared";

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

const PLAN_DURATION: Record<string, number> = { single: 0, weekly: 7, monthly: 0, "yearly-starter": 365, "yearly-pro": 365 }; // monthly uses setMonth() below; single adds credits
const PLAN_TIER: Record<string, string> = { single: "free", weekly: "starter", monthly: "pro", "yearly-starter": "starter", "yearly-pro": "pro" }; // single stays on free tier, just adds credits
const PLAN_AMOUNT: Record<string, number> = { single: 1000, weekly: 4900, monthly: 14900, "yearly-starter": 203900, "yearly-pro": 143000 };
const PLAN_LABEL: Record<string, string> = { single: "Single Session (₹10)", weekly: "Starter (₹49/week)", monthly: "Pro (₹149/month)", "yearly-starter": "Starter Annual (₹2,039/year)", "yearly-pro": "Pro Annual (₹1,430/year)" };

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
  const amountMap: Record<string, string> = { weekly: "₹49", monthly: "₹149", "yearly-starter": "₹2,039", "yearly-pro": "₹1,430" };
  const amount = amountMap[plan] || "₹149";

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
          <span style="font-size:18px;font-weight:600;color:#F0EDE8;letter-spacing:0.06em;">HireStepX</span>
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
            This is a payment confirmation from HireStepX. If you did not make this purchase, please contact us immediately by replying to this email.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#6B6560;">
            <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;text-decoration:underline;">Manage subscription</a> · <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;text-decoration:underline;">Unsubscribe</a>
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

  const SUPABASE_URL = supabaseUrl();
  if (!RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Payment verification not configured" });
  }

  // Rate limiting
  const ip = getVercelClientIp(req);
  if (await isRateLimited(ip, "verify-payment", 10, 60_000)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests. Please try again shortly.", retryAfter: 60 });
  }

  // Verify user auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_ANON_KEY = supabaseAnonKey();
  const token = authHeader.slice(7);
  let userId: string;
  let userEmail = "";
  let userName = "";
  try {
    const authAc = new AbortController();
    const authTimer = setTimeout(() => authAc.abort(), 5000);
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: authAc.signal,
    });
    clearTimeout(authTimer);
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email || "";
    userName = userData.user_metadata?.name || userData.user_metadata?.full_name || "";
  } catch (authErr) {
    if (authErr instanceof DOMException && authErr.name === "AbortError") {
      return res.status(504).json({ error: "Auth verification timed out" });
    }
    return res.status(401).json({ error: "Auth verification failed" });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, razorpay_subscription_id, plan } = req.body;

    if (!razorpay_payment_id || !razorpay_signature || !plan) {
      return res.status(400).json({ error: "Missing payment details", code: "MISSING_FIELDS" });
    }

    // For subscriptions, order_id may not be present — subscription_id is used instead
    if (!razorpay_order_id && !razorpay_subscription_id) {
      return res.status(400).json({ error: "Missing order or subscription ID", code: "MISSING_IDENTIFIER" });
    }

    // Validate format of Razorpay IDs (prevent injection)
    const razorpayIdPattern = /^[a-zA-Z0-9_]{6,50}$/;
    if (
      !razorpayIdPattern.test(razorpay_payment_id)
      || (razorpay_order_id && !razorpayIdPattern.test(razorpay_order_id))
      || (razorpay_subscription_id && !razorpayIdPattern.test(razorpay_subscription_id))
      || typeof razorpay_signature !== "string" || razorpay_signature.length > 128
    ) {
      return res.status(400).json({ error: "Invalid payment details format", code: "INVALID_FORMAT" });
    }

    if (typeof plan !== "string" || !PLAN_TIER[plan]) {
      return res.status(400).json({ error: "Invalid plan", code: "INVALID_PLAN" });
    }

    // 1. Verify Razorpay signature (HMAC-SHA256)
    // Subscriptions sign: payment_id|subscription_id; orders sign: order_id|payment_id
    const signPayload = razorpay_subscription_id
      ? `${razorpay_payment_id}|${razorpay_subscription_id}`
      : `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(signPayload)
      .digest("hex");

    const sigBuf = Buffer.from(razorpay_signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      console.error("Payment signature mismatch for", (razorpay_order_id || razorpay_subscription_id || "").slice(0, 8) + "...");
      return res.status(400).json({ error: "Payment signature verification failed", code: "SIGNATURE_MISMATCH" });
    }

    // 2. Verify plan matches the actual order/subscription amount with Razorpay
    const rzpAuth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const rzpAc = new AbortController();
    const rzpTimer = setTimeout(() => rzpAc.abort(), 8000);
    try {
    if (razorpay_order_id) {
      const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
        headers: { Authorization: `Basic ${rzpAuth}` }, signal: rzpAc.signal,
      });
      if (!orderRes.ok) {
        return res.status(400).json({ error: "Could not verify order details", code: "ORDER_FETCH_FAILED" });
      }
      const orderData = await orderRes.json();
      if (orderData.amount !== PLAN_AMOUNT[plan]) {
        console.error("Plan/amount mismatch for order", razorpay_order_id.slice(0, 8) + "...");
        return res.status(400).json({ error: "Plan does not match payment amount", code: "AMOUNT_MISMATCH" });
      }
    } else if (razorpay_subscription_id) {
      // For subscriptions, verify the subscription exists and is active
      const subRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpay_subscription_id}`, {
        headers: { Authorization: `Basic ${rzpAuth}` }, signal: rzpAc.signal,
      });
      if (!subRes.ok) {
        return res.status(400).json({ error: "Could not verify subscription details", code: "SUBSCRIPTION_FETCH_FAILED" });
      }
      const subData = await subRes.json();
      if (!["active", "authenticated", "created"].includes(subData.status)) {
        return res.status(400).json({ error: "Subscription is not active", code: "SUBSCRIPTION_INACTIVE" });
      }
    }
    } catch (rzpErr) {
      if (rzpErr instanceof DOMException && rzpErr.name === "AbortError") {
        return res.status(504).json({ error: "Payment verification timed out. Please retry.", code: "RAZORPAY_TIMEOUT" });
      }
      throw rzpErr;
    } finally { clearTimeout(rzpTimer); }

    // 3. Duplicate check FIRST — before any state mutations
    // Check payments table for any user with this payment ID (cross-user replay)
    const dupCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_payment_id=eq.${encodeURIComponent(razorpay_payment_id)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const dupRows = await dupCheck.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(409).json({ error: "Payment already processed" });
    }

    // 3b. Check profile for duplicate + subscription state
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end,razorpay_payment_id,session_credits`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const profiles = await profileRes.json();
    const current = Array.isArray(profiles) && profiles.length > 0 ? profiles[0] : null;
    if (current) {
      if (current.razorpay_payment_id === razorpay_payment_id) {
        return res.status(409).json({ error: "Payment already processed" });
      }
      const currentEnd = current.subscription_end ? new Date(current.subscription_end) : null;
      const isActive = currentEnd && currentEnd > new Date();
      const tierRank: Record<string, number> = { free: 0, starter: 1, pro: 2 };
      const newTier = PLAN_TIER[plan];
      if (isActive && (tierRank[current.subscription_tier] || 0) > (tierRank[newTier] || 0)) {
        return res.status(400).json({ error: `You already have an active ${current.subscription_tier} plan. Downgrading is not supported — wait for it to expire or contact support.` });
      }
    }

    // 4a. Handle single session credit purchase (no tier change)
    if (plan === "single") {
      const now = new Date();
      // Store payment record
      const paymentRecordRes = await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
        method: "POST",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ id: crypto.randomUUID(), user_id: userId, razorpay_payment_id, razorpay_order_id, plan: "single", tier: "free", amount: 1000, currency: "INR", status: "completed", subscription_start: now.toISOString(), subscription_end: now.toISOString() }),
      });
      if (!paymentRecordRes.ok) {
        console.error("Payment record save failed:", paymentRecordRes.status);
        return res.status(500).json({ error: "Failed to save payment record" });
      }
      // Increment session_credits on profile via RPC or direct update
      const currentCredits = current?.session_credits || 0;
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ session_credits: currentCredits + 1, razorpay_payment_id }),
      });
      if (!updateRes.ok) {
        console.error("Credit update failed:", updateRes.status);
        return res.status(500).json({ error: "Failed to add session credit" });
      }
      // Send confirmation email
      try { await sendPaymentEmail(email || "", "single", now.toISOString(), now.toISOString(), PLAN_LABEL["single"]); } catch (e) { console.warn("Email send failed:", e); }
      return res.status(200).json({ success: true, tier: current?.subscription_tier || "free", plan: "single", credits: currentCredits + 1, subscription_start: now.toISOString(), subscription_end: current?.subscription_end || now.toISOString() });
    }

    // 4b. Calculate subscription dates with mid-cycle upgrade proration
    const now = new Date();
    const currentEnd = current?.subscription_end ? new Date(current.subscription_end) : null;
    const tier = PLAN_TIER[plan];
    const tierRankForProration: Record<string, number> = { free: 0, starter: 1, pro: 2 };
    const isUpgrade = current && currentEnd && currentEnd > now
      && (tierRankForProration[current.subscription_tier] || 0) < (tierRankForProration[tier] || 0);

    let end: Date;
    let proratedDays = 0;
    if (isUpgrade && currentEnd) {
      // Credit remaining days from current plan proportionally
      const remainingMs = currentEnd.getTime() - now.getTime();
      const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
      const currentPlanDuration = current.subscription_tier === "starter" ? 7 : 30;
      const currentPlanAmount = current.subscription_tier === "starter" ? 4900 : 14900;
      const newPlanAmount = PLAN_AMOUNT[plan];
      // Convert remaining days to credit ratio and add proportional bonus days
      const isAnnual = plan.startsWith("yearly-");
      const newPlanDays = plan === "monthly" ? 30 : isAnnual ? 365 : PLAN_DURATION[plan];
      proratedDays = Math.floor((remainingDays / currentPlanDuration) * (currentPlanAmount / newPlanAmount) * newPlanDays);
      end = new Date(now);
      if (plan === "monthly") {
        end.setMonth(end.getMonth() + 1);
      } else if (isAnnual) {
        end.setFullYear(end.getFullYear() + 1);
      } else {
        end.setDate(end.getDate() + PLAN_DURATION[plan]);
      }
      end.setDate(end.getDate() + proratedDays);
    } else {
      // Extend from current end if still active (same tier renewal)
      const base = currentEnd && currentEnd > now ? currentEnd : now;
      end = new Date(base);
      if (plan === "monthly") {
        end.setMonth(end.getMonth() + 1);
      } else if (plan.startsWith("yearly-")) {
        end.setFullYear(end.getFullYear() + 1);
      } else {
        end.setDate(end.getDate() + PLAN_DURATION[plan]);
      }
    }

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
          ...(razorpay_subscription_id ? { razorpay_subscription_id } : {}),
          cancel_at_period_end: false,
        }),
      },
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "");
      console.error("Supabase update error:", updateRes.status, errText);
      return res.status(500).json({ error: "Failed to activate subscription" });
    }

    // 6c. Send confirmation email with retry (non-critical — don't fail payment if email fails)
    let emailSent = false;
    if (userEmail) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await sendPaymentEmail(userEmail, userName, plan, tier, razorpay_payment_id, now.toISOString(), end.toISOString());
          emailSent = true;
          break;
        } catch (emailErr) {
          console.error(`Confirmation email attempt ${attempt + 1} failed:`, emailErr);
          if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (!emailSent) {
        console.error(`[verify-payment] Email permanently failed for user ${userId.slice(0, 8)}, payment ${razorpay_payment_id.slice(0, 8)}`);
      }
    }

    // Fetch receipt/invoice URL from Razorpay payment (best-effort)
    // Razorpay provides a short_url on invoices that is customer-facing (no auth needed)
    let receiptUrl: string | null = null;
    try {
      const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        headers: { Authorization: `Basic ${rzpAuth}` },
      });
      if (paymentRes.ok) {
        const paymentData = await paymentRes.json();
        if (paymentData.invoice_id) {
          const invoiceRes = await fetch(`https://api.razorpay.com/v1/invoices/${paymentData.invoice_id}`, {
            headers: { Authorization: `Basic ${rzpAuth}` },
          });
          if (invoiceRes.ok) {
            const invoiceData = await invoiceRes.json();
            receiptUrl = invoiceData.short_url || null;
          }
        }
      }
    } catch (receiptErr) { console.warn("[verify-payment] Receipt fetch failed:", receiptErr); }

    return res.status(200).json({
      success: true,
      subscriptionTier: tier,
      subscriptionStart: now.toISOString(),
      subscriptionEnd: end.toISOString(),
      paymentId: razorpay_payment_id,
      emailSent,
      receiptUrl,
      ...(proratedDays > 0 ? { proratedBonusDays: proratedDays } : {}),
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

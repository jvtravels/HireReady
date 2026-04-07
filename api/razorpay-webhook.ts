/* Vercel Serverless Function — Razorpay Webhook Handler */
/* Receives payment.captured events from Razorpay and activates subscriptions server-side. */
/* This is a safety net: if the client's verify-payment call fails after payment, the webhook */
/* ensures the subscription is still activated. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";
import { safeCapture, safeCaptureError } from "./_posthog";

const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "Hirloop <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirloop.vercel.app").replace(/\/$/, "");

const PLAN_DURATION: Record<string, number> = { weekly: 7, monthly: 30 };
const PLAN_TIER: Record<string, string> = { weekly: "starter", monthly: "pro" };
const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900 };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Webhooks are POST only, no CORS needed (server-to-server)
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RAZORPAY_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Webhook not configured" });
  }

  // Verify Razorpay webhook signature
  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    return res.status(400).json({ error: "Missing signature" });
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const expectedSignature = createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("[webhook] Signature mismatch");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const eventType = event?.event;

  // Only handle payment.captured events
  if (eventType !== "payment.captured") {
    return res.status(200).json({ received: true, skipped: eventType });
  }

  try {
    const payment = event?.payload?.payment?.entity;
    if (!payment) {
      return res.status(400).json({ error: "Missing payment entity" });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amount = payment.amount; // in paise
    const notes = payment.notes || {};
    const plan = notes.plan;
    const userId = notes.userId;

    if (!plan || !userId || !PLAN_TIER[plan]) {
      console.error("[webhook] Missing plan or userId in notes:", { plan, userId: userId?.slice(0, 8) });
      return res.status(200).json({ received: true, skipped: "missing_notes" });
    }

    // Verify amount matches expected plan
    if (amount !== PLAN_AMOUNT[plan]) {
      console.error("[webhook] Amount mismatch:", { amount, expected: PLAN_AMOUNT[plan] });
      return res.status(200).json({ received: true, skipped: "amount_mismatch" });
    }

    // Check if payment already processed (idempotency)
    const dupCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_payment_id=eq.${encodeURIComponent(paymentId)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const dupRows = await dupCheck.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(200).json({ received: true, already_processed: true });
    }

    // Activate subscription — extend from current end if still active
    const now = new Date();
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_end`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const profileRows = await profileRes.json();
    const currentEnd = Array.isArray(profileRows) && profileRows[0]?.subscription_end ? new Date(profileRows[0].subscription_end) : null;
    const base = currentEnd && currentEnd > now ? currentEnd : now;
    const end = new Date(base);
    end.setDate(end.getDate() + PLAN_DURATION[plan]);
    const tier = PLAN_TIER[plan];

    // Update profile
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
          razorpay_payment_id: paymentId,
        }),
      },
    );

    if (!updateRes.ok) {
      console.error("[webhook] Profile update failed:", updateRes.status);
      return res.status(500).json({ error: "Profile update failed" });
    }

    // Store payment record
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
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        plan,
        tier,
        amount,
        currency: "INR",
        status: "completed",
        subscription_start: now.toISOString(),
        subscription_end: end.toISOString(),
      }),
    });

    if (!paymentRecordRes.ok) {
      console.error("[webhook] Payment record insert failed:", paymentRecordRes.status, "for payment", paymentId);
      // Subscription is already activated — log for manual reconciliation, don't fail webhook
    }

    // Send confirmation email (best-effort)
    if (RESEND_API_KEY && notes.email) {
      const safeName = escapeHtml(notes.userName || "there");
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [notes.email],
            subject: `Payment confirmed — ${tier} plan activated`,
            html: `<p>Hi ${safeName}, your Hirloop <strong>${tier}</strong> plan is now active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p><p><a href="${APP_URL}/dashboard">Start Practicing</a></p>`,
          }),
        });
      } catch {}
    }

    safeCapture(userId, "webhook_payment_activated", { plan, tier, amount, currency: "INR", razorpay_payment_id: paymentId, subscription_end: end.toISOString() });

    console.log(`[webhook] Activated ${tier} for user ${userId.slice(0, 8)}...`);
    return res.status(200).json({ received: true, activated: true, tier });
  } catch (err) {
    console.error("[webhook] Error:", err);
    safeCaptureError(err);
    return res.status(500).json({ error: "Internal error" });
  }
}

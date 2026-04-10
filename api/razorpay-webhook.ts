/* Vercel Serverless Function — Razorpay Webhook Handler */
/* Receives payment.captured events from Razorpay and activates subscriptions server-side. */
/* This is a safety net: if the client's verify-payment call fails after payment, the webhook */
/* ensures the subscription is still activated. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";


const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

const PLAN_DURATION: Record<string, number> = { weekly: 7, monthly: 30 };
const PLAN_TIER: Record<string, string> = { weekly: "starter", monthly: "pro" };
const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900 };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Vercel config: disable body parsing so we can access raw body for signature verification
export const config = { api: { bodyParser: false } };

function getRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Global timeout — ensure we respond before Vercel's 10s limit
  const globalTimeout = setTimeout(() => {
    console.error("[webhook] Global timeout reached (8s)");
    if (!res.headersSent) res.status(504).json({ error: "Processing timeout" });
  }, 8000);
  const clearGlobal = () => clearTimeout(globalTimeout);

  // Webhooks are POST only, no CORS needed (server-to-server)
  if (req.method !== "POST") { clearGlobal(); return res.status(405).json({ error: "Method not allowed" }); }

  if (!RAZORPAY_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    clearGlobal();
    return res.status(503).json({ error: "Webhook not configured" });
  }

  // Verify Razorpay webhook signature using raw body (preserves original key order)
  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    clearGlobal();
    return res.status(400).json({ error: "Missing signature" });
  }

  let rawBody: string;
  try {
    // If bodyParser is disabled, read raw stream; otherwise fall back to stringified body
    rawBody = typeof req.body === "string" ? req.body
      : req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? JSON.stringify(req.body) // fallback if bodyParser wasn't actually disabled
        : await getRawBody(req);
  } catch (bodyErr) {
    clearGlobal();
    console.error("[webhook] Failed to read body:", bodyErr);
    return res.status(400).json({ error: "Invalid body" });
  }

  if (rawBody.length > 1048576) {
    clearGlobal();
    return res.status(413).json({ error: "Body too large" });
  }

  const expectedSignature = createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    clearGlobal();
    console.error("[webhook] Signature mismatch");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    clearGlobal();
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const eventType = event?.event;

  const HANDLED_EVENTS = [
    "payment.captured",
    "subscription.activated",
    "subscription.charged",
    "subscription.halted",
    "subscription.cancelled",
    "subscription.completed",
    "subscription.paused",
    "subscription.resumed",
  ];

  if (!HANDLED_EVENTS.includes(eventType)) {
    return res.status(200).json({ received: true, skipped: eventType });
  }

  try {
    // ─── Subscription lifecycle events ───
    if (eventType.startsWith("subscription.")) {
      const subscription = event?.payload?.subscription?.entity;
      if (!subscription) return res.status(400).json({ error: "Missing subscription entity" });

      const subscriptionId = subscription.id;
      const notes = subscription.notes || {};
      const plan = notes.plan;
      const userId = notes.userId;

      if (!userId) {
        console.error("[webhook] Missing userId in subscription notes:", { subscriptionId });
        return res.status(200).json({ received: true, skipped: "missing_userId" });
      }

      const dbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

      if (eventType === "subscription.activated") {
        // First activation — save subscription ID and activate tier
        const tier = PLAN_TIER[plan] || "starter";
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + (PLAN_DURATION[plan] || 30));

        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            subscription_tier: tier,
            subscription_start: now.toISOString(),
            subscription_end: end.toISOString(),
            razorpay_subscription_id: subscriptionId,
            cancel_at_period_end: false,
          }),
        });

        console.log(`[webhook] subscription.activated: ${tier} for user ${userId.slice(0, 8)}`);
        return res.status(200).json({ received: true, activated: true, tier });
      }

      if (eventType === "subscription.charged") {
        // Recurring payment succeeded — extend subscription
        const payment = event?.payload?.payment?.entity;
        const paymentId = payment?.id;

        if (paymentId) {
          // Idempotency check
          const dupCheck = await fetch(
            `${SUPABASE_URL}/rest/v1/payments?razorpay_payment_id=eq.${encodeURIComponent(paymentId)}&select=id`,
            { headers: dbHeaders },
          );
          const dupRows = await dupCheck.json();
          if (Array.isArray(dupRows) && dupRows.length > 0) {
            return res.status(200).json({ received: true, already_processed: true });
          }
        }

        const tier = PLAN_TIER[plan] || "starter";
        const now = new Date();
        // Extend from current end if still active
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_end,email,name`,
          { headers: dbHeaders },
        );
        const profileRows = await profileRes.json();
        const currentEnd = Array.isArray(profileRows) && profileRows[0]?.subscription_end ? new Date(profileRows[0].subscription_end) : null;
        const base = currentEnd && currentEnd > now ? currentEnd : now;
        const end = new Date(base);
        end.setDate(end.getDate() + (PLAN_DURATION[plan] || 30));

        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            subscription_tier: tier,
            subscription_start: now.toISOString(),
            subscription_end: end.toISOString(),
            razorpay_payment_id: paymentId || undefined,
            cancel_at_period_end: false,
          }),
        });

        // Log payment record
        if (paymentId) {
          await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
            method: "POST",
            headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({
              id: crypto.randomUUID(),
              user_id: userId,
              razorpay_payment_id: paymentId,
              razorpay_order_id: payment?.order_id || "",
              plan: plan || "monthly",
              tier,
              amount: payment?.amount || PLAN_AMOUNT[plan] || 14900,
              currency: "INR",
              status: "completed",
              subscription_start: now.toISOString(),
              subscription_end: end.toISOString(),
            }),
          }).catch(err => console.error("[webhook] Payment record insert failed:", err));
        }

        // Send renewal confirmation email (best-effort)
        const profileEmail = Array.isArray(profileRows) && profileRows[0]?.email;
        const profileName = Array.isArray(profileRows) && profileRows[0]?.name;
        if (RESEND_API_KEY && profileEmail) {
          const safeName = escapeHtml(profileName || "there");
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: FROM_EMAIL,
                to: [profileEmail],
                subject: `Subscription renewed — ${tier} plan extended`,
                html: `<p>Hi ${safeName}, your HireStepX <strong>${tier}</strong> plan has been auto-renewed and is active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p><p><a href="${APP_URL}/dashboard">Continue Practicing</a></p>`,
              }),
            });
          } catch (emailErr) { console.error("[webhook] Renewal email failed:", emailErr); }
        }

        console.log(`[webhook] subscription.charged: renewed ${tier} for user ${userId.slice(0, 8)}`);
        return res.status(200).json({ received: true, renewed: true, tier });
      }

      if (eventType === "subscription.halted") {
        // Payment failed after all retries — downgrade to free
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            subscription_tier: "free",
            razorpay_subscription_id: null,
          }),
        });

        console.log(`[webhook] subscription.halted: downgraded user ${userId.slice(0, 8)} to free`);
        return res.status(200).json({ received: true, downgraded: true });
      }

      if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
        // User cancelled or all charges completed — mark cancel_at_period_end
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            cancel_at_period_end: true,
            razorpay_subscription_id: null,
          }),
        });

        console.log(`[webhook] ${eventType}: user ${userId.slice(0, 8)} subscription ending at period end`);
        return res.status(200).json({ received: true, cancelled: true });
      }

      if (eventType === "subscription.paused" || eventType === "subscription.resumed") {
        const paused = eventType === "subscription.paused";
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ subscription_paused: paused }),
        });

        console.log(`[webhook] ${eventType}: user ${userId.slice(0, 8)} subscription ${paused ? "paused" : "resumed"}`);
        return res.status(200).json({ received: true, paused });
      }

      return res.status(200).json({ received: true });
    }

    // ─── One-time payment.captured (backward compatibility) ───
    const payment = event?.payload?.payment?.entity;
    if (!payment) {
      return res.status(400).json({ error: "Missing payment entity" });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amount = payment.amount;
    const notes = payment.notes || {};
    const plan = notes.plan;
    const userId = notes.userId;

    if (!plan || !userId || !PLAN_TIER[plan]) {
      console.error("[webhook] Missing plan or userId in notes:", { plan, userId: userId?.slice(0, 8) });
      return res.status(200).json({ received: true, skipped: "missing_notes" });
    }

    if (amount !== PLAN_AMOUNT[plan]) {
      console.error("[webhook] Amount mismatch:", { amount, expected: PLAN_AMOUNT[plan] });
      return res.status(200).json({ received: true, skipped: "amount_mismatch" });
    }

    // Idempotency check
    const dupCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_payment_id=eq.${encodeURIComponent(paymentId)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const dupRows = await dupCheck.json();
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      return res.status(200).json({ received: true, already_processed: true });
    }

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

    await fetch(`${SUPABASE_URL}/rest/v1/payments`, {
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
    }).catch(err => console.error("[webhook] Payment record insert failed:", err));

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
            html: `<p>Hi ${safeName}, your HireStepX <strong>${tier}</strong> plan is now active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p><p><a href="${APP_URL}/dashboard">Start Practicing</a></p>`,
          }),
        });
      } catch (emailErr) { console.error("[webhook] Payment email failed:", emailErr); }
    }

    console.log(`[webhook] Activated ${tier} for user ${userId.slice(0, 8)}...`);
    return res.status(200).json({ received: true, activated: true, tier });
  } catch (err) {
    console.error("[webhook] Error:", err);
    return res.status(500).json({ error: "Internal error" });
  } finally {
    clearGlobal();
  }
}

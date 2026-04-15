/* Vercel Serverless Function — Razorpay Webhook Handler */
/* Receives payment.captured events from Razorpay and activates subscriptions server-side. */
/* This is a safety net: if the client's verify-payment call fails after payment, the webhook */
/* ensures the subscription is still activated. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";
import { escapeHtml } from "./_shared.js";


const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

const PLAN_DURATION: Record<string, number> = { weekly: 7, monthly: 30, "yearly-starter": 365, "yearly-pro": 365 };
const PLAN_TIER: Record<string, string> = { weekly: "starter", monthly: "pro", "yearly-starter": "starter", "yearly-pro": "pro" };
const PLAN_AMOUNT: Record<string, number> = { weekly: 4900, monthly: 14900, "yearly-starter": 203900, "yearly-pro": 143000 };

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

// In-memory event dedup — fallback when Redis is unavailable
const _processedEvents = new Set<string>();
const DEDUP_MAX = 500;
function markProcessedInMemory(eventId: string): boolean {
  if (_processedEvents.has(eventId)) return false; // already processed
  if (_processedEvents.size >= DEDUP_MAX) _processedEvents.clear();
  _processedEvents.add(eventId);
  return true; // first time
}

/** Check Redis-backed dedup (24h TTL). Returns "new" | "duplicate" | "redis_unavailable". */
async function checkDedup(dedupKey: string): Promise<"new" | "duplicate" | "redis_unavailable"> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return "redis_unavailable";
  try {
    const setRes = await fetch(
      `${UPSTASH_URL}/SET/${encodeURIComponent(`webhook:${dedupKey}`)}/1/NX/EX/86400`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } },
    );
    if (!setRes.ok) return "redis_unavailable";
    const setData = await setRes.json();
    // SET NX returns null when key already existed (duplicate)
    return setData.result === null ? "duplicate" : "new";
  } catch (err) {
    console.warn("[webhook] Redis dedup check failed, falling back to in-memory:", err);
    return "redis_unavailable";
  }
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
    if (res.headersSent) return;
    console.error("[webhook] Global timeout reached (8s)");
    res.status(504).json({ error: "Processing timeout" });
  }, 8000);

  // Webhooks are POST only, no CORS needed (server-to-server)
  if (req.method !== "POST") { clearTimeout(globalTimeout); return res.status(405).json({ error: "Method not allowed" }); }

  if (!RAZORPAY_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    clearTimeout(globalTimeout);
    return res.status(503).json({ error: "Webhook not configured" });
  }

  // Verify Razorpay webhook signature using raw body (preserves original key order)
  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    clearTimeout(globalTimeout);
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
    clearTimeout(globalTimeout);
    console.error("[webhook] Failed to read body:", bodyErr);
    return res.status(400).json({ error: "Invalid body" });
  }

  if (rawBody.length > 1048576) {
    clearTimeout(globalTimeout);
    return res.status(413).json({ error: "Body too large" });
  }

  const expectedSignature = createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks on signature verification
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    clearTimeout(globalTimeout);
    console.error("[webhook] Signature mismatch");
    return res.status(400).json({ error: "Invalid signature" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay webhook payload is dynamic external data
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    clearTimeout(globalTimeout);
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const eventType = event?.event;
  const eventId = event?.entity?.id || event?.payload?.payment?.entity?.id || event?.payload?.subscription?.entity?.id || "";
  const dedupKey = `${eventType}:${eventId}`;
  if (dedupKey.length > 5) {
    const dedupResult = await checkDedup(dedupKey);
    if (dedupResult === "duplicate") {
      clearTimeout(globalTimeout);
      return res.status(200).json({ received: true, skipped: "duplicate" });
    }
    if (dedupResult === "redis_unavailable") {
      // Fall back to in-memory dedup (better than nothing on cold starts)
      if (!markProcessedInMemory(dedupKey)) {
        clearTimeout(globalTimeout);
        return res.status(200).json({ received: true, skipped: "duplicate" });
      }
    }
  }

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
      if (typeof subscriptionId !== "string" || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
        console.error("[webhook] Invalid subscription ID format:", subscriptionId);
        return res.status(400).json({ error: "Invalid subscription ID format" });
      }
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

        const activateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
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

        if (!activateRes.ok) {
          console.error("[webhook] subscription.activated profile update failed:", activateRes.status);
          return res.status(500).json({ error: "Profile update failed" });
        }

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

        const renewRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
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

        if (!renewRes.ok) {
          console.error("[webhook] subscription.charged profile update failed:", renewRes.status);
          return res.status(500).json({ error: "Profile update failed" });
        }

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
                html: `<p>Hi ${safeName}, your HireStepX <strong>${tier}</strong> plan has been auto-renewed and is active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p><p><a href="${APP_URL}/dashboard">Continue Practicing</a></p><p style="margin-top:16px;font-size:11px;color:#6B6560;"><a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;">Manage subscription</a> · <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;">Unsubscribe</a></p>`,
              }),
            });
          } catch (emailErr) { console.error("[webhook] Renewal email failed:", emailErr); }
        }

        console.log(`[webhook] subscription.charged: renewed ${tier} for user ${userId.slice(0, 8)}`);
        return res.status(200).json({ received: true, renewed: true, tier });
      }

      if (eventType === "subscription.halted") {
        // Payment failed after all retries — downgrade to free
        // Fetch profile first to get email, name, and previous tier for the notification
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=email,name,subscription_tier`,
          { headers: dbHeaders },
        );
        const profileRows = await profileRes.json();
        const profileEmail = Array.isArray(profileRows) && profileRows[0]?.email;
        const profileName = Array.isArray(profileRows) && profileRows[0]?.name;
        const previousTier: string = (Array.isArray(profileRows) && profileRows[0]?.subscription_tier) || "starter";

        const haltRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            subscription_tier: "free",
            razorpay_subscription_id: null,
          }),
        });

        if (!haltRes.ok) {
          console.error("[webhook] subscription.halted profile update failed:", haltRes.status);
          return res.status(500).json({ error: "Profile update failed" });
        }

        // Send payment-failed notification email (best-effort, non-blocking)
        if (RESEND_API_KEY && profileEmail) {
          const safeName = escapeHtml(profileName || "there");
          const lostFeatures = previousTier === "pro"
            ? `<tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Unlimited sessions</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Full AI coaching feedback</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Performance analytics</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Priority support</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>`
            : `<tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">10 sessions per week</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">All question types</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Detailed feedback</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">Resume analysis</td><td align="right" style="padding:6px 0;font-size:13px;color:#E5534B;">Removed</td></tr>`;

          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: FROM_EMAIL,
                to: [profileEmail],
                subject: "Payment failed — your HireStepX subscription has been paused",
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#E5534B;">Payment Failed</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${safeName}, your recent payment attempt was unsuccessful and your subscription has been downgraded to the <strong style="color:#F0EDE8;">free tier</strong>. Your previous <strong style="color:#C9A96E;">${previousTier}</strong> plan benefits have been removed.
          </p>

          <!-- Lost features card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:16px 24px 8px;">
              <p style="margin:0;font-size:12px;font-weight:600;color:#9A9590;text-transform:uppercase;letter-spacing:0.08em;">Features you&rsquo;ve lost</p>
            </td></tr>
            <tr><td style="padding:4px 24px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${lostFeatures}
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${APP_URL}/dashboard?tab=settings" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#C9A96E,#B8923E);color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Update Payment Method
              </a>
            </td></tr>
          </table>

          <p style="margin:16px 0 0;font-size:13px;color:#9A9590;line-height:1.6;">
            If you believe this is an error, contact us at <a href="mailto:support@hirestepx.com" style="color:#C9A96E;text-decoration:underline;">support@hirestepx.com</a>.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;">
          <p style="margin:0;font-size:11px;color:#6B6560;line-height:1.5;">
            This is an automated notification from HireStepX regarding a failed payment on your account.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#6B6560;">
            <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;text-decoration:underline;">Manage subscription</a> · <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;text-decoration:underline;">Update payment</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
              }),
            });
          } catch (emailErr) { console.error("[webhook] Payment-failed email failed:", emailErr); }
        }

        console.log(`[webhook] subscription.halted: downgraded user ${userId.slice(0, 8)} to free`);
        return res.status(200).json({ received: true, downgraded: true });
      }

      if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
        // User cancelled or all charges completed — mark cancel_at_period_end
        const cancelRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            cancel_at_period_end: true,
            razorpay_subscription_id: null,
          }),
        });

        if (!cancelRes.ok) {
          console.error(`[webhook] ${eventType} profile update failed:`, cancelRes.status);
          return res.status(500).json({ error: "Profile update failed" });
        }

        console.log(`[webhook] ${eventType}: user ${userId.slice(0, 8)} subscription ending at period end`);
        return res.status(200).json({ received: true, cancelled: true });
      }

      if (eventType === "subscription.paused" || eventType === "subscription.resumed") {
        const paused = eventType === "subscription.paused";
        const pauseRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ subscription_paused: paused }),
        });

        if (!pauseRes.ok) {
          console.error(`[webhook] ${eventType} profile update failed:`, pauseRes.status);
          return res.status(500).json({ error: "Profile update failed" });
        }

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
    if (typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
      console.error("[webhook] Invalid payment ID format:", paymentId);
      return res.status(400).json({ error: "Invalid payment ID format" });
    }
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
            html: `<p>Hi ${safeName}, your HireStepX <strong>${tier}</strong> plan is now active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</p><p><a href="${APP_URL}/dashboard">Start Practicing</a></p><p style="margin-top:16px;font-size:11px;color:#6B6560;"><a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;">Manage subscription</a> · <a href="${APP_URL}/dashboard?tab=settings" style="color:#9A9590;">Unsubscribe</a></p>`,
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
    clearTimeout(globalTimeout);
  }
}

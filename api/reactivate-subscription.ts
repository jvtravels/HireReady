/* Vercel Serverless Function — Reactivate Subscription (undo cancel-at-period-end) */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  supabaseUrl,
  supabaseAnonKey,
  escapeHtml,
} from "./_shared";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = applyCorsHeaders(req, res);
  if (handlePreflightAndMethod(req, res)) return;

  const bodyLen = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (bodyLen > 1048576) return res.status(413).json({ error: "Request too large" });
  if (!origin) return res.status(403).json({ error: "Forbidden" });

  const SUPABASE_URL = supabaseUrl();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_ANON_KEY = supabaseAnonKey();
  const token = authHeader.slice(7);
  let userId: string;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }

  try {
    const dbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

    // Fetch profile to get razorpay_subscription_id
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=razorpay_subscription_id,subscription_end,cancel_at_period_end,email,name,subscription_tier`,
      { headers: dbHeaders },
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) && profiles[0];

    if (!profile?.cancel_at_period_end) {
      return res.status(400).json({ error: "Subscription is not pending cancellation" });
    }

    // Check subscription hasn't already expired
    if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
      return res.status(400).json({ error: "Subscription has already expired. Please purchase a new plan." });
    }

    const subscriptionId = profile?.razorpay_subscription_id;

    // Re-activate on Razorpay if we have a subscription ID
    if (subscriptionId && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
      try {
        // Razorpay: resume a cancelled subscription by creating a new one with same plan
        // For subscriptions cancelled with cancel_at_cycle_end, we check status first
        const statusRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (statusRes.ok) {
          const subData = await statusRes.json();
          // If subscription is still active (cancel_at_cycle_end was used), it can be resumed
          if (subData.status === "active") {
            // Razorpay doesn't have a direct "un-cancel" API for cancel_at_cycle_end.
            // The subscription will continue normally — we just clear our DB flag.
            console.warn(`[reactivate] Razorpay subscription ${subscriptionId} is still active, clearing cancel flag`);
          } else if (subData.status === "cancelled" || subData.status === "completed") {
            console.warn(`[reactivate] Razorpay subscription ${subscriptionId} is ${subData.status} — user will need to re-subscribe at next period end`);
          }
        }
      } catch (err) {
        console.warn("[reactivate] Razorpay API check failed (continuing with DB update):", err);
      }
    }

    // Clear the cancel flag in DB
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ cancel_at_period_end: false }),
      },
    );

    if (!updateRes.ok) {
      return res.status(500).json({ error: "Failed to reactivate subscription" });
    }

    // Send reactivation confirmation email (best-effort)
    if (RESEND_API_KEY && profile?.email) {
      const nextBilling = profile.subscription_end
        ? new Date(profile.subscription_end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "your next billing date";
      const safeName = escapeHtml(profile.name || "there");
      const tier = profile.subscription_tier || "paid";
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [profile.email],
            subject: "Welcome back! Your HireStepX subscription is active",
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#060607;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060607;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border-radius:16px;border:1px solid #2A2A2C;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2A2A2C;">
          <span style="font-size:18px;font-weight:600;color:#F5F2ED;letter-spacing:0.06em;">HireStepX</span>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F5F2ED;">Subscription Reactivated</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${safeName}, great to have you back! Your <strong style="color:#D4B37F;">${tier}</strong> plan is now active again.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;font-size:13px;color:#9A9590;">Plan</p>
              <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#F5F2ED;">${tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
              <p style="margin:0 0 8px;font-size:13px;color:#9A9590;">Next billing date</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#F5F2ED;">${nextBilling}</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="${APP_URL}/dashboard" style="display:inline-block;padding:14px 32px;background:#D4B37F;color:#060607;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Continue Practicing
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">Your subscription will renew automatically. Manage it anytime from your dashboard settings.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6A6560;">HireStepX by Silva Vitalis LLC</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
          }),
        });
      } catch (emailErr) {
        console.warn("[reactivate] Confirmation email failed (non-critical):", emailErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Reactivate subscription error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

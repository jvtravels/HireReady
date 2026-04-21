/* Vercel Serverless Function — Cancel Subscription */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceHeaders,
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
  res.setHeader("X-Request-ID", crypto.randomUUID());

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  // Verify user auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  const SUPABASE_ANON_KEY = supabaseAnonKey();
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
    // Fetch profile to get subscription ID, email, name, and end date
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=razorpay_subscription_id,email,name,subscription_end,subscription_tier`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) && profiles[0];
    const subscriptionId = profile?.razorpay_subscription_id;

    // Cancel Razorpay subscription at cycle end (if active)
    if (subscriptionId && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
      try {
        await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
          method: "POST",
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ cancel_at_cycle_end: true }),
        });
      } catch (err) {
        console.warn("[cancel] Razorpay API cancel failed (continuing with DB update):", err);
      }
    }

    // Mark subscription to cancel at period end (user keeps benefits until expiry)
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
          cancel_at_period_end: true,
        }),
      },
    );

    if (!updateRes.ok) {
      return res.status(500).json({ error: "Failed to cancel subscription" });
    }

    // Send cancellation confirmation email (best-effort)
    if (RESEND_API_KEY && profile?.email) {
      const endDate = profile.subscription_end
        ? new Date(profile.subscription_end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "the end of your billing period";
      const safeName = escapeHtml(profile.name || "there");
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [profile.email],
            subject: "Subscription cancellation confirmed",
            html: `<p>Hi ${safeName}, your HireStepX <strong>${profile.subscription_tier || "paid"}</strong> plan has been cancelled. You'll continue to have access until <strong>${endDate}</strong>.</p><p>Changed your mind? You can reactivate anytime from <a href="${APP_URL}/dashboard/settings">Settings</a>.</p><p style="color:#9A9590;font-size:12px;">— The HireStepX Team</p>`,
          }),
        });
      } catch (emailErr) {
        console.warn("[cancel] Confirmation email failed (non-critical):", emailErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

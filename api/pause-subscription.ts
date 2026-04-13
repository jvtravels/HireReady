/* Vercel Serverless Function — Pause / Resume Subscription */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  supabaseUrl,
  supabaseAnonKey,
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

  const { action } = req.body || {};
  if (action !== "pause" && action !== "resume") {
    return res.status(400).json({ error: "Invalid action. Use 'pause' or 'resume'." });
  }

  try {
    const dbHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=razorpay_subscription_id,subscription_tier,subscription_end,email,name`,
      { headers: dbHeaders },
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) && profiles[0];

    if (!profile || profile.subscription_tier === "free") {
      return res.status(400).json({ error: "No active subscription to pause" });
    }

    if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
      return res.status(400).json({ error: "Subscription has expired" });
    }

    const subscriptionId = profile.razorpay_subscription_id;

    // Call Razorpay to pause/resume if we have a subscription
    if (subscriptionId && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
      const endpoint = action === "pause"
        ? `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/pause`
        : `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/resume`;

      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 10_000);
        const rzpRes = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify(action === "pause" ? { pause_initiated_by: "customer" } : {}),
          signal: ac.signal,
        });
        clearTimeout(timer);

        if (!rzpRes.ok) {
          const errText = await rzpRes.text().catch(() => "");
          console.error(`[pause-subscription] Razorpay ${action} failed:`, rzpRes.status, errText);
          return res.status(502).json({ error: `Failed to ${action} subscription with payment provider` });
        }
      } catch (err) {
        console.error(`[pause-subscription] Razorpay ${action} error:`, err);
        return res.status(502).json({ error: `Payment provider ${action} request failed` });
      }
    }

    // Update DB flag
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ subscription_paused: action === "pause" }),
      },
    );

    if (!updateRes.ok) {
      return res.status(500).json({ error: `Failed to ${action} subscription` });
    }

    // Send pause/resume confirmation email (best-effort)
    if (RESEND_API_KEY && profile?.email) {
      const safeName = (profile.name || "there").replace(/[&<>"]/g, "");
      const subject = action === "pause"
        ? "Subscription paused"
        : "Subscription resumed";
      const body = action === "pause"
        ? `<p>Hi ${safeName}, your HireStepX <strong>${profile.subscription_tier}</strong> plan has been paused. Auto-renewal is on hold until you resume.</p><p>Ready to continue? <a href="${APP_URL}/dashboard/settings">Resume your plan</a> anytime.</p>`
        : `<p>Hi ${safeName}, your HireStepX <strong>${profile.subscription_tier}</strong> plan has been resumed. Auto-renewal is active again.</p><p><a href="${APP_URL}/dashboard">Continue Practicing</a></p>`;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [profile.email], subject, html: body + `<p style="color:#9A9590;font-size:12px;">— The HireStepX Team</p>` }),
        });
      } catch (emailErr) {
        console.warn(`[pause-subscription] ${action} email failed (non-critical):`, emailErr);
      }
    }

    return res.status(200).json({ success: true, action });
  } catch (err) {
    console.error("Pause subscription error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

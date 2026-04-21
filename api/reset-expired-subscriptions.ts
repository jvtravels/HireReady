/* Vercel Cron Function — Downgrade expired subscriptions */
/* Runs daily at midnight UTC. Finds subscriptions that have expired and sets tier to 'free'. */
/* This ensures server-side enforcement even if users don't log in (frontend check is client-side only). */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { escapeHtml } from "./_shared";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  try {
    const now = new Date().toISOString();

    // Find all non-free profiles where subscription_end is in the past
    const expiredRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?subscription_tier=neq.free&subscription_end=lt.${now}&select=id,name,email,subscription_tier,subscription_end`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!expiredRes.ok) {
      return res.status(500).json({ error: "Failed to query expired subscriptions" });
    }

    const expired = await expiredRes.json();
    if (!Array.isArray(expired) || expired.length === 0) {
      return res.status(200).json({ downgraded: 0, message: "No expired subscriptions" });
    }

    let downgraded = 0;
    let failed = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    for (const profile of expired) {
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ subscription_tier: "free" }),
        },
      );

      if (updateRes.ok) {
        downgraded++;
        console.warn(`[cron] Downgraded ${profile.id.slice(0, 8)}... from ${profile.subscription_tier} (expired ${profile.subscription_end})`);

        // Send expiration notification email (non-blocking per user)
        if (RESEND_API_KEY && profile.email) {
          const renewUrl = `${APP_URL}/dashboard?tab=settings`;
          const safeName = escapeHtml(profile.name || "there");
          const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border-radius:16px;border:1px solid #2A2A2C;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2A2A2C;">
          <span style="font-size:18px;font-weight:600;color:#F0EDE8;letter-spacing:0.06em;">HireStepX</span>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#F0EDE8;">Subscription Expired</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${safeName}, your <strong style="color:#C9A96E;">${escapeHtml(profile.subscription_tier)}</strong> subscription has ended and your account has been moved to the free tier.
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#9A9590;line-height:1.6;">
            With the free plan you still get:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#9A9590;line-height:1.8;">
            <li>3 AI mock interviews</li>
            <li>Behavioral questions only</li>
          </ul>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Your session history and all saved data are fully preserved — nothing has been deleted.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${renewUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#C9A96E,#B8923E);color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Renew Subscription
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;">
          <p style="margin:0;font-size:11px;color:#6B6560;line-height:1.5;">
            Upgrade anytime to unlock unlimited sessions, all question types, and AI coaching.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
                to: [profile.email],
                subject: "Your HireStepX subscription has expired",
                html: emailHtml,
              }),
            });
            clearTimeout(emailTimer);

            if (emailRes.ok) {
              emailsSent++;
            } else {
              emailsFailed++;
              console.error(`[cron] Expiration email failed for ${profile.id.slice(0, 8)}...`);
            }
          } catch (emailErr) {
            emailsFailed++;
            console.error(`[cron] Expiration email error for ${profile.id.slice(0, 8)}...:`, emailErr);
          }
        }
      } else {
        failed++;
        console.error(`[cron] Failed to downgrade ${profile.id.slice(0, 8)}...`);
      }
    }

    return res.status(200).json({ downgraded, failed, emailsSent, emailsFailed, total: expired.length });
  } catch (err) {
    console.error("Reset expired subscriptions error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

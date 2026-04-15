/* Vercel Cron Function — Send subscription renewal reminder emails */
/* Runs daily at 9 AM UTC. Sends reminders to users whose subscription expires within 3 days. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { escapeHtml } from "./_shared.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Protect cron endpoint — fail closed: require CRON_SECRET to be set
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  try {
    // Find users whose subscription expires in 1-3 days
    const now = new Date();
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?subscription_tier=neq.free&subscription_end=gte.${now.toISOString()}&subscription_end=lte.${threeDaysLater.toISOString()}&select=id,name,email,subscription_tier,subscription_end&limit=200`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!profilesRes.ok) {
      return res.status(500).json({ error: "Failed to query profiles" });
    }

    const profiles = await profilesRes.json();
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return res.status(200).json({ sent: 0, message: "No expiring subscriptions" });
    }

    let sent = 0;
    let failed = 0;
    for (const profile of profiles) {
      if (!profile.email) continue;

      const endDate = new Date(profile.subscription_end);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
      const tier = profile.subscription_tier;
      const plan = tier === "pro" ? "monthly" : "weekly";
      const renewUrl = `${APP_URL}/dashboard?plan=${plan}`;

      const emailBody = JSON.stringify({
        from: FROM_EMAIL,
        to: [profile.email],
        subject: `Your HireStepX ${tier} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        html: `
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
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#F0EDE8;">Your subscription expires soon</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${escapeHtml(profile.name || "there")}, your <strong style="color:#C9A96E;">${tier}</strong> plan expires in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong> (${endDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}).
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Renew now to keep your unlimited sessions, AI coaching, and performance analytics.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${renewUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#C9A96E,#B8923E);color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Renew Now
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;">
          <p style="margin:0;font-size:11px;color:#6B6560;line-height:1.5;">
            If you don't renew, your account will revert to the free plan. You won't lose any data.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      const sendEmail = async (): Promise<boolean> => {
        const emailAc = new AbortController();
        const emailTimer = setTimeout(() => emailAc.abort(), 10_000);
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: emailAc.signal,
          body: emailBody,
        });
        clearTimeout(emailTimer);
        return emailRes.ok;
      };

      try {
        let ok = await sendEmail();
        // Single retry after 1s on failure
        if (!ok) {
          await new Promise((r) => setTimeout(r, 1000));
          ok = await sendEmail();
        }
        if (ok) {
          sent++;
        } else {
          failed++;
          console.error(`Resend API error for ${profile.email} after retry`);
        }
      } catch (err) {
        failed++;
        console.error(`Failed to send reminder to ${profile.email}:`, err);
      }
    }

    return res.status(200).json({ sent, failed, total: profiles.length });
  } catch (err) {
    console.error("Renewal reminder error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* Vercel Cron Function — Re-engage inactive users */
/* Runs daily at 10 AM UTC (3:30 PM IST). Sends tiered re-engagement emails:
 *   Day 1 after last session: "Your personalized session is waiting"
 *   Day 3: "Your skills are fading — here's what to practice"
 *   Day 7: "Last chance" with a discount/urgency nudge
 * Only targets free-tier users who have at least 1 session but haven't returned. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { escapeHtml } from "./_shared";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  subscription_tier: string;
  practice_timestamps: string[] | null;
  target_role: string | null;
  re_engage_sent: string | null; // ISO date of last re-engagement email
}

interface SessionRow {
  score: number;
  skill_scores: Record<string, number> | null;
  created_at: string;
}

type EmailTier = "day1" | "day3" | "day7" | "paid14" | "paid30";

function getEmailTier(daysSinceLastSession: number, lastEmailSent: string | null, isPaid = false): EmailTier | null {
  const lastSentDays = lastEmailSent
    ? Math.floor((Date.now() - new Date(lastEmailSent).getTime()) / 86400000)
    : Infinity;

  if (isPaid) {
    // Paid users get at most one email every 10 days
    if (lastSentDays < 10) return null;
    if (daysSinceLastSession >= 30 && daysSinceLastSession < 42) return "paid30";
    if (daysSinceLastSession >= 14 && daysSinceLastSession < 30) return "paid14";
    return null;
  }

  // Free: at most one email every 2 days
  if (lastSentDays < 2) return null;
  if (daysSinceLastSession >= 7 && daysSinceLastSession < 14) return "day7";
  if (daysSinceLastSession >= 3 && daysSinceLastSession < 7) return "day3";
  if (daysSinceLastSession >= 1 && daysSinceLastSession < 3) return "day1";
  return null;
}

function getWeakestSkill(skillScores: Record<string, number> | null): string | null {
  if (!skillScores) return null;
  const entries = Object.entries(skillScores);
  if (entries.length === 0) return null;
  return entries.sort(([, a], [, b]) => a - b)[0][0];
}

function buildEmail(
  user: UserRow,
  tier: EmailTier,
  lastSession: SessionRow | null,
): { subject: string; html: string } {
  const name = escapeHtml(user.name?.split(" ")[0] || "there");
  const role = escapeHtml(user.target_role || "your target role");
  const weakest = lastSession ? getWeakestSkill(lastSession.skill_scores) : null;
  const score = lastSession?.score ?? null;
  const dashUrl = `${APP_URL}/dashboard`;
  const sessionUrl = `${APP_URL}/session/new`;

  const subjects: Record<EmailTier, string> = {
    day1: `${user.name?.split(" ")[0] || "Hey"}, your next practice session is ready`,
    day3: `Your ${weakest || "interview"} skills need a refresh`,
    day7: `Don't lose your progress — practice before your interview`,
    paid14: `${user.name?.split(" ")[0] || "Hey"}, 2 weeks since your last session — make today count`,
    paid30: `Your subscription is still active — let's get the most out of it`,
  };

  const heroText: Record<EmailTier, string> = {
    day1: `Your personalized ${role} session is ready. Pick up right where you left off.`,
    day3: weakest
      ? `Your <strong style="color:#C9A96E;">${escapeHtml(weakest)}</strong> score needs work. A focused 10-minute session can improve it by 15+ points.`
      : `Most users see 15+ point improvement with just one more session. Don't let your momentum fade.`,
    day7: score
      ? `You scored <strong style="color:#C9A96E;">${score}/100</strong> in your last session. That's a solid start — but skills fade without practice. One more session keeps you sharp.`
      : `Interview skills fade fast without practice. A quick 10-minute session keeps your edge sharp.`,
    paid14: `You're paying for unlimited practice — and haven't used it in 14 days. A 10-minute session today rebuilds the muscle memory that got you this far.`,
    paid30: `It's been a month since your last session. Your ${role} skills are still in there — let's brush them off with a focused 15-minute drill.`,
  };

  const ctaText: Record<EmailTier, string> = {
    day1: "Continue Practicing",
    day3: weakest ? `Practice ${weakest}` : "Start a Session",
    day7: "Practice Now — It's Free",
    paid14: "Start a Quick Session",
    paid30: "Start a Focused Drill",
  };

  const ctaUrl = tier === "day1" || tier === "paid14" || tier === "paid30" ? sessionUrl : dashUrl;

  const footerText: Record<EmailTier, string> = {
    day1: "You have free sessions remaining. No card needed.",
    day3: "10 minutes is all it takes. Your resume-personalized questions are waiting.",
    day7: "This is your last reminder. We'll stop emailing — but your practice sessions will always be here when you're ready.",
    paid14: "You're on the Pro plan. Unlimited sessions, every day.",
    paid30: "Pause or cancel anytime from Settings → Plan. We want you practicing only when it's useful.",
  };

  const html = `<!DOCTYPE html>
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
          <p style="margin:0 0 20px;font-size:15px;color:#F0EDE8;line-height:1.6;">
            Hi ${name},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.7;">
            ${heroText[tier]}
          </p>
          ${score && tier !== "day7" ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;background:#0A0A0B;border-radius:10px;border:1px solid #2A2A2C;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:12px;color:#6B6560;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Last Score</td>
                    <td align="right" style="font-size:22px;font-weight:700;color:#C9A96E;">${score}/100</td>
                  </tr>
                  ${weakest ? `<tr>
                    <td style="font-size:12px;color:#6B6560;padding-top:8px;">Focus area</td>
                    <td align="right" style="font-size:13px;color:#9A9590;padding-top:8px;">${escapeHtml(weakest)}</td>
                  </tr>` : ""}
                </table>
              </td>
            </tr>
          </table>` : ""}
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#C9A96E,#B8923E);color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                ${ctaText[tier]}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;">
          <p style="margin:0;font-size:11px;color:#6B6560;line-height:1.5;">
            ${footerText[tier]}
          </p>
          <p style="margin:8px 0 0;font-size:10px;color:#4A4540;">
            <a href="${APP_URL}/settings" style="color:#4A4540;text-decoration:underline;">Unsubscribe from practice reminders</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: subjects[tier], html };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  try {
    // Find free-tier users with at least 1 practice session
    // who haven't been emailed in the last 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

    // Target free AND paid users who haven't practiced recently. Paid users
    // get different copy (see buildEmail) since they need value-justification,
    // not upgrade prompts.
    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?or=(subscription_tier.eq.free,subscription_tier.eq.starter,subscription_tier.eq.pro)&select=id,name,email,subscription_tier,practice_timestamps,target_role,re_engage_sent&limit=500`,
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

    const profiles: UserRow[] = await profilesRes.json();
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return res.status(200).json({ sent: 0, message: "No users to re-engage" });
    }

    // Filter to users who have practiced but not recently.
    // Free tier: 1-14 day window. Paid tier: longer window (paid users have
    // higher tolerance; nag too early and they churn).
    const candidates = profiles.filter(p => {
      if (!p.email || !p.practice_timestamps || p.practice_timestamps.length === 0) return false;
      const lastPractice = new Date(p.practice_timestamps[p.practice_timestamps.length - 1]);
      const daysSince = Math.floor((Date.now() - lastPractice.getTime()) / 86400000);
      const isPaid = p.subscription_tier === "starter" || p.subscription_tier === "pro";
      if (isPaid) {
        // Paid: gently re-engage after 2 weeks idle, stop after 6 weeks
        return daysSince >= 14 && daysSince < 42;
      }
      return daysSince >= 1 && daysSince < 14;
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of candidates) {
      const lastPractice = new Date(user.practice_timestamps![user.practice_timestamps!.length - 1]);
      const daysSince = Math.floor((Date.now() - lastPractice.getTime()) / 86400000);

      const isPaid = user.subscription_tier === "starter" || user.subscription_tier === "pro";
      const tier = getEmailTier(daysSince, user.re_engage_sent, isPaid);
      if (!tier) { skipped++; continue; }

      // Fetch their last session for score data
      let lastSession: SessionRow | null = null;
      try {
        const sessRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=1&select=score,skill_scores,created_at`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        );
        if (sessRes.ok) {
          const sessions = await sessRes.json();
          if (Array.isArray(sessions) && sessions.length > 0) {
            lastSession = sessions[0];
          }
        }
      } catch { /* best effort */ }

      const { subject, html } = buildEmail(user, tier, lastSession);

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [user.email],
            subject,
            html,
          }),
        });

        if (emailRes.ok) {
          sent++;
          // Update re_engage_sent timestamp to prevent duplicate emails
          await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ re_engage_sent: new Date().toISOString() }),
            },
          ).catch(() => {}); // best effort — email was already sent
        } else {
          failed++;
          console.error(`Re-engage email failed for ${user.email}:`, emailRes.status);
        }
      } catch (err) {
        failed++;
        console.error(`Re-engage email error for ${user.email}:`, err);
      }
    }

    return res.status(200).json({
      sent,
      skipped,
      failed,
      candidates: candidates.length,
      total: profiles.length,
    });
  } catch (err) {
    console.error("Re-engage users error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

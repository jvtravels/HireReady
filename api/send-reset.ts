/* Vercel Serverless Function — Send Password Reset Email via Resend API */
/* Uses Supabase admin generate_link to create a recovery token, then sends via Resend */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin || "";
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 256) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: max 3 reset emails per IP per hour
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const ip = (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
      const rlKey = `rl:reset:${ip}`;
      const rlRes = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", rlKey], ["EXPIRE", rlKey, 3600]]),
      });
      if (rlRes.ok) {
        const results = await rlRes.json();
        const count = results[0]?.result || 0;
        if (count > 3) {
          return res.status(429).json({ error: "Too many reset requests. Try again later." });
        }
      }
    } catch { /* rate limit check failed, allow through */ }
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing required config: RESEND_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Password reset is not configured" });
  }

  try {
    // Generate a Supabase recovery link via admin API
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "recovery",
        email: normalizedEmail,
        options: { redirectTo: `${APP_URL}/reset-password` },
      }),
    });

    if (!linkRes.ok) {
      const errText = await linkRes.text().catch(() => "");
      console.error("generate_link failed:", linkRes.status, errText);
      // Don't reveal whether user exists — always return success
      return res.status(200).json({ ok: true });
    }

    const linkData = await linkRes.json();
    const actionLink = linkData.action_link || linkData.properties?.action_link;

    if (!actionLink || typeof actionLink !== "string") {
      console.error("No action_link in generate_link response:", JSON.stringify(linkData).slice(0, 300));
      // Still return success to not reveal user existence
      return res.status(200).json({ ok: true });
    }

    // Rewrite the redirect_to in the action link to point to our reset-password page
    const linkUrl = new URL(actionLink);
    linkUrl.searchParams.set("redirect_to", `${APP_URL}/reset-password`);
    const resetUrl = linkUrl.toString();
    const safeEmail = escapeHtml(normalizedEmail);

    // Send reset email via Resend
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [normalizedEmail],
        subject: "Reset your password — HireStepX",
        html: `<!DOCTYPE html>
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Reset Your Password</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            We received a request to reset the password for <strong style="color:#F0EDE8;">${safeEmail}</strong>. Click the button below to choose a new password.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#C9A96E;color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Reset Password
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;color:#9A9590;line-height:1.5;">
            This link expires in 24 hours. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <p style="margin:0;font-size:11px;color:#4A4540;line-height:1.5;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="${resetUrl}" style="color:#C9A96E;word-break:break-all;font-size:10px;">${resetUrl}</a>
          </p>
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
    clearTimeout(timer);

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend API error for reset:", emailRes.status, errBody);
    }

    // Always return success to not reveal whether the email exists
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Password reset email error:", err);
    return res.status(200).json({ ok: true });
  }
}

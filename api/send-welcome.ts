/* Vercel Serverless Function — Send Verification + Welcome Email via Resend API */
/* Bypasses Supabase's built-in SMTP (which doesn't work with Resend) */
/* Uses HMAC token for email verification link */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  isRateLimited,
  getVercelClientIp,
  escapeHtml,
} from "./_shared";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_SECRET = process.env.EMAIL_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

/** Generate HMAC verification token from email */
export function generateVerifyToken(email: string): string {
  return createHmac("sha256", EMAIL_SECRET).update(email.toLowerCase().trim()).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(req, res);
  if (handlePreflightAndMethod(req, res)) return;

  // Rate limit: 5 emails per IP per minute
  const ip = getVercelClientIp(req);
  if (isRateLimited(ip, 5, 60_000)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { email, name, userId } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured, skipping verification email");
    return res.status(200).json({ ok: true, skipped: true });
  }

  // Clear email_confirmed_at so user must verify (Supabase auto-sets it when Confirm email is OFF)
  if (userId && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL) {
    try {
      const clearRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_confirm: false }),
      });
      if (!clearRes.ok) {
        console.error("Failed to clear email_confirmed_at:", clearRes.status, await clearRes.text());
      }
    } catch (err) {
      console.error("Failed to clear email_confirmed_at:", err);
    }
  }

  // Generate verification link
  const token = generateVerifyToken(email);
  const verifyUrl = `${APP_URL}/api/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
  const safeName = escapeHtml(name || "there");

  // Step 3: Send verification email via Resend
  try {
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
        to: [email],
        subject: "Verify your email — HireStepX",
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Welcome, ${safeName}!</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Click the button below to verify your email and activate your account. You have <strong style="color:#C9A96E;">3 free mock interviews</strong> waiting.
          </p>

          <!-- Verify Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#C9A96E;color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Verify Email Address
              </a>
            </td></tr>
          </table>

          <!-- What's next -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#C9A96E;">After verifying, here's how to get started:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">1.</td>
                  <td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Upload your resume for personalized questions</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">2.</td>
                  <td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Pick your target company and role</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#9A9590;">3.</td>
                  <td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Start your first mock interview</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">
            If you didn't create this account, you can safely ignore this email.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#4A4540;line-height:1.5;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="${verifyUrl}" style="color:#C9A96E;word-break:break-all;font-size:10px;">${verifyUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6A6560;">
            HireStepX by Silva Vitalis LLC
          </p>
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
      console.error("Resend API error:", emailRes.status, errBody);
      return res.status(200).json({ ok: true, emailSent: false, reason: "Resend API error" });
    }

    return res.status(200).json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("Verification email error:", err);
    return res.status(200).json({ ok: true, emailSent: false, reason: "Email send failed" });
  }
}

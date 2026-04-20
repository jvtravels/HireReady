/* Vercel Serverless Function — Send Verification + Welcome + Password Reset Email via Resend API */
/* Self-contained: no _shared import to avoid module resolution issues */
/* Supports two actions: "verify" (default) and "reset" */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_SECRET = process.env.EMAIL_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Generate a time-limited verification token. Tokens expire after 24 hours. */
export function generateVerifyToken(email: string, expiresAt?: number): string {
  // Round to 24-hour windows so the same email gets the same token within a window
  const expiry = expiresAt ?? Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return createHmac("sha256", EMAIL_SECRET).update(`${email.toLowerCase().trim()}:${expiry}`).digest("hex") + "." + expiry;
}

// ─── Rate limiting helper ───────────────────────────────────────────────────
async function checkRateLimit(req: VercelRequest, prefix: string, max: number): Promise<boolean> {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  try {
    const ip = (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
    const rlKey = `rl:${prefix}:${ip}`;
    const rlRes = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", rlKey], ["EXPIRE", rlKey, 3600]]),
    });
    if (rlRes.ok) {
      const results = await rlRes.json();
      const count = results[0]?.result || 0;
      if (count > max) return true; // rate limited
    }
  } catch { /* rate limit check failed, allow through */ }
  return false;
}

// ─── Password Reset Email Handler ───────────────────────────────────────────
async function handleReset(req: VercelRequest, res: VercelResponse, normalizedEmail: string) {
  // Rate limit: max 3 reset emails per IP per hour
  if (await checkRateLimit(req, "reset", 3)) {
    return res.status(429).json({ error: "Too many reset requests. Try again later." });
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing required config for password reset");
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
      return res.status(200).json({ ok: true });
    }

    // Rewrite the redirect_to in the action link
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
            This link expires in 1 hour and can only be used once. If you didn't request a password reset, you can safely ignore this email.
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

// ─── Verification / Welcome Email Handler ───────────────────────────────────
async function handleVerify(req: VercelRequest, res: VercelResponse, email: string, name?: string, userId?: string) {
  // Rate limit: max 3 welcome emails per IP per hour
  if (await checkRateLimit(req, "email", 3)) {
    return res.status(429).json({ error: "Too many email requests. Try again later." });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured, skipping verification email");
    return res.status(200).json({ ok: true, skipped: true });
  }

  // Clear email_confirmed_at so user must verify (Supabase auto-sets it when "Confirm email" is OFF)
  if (userId && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL) {
    try {
      // Method 1: Admin API with email_confirm: false
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
        console.error("Failed to clear email_confirmed_at via admin API:", clearRes.status);
      }

      // Method 2: Also store our own verification flag in user_metadata
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_metadata: { custom_email_verified: false } }),
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to clear email verification:", err);
    }
  }

  // Generate verification link
  const token = generateVerifyToken(email);
  const verifyUrl = `${APP_URL}/api/verify-email?email=${encodeURIComponent(email)}&token=${token}`;
  const safeName = escapeHtml(name || "there");

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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Welcome, ${safeName}!</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Click the button below to verify your email and activate your account. You have <strong style="color:#C9A96E;">3 free mock interviews</strong> waiting.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#C9A96E;color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Verify Email Address
              </a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#C9A96E;">After verifying, here's how to get started:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">1.</td><td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Upload your resume for personalized questions</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">2.</td><td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Pick your target company and role</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#9A9590;">3.</td><td style="padding:6px 0 6px 8px;font-size:13px;color:#F0EDE8;">Start your first mock interview</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">If you didn't create this account, you can safely ignore this email.</p>
          <p style="margin:8px 0 0;font-size:11px;color:#4A4540;line-height:1.5;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="${verifyUrl}" style="color:#C9A96E;word-break:break-all;font-size:10px;">${verifyUrl}</a>
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
      console.error("Resend API error:", emailRes.status, errBody);
      return res.status(200).json({ ok: true, emailSent: false, reason: "Resend API error" });
    }

    return res.status(200).json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("Verification email error:", err);
    return res.status(200).json({ ok: true, emailSent: false, reason: "Email send failed" });
  }
}

// ─── Main Handler (routes to verify or reset) ──────────────────────────────
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

  const { email, name, userId, action } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 256) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Route to the appropriate handler
  if (action === "reset") {
    return handleReset(req, res, normalizedEmail);
  }
  return handleVerify(req, res, normalizedEmail, name, userId);
}

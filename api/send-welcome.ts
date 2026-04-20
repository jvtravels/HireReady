/* Vercel Serverless Function — Send Verification + Welcome + Password Reset Email via Resend API */
/* Self-contained: no _shared import to avoid module resolution issues */
/* Supports actions: "verify" (default), "reset", "password-changed", "verify-reminder" */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomBytes } from "crypto";
import { resolve } from "dns/promises";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL_SECRET = process.env.EMAIL_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Generate a unique, non-deterministic verification token with nonce. */
export function generateVerifyToken(email: string, expiresAt?: number): string {
  const expiry = expiresAt ?? Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  // Add a random nonce to make each token unique (prevents replay within same window)
  const nonce = randomBytes(8).toString("hex");
  const payload = `${email.toLowerCase().trim()}:${expiry}:${nonce}`;
  const hmac = createHmac("sha256", EMAIL_SECRET).update(payload).digest("hex");
  return `${hmac}.${expiry}.${nonce}`;
}

// ─── MX Record Validation (email deliverability pre-check) ──────────────────
async function validateMxRecord(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1];
    if (!domain) return false;
    const records = await resolve(domain, "MX");
    return Array.isArray(records) && records.length > 0;
  } catch {
    // DNS lookup failed — domain likely doesn't accept email
    return false;
  }
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

// ─── Password Changed Notification Email ─────────────────────────────────────
async function handlePasswordChanged(req: VercelRequest, res: VercelResponse, normalizedEmail: string) {
  if (!RESEND_API_KEY) return res.status(200).json({ ok: true });

  const safeEmail = escapeHtml(normalizedEmail);
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [normalizedEmail],
        subject: "Your password was changed — HireStepX",
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Password Changed</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            The password for <strong style="color:#F0EDE8;">${safeEmail}</strong> was successfully changed on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}.
          </p>
          <div style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#C4705A;font-weight:600;">⚠️ Didn't make this change?</p>
            <p style="margin:8px 0 0;font-size:13px;color:#9A9590;line-height:1.5;">
              If you didn't reset your password, someone may have access to your account. Please <a href="${APP_URL}/login" style="color:#C9A96E;text-decoration:underline;">log in immediately</a> and change your password, or contact <a href="mailto:support@hirestepx.com" style="color:#C9A96E;text-decoration:underline;">support@hirestepx.com</a>.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">If you made this change, no action is needed.</p>
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
  } catch { /* notification is best-effort */ }

  return res.status(200).json({ ok: true });
}

// ─── Verification Reminder Email ─────────────────────────────────────────────
async function handleVerifyReminder(req: VercelRequest, res: VercelResponse, normalizedEmail: string, name?: string) {
  if (!RESEND_API_KEY) return res.status(200).json({ ok: true });

  // Rate limit: max 2 reminders per IP per day
  if (await checkRateLimit(req, "reminder", 2)) {
    return res.status(429).json({ error: "Too many reminder requests." });
  }

  const token = generateVerifyToken(normalizedEmail);
  const verifyUrl = `${APP_URL}/api/verify-email?email=${encodeURIComponent(normalizedEmail)}&token=${token}`;
  const safeName = escapeHtml(name || "there");

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [normalizedEmail],
        subject: "Reminder: Verify your email — HireStepX",
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Hey ${safeName}, you're almost there!</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            You created your HireStepX account but haven't verified your email yet. Verify now to start your <strong style="color:#C9A96E;">3 free mock interviews</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#C9A96E;color:#0A0A0B;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Verify Email Address
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
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
  } catch { /* reminder is best-effort */ }

  return res.status(200).json({ ok: true });
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

    // Rewrite the redirect_to in the action link and add an HMAC signature for link integrity
    const linkUrl = new URL(actionLink);
    linkUrl.searchParams.set("redirect_to", `${APP_URL}/reset-password`);
    // Sign the reset link with HMAC to detect tampering/interception
    const linkSignature = createHmac("sha256", EMAIL_SECRET)
      .update(`${normalizedEmail}:${linkUrl.searchParams.get("token") || ""}:reset`)
      .digest("hex")
      .slice(0, 16);
    linkUrl.searchParams.set("sig", linkSignature);
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

// ─── Auth Rate Limiting (merged from auth-check.ts to stay within Vercel Hobby limit) ─
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_MAX_SIGNUP = 5;
const AUTH_LOCKOUT_SECONDS = 300;
const AUTH_SIGNUP_WINDOW = 3600;

async function getRedisValue(key: string): Promise<number> {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    return parseInt(d.result || "0", 10);
  } catch { return 0; }
}

async function incrRedisKey(key: string, ttl: number): Promise<number> {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const r = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttl]]),
    });
    if (!r.ok) return 0;
    const results = await r.json();
    return results[0]?.result || 0;
  } catch { return 0; }
}

async function delRedisKey(key: string): Promise<void> {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch { /* best effort */ }
}

async function handleAuthCheck(req: VercelRequest, res: VercelResponse, action: string, email?: string) {
  const ip = (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
  const normalizedEmail = (email || "").toLowerCase().trim();
  const ipKey = `rl:login:ip:${ip}`;
  const emailKey = normalizedEmail ? `rl:login:email:${normalizedEmail}` : "";

  if (action === "check") {
    const ipAttempts = await getRedisValue(ipKey);
    const emailAttempts = emailKey ? await getRedisValue(emailKey) : 0;
    if (ipAttempts >= AUTH_MAX_ATTEMPTS || emailAttempts >= AUTH_MAX_ATTEMPTS) {
      return res.status(429).json({ locked: true, message: "Too many failed login attempts. Please try again in 5 minutes.", remainingSeconds: AUTH_LOCKOUT_SECONDS });
    }
    const signupKey = `rl:signup:ip:${ip}`;
    const signupAttempts = await getRedisValue(signupKey);
    if (signupAttempts >= AUTH_MAX_SIGNUP) {
      return res.status(429).json({ locked: true, message: "Too many signup attempts. Please try again later.", remainingSeconds: AUTH_SIGNUP_WINDOW });
    }
    return res.status(200).json({ locked: false, attempts: Math.max(ipAttempts, emailAttempts) });
  }

  if (action === "signup") {
    const signupKey = `rl:signup:ip:${ip}`;
    const count = await incrRedisKey(signupKey, AUTH_SIGNUP_WINDOW);
    if (count > AUTH_MAX_SIGNUP) {
      return res.status(429).json({ locked: true, message: "Too many signup attempts. Please try again later." });
    }
    return res.status(200).json({ ok: true });
  }

  if (action === "fail") {
    const ipCount = await incrRedisKey(ipKey, AUTH_LOCKOUT_SECONDS);
    const emailCount = emailKey ? await incrRedisKey(emailKey, AUTH_LOCKOUT_SECONDS) : 0;
    const maxCount = Math.max(ipCount, emailCount);
    if (maxCount >= AUTH_MAX_ATTEMPTS) {
      return res.status(429).json({ locked: true, message: "Too many failed login attempts. Please try again in 5 minutes.", remainingSeconds: AUTH_LOCKOUT_SECONDS });
    }
    return res.status(200).json({ locked: false, attempts: maxCount, remaining: AUTH_MAX_ATTEMPTS - maxCount });
  }

  if (action === "success") {
    await delRedisKey(ipKey);
    if (emailKey) await delRedisKey(emailKey);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Invalid auth-check action" });
}

// ─── Origin validation ──────────────────────────────────────────────────────
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (hostname === "hirestepx.com" || hostname.endsWith(".hirestepx.com")) return true;
    if (hostname.endsWith(".vercel.app")) return true;
  } catch { /* invalid URL */ }
  return false;
}

// ─── Main Handler (routes to verify, reset, password-changed, verify-reminder) ─
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

  // Block requests from unknown origins (prevents external abuse)
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { email, name, userId, action, honeypot } = req.body || {};

  // Honeypot check: if the hidden field is filled, it's a bot
  if (honeypot) {
    // Pretend success to not alert the bot
    return res.status(200).json({ ok: true });
  }

  // Auth rate limiting actions (don't require email validation)
  if (["check", "fail", "success", "signup"].includes(action)) {
    return handleAuthCheck(req, res, action, email);
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 256) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // MX record validation — check domain can receive email (skip for password-changed notifications)
  if (action !== "password-changed") {
    const hasMx = await validateMxRecord(normalizedEmail);
    if (!hasMx) {
      return res.status(400).json({ error: "This email domain does not appear to accept mail. Please use a valid email address." });
    }
  }

  // Route to the appropriate handler
  if (action === "reset") {
    return handleReset(req, res, normalizedEmail);
  }
  if (action === "password-changed") {
    return handlePasswordChanged(req, res, normalizedEmail);
  }
  if (action === "verify-reminder") {
    return handleVerifyReminder(req, res, normalizedEmail, name);
  }
  return handleVerify(req, res, normalizedEmail, name, userId);
}

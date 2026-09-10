/* Vercel Serverless Function — Send Verification + Welcome + Password Reset Email via Resend API */
/* Self-contained: no _shared import to avoid module resolution issues */
/* Supports actions: "verify" (default), "reset", "password-changed", "verify-reminder" */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomBytes } from "crypto";
import { resolve } from "dns/promises";
import { isDisposableEmailServer } from "./_disposable-emails";
import {
  emailShell,
  title,
  para,
  b,
  link,
  button,
  dataCard,
  orderedList,
} from "./_email-theme";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <noreply@hirestepx.com>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/* Verification-token signing secret.
   Falls back to SUPABASE_SERVICE_ROLE_KEY in non-production environments
   so local dev / preview deploys keep working without extra config, but
   in production this MUST be set to a dedicated secret. Reusing the
   service-role key as the HMAC key means a service-role-key leak would
   also let an attacker forge verification tokens for any account, which
   is a much wider blast radius than the leak alone.

   Every call site that issues a token via generateVerifyToken() checks
   assertEmailSecret() first and returns a clean 500 instead of sending
   an email whose verify link is guaranteed to fail — see handleVerify
   and handleVerifyReminder below.

   The "fallback-secret" string is intentionally kept as a last-resort
   default so a misconfigured local dev doesn't crash with a cryptic
   error — but it's never reached in any deployed environment. */
const EMAIL_SECRET = (() => {
  const dedicated = (process.env.EMAIL_VERIFICATION_SECRET || "").trim();
  if (dedicated) return dedicated;
  if (process.env.VERCEL_ENV === "production") {
    // Loud error; the assertion below will turn this into a 500 at
    // request time so the misconfig is impossible to ignore.
    console.error(
      "[CRITICAL] EMAIL_VERIFICATION_SECRET is unset in production. " +
      "Verification tokens will be rejected until this is configured.",
    );
    return ""; // empty → assertEmailSecret() rejects all signing/verifying
  }
  // Dev / preview only: fall back to service role key so the local
  // signup flow keeps working without extra setup.
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret").trim();
})();

/* assertEmailSecret returns true if the HMAC signing key is sufficiently
   strong to issue tokens. Call this before generateVerifyToken() at any
   new call site — without it, a missing EMAIL_VERIFICATION_SECRET in
   production still emails a "successful" signup with a verify link that
   is silently guaranteed to fail at /api/verify-email. */
export function assertEmailSecret(): boolean {
  return EMAIL_SECRET.length >= 16;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Fire-and-forget: log Resend email usage. Self-contained — no _shared import. */
function logResendUsage(action: string, status: "success" | "error", latencyMs?: number, errorMessage?: string): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  fetch(`${SUPABASE_URL}/rest/v1/service_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      service: "resend_email",
      endpoint: action,
      status,
      latency_ms: latencyMs || null,
      error_message: errorMessage?.slice(0, 500) || null,
    }),
  }).catch(() => {});
}

// NOTE: a tracked sendResendEmail() wrapper previously lived here. All
// callers below still use raw fetch; remove the unused wrapper rather than
// leaving dead code. If we want tracked sends everywhere, rewire the
// call sites explicitly in a future PR.

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
const KNOWN_GOOD_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "protonmail.com", "mail.com", "aol.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "proton.me", "pm.me", "hey.com",
]);

async function validateMxRecord(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    // Skip DNS lookup for well-known providers
    if (KNOWN_GOOD_DOMAINS.has(domain)) return true;
    const records = await resolve(domain, "MX");
    return Array.isArray(records) && records.length > 0;
  } catch {
    // Fail OPEN: if DNS lookup fails (e.g., restricted serverless env), allow the email through
    return true;
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
  const whenStr = `${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
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
        subject: "Your password was changed",
        html: emailShell({
          preview: "If this was you, no action needed.",
          body:
            title("Password", { accentWord: "updated." }) +
            para(`Your HireStepX password was just changed. If that was you, you're done, nothing else to do.`) +
            dataCard("Change details", [
              ["When", whenStr],
              ["Account", safeEmail],
            ]) +
            para(
              `Didn't change it? ${link("Secure your account", `${APP_URL}/login`)} right away, then contact ${link("support@hirestepx.com", "mailto:support@hirestepx.com")}. We'll lock things down.`,
              { small: true, muted: true },
            ),
        }),
      }),
    });
    clearTimeout(timer);
    logResendUsage("password-changed", "success");
  } catch (err) {
    logResendUsage("password-changed", "error", undefined, err instanceof Error ? err.message : "Unknown");
  }

  return res.status(200).json({ ok: true });
}

// ─── New Device Login Notification ───────────────────────────────────────────
async function handleNewDeviceLogin(req: VercelRequest, res: VercelResponse, normalizedEmail: string) {
  if (!RESEND_API_KEY) return res.status(200).json({ ok: true });
  // Rate limit: max 5 notifications per IP per hour (prevent abuse)
  if (await checkRateLimit(req, "new-device", 5)) {
    return res.status(200).json({ ok: true });
  }
  const safeEmail = escapeHtml(normalizedEmail);
  const ua = typeof req.body?.userAgent === "string" ? escapeHtml(req.body.userAgent.slice(0, 200)) : "Unknown browser";
  const when = new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
        subject: "New device sign-in",
        html: emailShell({
          preview: "A new device signed in to your account.",
          body:
            title("A new", { accentWord: "sign-in." }) +
            para(`Your account ${b(safeEmail)} was just signed in on a new device at ${when}. HireStepX allows one active device at a time, so any other session was signed out.`) +
            dataCard(
              "Sign-in details",
              [
                ["When", when],
                ["Device", ua],
              ],
              { tone: "warning" },
            ) +
            para(
              `If this was you, you can ignore this email. If not, ${link("reset your password", `${APP_URL}/login`)} immediately and contact ${link("support@hirestepx.com", "mailto:support@hirestepx.com")}. Someone else may have your credentials.`,
              { small: true, muted: true },
            ),
        }),
      }),
    });
    clearTimeout(timer);
    logResendUsage("new-device-login", "success");
  } catch (err) {
    logResendUsage("new-device-login", "error", undefined, err instanceof Error ? err.message : "Unknown");
  }
  return res.status(200).json({ ok: true });
}

// ─── Verification Reminder Email ─────────────────────────────────────────────
async function handleVerifyReminder(req: VercelRequest, res: VercelResponse, normalizedEmail: string, name?: string) {
  if (!RESEND_API_KEY) return res.status(200).json({ ok: true });

  // Rate limit: max 2 reminders per IP per day
  if (await checkRateLimit(req, "reminder", 2)) {
    return res.status(429).json({ error: "Too many reminder requests." });
  }

  if (!assertEmailSecret()) {
    return res.status(500).json({ error: "Email verification is not configured" });
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
        subject: "Still need to verify your email",
        html: emailShell({
          preview: "Your free sessions are waiting behind one click.",
          body:
            title("One step", { accentWord: "left." }) +
            para(`Hi ${safeName}, you signed up but haven't confirmed your email yet. Your ${b("2 free mock interviews")} are ready the moment you do.`) +
            button("Verify and start", verifyUrl) +
            para(
              `A fresh link, valid for ${b("24 hours")}. If you've already verified, you're all set, just ignore this.`,
              { small: true, muted: true },
            ),
        }),
      }),
    });
    clearTimeout(timer);
    logResendUsage("verify-reminder", "success");
  } catch (err) {
    logResendUsage("verify-reminder", "error", undefined, err instanceof Error ? err.message : "Unknown");
  }

  return res.status(200).json({ ok: true });
}

/* ─── No-Account-Found courtesy email ─────────────────────────────────────
   Sent when /forgot-password is invoked with an email that has no
   matching HireStepX account. Lets the legit user (typo, wrong
   address, deleted account) understand why no reset email arrived,
   without leaking enumeration via the client UI. Fire-and-forget;
   never throws to the caller. Rate-limited by the same per-IP and
   per-email guards that gate the real reset path. */
async function sendNoAccountFoundEmail(email: string): Promise<void> {
  if (!RESEND_API_KEY) return; // best-effort
  try {
    const safeEmail = escapeHtml(email);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "We couldn't find your account",
        html: emailShell({
          preview: "No account exists for this address. Here's what to do.",
          body:
            title("No account", { accentWord: "yet." }) +
            para(`Someone just asked us to reset a HireStepX password for ${b(safeEmail)}, but we don't have an account on file for this address.`) +
            para(`If that was you, you may have signed up with a different email, or you haven't created an account yet.`, { muted: true }) +
            button("Create an account", `${APP_URL}/signup`) +
            para(
              `Have an account under a different address? ${link("Try the reset there", `${APP_URL}/forgot-password`)}. If you didn't request anything, you can safely ignore this email, nothing has changed.`,
              { small: true, muted: true },
            ),
        }),
      }),
    });
    clearTimeout(t);
  } catch (err) {
    console.warn(
      "[reset] no-account email send failed:",
      err instanceof Error ? err.message : "Unknown",
    );
  }
}

// ─── Password Reset Email Handler ───────────────────────────────────────────
async function handleReset(req: VercelRequest, res: VercelResponse, normalizedEmail: string) {
  // Email-format validation. The user reported password-reset emails
  // being sent for "completely invalid/garbage" addresses — Supabase's
  // generate_link doesn't validate format, it just looks up the user
  // record. We validate here BEFORE the admin API call so:
  //   • garbage like "asdfgh" returns a generic 200 (enumeration defense)
  //     without spending a Supabase admin call
  //   • the existing "user not found" path stays untouched for real
  //     well-formed but unregistered addresses
  // Stricter than RFC 5322 — matches the client-side validator in
  // src/auth/_validation.ts so client + server agree on what's valid.
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
  if (!EMAIL_RE.test(normalizedEmail) || /\.\./.test(normalizedEmail)) {
    // Generic 200 (enumeration defense) — client UI shows the same
    // "Check your email" confirmation regardless. Loud server log so
    // ops can still spot patterns of invalid-email probing.
    console.log(`[reset] no-op for invalid email format: ${normalizedEmail.slice(0, 50)}`);
    return res.status(200).json({ ok: true });
  }
  // Rate limit: max 3 reset emails per IP per hour
  if (await checkRateLimit(req, "reset", 3)) {
    return res.status(429).json({ error: "Too many reset requests. Try again later." });
  }

  // Audit P0 #8: per-email rate limit. With the link-reuse cache the
  // legit user only ever generates ONE link per 50 minutes, so 5/24h
  // is plenty for legit retries (typo email → resend → final). An
  // attacker on a botnet (different IPs) bypasses the per-IP limit
  // and can otherwise spam-DoS a single victim's inbox until our
  // domain reputation drops.
  const emailResetKey = `rl:reset:email:${normalizedEmail}`;
  const emailResetCount = await incrRedisKey(emailResetKey, 24 * 60 * 60);
  // Lowered from 5 to 3 — paired with the courtesy "no account found"
  // email below, the prior 5/day let an attacker pump 5 unsolicited
  // emails/day at any inbox by typing the victim's address into our
  // reset form. 3/day still covers the legit typo→correct→final loop.
  if (emailResetCount > 3) {
    // Generic 200 (enumeration defense) — the user's UI shows the
    // same "check your email" confirmation regardless. Loud server
    // log so ops can spot abuse.
    console.warn(`[reset] per-email rate limit hit for ${normalizedEmail.slice(0, 50)} (count=${emailResetCount})`);
    return res.status(200).json({ ok: true });
  }

  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing required config for password reset");
    return res.status(500).json({ error: "Password reset is not configured" });
  }

  try {
    // Check if user exists before sending reset email
    const userListRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(normalizedEmail)}&page=1&per_page=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (userListRes.ok) {
      const userListData = await userListRes.json();
      const users = userListData.users || userListData || [];
      const found = Array.isArray(users) && users.some((u: { email?: string }) => u.email?.toLowerCase() === normalizedEmail);
      if (!found) {
        /* Email enumeration defense — the client UI must look identical
           whether the email exists or not, so attackers probing
           /forgot-password can't tell which addresses are registered.
           BUT a silent no-op leaves a legit user (typo'd email, wrong
           account) sitting forever on "Check your email" with no
           explanation.
           Option C from the audit: silent in UI, but send a "we
           couldn't find an account" email to the typed address. The
           legit user immediately understands what happened; the
           attacker only learns about emails sent to their own probe
           address (no information leak). Same per-IP + per-email
           rate limits (3/h IP, 5/24h email) bound abuse cost. */
        console.log(`[reset] unknown email — sending "no account found" courtesy email: ${normalizedEmail.slice(0, 3)}***`);
        await sendNoAccountFoundEmail(normalizedEmail);
        return res.status(200).json({ ok: true });
      }
    }

    /* Always generate a fresh recovery link.
       Previous behaviour cached the link for 50 minutes and served the
       SAME link on subsequent "send reset" clicks. The intent was to
       avoid token rotation during legitimate retries (idempotent
       resend). In practice it broke the more common case:
         1. User receives link L1, clicks it → token T1 consumed,
            recovery session created. Reset succeeds OR fails.
         2. User asks for a new link (legitimately — first one
            failed, or they want to change again).
         3. Server hit the 50-min cache → returned L1 (with already-
            consumed T1). User clicks L1 → "expired" because T1 is
            gone.
         4. User has to wait 50 minutes for the cache to expire
            before any new link they request actually works.
       Fix: drop the cache. Each user-initiated send rotates the
       Supabase recovery token (T1 → T2) and emails the latest. The
       per-IP (3/h) and per-email (5/24h) rate limits already prevent
       a runaway resend loop, and "only the latest link works" matches
       what users expect from every other reset flow they've used. */
    let resetUrl: string | null = null;

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

    // Rewrite the redirect_to in the action link so user lands on our reset page
    const linkUrl = new URL(actionLink);
    linkUrl.searchParams.set("redirect_to", `${APP_URL}/reset-password`);
    resetUrl = linkUrl.toString();
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
        subject: "Reset link, as requested",
        html: emailShell({
          preview: "Valid for 60 minutes. Didn't ask? Nothing changes.",
          body:
            title("Reset your", { accentWord: "password." }) +
            para(`You asked to reset the HireStepX password for ${b(safeEmail)}. Pick a new one, this is the only link you'll need.`) +
            button("Choose a new password", resetUrl) +
            para(
              `The link works for ${b("60 minutes")}, then expires, and can only be used once. If you didn't request this, ignore it, your password stays exactly as it is.`,
              { small: true, muted: true },
            ) +
            para(`Button not working? Copy this link:<br>${link(resetUrl, resetUrl)}`, {
              small: true,
              muted: true,
            }),
        }),
      }),
    });
    clearTimeout(timer);

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend API error for reset:", emailRes.status, errBody);
      logResendUsage("reset", "error", undefined, `HTTP ${emailRes.status}`);
    } else {
      logResendUsage("reset", "success");
    }

    // Always return success to not reveal whether the email exists
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Password reset email error:", err);
    logResendUsage("reset", "error", undefined, err instanceof Error ? err.message : "Unknown");
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
    // CRITICAL: signup will appear successful (200 + skipped:true) but no
    // verification email goes out → user is permanently stuck unverified.
    // Loud log + 500 in production so monitoring catches it; 200 in
    // dev/preview so local signup flow doesn't error out.
    const isProd = process.env.VERCEL_ENV === "production";
    const msg =
      "[CRITICAL] RESEND_API_KEY missing — verification email NOT sent. " +
      `Signup completed for ${email} but they cannot verify.`;
    console.error(msg);
    if (isProd) {
      // Surface to whatever monitoring is listening on console.error in
      // production (Vercel Log Drains / Sentry server SDK if wired).
      return res
        .status(500)
        .json({ ok: false, error: "Email service unavailable" });
    }
    return res.status(200).json({ ok: true, skipped: true });
  }

  if (!assertEmailSecret()) {
    // Don't flip the user to unverified below if we can't issue a token
    // that will ever pass verification — that would strand them worse
    // than leaving them as Supabase's default-confirmed state.
    return res.status(500).json({ error: "Email verification is not configured" });
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
        subject: "Verify your email to get started",
        html: emailShell({
          preview: "One click to confirm it's you and unlock your free sessions.",
          body:
            title("Welcome,", { accentWord: `${safeName}.` }) +
            para(`Glad you're here. One quick step before you start: confirm this is your email. Your ${b("2 free mock interviews")} are waiting on the other side.`) +
            button("Verify my email", verifyUrl) +
            para(`Once you're verified, here's how to get going:`) +
            orderedList([
              "Upload your resume so the questions match your real experience.",
              "Pick your target company and role.",
              "Start your first mock interview, about 15 minutes.",
            ]) +
            para(
              `This link expires in ${b("24 hours")}. If you didn't create this account, you can safely ignore this email.`,
              { small: true, muted: true },
            ) +
            para(`Button not working? Copy this link:<br>${link(verifyUrl, verifyUrl)}`, {
              small: true,
              muted: true,
            }),
        }),
      }),
    });
    clearTimeout(timer);

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend API error:", emailRes.status, errBody);
      logResendUsage("verify", "error", undefined, `HTTP ${emailRes.status}`);
      return res.status(502).json({ ok: false, emailSent: false, reason: "Resend API error" });
    }

    logResendUsage("verify", "success");
    return res.status(200).json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("Verification email error:", err);
    logResendUsage("verify", "error", undefined, err instanceof Error ? err.message : "Unknown");
    return res.status(502).json({ ok: false, emailSent: false, reason: "Email send failed" });
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
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return inMemFallbackGetNum(key);
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    return parseInt(d.result || "0", 10);
  } catch { return inMemFallbackGetNum(key); }
}

/* getRedisString / setRedisString were used to cache the recovery link
   for 50 minutes between resends (so multiple "send reset" clicks
   reused the same Supabase token). That cache caused stale-link bugs
   — we now always generate a fresh link per request. The helpers
   remain available below as inMemFallbackGetStr / inMemFallbackSetStr
   in case a future feature needs Redis-backed strings. */

/* ─── In-memory fallback for when Upstash isn't configured ───
   Keeps server-side login lockout + reset-link cache working in dev
   and as a defense-in-depth if Redis is briefly unavailable. Per-
   Vercel-instance only — cold starts reset state. Strong production
   defense still requires Redis (set UPSTASH_REDIS_REST_URL +
   UPSTASH_REDIS_REST_TOKEN), but this stops the "no Redis = no
   lockout at all" bypass that the user reported (#5: incognito
   resets attempt count). */
const _inMemStore = new Map<string, { value: string; expiresAt: number }>();
function inMemFallbackGetStr(key: string): string | null {
  const entry = _inMemStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _inMemStore.delete(key); return null; }
  return entry.value;
}
function inMemFallbackGetNum(key: string): number {
  const v = inMemFallbackGetStr(key);
  return v ? parseInt(v, 10) || 0 : 0;
}
function inMemFallbackSetStr(key: string, value: string, ttlSec: number): void {
  _inMemStore.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}
function inMemFallbackIncr(key: string, ttlSec: number): number {
  const cur = inMemFallbackGetNum(key);
  const next = cur + 1;
  inMemFallbackSetStr(key, String(next), ttlSec);
  return next;
}

async function incrRedisKey(key: string, ttl: number): Promise<number> {
  const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return inMemFallbackIncr(key, ttl);
  try {
    const r = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttl]]),
    });
    if (!r.ok) return inMemFallbackIncr(key, ttl);
    const results = await r.json();
    return results[0]?.result || 0;
  } catch { return inMemFallbackIncr(key, ttl); }
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

async function handleAuthCheck(req: VercelRequest, res: VercelResponse, action: string, email?: string, intent?: string) {
  const ip = (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
  const normalizedEmail = (email || "").toLowerCase().trim();
  const ipKey = `rl:login:ip:${ip}`;
  const emailKey = normalizedEmail ? `rl:login:email:${normalizedEmail}` : "";

  /* IP-based threshold is much higher than the email-based one.
     User-reported failure: a new user's SECOND wrong-password attempt
     locked them out. Root cause: AUTH_MAX_ATTEMPTS=5 was applied to
     BOTH counters with the same threshold, but the IP counter
     accumulates across all users sharing the same x-forwarded-for —
     which on Indian mobile carriers + corporate NAT + dev/preview
     deploys can mean dozens of legit users behind one IP. So a fresh
     user's first or second attempt trips a lockout someone else
     racked up.
     Fix: keep email threshold at 5 (the real password-spray defense),
     but raise IP threshold to 30 — still catches genuine IP-targeted
     bursts (a single attacker hammering many emails from one IP) while
     not punishing shared-NAT users. */
  const IP_MAX_ATTEMPTS = 30;
  if (action === "check") {
    const ipAttempts = await getRedisValue(ipKey);
    const emailAttempts = emailKey ? await getRedisValue(emailKey) : 0;
    if (ipAttempts >= IP_MAX_ATTEMPTS || emailAttempts >= AUTH_MAX_ATTEMPTS) {
      return res.status(429).json({ locked: true, message: "Too many failed login attempts. Please try again in 5 minutes.", remainingSeconds: AUTH_LOCKOUT_SECONDS });
    }
    // Only the SIGNUP pre-flight consults the signup counter. The login
    // pre-check ("check" with no signup intent) must NOT be gated by it —
    // otherwise 5+ signups from a shared IP (mobile NAT / corporate / dev
    // preview) would return a 429 that blocks LOGIN for everyone behind
    // that IP. Signup's real enforcement still lives in the "signup"
    // action's incrRedisKey cap below; this is just its early bail.
    if (intent === "signup") {
      const signupKey = `rl:signup:ip:${ip}`;
      const signupAttempts = await getRedisValue(signupKey);
      if (signupAttempts >= AUTH_MAX_SIGNUP) {
        return res.status(429).json({ locked: true, message: "Too many signup attempts. Please try again later.", remainingSeconds: AUTH_SIGNUP_WINDOW });
      }
    }
    return res.status(200).json({ locked: false, attempts: Math.max(ipAttempts, emailAttempts) });
  }

  if (action === "signup") {
    // Two rate-limit dimensions, both must pass:
    //
    //   • Per-IP cap: AUTH_MAX_SIGNUP signups / AUTH_SIGNUP_WINDOW.
    //     Catches spray-and-pray bot signups from a single IP.
    //   • Per-email cap: 3 signup attempts on the same address per
    //     24h. Without this an attacker on a clean IP could pound a
    //     single email with 5 attempts; combined with the 60 s
    //     verification cooldown elsewhere, 3/day is plenty for legit
    //     users (typo → resend → finally land) but cuts off targeted
    //     abuse.
    const signupKey = `rl:signup:ip:${ip}`;
    const ipCount = await incrRedisKey(signupKey, AUTH_SIGNUP_WINDOW);
    if (ipCount > AUTH_MAX_SIGNUP) {
      return res.status(429).json({ locked: true, message: "Too many signup attempts. Please try again later." });
    }
    if (normalizedEmail) {
      const emailSignupKey = `rl:signup:email:${normalizedEmail}`;
      const emailCount = await incrRedisKey(emailSignupKey, 24 * 60 * 60);
      if (emailCount > 2) {
        // 2/24h per email: covers legit typo→correct flow while blocking
        // bots hammering a single address. Generic copy — no information leak.
        return res.status(429).json({ locked: true, message: "Too many attempts for this email. Please try again later." });
      }
    }
    return res.status(200).json({ ok: true });
  }

  // Turnstile branch removed — bot prevention now lives in:
  //   • email-link verification (mandatory before account activation)
  //   • per-IP + per-email rate limits (auth-fail block above)
  //   • honeypot field on the signup form
  //   • disposable-email blocklist (add when needed)
  // Ad blockers were rejecting Turnstile for ~5% of legitimate users,
  // and the JS challenge produced no spam-prevention value we couldn't
  // already get from email verification + rate limits.

  if (action === "fail") {
    const ipCount = await incrRedisKey(ipKey, AUTH_LOCKOUT_SECONDS);
    const emailCount = emailKey ? await incrRedisKey(emailKey, AUTH_LOCKOUT_SECONDS) : 0;
    /* Same shared-NAT reasoning as the "check" branch above. The
       email counter is the canonical "this user is being attacked"
       signal — lock at 5. The IP counter only fires at 30 to handle
       single-attacker-many-emails bursts without punishing legit
       users on shared mobile / corporate IPs. */
    if (emailCount >= AUTH_MAX_ATTEMPTS || ipCount >= IP_MAX_ATTEMPTS) {
      return res.status(429).json({ locked: true, message: "Too many failed login attempts. Please try again in 5 minutes.", remainingSeconds: AUTH_LOCKOUT_SECONDS });
    }
    // Surface the EMAIL-keyed remaining count to the client (not max
    // of IP and email) — that's what the user can directly affect.
    return res.status(200).json({ locked: false, attempts: emailCount, remaining: AUTH_MAX_ATTEMPTS - emailCount });
  }

  if (action === "success") {
    await delRedisKey(ipKey);
    if (emailKey) await delRedisKey(emailKey);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Invalid auth-check action" });
}

// ─── Google OAuth Token Exchange (direct OAuth flow) ────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

async function handleGoogleTokenExchange(req: VercelRequest, res: VercelResponse) {
  const { code, redirectUri } = req.body || {};

  if (!code || !redirectUri) {
    return res.status(400).json({ error: "Missing authorization code or redirect URI" });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error("Google OAuth not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return res.status(500).json({ error: "Google sign-in is not configured" });
  }

  try {
    // Exchange authorization code for tokens at Google's token endpoint
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Google token exchange failed:", tokenRes.status, errBody);
      return res.status(400).json({ error: "Failed to exchange authorization code" });
    }

    const tokenData = await tokenRes.json();

    return res.status(200).json({
      id_token: tokenData.id_token,
      access_token: tokenData.access_token,
    });
  } catch (err) {
    console.error("Google token exchange error:", err);
    return res.status(500).json({ error: "Token exchange failed" });
  }
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

  const { email, name, userId, action, honeypot, intent } = req.body || {};

  // Honeypot check: if the hidden field is filled, it's a bot
  if (honeypot) {
    // Pretend success to not alert the bot
    return res.status(200).json({ ok: true });
  }

  // Require a valid Origin for all email-sending actions — blocks external curl/scripts.
  // Rate-limit tracking actions and "reset" (no active session) remain open.
  const EMAIL_SEND_ACTIONS = ["verify", "password-changed", "verify-reminder", "new_device_login", "signup-attempted-existing"];
  if (EMAIL_SEND_ACTIONS.includes(action) && (!origin || !isAllowedOrigin(origin))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Auth rate limiting + Turnstile verification actions (don't require
  // email validation — Turnstile verifies a captcha token, not the email).
  if (["check", "fail", "success", "signup"].includes(action)) {
    // Server-side disposable-email reject for signup tracking too —
    // an attacker hitting this endpoint directly to bump the counter
    // for a throwaway address would otherwise sneak past.
    if (
      action === "signup" &&
      typeof email === "string" &&
      email &&
      isDisposableEmailServer(email.toLowerCase().trim())
    ) {
      return res.status(400).json({
        error:
          "Please use a permanent email address — temporary inboxes aren't supported.",
      });
    }
    return handleAuthCheck(req, res, action, email, intent);
  }

  // Google OAuth token exchange (doesn't require email)
  if (action === "google-token-exchange") {
    return handleGoogleTokenExchange(req, res);
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 256) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Server-side disposable-email enforcement. The same blocklist is
  // checked client-side at signup, but a curl past the form would
  // bypass it entirely without this server-side gate. Keep the early
  // reject above MX validation so we don't waste a DNS lookup on an
  // address we'd reject anyway.
  //
  // We reject for ALL email-bearing actions (verify, reminder, reset,
  // signup-attempted-existing, password-changed) — a disposable
  // address has no business receiving any of our transactional mail.
  // Generic copy avoids leaking the policy details to bots.
  if (isDisposableEmailServer(normalizedEmail)) {
    return res.status(400).json({
      error:
        "Please use a permanent email address — temporary inboxes aren't supported.",
    });
  }

  // MX record validation — check domain can receive email
  // Skip for: reset (don't reveal if email exists), password-changed (notification only), verify-reminder
  if (!["reset", "password-changed", "verify-reminder", "new_device_login", "signup-attempted-existing"].includes(action)) {
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
  if (action === "new_device_login") {
    return handleNewDeviceLogin(req, res, normalizedEmail);
  }
  if (action === "verify-reminder") {
    return handleVerifyReminder(req, res, normalizedEmail, name);
  }
  if (action === "signup-attempted-existing") {
    return handleSignupAttemptedExisting(req, res, normalizedEmail, name);
  }
  return handleVerify(req, res, normalizedEmail, name, userId);
}

/* ─── handleSignupAttemptedExisting ──────────────────────────────────────
   Triggered when a user runs the signup flow with an email that already
   has an account. We DON'T tell the client (email enumeration defense).
   Instead we send a "looks like you already have an account" email so
   the legit user gets a useful pointer back to login/reset. */
async function handleSignupAttemptedExisting(
  req: VercelRequest,
  res: VercelResponse,
  email: string,
  name: string,
) {
  if (await checkRateLimit(req, "signup-attempted-existing", 5)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Try again later." });
  }
  if (!RESEND_API_KEY) {
    // Don't leak failure to the client — return 200.
    return res.status(200).json({ ok: true, skipped: true });
  }
  const safeName = escapeHtml(name || "there");
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "You already have an account",
        html: emailShell({
          preview: "Sign in instead, or reset your password if you're stuck.",
          body:
            title("Welcome", { accentWord: "back." }) +
            para(`Hi ${safeName}, someone (probably you) just tried to sign up at HireStepX with this email, but you already have an account here. No need to create another, just sign in.`) +
            button("Sign in", `${APP_URL}/login`) +
            para(
              `Forgot your password? ${link("Reset it here", `${APP_URL}/forgot-password`)}. If this wasn't you, no account was created and nothing changed.`,
              { small: true, muted: true },
            ),
        }),
      }),
    });
    clearTimeout(t);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.warn(
      "[signup-attempted-existing] email send failed:",
      err instanceof Error ? err.message : "Unknown",
    );
    // Don't leak failure to client.
    return res.status(200).json({ ok: true });
  }
}

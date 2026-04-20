/* Vercel Serverless Function — Server-side Login Rate Limiting */
/* Uses Upstash Redis to track failed login attempts per IP + email combo */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

const MAX_ATTEMPTS = 5;
const MAX_SIGNUP_ATTEMPTS = 5; // signups per IP per hour
const LOCKOUT_SECONDS = 300; // 5 minutes
const SIGNUP_WINDOW_SECONDS = 3600; // 1 hour

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

async function getAttempts(key: string): Promise<number> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return parseInt(data.result || "0", 10);
  } catch { return 0; }
}

async function incrementAttempts(key: string): Promise<number> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return 0;
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, LOCKOUT_SECONDS]]),
    });
    if (!res.ok) return 0;
    const results = await res.json();
    return results[0]?.result || 0;
  } catch { return 0; }
}

async function clearAttempts(key: string): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch { /* best effort */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin || "";
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { action, email } = req.body || {};
  const ip = (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
  const normalizedEmail = (email || "").toLowerCase().trim();

  // Rate limit key combines IP + email to prevent both targeted and distributed attacks
  const ipKey = `rl:login:ip:${ip}`;
  const emailKey = normalizedEmail ? `rl:login:email:${normalizedEmail}` : "";

  if (action === "check") {
    // Pre-login check: is this IP or email currently locked out?
    const ipAttempts = await getAttempts(ipKey);
    const emailAttempts = emailKey ? await getAttempts(emailKey) : 0;

    if (ipAttempts >= MAX_ATTEMPTS || emailAttempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        locked: true,
        message: "Too many failed login attempts. Please try again in 5 minutes.",
        remainingSeconds: LOCKOUT_SECONDS,
      });
    }

    // Also check signup rate limit for the IP
    const signupKey = `rl:signup:ip:${ip}`;
    const signupAttempts = await getAttempts(signupKey);
    if (signupAttempts >= MAX_SIGNUP_ATTEMPTS) {
      return res.status(429).json({
        locked: true,
        message: "Too many signup attempts. Please try again later.",
        remainingSeconds: SIGNUP_WINDOW_SECONDS,
      });
    }

    return res.status(200).json({ locked: false, attempts: Math.max(ipAttempts, emailAttempts) });
  }

  if (action === "signup") {
    // Track signup attempt per IP (prevents mass account creation)
    const signupKey = `rl:signup:ip:${ip}`;
    if (!UPSTASH_URL || !UPSTASH_TOKEN) return res.status(200).json({ ok: true });
    try {
      const pRes = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", signupKey], ["EXPIRE", signupKey, SIGNUP_WINDOW_SECONDS]]),
      });
      if (pRes.ok) {
        const results = await pRes.json();
        const count = results[0]?.result || 0;
        if (count > MAX_SIGNUP_ATTEMPTS) {
          return res.status(429).json({ locked: true, message: "Too many signup attempts. Please try again later." });
        }
      }
    } catch { /* allow through on failure */ }
    return res.status(200).json({ ok: true });
  }

  if (action === "fail") {
    // Record a failed attempt
    const ipCount = await incrementAttempts(ipKey);
    const emailCount = emailKey ? await incrementAttempts(emailKey) : 0;
    const maxCount = Math.max(ipCount, emailCount);

    if (maxCount >= MAX_ATTEMPTS) {
      return res.status(429).json({
        locked: true,
        message: "Too many failed login attempts. Please try again in 5 minutes.",
        remainingSeconds: LOCKOUT_SECONDS,
      });
    }

    return res.status(200).json({
      locked: false,
      attempts: maxCount,
      remaining: MAX_ATTEMPTS - maxCount,
    });
  }

  if (action === "success") {
    // Clear attempts on successful login
    await clearAttempts(ipKey);
    if (emailKey) await clearAttempts(emailKey);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Invalid action. Use: check, fail, success" });
}

/* Vercel Cron — Payment Abandonment Recovery
 * Runs hourly. Finds payment intents created 1-24 hours ago where the user
 * never completed payment, sends a recovery email, then deletes the key.
 * Intent keys are created by create-order.ts and deleted by
 * verify-payment.ts on successful payment.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { escapeHtml } from "./_shared";

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

interface PaymentIntent {
  userId: string;
  email: string;
  plan: string;
  amount: number;
  planName: string;
  createdAt: number;
}

async function redisScan(cursor: string, pattern: string): Promise<[string, string[]] | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/SCAN/${cursor}/MATCH/${encodeURIComponent(pattern)}/COUNT/100`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result as [string, string[]];
  } catch { return null; }
}

async function redisGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${UPSTASH_URL}/GET/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result as string | null;
  } catch { return null; }
}

async function redisDel(key: string): Promise<void> {
  try {
    await fetch(`${UPSTASH_URL}/DEL/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch { /* best effort */ }
}

function buildEmail(intent: PaymentIntent): { subject: string; html: string } {
  const safePlan = escapeHtml(intent.planName);
  const amount = (intent.amount / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const pricingUrl = `${APP_URL}/pricing`;
  return {
    subject: `You're one step away from ${safePlan}`,
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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F0EDE8;">Forgot something?</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#9A9590;line-height:1.7;">
            You started checkout for <strong style="color:#F0EDE8;">${safePlan}</strong> (${amount}) but didn't finish. Come back when you're ready — your session is waiting.
          </p>
          <div style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;padding:18px 22px;margin-bottom:22px;">
            <p style="margin:0;font-size:12px;color:#6A6560;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Your plan</p>
            <p style="margin:6px 0 0;font-size:15px;color:#F0EDE8;">${safePlan} — ${amount}</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#D4B37F;border-radius:10px;">
              <a href="${pricingUrl}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:600;color:#060607;text-decoration:none;">
                Complete your purchase →
              </a>
            </td></tr>
          </table>
          <p style="margin:22px 0 0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">
            No pressure — you can also keep using the free tier. We won't email you again about this.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6A6560;">HireStepX by Silva Vitalis LLC · <a href="mailto:support@hirestepx.com" style="color:#9A9590;">support@hirestepx.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

async function sendEmail(intent: PaymentIntent): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const { subject, html } = buildEmail(intent);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [intent.email], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth: Vercel Cron or CRON_SECRET header
  const authHeader = req.headers.authorization || "";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const hasSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(503).json({ error: "Redis not configured" });
  }

  const now = Date.now();
  const MIN_AGE_MS = 60 * 60 * 1000;     // email after 1h
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // don't email if > 24h (stale)

  let sent = 0, skipped = 0, scanned = 0;
  let cursor = "0";

  try {
    // Use SCAN to iterate over all pay_intent:* keys safely
    for (let i = 0; i < 50; i++) { // cap iterations to protect runtime
      const result = await redisScan(cursor, "pay_intent:*");
      if (!result) break;
      cursor = result[0];
      const keys = result[1] || [];
      for (const key of keys) {
        scanned++;
        const raw = await redisGet(key);
        if (!raw) continue;
        let intent: PaymentIntent;
        try { intent = JSON.parse(raw); } catch { await redisDel(key); continue; }
        const age = now - (intent.createdAt || 0);
        if (age < MIN_AGE_MS) { skipped++; continue; } // too fresh
        if (age > MAX_AGE_MS) { await redisDel(key); skipped++; continue; } // stale — forget
        if (!intent.email) { await redisDel(key); continue; }
        const ok = await sendEmail(intent);
        if (ok) { sent++; await redisDel(key); }
      }
      if (cursor === "0") break; // SCAN finished
    }
    return res.status(200).json({ sent, skipped, scanned });
  } catch (err) {
    console.error("[send-abandonment-emails] Error:", err);
    return res.status(500).json({ error: "Internal error", sent, scanned });
  }
}

/* Vercel Edge Function — Audit Log Writer
 * Receives security/auth events from the client (logAuditEvent) and
 * persists them to the audit_log table for compliance & forensics.
 */

export const config = { runtime: "edge" };

import { corsHeaders, handleCorsPreflightOrMethod, getClientIp, isRateLimited, verifyAuth, slog } from "./_shared";

declare const process: { env: Record<string, string | undefined> };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Allowed event names — prevents clients from writing arbitrary strings
const ALLOWED_EVENTS = new Set([
  "login_success", "login_failed", "login_locked", "logout",
  "signup_started", "signup_completed", "email_verified",
  "single_device_enforcement", "single_device_kicked",
  "inactivity_timeout", "session_expired",
  "new_device_login", "password_changed",
  "account_deleted", "account_restored",
  "subscription_created", "subscription_cancelled",
  "suspicious_activity",
]);

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;
  const headers = corsHeaders(req);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Silently accept — audit is best-effort
    return new Response(JSON.stringify({ ok: true, configured: false }), { status: 200, headers });
  }

  // Payload size guard
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 8192) return new Response("Payload too large", { status: 413, headers });

  // Rate limit per IP to prevent flooding
  const ip = getClientIp(req);
  if (await isRateLimited(ip, "audit-log", 60, 60_000)) {
    return new Response(JSON.stringify({ ok: true, throttled: true }), { status: 200, headers });
  }

  // Auth is optional — some events (login_failed) fire before a session exists
  const auth = await verifyAuth(req);
  const userId = auth.authenticated ? auth.userId : null;

  let body: { event?: string; details?: Record<string, unknown> };
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400, headers }); }
  const event = body?.event;
  if (!event || typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_event" }), { status: 400, headers });
  }

  // Strip any fields that could contain sensitive data (passwords, tokens)
  const rawDetails = (body.details || {}) as Record<string, unknown>;
  const safeDetails: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawDetails)) {
    if (/password|token|secret|cookie/i.test(k)) continue;
    if (typeof v === "string" && v.length > 500) safeDetails[k] = v.slice(0, 500);
    else safeDetails[k] = v;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        event,
        details: safeDetails,
        ip_address: ip,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) || null,
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      // If table is missing, silently degrade
      if (msg.includes("audit_log") || res.status === 404) {
        return new Response(JSON.stringify({ ok: true, skipped: "table_missing" }), { status: 200, headers });
      }
      slog.warn("audit-log insert failed", { status: res.status, msg: msg.slice(0, 200) });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    slog.warn("audit-log exception", { err: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }
}

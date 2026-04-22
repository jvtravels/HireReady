/* Shared utilities for Vercel Edge Functions & Node.js API routes */

import type { VercelRequest, VercelResponse } from "@vercel/node";

declare const process: { env: Record<string, string | undefined> };

/* ─── Plan Limits (single source of truth for backend) ─── */
const FREE_SESSION_LIMIT = 3;
const STARTER_WEEKLY_LIMIT = 7;
const PRO_MONTHLY_LIMIT = 30;

/** Timeout for Supabase auth/profile verification requests (ms) */
const SUPABASE_TIMEOUT_MS = 5000;
/** TTL for atomic in-flight session counter (seconds) */
const INFLIGHT_TTL_SEC = 300;

/* ─── CORS ─── */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

/** Resolve allowed CORS origin from a raw origin string. Returns empty string if not allowed. */
export function getAllowedOriginFromString(origin: string): string {
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  if (isAllowedDomain(origin)) return origin;
  return "";
}

/** Resolve allowed CORS origin from a Request's Origin header. */
export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  return getAllowedOriginFromString(origin);
}

/** Build CORS response headers for an Edge Function request. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = getAllowedOrigin(req);
  if (!origin) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

/** Handle OPTIONS preflight and reject non-POST methods. Returns Response if handled, null if should continue. */
export function handleCorsPreflightOrMethod(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = getAllowedOrigin(req);
    return new Response(null, {
      status: 204,
      headers: origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Vary": "Origin",
          }
        : {},
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/* ─── Auth ─── */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

/** Verify the user's JWT token against Supabase Auth. Returns userId if valid. */
export async function verifyAuth(req: Request): Promise<{ authenticated: boolean; userId?: string }> {
  // Fail closed in production — only skip auth in local dev
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const isLocal = (req.headers.get("origin") || "").startsWith("http://localhost:");
    if (isLocal) return { authenticated: true };
    return { authenticated: false };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false };
  }

  const token = authHeader.slice(7);
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SUPABASE_TIMEOUT_MS);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { authenticated: false };
    const user = await res.json();
    if (!user.id || typeof user.id !== "string") return { authenticated: false };
    return { authenticated: true, userId: user.id };
  } catch {
    return { authenticated: false };
  }
}

/** Return a 401 Unauthorized JSON response. */
export function unauthorizedResponse(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized. Please log in." }), {
    status: 401,
    headers,
  });
}

/* ─── Atomic In-Flight Session Counter (prevents race condition) ─── */

const UPSTASH_URL_SHARED = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
const UPSTASH_TOKEN_SHARED = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

async function incrementInFlightCounter(userId: string, tier: string, ttlSec: number): Promise<number | null> {
  if (!UPSTASH_URL_SHARED || !UPSTASH_TOKEN_SHARED) return null;
  try {
    const key = `inflight:${tier}:${userId}`;
    const res = await fetch(`${UPSTASH_URL_SHARED}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN_SHARED}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, ttlSec]]),
    });
    if (res.ok) {
      const results = await res.json();
      return (results[0]?.result ?? 1) - 1; // subtract 1 because INCR includes current request
    }
    return null;
  } catch { return null; }
}

/* ─── Session Limit Check ─── */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Check if a user has exceeded their plan's session limit. Uses atomic in-flight counter to prevent race conditions. */
export async function checkSessionLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { allowed: true }; // skip in dev

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SUPABASE_TIMEOUT_MS);
    // Get user's subscription tier and expiry
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, signal: ac.signal },
    );
    if (!profileRes.ok) { clearTimeout(timer); console.error("Session limit check: profile fetch failed", profileRes.status); return { allowed: false, reason: "Could not verify session limit. Please try again." }; }
    const profiles = await profileRes.json();
    if (!Array.isArray(profiles) || profiles.length === 0) { clearTimeout(timer); return { allowed: false, reason: "Could not verify session limit. Please try again." }; }

    let tier = profiles[0].subscription_tier || "free";
    const subEnd = profiles[0].subscription_end;

    // Check expiry — treat expired paid tiers as free
    if (tier !== "free" && subEnd && new Date(subEnd) < new Date()) {
      tier = "free";
    }

    if (tier === "team") { clearTimeout(timer); return { allowed: true }; }

    if (tier === "pro") {
      // Pro: 30 sessions per month
      const now2 = new Date();
      const monthStart = new Date(Date.UTC(now2.getUTCFullYear(), now2.getUTCMonth(), 1));
      const monthISO = monthStart.toISOString();
      const sessionsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(monthISO)}&select=id`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "count=exact" }, signal: ac.signal },
      );
      clearTimeout(timer);
      if (!sessionsRes.ok) { console.error("Session limit check: sessions fetch failed", sessionsRes.status); return { allowed: false, reason: "Could not verify session limit. Please try again." }; }
      const range = sessionsRes.headers.get("content-range");
      const thisMonth = range ? parseInt(range.split("/")[1] || "0", 10) : ((await sessionsRes.json()) as unknown[]).length;
      if (thisMonth >= PRO_MONTHLY_LIMIT) {
        return { allowed: false, reason: `Pro plan limit reached (${PRO_MONTHLY_LIMIT}/month). Buy extra sessions or wait for next month.` };
      }
      return { allowed: true };
    }

    if (tier === "free") {
      // Count total sessions at DB level
      const sessionsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(userId)}&select=id`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "count=exact" }, signal: ac.signal },
      );
      clearTimeout(timer);
      if (!sessionsRes.ok) { console.error("Session limit check: sessions fetch failed", sessionsRes.status); return { allowed: false, reason: "Could not verify session limit. Please try again." }; }
      // Use content-range header for count (more efficient than parsing all rows)
      const range = sessionsRes.headers.get("content-range");
      const totalCount = range ? parseInt(range.split("/")[1] || "0", 10) : ((await sessionsRes.json()) as unknown[]).length;

      // Check if user has purchased session credits
      const creditRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=session_credits`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, signal: ac.signal },
      );
      const creditData = creditRes.ok ? await creditRes.json() : [];
      const credits = Array.isArray(creditData) && creditData.length > 0 ? (creditData[0].session_credits || 0) : 0;

      if (totalCount >= FREE_SESSION_LIMIT && credits <= 0) {
        return { allowed: false, reason: `Free plan limit reached (${FREE_SESSION_LIMIT} sessions). Buy a session for ₹10 or upgrade.` };
      }
      if (totalCount < FREE_SESSION_LIMIT) {
        // Atomic in-flight check: prevent race condition with concurrent sessions
        const inFlight = await incrementInFlightCounter(userId, "free", INFLIGHT_TTL_SEC);
        if (inFlight !== null && totalCount + inFlight > FREE_SESSION_LIMIT && credits <= 0) {
          return { allowed: false, reason: `Free plan limit reached (${FREE_SESSION_LIMIT} sessions). Buy a session for ₹10 or upgrade.` };
        }
      }
      // If using credits, decrement after session completes (handled in session save)
    } else if (tier === "starter") {
      // Count sessions this week at DB level (UTC-based)
      const now2 = new Date();
      const weekStart = new Date(now2.getTime() - now2.getUTCDay() * 86400000);
      weekStart.setUTCHours(0, 0, 0, 0);
      const weekISO = weekStart.toISOString();
      const sessionsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(weekISO)}&select=id`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "count=exact" }, signal: ac.signal },
      );
      clearTimeout(timer);
      if (!sessionsRes.ok) { console.error("Session limit check: sessions fetch failed", sessionsRes.status); return { allowed: false, reason: "Could not verify session limit. Please try again." }; }
      const range = sessionsRes.headers.get("content-range");
      const thisWeek = range ? parseInt(range.split("/")[1] || "0", 10) : ((await sessionsRes.json()) as unknown[]).length;
      if (thisWeek >= STARTER_WEEKLY_LIMIT) {
        return { allowed: false, reason: `Starter plan limit reached (${STARTER_WEEKLY_LIMIT}/week). Upgrade to Pro for more sessions.` };
      }
    } else {
      clearTimeout(timer);
    }

    return { allowed: true };
  } catch (err) {
    console.error("Session limit check error:", err);
    return { allowed: false, reason: "Could not verify session limit. Please try again." };
  }
}

/* ─── Subscription Tier Check ─── */

/** Get the user's current subscription tier, accounting for expiry. Returns "pro" in dev mode. */
export async function getSubscriptionTier(userId: string): Promise<"free" | "starter" | "pro" | "team"> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return "pro"; // dev mode — unrestricted
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SUPABASE_TIMEOUT_MS);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, signal: ac.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return "free";
    const profiles = await res.json();
    if (!Array.isArray(profiles) || profiles.length === 0) return "free";
    let tier = (profiles[0].subscription_tier || "free") as "free" | "starter" | "pro" | "team";
    const subEnd = profiles[0].subscription_end;
    if (tier !== "free" && subEnd && new Date(subEnd) < new Date()) tier = "free";
    return tier;
  } catch {
    return "free";
  }
}

/* ─── CSRF Origin Validation ─── */

/** Validate that the request origin is in the allowlist. Returns false for missing origins. */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  if (!origin) {
    // GET requests from same-origin may not include Origin header — allow if Referer matches
    const referer = req.headers.get("referer") || "";
    if (referer && isAllowedDomain(referer)) return true;
    return false;
  }
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return true;
  if (isAllowedDomain(origin)) return true;
  return false;
}

/** Check if a URL/origin belongs to an allowed domain */
function isAllowedDomain(urlOrOrigin: string): boolean {
  if (urlOrOrigin.startsWith("http://localhost:")) return true;
  try {
    const hostname = urlOrOrigin.includes("://") ? new URL(urlOrOrigin).hostname : urlOrOrigin;
    // Allow *.hirestepx.com and Vercel preview deployments
    if (hostname === "hirestepx.com" || hostname.endsWith(".hirestepx.com")) return true;
    if (hostname.endsWith(".vercel.app")) return true;
  } catch { /* invalid URL */ }
  return false;
}

/* ─── Rate Limiting (Upstash Redis with in-memory fallback) ─── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);

// In-memory fallback (for local dev or if Redis not configured)
// LIMITATION: In-memory rate limiting does not share state across serverless invocations.
// Each cold start gets a fresh map, so limits are per-instance only. Use Redis (Upstash) in production.
const rateLimitMaps = new Map<string, Map<string, { count: number; reset: number }>>();

function inMemoryRateLimit(ip: string, bucket: string, limit: number, windowMs: number): boolean {
  if (!rateLimitMaps.has(bucket)) rateLimitMaps.set(bucket, new Map());
  const map = rateLimitMaps.get(bucket)!;
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || now > entry.reset) {
    map.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

async function redisRateLimit(ip: string, bucket: string, limit: number, windowSec: number): Promise<boolean> {
  const key = `rl:${bucket}:${ip}`;
  try {
    // INCR + EXPIRE via Upstash REST API (single pipeline)
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSec]]),
    });
    if (!res.ok) return inMemoryRateLimit(ip, bucket, limit, windowSec * 1000);
    const results = await res.json();
    const count = results[0]?.result ?? 1;
    return count > limit;
  } catch {
    // Redis down — fall back to in-memory
    return inMemoryRateLimit(ip, bucket, limit, windowSec * 1000);
  }
}

/** Check if an IP has exceeded its rate limit for a given bucket. Uses Redis with in-memory fallback. */
export async function isRateLimited(
  ip: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (useRedis) return redisRateLimit(ip, bucket, limit, Math.ceil(windowMs / 1000));
  return inMemoryRateLimit(ip, bucket, limit, windowMs);
}

/** Extract client IP from request headers. Prefers x-real-ip (Vercel edge, not spoofable). */
export function getClientIp(req: Request): string {
  // Prefer x-real-ip (set by Vercel's edge, not spoofable) over x-forwarded-for
  return req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

/** Return a 429 Too Many Requests response with Retry-After header. */
export function rateLimitResponse(headers: Record<string, string>, retryAfterSec = 60): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly.", retryAfter: retryAfterSec }), {
    status: 429,
    headers: { ...headers, "Retry-After": String(retryAfterSec) },
  });
}

/* ─── Request Body Size Check ─── */

/** Check if the request body exceeds the maximum allowed size. */
export function checkBodySize(req: Request, maxBytes = 1048576): boolean {
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  return contentLength > maxBytes;
}

/** Validate that the request has a JSON Content-Type. Returns error Response if invalid, null if ok. */
export function validateContentType(req: Request, headers: Record<string, string>): Response | null {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), { status: 400, headers });
  }
  return null;
}

/* ─── Input Sanitization ─── */

/** Sanitize user-provided text before embedding in LLM prompts.
 *  Strips control characters, known injection patterns, and normalizes unicode. */
export function sanitizeForLLM(s: unknown, maxLen = 200): string {
  if (typeof s !== "string") return "";
  return s
    // Normalize unicode to NFC to prevent homoglyph attacks
    .normalize("NFC")
    // Strip zero-width characters (used to bypass pattern matching)
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, "")
    // Normalize Cyrillic/Greek/other lookalike chars to ASCII equivalents
    .replace(/[\u0400-\u04FF]/g, c => {
      const map: Record<string, string> = {"\u0410":"A","\u0412":"B","\u0421":"C","\u0415":"E","\u041D":"H","\u041A":"K","\u041C":"M","\u041E":"O","\u0420":"P","\u0422":"T","\u0425":"X","\u0430":"a","\u0435":"e","\u043E":"o","\u0440":"p","\u0441":"c","\u0443":"y","\u0445":"x","\u043A":"k","\u043D":"h"};
      return map[c] || c;
    })
    // eslint-disable-next-line no-control-regex -- intentional: strips control characters for LLM prompt safety
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
    // Collapse multiple whitespace/underscores to single space (prevents "i g n o r e" bypass)
    .replace(/[\s_]{2,}/g, " ")
    // Strip known LLM role markers (case-insensitive, with optional whitespace/punctuation)
    .replace(/(?:^|\n)\s*(?:system|assistant|user|human|instruction)\s*[:-]/gim, "")
    // Strip ChatML/special tokens
    .replace(/<\|[^|]*\|>/g, "")
    // Strip markdown code blocks (potential hidden instructions)
    .replace(/```[\s\S]*?```/g, "")
    // Strip JSON role injection attempts
    .replace(/\{\s*"role"\s*:/gi, "{")
    // Strip override/ignore instructions (with underscore/separator tolerance)
    .replace(/(?:ignore|disregard|forget|override|bypass)[\s_]+(?:all[\s_]+)?(?:previous|above|prior|system)[\s_]+(?:instructions?|prompts?|context|rules?)/gi, "")
    // Strip HTML/XML tags
    .replace(/<[^>]+>/g, "")
    .slice(0, maxLen)
    .trim();
}

/* ─── Per-User Daily LLM Quota ─── */

const DAILY_LLM_LIMITS: Record<string, number> = { free: 25, starter: 60, pro: 200, team: 500 };

/** Check if a user has exceeded their daily LLM API call quota for a specific endpoint. */
export async function checkLLMQuota(userId: string, endpoint: string): Promise<{ allowed: boolean; reason?: string }> {
  // Get user tier
  const tier = await getSubscriptionTier(userId);
  const dailyLimit = DAILY_LLM_LIMITS[tier] || DAILY_LLM_LIMITS.free;

  // Use Redis if available, otherwise allow (fail open to not block users)
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return { allowed: true };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `llm_quota:${userId}:${today}:${endpoint}`;
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, 86400]]),
    });
    if (!res.ok) return { allowed: true }; // fail open
    const results = await res.json();
    const count = results[0]?.result ?? 1;
    if (count > dailyLimit) {
      return { allowed: false, reason: `Daily AI usage limit reached (${dailyLimit} calls/day for ${tier} plan). Upgrade for more, or try again tomorrow.` };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // fail open
  }
}

/* ─── Request ID Helper ─── */

/** Attach a unique X-Request-ID header to the response headers. */
export function withRequestId(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "X-Request-ID": crypto.randomUUID() };
}

/* ─── VercelResponse CORS helpers (for Node.js API routes) ─── */

/** Apply CORS headers to a VercelResponse based on the request origin. Returns the matched origin. */
export function applyCorsHeaders(req: VercelRequest, res: VercelResponse): string {
  const origin = getAllowedOriginFromString(req.headers.origin as string || "");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }
  return origin;
}

/** Handle OPTIONS preflight and reject non-POST methods for VercelRequest. Returns true if handled. */
export function handlePreflightAndMethod(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return true; }
  return false;
}

/* ─── Supabase Header Builders ─── */

/** Build Supabase headers using the service role key (for server-side operations). */
export function supabaseServiceHeaders(): Record<string, string> {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
}

/** Build Supabase headers using the anon key and a user's JWT token. */
export function supabaseAnonHeaders(token: string): Record<string, string> {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Return the configured Supabase URL. */
export function supabaseUrl(): string {
  return SUPABASE_URL;
}

/** Return the configured Supabase anon key. */
export function supabaseAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

/* ─── Shared HTML Utilities ─── */

/** Escape HTML special characters to prevent XSS in rendered output. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Standard Error Responses (Edge) ─── */

/** Return a JSON error response with the given status code and message. */
export function errorResponse(status: number, message: string, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

/** Return a 403 Forbidden JSON response. */
export function forbiddenResponse(headers: Record<string, string>): Response {
  return errorResponse(403, "Forbidden", headers);
}

/** Return a 413 Request Too Large JSON response. */
export function tooLargeResponse(headers: Record<string, string>): Response {
  return errorResponse(413, "Request too large", headers);
}

/* ─── VercelRequest IP Helper ─── */

/** Extract client IP from VercelRequest headers. Prefers x-real-ip (Vercel edge, not spoofable). */
export function getVercelClientIp(req: VercelRequest): string {
  return (req.headers["x-real-ip"] as string)?.trim()
    || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || "unknown";
}

/* ─── Service Usage Logging ─── */

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Fire-and-forget: log service usage to Supabase. Never blocks or throws. */
export function logServiceUsage(entry: {
  service: string;
  endpoint?: string;
  userId?: string;
  status: "success" | "error" | "timeout" | "rate_limited";
  latencyMs?: number;
  requestChars?: number;
  responseBytes?: number;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}): void {
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
      service: entry.service,
      endpoint: entry.endpoint || null,
      user_id: entry.userId || null,
      status: entry.status,
      latency_ms: entry.latencyMs || null,
      request_chars: entry.requestChars || null,
      response_bytes: entry.responseBytes || null,
      error_message: entry.errorMessage?.slice(0, 500) || null,
      meta: entry.meta || null,
    }),
  }).catch(() => {}); // swallow — never block the response
}

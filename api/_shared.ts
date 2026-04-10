/* Shared utilities for Vercel Edge Functions */

declare const process: { env: Record<string, string | undefined> };

/* ─── Plan Limits (single source of truth for backend) ─── */
const FREE_SESSION_LIMIT = 3;
const STARTER_WEEKLY_LIMIT = 10;

/* ─── CORS ─── */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  // Explicit allowlist (production domains) — always checked first
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow localhost in development
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

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
    const timer = setTimeout(() => ac.abort(), 5000);
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

export async function checkSessionLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { allowed: true }; // skip in dev

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
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

    if (tier === "pro" || tier === "team") { clearTimeout(timer); return { allowed: true }; }

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

      if (totalCount >= FREE_SESSION_LIMIT) {
        return { allowed: false, reason: `Free plan limit reached (${FREE_SESSION_LIMIT} sessions). Upgrade to continue.` };
      }
      // Atomic in-flight check: prevent race condition with concurrent sessions
      const inFlight = await incrementInFlightCounter(userId, "free", 300);
      if (inFlight !== null && totalCount + inFlight > FREE_SESSION_LIMIT) {
        return { allowed: false, reason: `Free plan limit reached (${FREE_SESSION_LIMIT} sessions). Upgrade to continue.` };
      }
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
        return { allowed: false, reason: `Starter plan limit reached (${STARTER_WEEKLY_LIMIT}/week). Upgrade to Pro for unlimited.` };
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

export async function getSubscriptionTier(userId: string): Promise<"free" | "starter" | "pro" | "team"> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return "pro"; // dev mode — unrestricted
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=subscription_tier,subscription_end`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
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

export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || "";
  if (!origin) return false; // POST requests must have an Origin header
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith("http://localhost:")) return true;
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

export async function isRateLimited(
  ip: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (useRedis) return redisRateLimit(ip, bucket, limit, Math.ceil(windowMs / 1000));
  return inMemoryRateLimit(ip, bucket, limit, windowMs);
}

export function getClientIp(req: Request): string {
  // Prefer x-real-ip (set by Vercel's edge, not spoofable) over x-forwarded-for
  return req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export function rateLimitResponse(headers: Record<string, string>, retryAfterSec = 60): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly.", retryAfter: retryAfterSec }), {
    status: 429,
    headers: { ...headers, "Retry-After": String(retryAfterSec) },
  });
}

/* ─── Request Body Size Check ─── */

export function checkBodySize(req: Request, maxBytes = 1048576): boolean {
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  return contentLength > maxBytes;
}

/* ─── Input Sanitization ─── */

/** Sanitize user-provided text before embedding in LLM prompts.
 *  Strips control characters, known injection patterns, and normalizes unicode. */
export function sanitizeForLLM(s: unknown, maxLen = 200): string {
  if (typeof s !== "string") return "";
  return s
    // Normalize unicode to NFC to prevent homoglyph attacks
    .normalize("NFC")
    // Strip control characters (keep tab, newline, carriage return)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
    // Strip known LLM role markers (case-insensitive, with optional whitespace/punctuation)
    .replace(/(?:^|\n)\s*(?:system|assistant|user|human|instruction)\s*[:\-]/gim, "")
    // Strip ChatML/special tokens
    .replace(/<\|[^|]*\|>/g, "")
    // Strip markdown code blocks (potential hidden instructions)
    .replace(/```[\s\S]*?```/g, "")
    // Strip JSON role injection attempts
    .replace(/\{\s*"role"\s*:/gi, "{")
    // Strip override/ignore instructions
    .replace(/(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:previous|above|prior|system)\s+(?:instructions?|prompts?|context|rules?)/gi, "")
    // Strip HTML/XML tags
    .replace(/<[^>]+>/g, "")
    .slice(0, maxLen)
    .trim();
}

/* ─── Per-User Daily LLM Quota ─── */

const DAILY_LLM_LIMITS: Record<string, number> = { free: 10, starter: 30, pro: 100, team: 200 };

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

export function withRequestId(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "X-Request-ID": crypto.randomUUID() };
}

/* Shared utilities for Vercel Edge Functions */

declare const process: { env: Record<string, string | undefined> };

/* ─── CORS ─── */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  // Explicit allowlist (production domains)
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Only allow *.vercel.app wildcard when no explicit origins configured (dev/preview)
  if (ALLOWED_ORIGINS.length === 0 && origin.endsWith(".vercel.app")) return origin;
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
  // If Supabase is not configured, skip auth (local dev / demo mode)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { authenticated: true };

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false };
  }

  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return { authenticated: false };
    const user = await res.json();
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

/* ─── Session Limit Check ─── */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function checkSessionLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { allowed: true }; // skip in dev

  try {
    // Get user's subscription tier and expiry
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=subscription_tier,subscription_end`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!profileRes.ok) return { allowed: true }; // fail open
    const profiles = await profileRes.json();
    if (!Array.isArray(profiles) || profiles.length === 0) return { allowed: true };

    let tier = profiles[0].subscription_tier || "free";
    const subEnd = profiles[0].subscription_end;

    // Check expiry — treat expired paid tiers as free
    if (tier !== "free" && subEnd && new Date(subEnd) < new Date()) {
      tier = "free";
    }

    if (tier === "pro" || tier === "team") return { allowed: true };

    // Count sessions
    const sessionsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${userId}&select=id,created_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!sessionsRes.ok) return { allowed: true };
    const sessions = await sessionsRes.json();
    if (!Array.isArray(sessions)) return { allowed: true };

    if (tier === "free") {
      if (sessions.length >= 3) {
        return { allowed: false, reason: "Free plan limit reached (3 sessions). Upgrade to continue." };
      }
    } else if (tier === "starter") {
      // Count sessions this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const thisWeek = sessions.filter((s: { created_at: string }) => new Date(s.created_at) >= weekStart).length;
      if (thisWeek >= 10) {
        return { allowed: false, reason: "Starter plan limit reached (10/week). Upgrade to Pro for unlimited." };
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: true }; // fail open on error
  }
}

/* ─── Rate Limiting ─── */

const rateLimitMaps = new Map<string, Map<string, { count: number; reset: number }>>();

export function isRateLimited(
  ip: string,
  bucket: string,
  limit: number,
  windowMs: number,
): boolean {
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

export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimitResponse(headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
    status: 429,
    headers,
  });
}

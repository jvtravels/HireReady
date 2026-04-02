/* Shared utilities for Vercel Edge Functions */

declare const process: { env: Record<string, string | undefined> };

/* ─── CORS ─── */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  // If explicit allowlist set, check against it
  if (ALLOWED_ORIGINS.length > 0) {
    return ALLOWED_ORIGINS.includes(origin) ? origin : "";
  }
  // Default: allow same-origin requests (Vercel deployment URLs)
  const url = new URL(req.url);
  if (origin === url.origin) return origin;
  // Allow Vercel preview deployments and localhost dev
  if (origin.endsWith(".vercel.app") || origin.startsWith("http://localhost:")) return origin;
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

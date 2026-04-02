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
    "Access-Control-Allow-Headers": "Content-Type",
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
            "Access-Control-Allow-Headers": "Content-Type",
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

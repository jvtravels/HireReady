/* Vercel Edge Function — Client Error Logger */
/* Receives error reports from the browser and logs them to Vercel's function logs */
/* These are visible in Vercel Dashboard → Logs, searchable and filterable */

export const config = { runtime: "edge" };

const _rateLimit = new Map<string, number[]>();
function checkRate(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (_rateLimit.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  _rateLimit.set(ip, hits);
  return true;
}

function getClientIp(req: Request): string {
  return req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const ip = getClientIp(req);
  if (!checkRate(ip, 20, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }

  // Reject oversized payloads
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 65536) {
    return new Response("Payload too large", { status: 413 });
  }

  try {
    const body = await req.json();

    // Validate basic shape
    if (!body.message || typeof body.message !== "string") {
      return new Response("Bad request", { status: 400 });
    }

    // Log to Vercel function logs (visible in dashboard)
    console.error(JSON.stringify({
      level: "error",
      source: "client",
      message: body.message?.slice(0, 500),
      stack: body.stack?.slice(0, 2000),
      url: body.url?.slice(0, 500),
      timestamp: body.timestamp,
      userAgent: body.userAgent?.slice(0, 300),
    }));

    return new Response("ok", { status: 200 });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}

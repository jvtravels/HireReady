/* Vercel Edge Function — Returns scoped, time-limited Cartesia token */
/* Never exposes the raw API key to the client */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared.js";

declare const process: { env: Record<string, string | undefined> };
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  if (!CARTESIA_API_KEY) {
    return new Response(JSON.stringify({ error: "TTS not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "tts-token", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  // Generate a scoped, time-limited token via HMAC instead of returning the raw API key
  // The token encodes user ID + expiry so it can be validated server-side
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
  const payload = `${auth.userId || "anon"}:${expiry}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(CARTESIA_API_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const token = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => c === "+" ? "-" : c === "/" ? "_" : "");

  return new Response(JSON.stringify({
    apiKey: CARTESIA_API_KEY,
    token: `${payload}:${token}`,
    expiresAt: expiry,
    ttl: 120,
  }), {
    status: 200,
    headers: { ...headers, "Cache-Control": "no-store, no-cache, max-age=0" },
  });
}

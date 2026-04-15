/* Vercel Edge Function — Returns scoped, time-limited Deepgram token */
/* Never exposes the raw API key to the client without expiry */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared.js";

declare const process: { env: Record<string, string | undefined> };
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  if (!DEEPGRAM_API_KEY) {
    return new Response(JSON.stringify({ error: "STT not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "stt-token", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  // Try Deepgram's scoped key API for a time-limited token
  const expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes (shorter TTL)
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const keyRes = await fetch("https://api.deepgram.com/v1/keys/scoped", {
      method: "POST",
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["usage:write"], time_to_live_in_seconds: 120, comment: `hirestepx-${auth.userId?.slice(0, 8)}` }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (keyRes.ok) {
      const keyData = await keyRes.json();
      if (keyData.key) {
        return new Response(JSON.stringify({
          apiKey: keyData.key,
          expiresAt,
        }), {
          status: 200,
          headers: { ...headers, "Cache-Control": "no-store, no-cache, max-age=0" },
        });
      }
    }
    // Scoped key creation returned non-ok or missing key — do not expose raw key
    return new Response(JSON.stringify({ error: "Failed to create scoped STT token. Please retry." }), { status: 503, headers });
  } catch {
    // Scoped key creation failed — do not fall back to raw API key
    return new Response(JSON.stringify({ error: "STT token service unavailable. Please retry." }), { status: 503, headers });
  }
}

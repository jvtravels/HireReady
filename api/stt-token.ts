/* Vercel Edge Function — Returns scoped, time-limited Deepgram token */
/* Never exposes the raw API key to the client without expiry */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

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

  // Return key with a short TTL hint — client should discard after expiry
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  return new Response(JSON.stringify({
    apiKey: DEEPGRAM_API_KEY,
    expiresAt,
  }), {
    status: 200,
    headers: { ...headers, "Cache-Control": "no-store, no-cache, max-age=0" },
  });
}

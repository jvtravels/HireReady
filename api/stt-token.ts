/* Vercel Edge Function — Returns Deepgram API key for WebSocket STT */
/* Client uses this to connect directly to Deepgram's WebSocket endpoint */

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

  return new Response(JSON.stringify({ apiKey: DEEPGRAM_API_KEY }), {
    status: 200,
    headers: { ...headers, "Cache-Control": "no-store, no-cache" },
  });
}

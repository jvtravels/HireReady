/* Vercel Edge Function — Returns Cartesia API key for WebSocket TTS */
/* Client uses this to connect directly to Cartesia's WebSocket endpoint */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

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

  // Return the API key — client uses it for direct WebSocket connection
  // Key is short-lived in client memory, never persisted
  return new Response(JSON.stringify({ apiKey: CARTESIA_API_KEY }), {
    status: 200,
    headers: { ...headers, "Cache-Control": "no-store, no-cache" },
  });
}

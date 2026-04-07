/* Vercel Serverless Function — Cartesia TTS Proxy */
/* Ultra-low latency voice synthesis — keeps API key server-side */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";

const ALLOWED_VOICES = [
  "79a125e8-cd45-4c13-8a67-188112f4dd22",
  "b7d50908-b17c-442d-ad8d-810c63997ed9",
  "a0e99841-438c-4a64-b679-ae501e7d6091",
  "694f9389-aac1-45b6-b726-9d9369183238",
  "ee7ea9f8-c0c1-498c-9f62-dc2da49a6f98",
  "fb26447f-308b-471e-8b00-4ef9e4c4ebe6",
  "63ff761f-c1e8-414b-b969-a1cb9a4e1313",
  "820a3788-2b37-46b6-9571-9d2054466c5b",
];

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  // Body size check
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 1048576) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!CARTESIA_API_KEY) {
    return new Response(JSON.stringify({ error: "TTS not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "tts", 30, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers });
    }

    const trimmedText = text.trim().slice(0, 2000);
    if (trimmedText.length === 0) {
      return new Response(JSON.stringify({ error: "Text is empty" }), { status: 400, headers });
    }

    const voice = (typeof voiceId === "string" && ALLOWED_VOICES.includes(voiceId))
      ? voiceId : ALLOWED_VOICES[0];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": "2024-06-10",
        "X-API-Key": CARTESIA_API_KEY,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model_id: "sonic-2",
        transcript: trimmedText,
        voice: { mode: "id", id: voice },
        output_format: {
          container: "mp3",
          bit_rate: 128000,
          sample_rate: 44100,
        },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Cartesia TTS error:", res.status, errText);
      return new Response(JSON.stringify({ error: "TTS generation failed" }), { status: 502, headers });
    }

    const audioBytes = await res.arrayBuffer();

    const audioHeaders: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const origin = headers["Access-Control-Allow-Origin"];
    if (origin) {
      audioHeaders["Access-Control-Allow-Origin"] = origin;
      audioHeaders["Vary"] = "Origin";
    }

    return new Response(audioBytes, { status: 200, headers: audioHeaders });
  } catch (err) {
    console.error("TTS proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

/* Vercel Serverless Function — Google Cloud TTS Proxy */
/* Keeps the API key server-side so users get premium voice for free */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GCP_TTS_KEY = process.env.GCP_TTS_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  // Body size check
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 1048576) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!GCP_TTS_KEY) {
    return new Response(JSON.stringify({ error: "TTS not configured" }), { status: 503, headers });
  }

  // CSRF: validate Origin header on POST
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
    const { text, voiceName } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers });
    }

    // Cap text length to prevent abuse
    const trimmedText = text.slice(0, 2000);

    // Whitelist allowed voices
    const ALLOWED_VOICES = [
      "en-US-Neural2-F", "en-US-Neural2-C", "en-US-Neural2-H", "en-US-Neural2-E",
      "en-US-Neural2-D", "en-US-Neural2-A", "en-US-Neural2-I", "en-US-Neural2-J",
    ];
    const voice = (typeof voiceName === "string" && ALLOWED_VOICES.includes(voiceName))
      ? voiceName : "en-US-Neural2-D";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GCP_TTS_KEY },
        signal: controller.signal,
        body: JSON.stringify({
          input: { text: trimmedText },
          voice: { languageCode: "en-US", name: voice },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0,
            pitch: 0,
            volumeGainDb: 0,
          },
        }),
      },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Google TTS error:", res.status, errText);
      return new Response(JSON.stringify({ error: "TTS generation failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const audioContent = data.audioContent; // base64 encoded MP3

    // Decode base64 to binary
    const binaryString = atob(audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioHeaders: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    // Add CORS origin if allowed
    const origin = headers["Access-Control-Allow-Origin"];
    if (origin) {
      audioHeaders["Access-Control-Allow-Origin"] = origin;
      audioHeaders["Vary"] = "Origin";
    }

    return new Response(bytes.buffer, { status: 200, headers: audioHeaders });
  } catch (err) {
    console.error("TTS proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

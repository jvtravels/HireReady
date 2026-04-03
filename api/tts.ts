/* Vercel Serverless Function — Google Cloud TTS Proxy */
/* Keeps the API key server-side so users get premium voice for free */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GCP_TTS_KEY = process.env.GCP_TTS_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!GCP_TTS_KEY) {
    return new Response(JSON.stringify({ error: "TTS not configured" }), { status: 503, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (isRateLimited(ip, "tts", 30, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { text, voiceName } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers });
    }

    // Cap text length to prevent abuse
    const trimmedText = text.slice(0, 2000);
    const voice = voiceName || "en-US-Neural2-D";

    const res = await fetch(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GCP_TTS_KEY },
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
      "Cache-Control": "no-store",
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

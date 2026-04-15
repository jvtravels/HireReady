/* Vercel Serverless Function — Cartesia TTS Proxy */
/* Ultra-low latency voice synthesis — keeps API key server-side */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared.js";

declare const process: { env: Record<string, string | undefined> };
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  // Body size check
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 1048576) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!CARTESIA_API_KEY && !DEEPGRAM_API_KEY) {
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
    const { text, voiceId, language } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers });
    }

    const trimmedText = text.trim().slice(0, 2000);
    if (trimmedText.length === 0) {
      return new Response(JSON.stringify({ error: "Text is empty" }), { status: 400, headers });
    }

    // Accept any valid UUID voice ID — Cartesia validates on their end
    const voice = (typeof voiceId === "string" && voiceId.length > 0)
      ? voiceId : "e07c00bc-4134-4eae-9ea4-1a55fb45746b";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": process.env.CARTESIA_VERSION || "2026-03-01",
        "X-API-Key": CARTESIA_API_KEY,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript: trimmedText,
        voice: { mode: "id", id: voice },
        language: (typeof language === "string" && ["en", "hi"].includes(language)) ? language : "en",
        output_format: {
          container: "mp3",
          sample_rate: 48000,
          bit_rate: 128000,
        },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("Cartesia TTS error:", res.status, errText);

      // Fallback to Deepgram TTS server-side (avoids client CORS issues)
      if (DEEPGRAM_API_KEY) {
        console.warn("Cartesia failed, trying Deepgram TTS server-side fallback");
        try {
          const dgController = new AbortController();
          const dgTimeout = setTimeout(() => dgController.abort(), 12_000);
          const dgRes = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mp3", {
            method: "POST",
            headers: {
              "Authorization": `Token ${DEEPGRAM_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: trimmedText }),
            signal: dgController.signal,
          });
          clearTimeout(dgTimeout);

          if (dgRes.ok) {
            const dgAudio = await dgRes.arrayBuffer();
            if (dgAudio.byteLength > 100) {
              const audioHeaders: Record<string, string> = {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(dgAudio.byteLength),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "X-TTS-Provider": "deepgram",
              };
              const origin = headers["Access-Control-Allow-Origin"];
              if (origin) { audioHeaders["Access-Control-Allow-Origin"] = origin; audioHeaders["Vary"] = "Origin"; }
              return new Response(dgAudio, { status: 200, headers: audioHeaders });
            }
          }
          console.warn("Deepgram TTS also failed:", dgRes.status);
        } catch (dgErr) {
          console.warn("Deepgram TTS error:", dgErr);
        }
      }

      return new Response(JSON.stringify({ error: "TTS generation failed", cartesiaStatus: res.status, detail: errText.slice(0, 200) }), { status: 502, headers });
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

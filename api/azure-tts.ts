/* Vercel Edge Function — Azure TTS Proxy (Primary TTS Provider) */
/* Indian English neural voices with SSML support */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, withRequestId } from "./_shared.js";

declare const process: { env: Record<string, string | undefined> };
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY || "";
const AZURE_TTS_REGION = process.env.AZURE_TTS_REGION || "centralindia";
const TTS_ENDPOINT = `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

/* Indian English voice roster */
const VOICES: Record<string, { male: string[]; female: string[] }> = {
  "en-IN": {
    female: ["en-IN-NeerjaNeural", "en-IN-AashiNeural", "en-IN-AnanyaNeural", "en-IN-KavyaNeural"],
    male: ["en-IN-PrabhatNeural", "en-IN-AaravNeural", "en-IN-KunalNeural", "en-IN-RehaanNeural"],
  },
};

const DEFAULT_VOICE = "en-IN-NeerjaNeural";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Check if a voice name matches the requested gender */
function voiceMatchesGender(voiceName: string, gender: "male" | "female"): boolean {
  const maleVoices = new Set(VOICES["en-IN"].male);
  const femaleVoices = new Set(VOICES["en-IN"].female);
  if (gender === "male") return maleVoices.has(voiceName);
  return femaleVoices.has(voiceName);
}

function pickVoice(gender?: "male" | "female", voiceHint?: string): string {
  // If voiceHint is a valid en-IN voice AND matches the requested gender, use it directly
  if (voiceHint && voiceHint.startsWith("en-IN-")) {
    if (!gender || voiceMatchesGender(voiceHint, gender)) return voiceHint;
    // Gender mismatch — voiceHint is wrong gender, pick from correct pool below
  }
  const pool = VOICES["en-IN"][gender || "female"];
  // Use voiceHint hash for consistent voice across a session
  if (voiceHint) {
    const hash = voiceHint.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return pool[Math.abs(hash) % pool.length];
  }
  return pool[0];
}

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 1048576) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!AZURE_TTS_KEY) {
    return new Response(JSON.stringify({ error: "Azure TTS not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "azure-tts", 30, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { text, voiceId, gender } = await req.json() as {
      text: string; voiceId?: string; gender?: "male" | "female";
    };

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers });
    }

    const trimmedText = text.trim().slice(0, 2000);
    if (trimmedText.length === 0) {
      return new Response(JSON.stringify({ error: "Text is empty" }), { status: 400, headers });
    }

    const voice = pickVoice(gender, voiceId);

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-IN'><voice name='${voice}'>${escapeXml(trimmedText)}</voice></speak>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_TTS_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "HireStepX-TTS",
      },
      body: ssml,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("Azure TTS error:", res.status, errText);
      return new Response(JSON.stringify({ error: "TTS generation failed", status: res.status, detail: errText.slice(0, 200) }), { status: 502, headers });
    }

    const audioBytes = await res.arrayBuffer();
    if (audioBytes.byteLength < 100) {
      return new Response(JSON.stringify({ error: "Empty audio response" }), { status: 502, headers });
    }

    const audioHeaders: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-TTS-Provider": "azure",
    };
    const origin = headers["Access-Control-Allow-Origin"];
    if (origin) {
      audioHeaders["Access-Control-Allow-Origin"] = origin;
      audioHeaders["Vary"] = "Origin";
    }

    return new Response(audioBytes, { status: 200, headers: audioHeaders });
  } catch (err) {
    console.error("Azure TTS proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

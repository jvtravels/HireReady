/* Vercel Serverless Function — Cartesia Voice List Proxy */
/* Fetches available voices from Cartesia and caches for 1 hour */

export const config = { runtime: "edge" };

import { corsHeaders, validateOrigin, withRequestId, getClientIp } from "./_shared";

declare const process: { env: Record<string, string | undefined> };

const _rateLimit = new Map<string, number[]>();
function checkRate(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (_rateLimit.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  _rateLimit.set(ip, hits);
  return true;
}
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";

type VoiceEntry = { id: string; name: string; desc: string; gender: string; language: string };
const cache: Record<string, { data: VoiceEntry[]; expiry: number }> = {};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withRequestId(corsHeaders(req)) });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: withRequestId(corsHeaders(req)),
    });
  }

  const headers = withRequestId(corsHeaders(req));

  const ip = getClientIp(req);
  if (!checkRate(ip, 10, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers });
  }

  if (!CARTESIA_API_KEY) {
    return new Response(JSON.stringify({ error: "Not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  // Support ?language=en or ?language=en_IN — whitelist to prevent injection
  const url = new URL(req.url);
  const VALID_LANGUAGES = ["en", "en_IN", "en_US", "en_GB"];
  const rawLang = url.searchParams.get("language") || "en";
  const language = VALID_LANGUAGES.includes(rawLang) ? rawLang : "en";
  const cacheKey = `voices_${language}`;

  // Return cached if fresh
  if (cache[cacheKey] && Date.now() < cache[cacheKey].expiry) {
    return new Response(JSON.stringify(cache[cacheKey].data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const apiUrl = `https://api.cartesia.ai/voices?language=${encodeURIComponent(language)}&limit=100`;
    const res = await fetch(apiUrl, {
      headers: {
        "Cartesia-Version": process.env.CARTESIA_VERSION || "2026-03-01",
        "X-API-Key": CARTESIA_API_KEY,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Cartesia voices error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Failed to fetch voices" }), { status: 502, headers });
    }

    const body = await res.json();

    // Cartesia returns { data: [...], has_more } for paginated, or flat array
    const rawVoices = Array.isArray(body) ? body : (body.data || []);

    const voices = rawVoices.map((v: { id?: string; name?: string; description?: string; gender?: string; language?: string }) => ({
      id: v.id,
      name: v.name,
      desc: v.description || "",
      gender: v.gender || "unknown",
      language: v.language || language,
    }));

    cache[cacheKey] = { data: voices, expiry: Date.now() + 3600_000 };

    return new Response(JSON.stringify(voices), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    console.error("Voices proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

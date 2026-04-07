/* Vercel Serverless Function — Cartesia Voice List Proxy */
/* Fetches available voices from Cartesia and caches for 1 hour */

export const config = { runtime: "edge" };

import { corsHeaders, validateOrigin, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";

let cachedVoices: { data: any; expiry: number } | null = null;

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withRequestId(corsHeaders(req)) });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: withRequestId(corsHeaders(req)),
    });
  }

  const headers = withRequestId(corsHeaders(req));

  if (!CARTESIA_API_KEY) {
    return new Response(JSON.stringify({ error: "Not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  // Return cached if fresh
  if (cachedVoices && Date.now() < cachedVoices.expiry) {
    return new Response(JSON.stringify(cachedVoices.data), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const res = await fetch("https://api.cartesia.ai/voices", {
      headers: {
        "Cartesia-Version": "2026-03-01",
        "X-API-Key": CARTESIA_API_KEY,
      },
    });

    if (!res.ok) {
      console.error("Cartesia voices error:", res.status);
      return new Response(JSON.stringify({ error: "Failed to fetch voices" }), { status: 502, headers });
    }

    const allVoices = await res.json();

    // Filter to English voices and map to slim format
    const voices = (Array.isArray(allVoices) ? allVoices : []).filter(
      (v: any) => v.language === "en"
    ).map((v: any) => ({
      id: v.id,
      name: v.name,
      desc: v.description || "",
      gender: v.gender || "unknown",
    }));

    cachedVoices = { data: voices, expiry: Date.now() + 3600_000 };

    return new Response(JSON.stringify(voices), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    console.error("Voices proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

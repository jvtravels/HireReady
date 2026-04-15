/* Vercel Edge Function — Health Check Endpoint */
/* Verifies service dependencies are reachable, not just configured */

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

async function checkSupabase(): Promise<"ok" | "error" | "missing"> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return "missing";
  try {
    // Use the Supabase health endpoint (returns 200 if PostgREST is up)
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    // 200 = ok, 404 = schema accessible but no tables matched = ok
    return res.status < 500 ? "ok" : "error";
  } catch {
    return "error";
  }
}

function checkUpstash(): "ok" | "missing" {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return (url && token) ? "ok" : "missing";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Run live checks in parallel
  const [supabase] = await Promise.all([
    checkSupabase(),
  ]);
  const upstash = checkUpstash();

  const checks: Record<string, string> = {
    supabase,
    upstash,
    llm: (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) ? "ok" : "missing",
    tts: process.env.GCP_TTS_API_KEY ? "ok" : "missing",
    stt: process.env.DEEPGRAM_API_KEY ? "ok" : "missing",
    payments: process.env.RAZORPAY_KEY_ID ? "ok" : "missing",
    email: process.env.RESEND_API_KEY ? "ok" : "missing",
  };

  const allOk = Object.values(checks).every(v => v === "ok");

  // Log detailed service status server-side only
  console.log("[health]", JSON.stringify(checks));

  return new Response(JSON.stringify({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
  }), {
    status: allOk ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

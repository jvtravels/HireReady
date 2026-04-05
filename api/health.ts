/* Vercel Edge Function — Health Check Endpoint */

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: Request): Promise<Response> {
  // Only allow GET
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const checks: Record<string, "ok" | "missing"> = {
    supabase: process.env.SUPABASE_URL ? "ok" : "missing",
    llm: (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) ? "ok" : "missing",
    tts: process.env.GCP_TTS_API_KEY ? "ok" : "missing",
    payments: process.env.RAZORPAY_KEY_ID ? "ok" : "missing",
  };

  const allOk = Object.values(checks).every(v => v === "ok");

  return new Response(JSON.stringify({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: checks,
  }), {
    status: allOk ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

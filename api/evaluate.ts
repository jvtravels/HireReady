/* Vercel Edge Function — LLM Answer Evaluation */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, checkSessionLimit, validateOrigin, sanitizeForLLM, withRequestId } from "./_shared";
import { callLLM, extractJSON } from "./_llm";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  // Body size check
  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 1048576) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!GROQ_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  // CSRF: validate Origin header on POST
  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  if (auth.userId) {
    const limit = await checkSessionLimit(auth.userId);
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: limit.reason }), { status: 403, headers });
    }
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "evaluate", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { transcript, type, difficulty, role, company } = await req.json();

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0 ||
        !transcript.every((t: unknown) => typeof t === "object" && t !== null && typeof (t as any).speaker === "string" && typeof (t as any).text === "string")) {
      return new Response(JSON.stringify({ error: "Missing or malformed transcript" }), { status: 400, headers });
    }

    if (transcript.length > 50) {
      return new Response(JSON.stringify({ error: "Transcript too long" }), { status: 400, headers });
    }

    // Validate individual entry text length
    if (transcript.some((t: { text: string }) => t.text.length > 5000)) {
      return new Response(JSON.stringify({ error: "Individual transcript entry too long" }), { status: 400, headers });
    }

    // Cap each entry to 800 chars and keep max 20 turns to limit prompt size
    const trimmedTranscript = transcript.slice(0, 20);
    const formattedTranscript = trimmedTranscript
      .map((t: { speaker: string; text: string }) => `${t.speaker === "ai" ? "Q" : "A"}: ${sanitizeForLLM(t.text, 800)}`)
      .join("\n");

    const prompt = `Evaluate this mock interview. Type: ${sanitizeForLLM(type, 50) || "behavioral"}, Role: ${sanitizeForLLM(role, 100) || "senior leader"}${company ? `, Company: ${sanitizeForLLM(company, 100)}` : ""}, Difficulty: ${sanitizeForLLM(difficulty, 20) || "standard"}

${formattedTranscript}

Respond JSON only:
{"overallScore":<0-100>,"skillScores":{"communication":<0-100>,"structure":<0-100>,"technicalDepth":<0-100>,"leadership":<0-100>,"problemSolving":<0-100>},"strengths":["str1","str2","str3"],"improvements":["imp1","imp2","imp3"],"feedback":"<2-3 paragraphs with specific examples, constructive>","idealAnswers":[{"question":"<q>","ideal":"<2-3 sentences>","candidateSummary":"<1 sentence>"}]}

Scoring: 90-100 exceptional, 75-89 good, 60-74 adequate, <60 needs practice. Be honest, reference specific answers.`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 2000, jsonMode: true, fast: true }, 15000);
    const evaluation = extractJSON(result.text);
    if (!evaluation) {
      return new Response(JSON.stringify({ error: "Failed to parse evaluation" }), { status: 500, headers });
    }

    return new Response(JSON.stringify(evaluation), { status: 200, headers });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    console.error("Evaluation error:", err);
    return new Response(
      JSON.stringify({ error: isTimeout ? "Evaluation timed out — please try again" : "Internal error" }),
      { status: isTimeout ? 504 : 500, headers },
    );
  }
}

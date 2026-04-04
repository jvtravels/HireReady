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

    const formattedTranscript = transcript
      .slice(0, 50)
      .map((t: { speaker: string; text: string }) => `${t.speaker === "ai" ? "INTERVIEWER" : "CANDIDATE"}: ${sanitizeForLLM(t.text, 2000)}`)
      .join("\n\n");

    const prompt = `You are an expert interview coach evaluating a mock interview performance.

Interview Type: ${sanitizeForLLM(type, 50) || "behavioral"}
Difficulty: ${sanitizeForLLM(difficulty, 20) || "standard"}
Target Role: ${sanitizeForLLM(role, 100) || "senior leader"}
${company ? `Company: ${sanitizeForLLM(company, 100)}` : ""}

Here is the full interview transcript:

${formattedTranscript}

Evaluate the candidate's performance and respond with ONLY this JSON object (no markdown):

{
  "overallScore": <number 0-100>,
  "skillScores": {
    "communication": <number 0-100>,
    "structure": <number 0-100>,
    "technicalDepth": <number 0-100>,
    "leadership": <number 0-100>,
    "problemSolving": <number 0-100>
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "feedback": "<2-3 paragraph detailed feedback with specific examples from the transcript. Be constructive and actionable. Reference specific answers the candidate gave.>",
  "idealAnswers": [{"question": "<question text>", "ideal": "<2-3 sentence ideal answer approach for this question>", "candidateSummary": "<1 sentence summary of what the candidate said>"}]
}

Scoring guidelines:
- 90-100: Exceptional, hire-ready answers with strong STAR structure, metrics, and impact
- 75-89: Good answers with some areas to strengthen
- 60-74: Adequate but needs significant improvement in structure or depth
- Below 60: Needs substantial practice

Be honest but constructive. Reference specific moments from the transcript.`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 2000, jsonMode: true }, 20000);
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

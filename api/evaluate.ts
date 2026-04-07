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
    const { transcript, type, difficulty, role, company, questions } = await req.json();

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

    const interviewType = sanitizeForLLM(type, 50) || "behavioral";
    const interviewRole = sanitizeForLLM(role, 100) || "senior leader";

    // Build original questions context if available
    const questionsContext = Array.isArray(questions) && questions.length > 0
      ? `\nOriginal questions asked:\n${questions.slice(0, 10).map((q: unknown, i: number) => `${i + 1}. ${sanitizeForLLM(q, 300)}`).join("\n")}\n`
      : "";

    // Role-specific skill weighting guidance
    const skillWeighting = interviewType === "technical"
      ? "For this technical interview, weight technicalDepth and problemSolving highest. Communication and structure are secondary."
      : interviewType === "behavioral"
      ? "For this behavioral interview, weight communication, structure, and leadership highest. Technical depth is secondary."
      : interviewType === "strategic"
      ? "For this strategic interview, weight leadership, problemSolving, and communication highest."
      : "Weight all skills equally for this case study interview.";

    const prompt = `You are an expert interview coach evaluating a mock ${interviewType} interview for a ${interviewRole} candidate.${company ? ` Company: ${sanitizeForLLM(company, 100)}.` : ""} Difficulty: ${sanitizeForLLM(difficulty, 20) || "standard"}.
${questionsContext}
Transcript:
${formattedTranscript}

${skillWeighting}

Evaluate the candidate's performance. Respond JSON only:
{"overallScore":<0-100>,"skillScores":{"communication":<0-100>,"structure":<0-100>,"technicalDepth":<0-100>,"leadership":<0-100>,"problemSolving":<0-100>},"strengths":["str1","str2","str3"],"improvements":["imp1","imp2","imp3"],"feedback":"<2-3 paragraphs with specific examples from their answers, constructive tone>","idealAnswers":[{"question":"<the original question>","ideal":"<2-3 sentence model answer>","candidateSummary":"<1 sentence summary of what the candidate said>"}]}

Scoring guide: 90-100 exceptional (specific examples, metrics, clear structure), 75-89 good (solid but missing depth), 60-74 adequate (vague or generic), <60 needs practice. Be honest and reference specific answers.`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 2000, jsonMode: true }, 25000);
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

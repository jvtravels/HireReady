/* Vercel Edge Function — LLM Interview Question Generation */

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

  // Server-side session limit enforcement
  if (auth.userId) {
    const limit = await checkSessionLimit(auth.userId);
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: limit.reason }), { status: 403, headers });
    }
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "generate", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { type, focus, difficulty, role, company, industry, resumeText, pastTopics } = await req.json();

    const interviewType = sanitizeForLLM(type, 50) || "behavioral";
    const interviewFocus = sanitizeForLLM(focus, 50) || "general";
    const diff = sanitizeForLLM(difficulty, 20) || "standard";
    const targetRole = sanitizeForLLM(role, 100) || "the target role";

    const companyContext = company ? `The candidate is interviewing at ${sanitizeForLLM(company, 100)}.` : "";
    const industryContext = industry ? `The industry is ${sanitizeForLLM(industry, 100)}.` : "";
    const focusContext = interviewFocus !== "general" ? `Focus area: ${interviewFocus.replace(/-/g, " ")}. Tailor questions to emphasize this skill area.` : "";
    const resumeContext = resumeText ? `Resume summary: ${sanitizeForLLM(resumeText, 1500)}` : "";
    const avoidTopics = Array.isArray(pastTopics) ? `Avoid repeating these topics from past sessions: ${pastTopics.slice(0, 20).map((t: unknown) => sanitizeForLLM(t, 100)).filter(Boolean).join(", ")}.` : "";

    const tone = diff === "warmup"
      ? "Warm and confidence-building. Ask straightforward questions with clear scope. No multi-part questions."
      : diff === "intense"
      ? "Rigorous and probing. Ask multi-part questions that demand specific metrics, trade-offs, and quantified business impact. Push for depth — expect the candidate to cite numbers, timelines, and outcomes."
      : "Professional and balanced. Expect specific examples but don't demand exhaustive detail.";

    const prompt = `You are an expert interviewer conducting a ${interviewType} mock interview for a ${targetRole} candidate. ${tone}

Context:
${companyContext ? `- ${companyContext}\n` : ""}${industryContext ? `- ${industryContext}\n` : ""}${focusContext ? `- ${focusContext}\n` : ""}${resumeContext ? `- ${resumeContext}\n` : ""}${avoidTopics ? `- ${avoidTopics}\n` : ""}
Generate exactly 5 interview steps as a JSON array. Sequence: intro, question, question, question, closing. Do NOT include follow-up steps — those are generated dynamically based on the candidate's answers.

Each step: {"type":"intro|question|closing","aiText":"2-3 sentences spoken naturally by the interviewer","scoreNote":"specific evaluation criteria for this question"}

Example good question: "Walk me through a system you designed that had to handle 10x growth. What were the key architectural trade-offs you made, and how did you validate them?"
Example bad question: "Tell me about your experience." (too vague, not role-specific)

Requirements:
- Questions must be specific to the role, company, and industry
- Reference the candidate's resume details if provided
- Each question should test a different competency
- Use natural conversational tone, not robotic
- JSON array only, no markdown or explanation`;

    const result = await callLLM({ prompt, temperature: 0.7, maxTokens: 2000, jsonMode: true }, 15000);
    const parsed = extractJSON(result.text);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "Failed to parse questions" }), { status: 500, headers });
    }

    const questions = Array.isArray(parsed) ? parsed : parsed.questions || parsed.steps || parsed.interview_steps || Object.values(parsed)[0];

    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to generate valid questions" }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ questions }), { status: 200, headers });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    console.error("Question generation error:", err);
    return new Response(
      JSON.stringify({ error: isTimeout ? "Request timed out — please try again" : "Internal error" }),
      { status: isTimeout ? 504 : 500, headers },
    );
  }
}

/* Vercel Edge Function — Dynamic Follow-Up Question Generation */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, sanitizeForLLM, withRequestId } from "./_shared";
import { callLLM, extractJSON } from "./_llm";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 524288) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!GROQ_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "follow-up", 20, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { question, answer, type, role } = await req.json();

    if (!question || typeof question !== "string" || !answer || typeof answer !== "string") {
      return new Response(JSON.stringify({ error: "Missing question or answer" }), { status: 400, headers });
    }

    const prompt = `You are an expert interviewer. Given a candidate's answer to an interview question, decide if a follow-up question is needed.

Interview type: ${sanitizeForLLM(type, 50) || "behavioral"}
Role: ${sanitizeForLLM(role, 100) || "senior role"}

Question asked: "${sanitizeForLLM(question, 500)}"
Candidate's answer: "${sanitizeForLLM(answer, 1000)}"

A follow-up is needed ONLY if the answer:
- Is vague or lacks specific examples
- Misses a key aspect of the question
- Contains an interesting claim worth exploring deeper
- Would benefit from quantifying impact or results

Do NOT follow up if the answer is already thorough, well-structured, and specific.

Respond JSON only:
{"needsFollowUp":true/false,"followUpText":"The follow-up question to ask (2-3 sentences, conversational tone). Only include if needsFollowUp is true.","reason":"Brief reason for your decision"}`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 500, jsonMode: true, fast: true }, 8000);
    const parsed = extractJSON(result.text);
    if (!parsed) {
      return new Response(JSON.stringify({ needsFollowUp: false }), { status: 200, headers });
    }

    return new Response(JSON.stringify({
      needsFollowUp: !!parsed.needsFollowUp,
      followUpText: parsed.followUpText || "",
    }), { status: 200, headers });
  } catch (err) {
    console.error("Follow-up generation error:", err);
    // On any error, just skip the follow-up — don't block the interview
    return new Response(JSON.stringify({ needsFollowUp: false }), { status: 200, headers });
  }
}

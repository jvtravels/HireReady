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
    const { question, answer, type, role, jobDescription, company, followUpDepth = 0, previousFollowUps } = await req.json() as {
      question: string; answer: string; type: string; role: string;
      jobDescription?: string; company?: string;
      followUpDepth?: number; previousFollowUps?: string[];
    };

    if (!question || typeof question !== "string" || !answer || typeof answer !== "string") {
      return new Response(JSON.stringify({ error: "Missing question or answer" }), { status: 400, headers });
    }

    // Detect weak answers that warrant follow-up
    const wordCount = answer.trim().split(/\s+/).length;
    const hasMetrics = /\d+%|\$\d|[0-9]+x|[0-9]+ (users|customers|engineers|people|team|million|billion)/i.test(answer);
    const hasPassiveVoice = /(was done|were made|it was|has been|got done|we had)/i.test(answer);
    const lacksFirstPerson = !(/ I /i.test(answer) || /^I /i.test(answer));
    const isShort = wordCount < 40;

    const jdContext = jobDescription ? `The candidate is targeting this role: ${sanitizeForLLM(jobDescription, 500)}. If relevant, probe for skills mentioned in the JD.` : "";
    const previousContext = previousFollowUps && previousFollowUps.length > 0
      ? `\nPrevious follow-up exchange:\n${previousFollowUps.map(s => sanitizeForLLM(s, 300)).join("\n")}`
      : "";

    // Depth 0: probe for detail (existing behavior)
    // Depth 1: challenge / pushback
    // Depth 2: pivot to adjacent competency
    const safeDepth = Math.max(0, Math.min(2, Math.floor(followUpDepth)));
    const followUpTypeLabel = safeDepth === 0 ? "probe_detail" : safeDepth === 1 ? "challenge" : "pivot";

    let depthInstructions: string;
    if (safeDepth === 0) {
      depthInstructions = `Analysis hints (use these to inform your decision):
- Word count: ${wordCount} ${isShort ? "(SHORT — likely needs follow-up)" : ""}
- Contains metrics/numbers: ${hasMetrics ? "yes" : "NO — probe for quantified impact"}
- Uses passive voice: ${hasPassiveVoice ? "YES — probe for their specific role" : "no"}
- Uses first-person 'I': ${lacksFirstPerson ? "NO — probe for individual contribution" : "yes"}

Follow up if ANY of these are true:
- Answer is under 40 words (too brief for a substantive question)
- Answer lacks specific numbers, metrics, or quantified outcomes
- Answer uses passive voice without clarifying their personal role
- Answer is vague or lacks a concrete example (no situation/context described)
- Answer misses a key aspect of the question
- Answer contains an interesting claim worth exploring deeper

Do NOT follow up ONLY if the answer is thorough, specific, uses first-person, includes metrics, and directly addresses the question.`;
    } else if (safeDepth === 1) {
      depthInstructions = `This is a CHALLENGE follow-up (depth 1). You MUST generate a follow-up question — set needsFollowUp to true.

Your goal: Push back on the candidate's answer to test depth of understanding and ownership. Use ONE of these approaches:
- Present a hypothetical failure: "I hear that, but what if [X failed]? How would you have handled it differently?"
- Question the approach: "That's interesting, but couldn't you have achieved the same with [simpler approach]?"
- Probe for individual ownership: "What evidence do you have that YOUR contribution specifically drove that outcome?"
- Test conviction: "Some people would argue [alternative viewpoint]. How would you respond to that?"

Be conversational but firm. 2-3 sentences max.`;
    } else {
      depthInstructions = `This is a PIVOT follow-up (depth 2). You MUST generate a follow-up question — set needsFollowUp to true.

Your goal: Pivot to an adjacent competency area revealed by the candidate's answer. Use ONE of these approaches:
- Leadership/influence: "That shows strong execution. How did you bring your team along on that decision?"
- Learning/growth: "How did that experience shape your approach to [related area]?"
- Cross-functional: "How did you navigate the stakeholder dynamics around that decision?"
- Strategic thinking: "Looking back, what would you do differently if you had to solve that problem at 10x scale?"

Be conversational and genuinely curious. 2-3 sentences max.`;
    }

    const prompt = `You are an expert interviewer. Given a candidate's answer to an interview question, decide if a follow-up question is needed.

Interview type: ${sanitizeForLLM(type, 50) || "behavioral"}
Role: ${sanitizeForLLM(role, 100) || "senior role"}${company ? `\nCompany: ${sanitizeForLLM(company, 100)}` : ""}${jdContext ? `\n${jdContext}` : ""}

Question asked: "${sanitizeForLLM(question, 500)}"
Candidate's answer: "${sanitizeForLLM(answer, 1000)}"${previousContext}

${depthInstructions}

Respond JSON only:
{"needsFollowUp":true/false,"followUpText":"The follow-up question (2-3 sentences, conversational). Only include if needsFollowUp is true.","followUpType":"${followUpTypeLabel}","reason":"Brief reason"}`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 500, jsonMode: true, fast: true }, 8000);
    const parsed = extractJSON<{ needsFollowUp?: boolean; followUpText?: string; followUpType?: string }>(result.text);
    if (!parsed) {
      return new Response(JSON.stringify({ needsFollowUp: false }), { status: 200, headers });
    }

    // Depths 1-2 always generate a follow-up
    const needsFollowUp = safeDepth >= 1 ? true : !!parsed.needsFollowUp;

    return new Response(JSON.stringify({
      needsFollowUp,
      followUpText: parsed.followUpText || "",
      followUpType: followUpTypeLabel,
    }), { status: 200, headers });
  } catch (err) {
    console.error("Follow-up generation error:", err);
    // On any error, just skip the follow-up — don't block the interview
    return new Response(JSON.stringify({ needsFollowUp: false }), { status: 200, headers });
  }
}

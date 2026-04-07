/* Vercel Edge Function — AI Resume Analysis */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, checkSessionLimit, sanitizeForLLM, withRequestId } from "./_shared";
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
  if (await isRateLimited(ip, "analyze-resume", 5, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { resumeText, targetRole } = await req.json();

    if (!resumeText || typeof resumeText !== "string" || resumeText.length < 20) {
      return new Response(JSON.stringify({ error: "Resume text too short" }), { status: 400, headers });
    }
    if (resumeText.length > 50000) {
      return new Response(JSON.stringify({ error: "Resume text too long" }), { status: 400, headers });
    }

    const roleContext = targetRole ? `The candidate is targeting a ${sanitizeForLLM(targetRole, 100)} role.` : "";

    const prompt = `You are an expert career coach. Analyze this resume and produce a structured JSON profile.

Resume text:
"""
${resumeText.slice(0, 3000)}
"""

${roleContext}

Return a JSON object with these exact fields:
{
  "headline": "A single compelling sentence (under 15 words) summarizing who this person is professionally",
  "summary": "A 2-3 sentence professional narrative of the candidate's career arc, strengths, and what makes them stand out. Write in third person.",
  "yearsExperience": number or null if unclear,
  "seniorityLevel": "Entry" | "Mid" | "Senior" | "Staff" | "Lead" | "Director" | "VP" | "C-Suite",
  "topSkills": ["array of their 6-8 strongest technical and leadership skills, ordered by strength"],
  "keyAchievements": ["3-5 specific, quantified accomplishments from the resume — use exact numbers when available"],
  "industries": ["1-3 industries they have experience in"],
  "interviewStrengths": ["2-3 areas where they'll naturally excel in interviews based on their background"],
  "interviewGaps": ["2-3 areas they should prepare more for, framed constructively"],
  "careerTrajectory": "A brief sentence describing their career direction/momentum"
}

Be specific — reference real details from the resume. Don't invent information not present.
Respond with ONLY the JSON object, no markdown or explanation.`;

    const result = await callLLM({ prompt, temperature: 0.4, maxTokens: 1500, jsonMode: true, fast: true }, 10000);
    const profile = extractJSON(result.text);
    if (!profile) {
      return new Response(JSON.stringify({ error: "Failed to parse analysis" }), { status: 500, headers });
    }

    const truncated = resumeText.length > 3000;
    return new Response(JSON.stringify({ profile, truncated }), { status: 200, headers });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    console.error("Resume analysis error:", err);
    return new Response(
      JSON.stringify({ error: isTimeout ? "Analysis timed out — please try again" : "Internal error" }),
      { status: isTimeout ? 504 : 500, headers },
    );
  }
}

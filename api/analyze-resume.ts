/* Vercel Edge Function — AI Resume Analysis via Groq */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (isRateLimited(ip, "analyze-resume", 5, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { resumeText, targetRole } = await req.json();

    if (!resumeText || typeof resumeText !== "string" || resumeText.length < 20) {
      return new Response(JSON.stringify({ error: "Resume text too short" }), { status: 400, headers });
    }

    const roleContext = targetRole ? `The candidate is targeting a ${targetRole} role.` : "";

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

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Groq error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Resume analysis failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    let profile;
    try {
      profile = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        profile = JSON.parse(match[0]);
      } else {
        return new Response(JSON.stringify({ error: "Failed to parse analysis" }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ profile }), { status: 200, headers });
  } catch (err) {
    console.error("Resume analysis error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

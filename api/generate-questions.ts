/* Vercel Edge Function — LLM Interview Question Generation via Google Gemini */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip, "generate", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { type, difficulty, role, company, industry, resumeText, pastTopics } = await req.json();

    const interviewType = type || "behavioral";
    const diff = difficulty || "standard";
    const targetRole = role || "senior engineering leader";

    const companyContext = company ? `The candidate is interviewing at ${company}.` : "";
    const industryContext = industry ? `The industry is ${industry}.` : "";
    const resumeContext = resumeText ? `Resume summary: ${resumeText.slice(0, 1500)}` : "";
    const avoidTopics = pastTopics?.length ? `Avoid repeating these topics from past sessions: ${pastTopics.join(", ")}.` : "";

    const difficultyGuide = diff === "warmup"
      ? "Use a warm, conversational tone. Ask open-ended questions that build confidence. Keep follow-ups gentle."
      : diff === "intense"
        ? "Be rigorous and challenging. Ask probing follow-ups. Expect precise, structured answers. Push for specifics and metrics."
        : "Use a professional, balanced tone. Ask thorough but fair questions with reasonable follow-ups.";

    const prompt = `You are an expert interview coach generating questions for a mock interview.

Role: ${targetRole}
Interview Type: ${interviewType}
${companyContext}
${industryContext}
${resumeContext}
${avoidTopics}

${difficultyGuide}

Generate exactly 7 interview steps in this JSON array format. Each step must have:
- "type": one of "intro", "question", "follow-up", "closing"
- "aiText": the exact text the AI interviewer will speak (2-4 sentences)
- "scoreNote": what to evaluate in the candidate's response (for question/follow-up types)

The sequence must be: intro, question, follow-up, question, follow-up, question, closing.

Make questions specific to the role, company, and industry. If resume text is provided, reference specific experiences from it.

Respond with ONLY the JSON array, no markdown or explanation.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Gemini error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Question generation failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let questions;
    try {
      questions = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        questions = JSON.parse(match[0]);
      } else {
        return new Response(JSON.stringify({ error: "Failed to parse questions" }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ questions }), { status: 200, headers });
  } catch (err) {
    console.error("Question generation error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

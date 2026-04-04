/* Vercel Edge Function — LLM Interview Question Generation via Groq */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, checkSessionLimit, validateOrigin } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!GROQ_API_KEY) {
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
    const { type, difficulty, role, company, industry, resumeText, pastTopics } = await req.json();

    // Sanitize inputs — strip prompt injection attempts
    const sanitize = (s: unknown, maxLen = 200) => {
      if (typeof s !== "string") return "";
      return s
        .replace(/(?:^|\n)\s*(system|assistant|user|human|instruction|<\|im_start\||<\|im_end\|)\s*:?/gi, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\{[^}]*"role"\s*:/gi, "")
        .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)/gi, "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, maxLen)
        .trim();
    };

    const interviewType = sanitize(type, 50) || "behavioral";
    const diff = sanitize(difficulty, 20) || "standard";
    const targetRole = sanitize(role, 100) || "senior engineering leader";

    const companyContext = company ? `The candidate is interviewing at ${sanitize(company, 100)}.` : "";
    const industryContext = industry ? `The industry is ${sanitize(industry, 100)}.` : "";
    const resumeContext = resumeText ? `Resume summary: ${sanitize(resumeText, 1500)}` : "";
    const avoidTopics = Array.isArray(pastTopics) ? `Avoid repeating these topics from past sessions: ${pastTopics.slice(0, 20).map((t: unknown) => sanitize(t, 100)).filter(Boolean).join(", ")}.` : "";

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

    const ac = new AbortController();
    const acTimer = setTimeout(() => ac.abort(), 15_000);
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      signal: ac.signal,
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(acTimer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Groq error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Question generation failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    let questions;
    try {
      const parsed = JSON.parse(text);
      questions = Array.isArray(parsed) ? parsed : parsed.questions || parsed.steps || parsed.interview_steps || Object.values(parsed)[0];
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { questions = JSON.parse(match[0]); } catch {
          return new Response(JSON.stringify({ error: "Failed to parse questions" }), { status: 500, headers });
        }
      } else {
        return new Response(JSON.stringify({ error: "Failed to parse questions" }), { status: 500, headers });
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to generate valid questions" }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ questions }), { status: 200, headers });
  } catch (err) {
    console.error("Question generation error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

/* Vercel Edge Function — LLM Answer Evaluation via Groq */

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

    // Sanitize inputs — strip prompt injection attempts
    const sanitize = (s: unknown, maxLen = 200) => {
      if (typeof s !== "string") return "";
      return s
        .replace(/(?:^|\n)\s*(system|assistant|user|human|instruction|<\|im_start\||<\|im_end\|)\s*:?/gi, "")
        .replace(/```[\s\S]*?```/g, "") // strip markdown code blocks
        .replace(/\{[^}]*"role"\s*:/gi, "") // strip JSON role injection
        .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)/gi, "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
        .slice(0, maxLen)
        .trim();
    };

    const formattedTranscript = transcript
      .slice(0, 50) // cap transcript entries
      .map((t: { speaker: string; text: string }) => `${t.speaker === "ai" ? "INTERVIEWER" : "CANDIDATE"}: ${sanitize(t.text, 2000)}`)
      .join("\n\n");

    const prompt = `You are an expert interview coach evaluating a mock interview performance.

Interview Type: ${sanitize(type, 50) || "behavioral"}
Difficulty: ${sanitize(difficulty, 20) || "standard"}
Target Role: ${sanitize(role, 100) || "senior leader"}
${company ? `Company: ${sanitize(company, 100)}` : ""}

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
  "feedback": "<2-3 paragraph detailed feedback with specific examples from the transcript. Be constructive and actionable. Reference specific answers the candidate gave.>"
}

Scoring guidelines:
- 90-100: Exceptional, hire-ready answers with strong STAR structure, metrics, and impact
- 75-89: Good answers with some areas to strengthen
- 60-74: Adequate but needs significant improvement in structure or depth
- Below 60: Needs substantial practice

Be honest but constructive. Reference specific moments from the transcript.`;

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
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(acTimer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Groq eval error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Evaluation failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    let evaluation;
    try {
      evaluation = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { evaluation = JSON.parse(match[0]); } catch {
          return new Response(JSON.stringify({ error: "Failed to parse evaluation" }), { status: 500, headers });
        }
      } else {
        return new Response(JSON.stringify({ error: "Failed to parse evaluation" }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify(evaluation), { status: 200, headers });
  } catch (err) {
    console.error("Evaluation error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

/* Vercel Edge Function — LLM Answer Evaluation via Google Gemini */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (isRateLimited(ip, "evaluate", 10, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { transcript, type, difficulty, role, company } = await req.json();

    if (!transcript || !Array.isArray(transcript)) {
      return new Response(JSON.stringify({ error: "Missing transcript" }), { status: 400, headers });
    }

    const formattedTranscript = transcript
      .map((t: { speaker: string; text: string }) => `${t.speaker === "ai" ? "INTERVIEWER" : "CANDIDATE"}: ${t.text}`)
      .join("\n\n");

    const prompt = `You are an expert interview coach evaluating a mock interview performance.

Interview Type: ${type || "behavioral"}
Difficulty: ${difficulty || "standard"}
Target Role: ${role || "senior leader"}
${company ? `Company: ${company}` : ""}

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Gemini eval error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Evaluation failed" }), { status: 502, headers });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let evaluation;
    try {
      evaluation = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        evaluation = JSON.parse(match[0]);
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

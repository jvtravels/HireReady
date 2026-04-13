/* Vercel Edge Function — Generate personalized AI coaching insights */

export const config = { runtime: "edge" };

import { callLLM, extractJSON } from "./_llm";
import {
  handleCorsPreflightOrMethod, corsHeaders, verifyAuth,
  unauthorizedResponse, isRateLimited, getClientIp, rateLimitResponse,
  checkBodySize, validateOrigin, withRequestId, getSubscriptionTier,
} from "./_shared";

export default async function handler(req: Request) {
  const preflight = handleCorsPreflightOrMethod(req);
  if (preflight) return preflight;

  const headers = withRequestId(corsHeaders(req));

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  if (checkBodySize(req)) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  const auth = await verifyAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return unauthorizedResponse(headers);
  }

  // Rate limit: 5 insight generations per hour
  const ip = getClientIp(req);
  if (await isRateLimited(ip, "insights", 5, 3600_000)) {
    return rateLimitResponse(headers, 3600);
  }

  // Only paid users get LLM insights
  const tier = await getSubscriptionTier(auth.userId);
  if (tier === "free") {
    return new Response(JSON.stringify({ error: "Upgrade to Pro for AI-powered insights", requiresUpgrade: true }), {
      status: 403, headers,
    });
  }

  try {
    const body = await req.json();
    const { role, company, industry, skills, recentSessions, sessionCount } = body;

    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return new Response(JSON.stringify({ insights: [] }), { status: 200, headers });
    }

    const sessionsContext = Array.isArray(recentSessions)
      ? recentSessions.slice(0, 5).map((s: { type?: string; score?: number; date?: string; topStrength?: string; topWeakness?: string }) => ({
          type: s.type, score: s.score, date: s.date,
          topStrength: s.topStrength, topWeakness: s.topWeakness,
        }))
      : [];

    const prompt = `You are a senior interview coach who has helped hundreds of candidates land roles at top companies. Generate 3-4 personalized, specific coaching insights.

CANDIDATE CONTEXT:
- Target role: ${role || "not specified"}
${company ? `- Target company: ${company}` : ""}
${industry ? `- Industry: ${industry}` : ""}
- Total sessions completed: ${sessionCount || 0}
- Skill scores (0-100): ${JSON.stringify(skills.map((s: { name?: string; score?: number; prev?: number }) => ({ name: s.name, score: s.score, previousScore: s.prev })))}
- Recent sessions: ${JSON.stringify(sessionsContext)}

RULES:
1. Each insight MUST reference specific data (skill names, scores, trends)
2. For strengths: celebrate with specifics, suggest how to leverage in interviews
3. For weaknesses: give ONE concrete, actionable practice exercise
4. Include a role/company-specific tip if company is provided
5. Keep each insight to 1-2 sentences, under 160 characters
6. Be direct and specific — no generic advice like "practice more"

Return a JSON array where each element has:
- "type": one of "strength", "weakness", "tip", "pattern"
- "text": the insight text

Return ONLY the JSON array, no other text.`;

    const result = await callLLM({ prompt, temperature: 0.7, maxTokens: 600, jsonMode: true, fast: true }, 12000);
    const parsed = extractJSON<{ type?: string; text?: string }[]>(result.text);

    if (!Array.isArray(parsed)) {
      console.error("[generate-insights] LLM returned non-array:", typeof parsed);
      return new Response(JSON.stringify({ insights: [], error: "Failed to parse insights" }), { status: 502, headers });
    }

    // Validate and sanitize
    const validTypes = new Set(["strength", "weakness", "tip", "pattern"]);
    const insights = parsed
      .filter(i => i && typeof i.text === "string" && validTypes.has(i.type ?? ""))
      .slice(0, 4)
      .map(i => ({ type: i.type, text: i.text!.slice(0, 200) }));

    return new Response(JSON.stringify({ insights, model: result.model }), { status: 200, headers });
  } catch (err) {
    console.error("[generate-insights] Error:", err);
    return new Response(JSON.stringify({ insights: [], error: "Failed to generate insights" }), { status: 500, headers });
  }
}

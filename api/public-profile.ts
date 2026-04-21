/* Vercel Edge Function — Public profile data for sharing */
/* GET /api/public-profile?userId=xxx → public stats (no auth required) */

export const config = { runtime: "edge" };

import { corsHeaders, validateOrigin, withRequestId, getClientIp } from "./_shared";

declare const process: { env: Record<string, string | undefined> };

const _rateLimit = new Map<string, number[]>();
function checkRate(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (_rateLimit.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  _rateLimit.set(ip, hits);
  return true;
}
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });
  }

  const headers = withRequestId(corsHeaders(req));

  const ip = getClientIp(req);
  if (!checkRate(ip, 30, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400, headers });
  }

  const dbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  try {

  // Fetch profile (limited fields — no sensitive data)
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=name,target_role,target_company,created_at,is_profile_public`,
    { headers: dbHeaders },
  );
  const profiles = await profileRes.json();
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers });
  }

  const profile = profiles[0];

  // Privacy check — only show profile if user has opted in (default: public for backward compat)
  if (profile.is_profile_public === false) {
    return new Response(JSON.stringify({ error: "This profile is private" }), { status: 403, headers });
  }

  // Fetch session stats (aggregated — no raw transcripts)
  const sessionsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(userId)}&select=score,type,skill_scores,created_at&order=created_at.desc&limit=20`,
    { headers: dbHeaders },
  );
  const sessions = await sessionsRes.json();
  const sessionList = Array.isArray(sessions) ? sessions : [];

  const totalSessions = sessionList.length;
  const avgScore = totalSessions > 0 ? Math.round(sessionList.reduce((sum: number, s: { score?: number }) => sum + (s.score || 0), 0) / totalSessions) : 0;

  // Aggregate skill scores
  const skillTotals: Record<string, { sum: number; count: number }> = {};
  for (const s of sessionList) {
    if (s.skill_scores && typeof s.skill_scores === "object") {
      for (const [name, raw] of Object.entries(s.skill_scores)) {
        const score = typeof raw === "number" ? raw : typeof raw === "object" && raw !== null && "score" in (raw as Record<string, unknown>) ? (raw as { score: number }).score : 0;
        if (!skillTotals[name]) skillTotals[name] = { sum: 0, count: 0 };
        skillTotals[name].sum += score;
        skillTotals[name].count++;
      }
    }
  }
  const skills = Object.entries(skillTotals)
    .map(([name, { sum, count }]) => ({ name, score: Math.round(sum / count) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Session type distribution
  const typeCounts: Record<string, number> = {};
  for (const s of sessionList) {
    const t = s.type || "general";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  return new Response(JSON.stringify({
    name: profile.name || "Anonymous",
    targetRole: profile.target_role || "",
    targetCompany: profile.target_company || "",
    memberSince: profile.created_at,
    stats: {
      totalSessions,
      avgScore,
      skills,
      sessionTypes: typeCounts,
    },
  }), {
    status: 200,
    headers: { ...headers, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });

  } catch (err) {
    console.error("[public-profile] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

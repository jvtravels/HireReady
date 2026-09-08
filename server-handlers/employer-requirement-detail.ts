/* Vercel Edge Function — Employer Requirement Detail
 *
 * GET /api/employer-requirement-detail?id=<requirementId>
 *
 * Returns one requirement owned by the caller plus its scored candidate
 * shortlist. Contact-unlock paywall is disabled for now — every match
 * shows full candidate identity (name, email) regardless of the
 * `unlocked` DB flag, which stays wired up for a future re-enable.
 *
 * Candidate fields are limited to what the real schema actually backs:
 * target role, resume-derived city/skills, session count, and last-active
 * recency, plus a normalized `resume` detail block (see
 * _resume-detail-helpers.ts) — summary, employment history, education,
 * and any self-reported notice period / CTC the candidate's own resume
 * text stated. Those last two are exactly what the resume said, not a
 * verified figure, so the UI must label them as self-reported. The
 * mocked-data pass additionally showed an "exclusive to you" flag with no
 * real backing — that one stays dropped rather than fabricated.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId, slog } from "./_shared";
import { extractResumeLocation, explainMatch } from "./_requirement-match-helpers";
import { extractResumeDetail } from "./_resume-detail-helpers";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function serviceHeaders(): Record<string, string> {
  return { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
}

function extractSkills(resumeData: unknown): string[] {
  if (!resumeData || typeof resumeData !== "object") return [];
  const skills = (resumeData as Record<string, unknown>).skills;
  return Array.isArray(skills) ? skills.filter((s): s is string => typeof s === "string").slice(0, 8) : [];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req, { allowGet: true }) });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503, headers: withRequestId(corsHeaders(req, { allowGet: true })),
    });
  }

  const pre = await withAuthAndRateLimit(req, {
    endpoint: "employer-requirement-detail",
    ipLimit: 40,
    userLimit: 20,
    maxBytes: 0,
    checkQuota: false,
    allowGet: true,
  });
  if (pre instanceof Response) return pre;
  const { auth } = pre;
  const headers = { ...pre.headers, ...corsHeaders(req, { allowGet: true }) };

  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const requirementId = new URL(req.url).searchParams.get("id") || "";
  if (!requirementId) {
    return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });
  }

  try {
    const reqRes = await fetch(
      `${SUPABASE_URL}/rest/v1/employer_requirements?id=eq.${encodeURIComponent(requirementId)}&employer_id=eq.${encodeURIComponent(auth.userId)}&select=id,title,location,notice_period_pref,description,status,experience_min,experience_max,due_date,budget_min,budget_max,locations,open_positions,work_mode,skills,responsibilities,nice_to_have,preferred_industry,preferred_colleges,target_companies,perks_and_benefits,created_at`,
      { headers: serviceHeaders() },
    );
    if (!reqRes.ok) throw new Error(`requirement read failed: ${reqRes.status}`);
    const reqRows = (await reqRes.json().catch(() => [])) as Array<{
      id: string; title: string; location: string; notice_period_pref: string; description: string | null; status: string;
      experience_min: number | null; experience_max: number | null; due_date: string | null;
      budget_min: number | null; budget_max: number | null;
      locations: string[] | null; open_positions: number | null; work_mode: string | null; skills: string[] | null;
      responsibilities: string | null; nice_to_have: string | null; preferred_industry: string | null;
      preferred_colleges: string[] | null; target_companies: string[] | null; perks_and_benefits: string[] | null;
      created_at: string;
    }>;
    const requirement = reqRows[0];
    if (!requirement) {
      return new Response(JSON.stringify({ error: "Requirement not found" }), { status: 404, headers });
    }

    const matchesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/requirement_matches?requirement_id=eq.${encodeURIComponent(requirementId)}&select=id,candidate_user_id,match_score,roster_score,unlocked,unlocked_at&order=match_score.desc`,
      { headers: serviceHeaders() },
    );
    if (!matchesRes.ok) throw new Error(`matches read failed: ${matchesRes.status}`);
    const matches = (await matchesRes.json().catch(() => [])) as Array<{
      id: string; candidate_user_id: string; match_score: number; roster_score: number; unlocked: boolean; unlocked_at: string | null;
    }>;

    const candidateIds = matches.map((m) => m.candidate_user_id);
    const profileById = new Map<string, { name: string; email: string; target_role: string; resume_data: unknown; practice_timestamps: string[] }>();
    if (candidateIds.length > 0) {
      const idParam = candidateIds.map((id) => encodeURIComponent(id)).join(",");
      const profilesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=in.(${idParam})&select=id,name,email,target_role,resume_data,practice_timestamps`,
        { headers: serviceHeaders() },
      );
      if (profilesRes.ok) {
        const rows = (await profilesRes.json().catch(() => [])) as Array<{
          id: string; name: string; email: string; target_role: string; resume_data: unknown; practice_timestamps: string[];
        }>;
        for (const r of rows) profileById.set(r.id, r);
      }
    }

    const sessionCounts = new Map<string, number>();
    if (candidateIds.length > 0) {
      const idParam = candidateIds.map((id) => encodeURIComponent(id)).join(",");
      const sessionsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?user_id=in.(${idParam})&select=user_id`,
        { headers: serviceHeaders() },
      );
      if (sessionsRes.ok) {
        const rows = (await sessionsRes.json().catch(() => [])) as Array<{ user_id: string }>;
        for (const r of rows) sessionCounts.set(r.user_id, (sessionCounts.get(r.user_id) || 0) + 1);
      }
    }

    const candidates = matches.map((m) => {
      const profile = profileById.get(m.candidate_user_id);
      const timestamps = Array.isArray(profile?.practice_timestamps) ? profile!.practice_timestamps : [];
      const lastActive = timestamps.length ? timestamps[timestamps.length - 1] : null;
      const lastActiveDaysAgo = lastActive ? Math.max(0, Math.round((Date.now() - new Date(lastActive).getTime()) / 86_400_000)) : -1;
      const resumeDetail = extractResumeDetail(profile?.resume_data);
      const matchBreakdown = explainMatch(
        { target_role: profile?.target_role ?? null, resume_data: profile?.resume_data ?? null },
        { title: requirement.title, location: requirement.location, description: requirement.description || "" },
      );

      return {
        id: m.id,
        name: profile?.name || "Candidate",
        targetRole: profile?.target_role || "Not specified",
        city: extractResumeLocation(profile?.resume_data) || "Not specified",
        matchScore: m.match_score,
        rosterScore: m.roster_score,
        matchBreakdown,
        sessionsCompleted: sessionCounts.get(m.candidate_user_id) || 0,
        lastActiveDaysAgo,
        skills: extractSkills(profile?.resume_data),
        unlocked: true,
        contact: profile ? { email: profile.email, phone: resumeDetail.phone || undefined } : undefined,
        resume: resumeDetail,
      };
    });

    return new Response(
      JSON.stringify({
        id: requirement.id,
        title: requirement.title,
        location: requirement.location,
        noticePeriodPref: requirement.notice_period_pref,
        description: requirement.description || "",
        status: requirement.status,
        experienceMin: requirement.experience_min,
        experienceMax: requirement.experience_max,
        dueDate: requirement.due_date ? requirement.due_date.slice(0, 10) : null,
        budgetMin: requirement.budget_min,
        budgetMax: requirement.budget_max,
        locations: requirement.locations ?? [],
        openPositions: requirement.open_positions,
        workMode: requirement.work_mode,
        skills: requirement.skills ?? [],
        responsibilities: requirement.responsibilities || "",
        niceToHave: requirement.nice_to_have || "",
        preferredIndustry: requirement.preferred_industry || "",
        preferredColleges: requirement.preferred_colleges ?? [],
        targetCompanies: requirement.target_companies ?? [],
        perksAndBenefits: requirement.perks_and_benefits ?? [],
        createdAt: requirement.created_at.slice(0, 10),
        candidates,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog.error("employer-requirement-detail GET threw", { code: "employer_requirement_detail_unexpected_error", error: msg.slice(0, 200), userId: auth.userId, requirementId });
    return new Response(JSON.stringify({ error: "Failed to load requirement" }), { status: 500, headers });
  }
}

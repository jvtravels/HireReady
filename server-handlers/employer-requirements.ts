/* Vercel Edge Function — Employer Requirements
 *
 * GET  /api/employer-requirements → list of the caller's requirements
 *      (newest first), each with its matched-candidate count.
 * POST /api/employer-requirements { title, location, noticePeriodPref?,
 *      description? } → creates a requirement, then synchronously scores
 *      it against the real, consent-gated candidate pool
 *      (profiles.is_discoverable_to_employers = true) using the
 *      deterministic heuristic in _requirement-match-helpers.ts, persists
 *      requirement_matches, and returns the requirement with its final
 *      status (ready/partial/zero/failed).
 *
 * Requires an approved employer row — see employer-profile.ts.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId, slog } from "./_shared";
import {
  scoreCandidateMatch,
  classifyRequirementStatus,
  rankAndCap,
  type CandidatePoolRow,
} from "./_requirement-match-helpers";
import {
  asBoundedString,
  asBoundedStringArray,
  asBoundedExperience,
  asBoundedDueDate,
  asBoundedBudget,
  asBoundedOpenPositions,
  asBoundedWorkMode,
  isValidRequirementInput,
  buildRequirementsListResponse,
  countMatchesByRequirement,
  averageScoresByUser,
  daysSinceLastActive,
  type RequirementRow,
} from "./_employer-requirements-helpers";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function serviceHeaders(): Record<string, string> {
  return { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
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
    endpoint: "employer-requirements",
    ipLimit: 20,
    userLimit: 10,
    maxBytes: 20_000,
    checkQuota: false,
    allowGet: true,
  });
  if (pre instanceof Response) return pre;
  const { auth } = pre;
  const headers = { ...pre.headers, ...corsHeaders(req, { allowGet: true }) };

  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  if (req.method === "GET") return handleGet(auth.userId, headers);
  if (req.method === "POST") return handlePost(req, auth.userId, headers);
  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}

async function handleGet(userId: string, headers: Record<string, string>): Promise<Response> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/employer_requirements?employer_id=eq.${encodeURIComponent(userId)}&select=id,title,location,notice_period_pref,status,experience_min,experience_max,due_date,budget_min,budget_max,locations,open_positions,work_mode,skills,created_at&order=created_at.desc`,
      { headers: serviceHeaders() },
    );
    if (!res.ok) throw new Error(`requirements read failed: ${res.status}`);
    const rows = (await res.json().catch(() => [])) as RequirementRow[];

    const ids = rows.map((r) => r.id);
    let countsByRequirement = new Map<string, number>();
    if (ids.length > 0) {
      const idParam = ids.map((id) => encodeURIComponent(id)).join(",");
      const matchesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/requirement_matches?requirement_id=in.(${idParam})&select=requirement_id,match_score`,
        { headers: serviceHeaders() },
      );
      if (matchesRes.ok) {
        const matchRows = (await matchesRes.json().catch(() => [])) as Array<{ requirement_id: string; match_score: number }>;
        countsByRequirement = countMatchesByRequirement(matchRows);
      }
    }

    const requirements = buildRequirementsListResponse(rows, countsByRequirement);

    return new Response(JSON.stringify({ requirements }), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog.error("employer-requirements GET threw", { code: "employer_requirements_get_unexpected_error", error: msg.slice(0, 200), userId });
    return new Response(JSON.stringify({ error: "Failed to load requirements" }), { status: 500, headers });
  }
}

async function handlePost(req: Request, userId: string, headers: Record<string, string>): Promise<Response> {
  let body: {
    title?: unknown; location?: unknown; noticePeriodPref?: unknown; description?: unknown;
    experienceMin?: unknown; experienceMax?: unknown; dueDate?: unknown;
    budgetMin?: unknown; budgetMax?: unknown;
    locations?: unknown; openPositions?: unknown; workMode?: unknown; skills?: unknown;
    responsibilities?: unknown; niceToHave?: unknown; preferredIndustry?: unknown;
    preferredColleges?: unknown; targetCompanies?: unknown; perksAndBenefits?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const title = asBoundedString(body.title, 200);
  const noticePeriodPref = asBoundedString(body.noticePeriodPref, 60) || "Any";
  const description = asBoundedString(body.description, 5000);
  const experienceMin = asBoundedExperience(body.experienceMin);
  const experienceMax = asBoundedExperience(body.experienceMax);
  const dueDate = asBoundedDueDate(body.dueDate);
  const budgetMin = asBoundedBudget(body.budgetMin);
  const budgetMax = asBoundedBudget(body.budgetMax);
  const locations = asBoundedStringArray(body.locations, 20, 100);
  const openPositions = asBoundedOpenPositions(body.openPositions);
  const workMode = asBoundedWorkMode(body.workMode);
  const skills = asBoundedStringArray(body.skills, 40, 60);
  const responsibilities = asBoundedString(body.responsibilities, 2000);
  const niceToHave = asBoundedString(body.niceToHave, 2000);
  const preferredIndustry = asBoundedString(body.preferredIndustry, 120);
  const preferredColleges = asBoundedStringArray(body.preferredColleges, 20, 100);
  const targetCompanies = asBoundedStringArray(body.targetCompanies, 20, 100);
  const perksAndBenefits = asBoundedStringArray(body.perksAndBenefits, 20, 100);
  const location = locations.join(", ");

  if (!isValidRequirementInput(title, locations, description)) {
    return new Response(JSON.stringify({ error: "title, at least one location, and a role description (min 20 characters) are required" }), { status: 400, headers });
  }

  try {
    const employerRes = await fetch(
      `${SUPABASE_URL}/rest/v1/employers?id=eq.${encodeURIComponent(userId)}&select=status`,
      { headers: serviceHeaders() },
    );
    const employerRows = (await employerRes.json().catch(() => [])) as Array<{ status: string }>;
    if (!employerRes.ok || !employerRows[0] || employerRows[0].status !== "approved") {
      return new Response(JSON.stringify({ error: "Employer profile is not approved" }), { status: 403, headers });
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/employer_requirements`, {
      method: "POST",
      headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify([{
        employer_id: userId, title, location, notice_period_pref: noticePeriodPref, description, status: "generating",
        experience_min: experienceMin, experience_max: experienceMax, due_date: dueDate,
        budget_min: budgetMin, budget_max: budgetMax,
        locations, open_positions: openPositions, work_mode: workMode, skills,
        responsibilities, nice_to_have: niceToHave, preferred_industry: preferredIndustry,
        preferred_colleges: preferredColleges, target_companies: targetCompanies,
        perks_and_benefits: perksAndBenefits,
      }]),
    });
    if (!insertRes.ok) {
      const t = await insertRes.text().catch(() => "");
      slog.error("employer-requirements insert failed", { code: "employer_requirements_insert_failed", httpStatus: insertRes.status, body: t.slice(0, 200), userId });
      return new Response(JSON.stringify({ error: "Failed to create requirement" }), { status: 500, headers });
    }
    const inserted = (await insertRes.json()) as RequirementRow[];
    const requirement = inserted[0];

    const finalStatus = await runMatching(requirement.id, { title, location, description }, userId);

    return new Response(
      JSON.stringify({
        id: requirement.id,
        title: requirement.title,
        location: requirement.location,
        noticePeriodPref: requirement.notice_period_pref,
        status: finalStatus,
        experienceMin: requirement.experience_min ?? null,
        experienceMax: requirement.experience_max ?? null,
        dueDate: requirement.due_date ?? null,
        budgetMin: requirement.budget_min ?? null,
        budgetMax: requirement.budget_max ?? null,
        locations: requirement.locations ?? [],
        openPositions: requirement.open_positions ?? null,
        workMode: requirement.work_mode ?? null,
        skills: requirement.skills ?? [],
        createdAt: requirement.created_at.slice(0, 10),
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog.error("employer-requirements POST threw", { code: "employer_requirements_post_unexpected_error", error: msg.slice(0, 200), userId });
    return new Response(JSON.stringify({ error: "Failed to create requirement" }), { status: 500, headers });
  }
}

/** Scores the real candidate pool against a freshly created requirement,
    persists requirement_matches, and PATCHes the requirement's final
    status. Returns that status. Any failure here is caught and recorded
    as a "failed" requirement rather than left stuck on "generating". */
async function runMatching(requirementId: string, req: { title: string; location: string; description: string }, ownerUserId: string): Promise<string> {
  try {
    const poolRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?is_discoverable_to_employers=eq.true&id=neq.${encodeURIComponent(ownerUserId)}&select=id,name,target_role,industry,resume_data,practice_timestamps`,
      { headers: serviceHeaders() },
    );
    if (!poolRes.ok) throw new Error(`candidate pool read failed: ${poolRes.status}`);
    const pool = (await poolRes.json().catch(() => [])) as Array<{
      id: string; name: string; target_role: string | null; industry: string | null;
      resume_data: unknown; practice_timestamps: string[] | null;
    }>;

    const scores = new Map<string, number>();
    const sessionCounts = new Map<string, number>();
    if (pool.length > 0) {
      const idParam = pool.map((p) => encodeURIComponent(p.id)).join(",");
      const sessionsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?user_id=in.(${idParam})&select=user_id,score`,
        { headers: serviceHeaders() },
      );
      if (sessionsRes.ok) {
        const sessionRows = (await sessionsRes.json().catch(() => [])) as Array<{ user_id: string; score: number }>;
        for (const [uid, avg] of averageScoresByUser(sessionRows)) scores.set(uid, avg);
        for (const s of sessionRows) sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) || 0) + 1);
      }
    }

    const candidateRows: CandidatePoolRow[] = pool.map((p) => {
      const timestamps = Array.isArray(p.practice_timestamps) ? p.practice_timestamps : [];
      return {
        id: p.id,
        name: p.name,
        target_role: p.target_role,
        industry: p.industry,
        resume_data: p.resume_data,
        avg_score: scores.get(p.id) ?? null,
        sessions_completed: sessionCounts.get(p.id) || 0,
        last_active_days_ago: daysSinceLastActive(timestamps, Date.now()),
      };
    });

    const scored = candidateRows.map((c) => scoreCandidateMatch(c, req));
    const ranked = rankAndCap(scored);

    if (ranked.length > 0) {
      const rows = ranked.map((m) => ({
        requirement_id: requirementId,
        candidate_user_id: m.candidateId,
        match_score: m.matchScore,
        roster_score: m.rosterScore,
      }));
      const insertMatchesRes = await fetch(`${SUPABASE_URL}/rest/v1/requirement_matches`, {
        method: "POST",
        headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!insertMatchesRes.ok) throw new Error(`requirement_matches insert failed: ${insertMatchesRes.status}`);
    }

    const finalStatus = classifyRequirementStatus(ranked);
    await fetch(`${SUPABASE_URL}/rest/v1/employer_requirements?id=eq.${encodeURIComponent(requirementId)}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: finalStatus }),
    });
    return finalStatus;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog.error("employer-requirements matching threw", { code: "employer_requirements_matching_failed", error: msg.slice(0, 200), requirementId });
    await fetch(`${SUPABASE_URL}/rest/v1/employer_requirements?id=eq.${encodeURIComponent(requirementId)}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed" }),
    }).catch(() => {});
    return "failed";
  }
}

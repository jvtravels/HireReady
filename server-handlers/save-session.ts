/* Vercel Edge Function — Save Session
 *
 * Single authoritative endpoint for persisting a completed interview session
 * AND bumping the user's practice_timestamps in one server-to-server call.
 *
 * Why this exists:
 *   The previous path used supabase-js directly from the browser, which goes
 *   through window.fetch. A material fraction of users run extensions (Loom,
 *   Jam.dev, Hotjar, session-replay tools) that wrap fetch and silently hang
 *   authenticated POSTs above a small body-size threshold. Transcripts +
 *   jd_analysis + skill_scores routinely cross that threshold, so "session
 *   completed but nothing in the sessions table, nothing in practice_timestamps"
 *   was reproducible in the wild. Routing through our own endpoint via the
 *   XHR-based apiClient bypasses those wrappers.
 *
 * Additionally, doing the session insert and the practice_timestamps append
 * in the same request eliminates the race between two independent writes
 * that each have their own failure modes.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";
import { computeCurrentStreak, pickStreakMilestone } from "./_streak-reward";
import { resolveActiveResumeVersionId } from "./_resume-versioning";
import { captureServerEvent, distinctIdFrom } from "./_posthog";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface SessionBody {
  id?: unknown;
  date?: unknown;
  type?: unknown;
  difficulty?: unknown;
  focus?: unknown;
  duration?: unknown;
  score?: unknown;
  questions?: unknown;
  transcript?: unknown;
  ai_feedback?: unknown;
  skill_scores?: unknown;
  job_description?: unknown;
  jd_analysis?: unknown;
  // Optional: client can send the version id it was using when the
  // session started. Falls back to resolveActiveResumeVersionId on the
  // server if not provided. Either way, immutable once written —
  // re-uploading a resume after the session never re-binds the row.
  resume_version_id?: unknown;
}

function asString(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export default async function handler(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  // Transcripts + skill_scores + jd_analysis can be sizeable — cap at 500 KB
  // which is generous for a 30-minute interview with full per-turn transcript.
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "save-session",
    ipLimit: 30,
    userLimit: 15,
    maxBytes: 500_000,
    checkQuota: false,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  if (!auth.userId || typeof auth.userId !== "string") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: SessionBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  // Pin the resume_version_id used to generate this session's questions
  // so scores stay reproducible if the user later re-uploads. Prefer the
  // value the client sent (captured at session start); fall back to
  // looking up whatever resume is currently active for this user. Null
  // is acceptable — sessions can run with no resume.
  const clientVersionId = typeof body.resume_version_id === "string" && /^[0-9a-f-]{32,}$/i.test(body.resume_version_id)
    ? body.resume_version_id
    : null;
  const resolvedVersionId = clientVersionId
    || await resolveActiveResumeVersionId(SUPABASE_URL, SUPABASE_SERVICE_KEY, auth.userId, asString(body.type, 64));

  const sessionRow = {
    id: asString(body.id, 64),
    user_id: auth.userId,
    date: asString(body.date, 64) || new Date().toISOString(),
    type: asString(body.type, 64),
    difficulty: asString(body.difficulty, 32),
    focus: asString(body.focus, 128),
    duration: asNumber(body.duration),
    score: asNumber(body.score),
    questions: asNumber(body.questions),
    transcript: Array.isArray(body.transcript) ? body.transcript : [],
    ai_feedback: asString(body.ai_feedback, 20000),
    skill_scores: (body.skill_scores && typeof body.skill_scores === "object") ? body.skill_scores : null,
    job_description: asString(body.job_description, 20000) || null,
    jd_analysis: (body.jd_analysis && typeof body.jd_analysis === "object") ? body.jd_analysis : null,
    resume_version_id: resolvedVersionId,
  };

  if (!sessionRow.id) {
    return new Response(JSON.stringify({ error: "Missing session id" }), { status: 400, headers });
  }

  const t0 = Date.now();

  // 1. Insert the session row. Column-stripping retry for environments where
  //    jd_analysis / job_description haven't been migrated yet.
  const strippedSession: string[] = [];
  const row: Record<string, unknown> = { ...sessionRow };
  let sessionOk = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
    });
    if (res.ok) { sessionOk = true; break; }
    const errText = await res.text().catch(() => "");
    const missingCol = errText.match(/Could not find the '(\w+)' column/)?.[1]
      || errText.match(/column "(\w+)" of .* does not exist/i)?.[1]
      || errText.match(/column sessions\.(\w+) does not exist/i)?.[1];
    if (missingCol && missingCol in row && missingCol !== "id" && missingCol !== "user_id") {
      strippedSession.push(missingCol);
      delete row[missingCol];
      continue;
    }
    console.error(`[save-session] session insert failed HTTP ${res.status}: ${errText.slice(0, 300)}`);
    return new Response(JSON.stringify({
      error: "Session save failed",
      details: errText.slice(0, 300),
      strippedColumns: strippedSession,
    }), { status: res.status >= 400 && res.status < 500 ? 400 : 502, headers });
  }

  if (!sessionOk) {
    return new Response(JSON.stringify({
      error: "Session save failed after retries",
      strippedColumns: strippedSession,
    }), { status: 500, headers });
  }

  // 2. Atomically append a timestamp to practice_timestamps AND evaluate
  //    streak milestones for a reward. Read-modify-write with the service
  //    role — not ideal for high concurrency but a user only completes one
  //    session at a time, so races aren't real here.
  const nowIso = new Date().toISOString();
  let practiceAppended = false;
  let streakReward: { milestone: number; bonusCredits: number } | null = null;
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}&select=practice_timestamps,session_credits,last_streak_reward_day`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    if (getRes.ok) {
      const arr = await getRes.json().catch(() => []);
      const row = Array.isArray(arr) && arr[0] ? arr[0] : {};
      const existing: string[] = Array.isArray(row.practice_timestamps) ? row.practice_timestamps : [];
      const currentCredits: number = typeof row.session_credits === "number" ? row.session_credits : 0;
      const lastRewardDay: number = typeof row.last_streak_reward_day === "number" ? row.last_streak_reward_day : 0;

      // Cap at 500 entries to keep the column small; the oldest are least useful.
      const next = [...existing, nowIso].slice(-500);

      // Streak math extracted to ./_streak-reward.ts and unit-tested.
      const streakDays = computeCurrentStreak(next);
      const awardedMilestone = pickStreakMilestone(streakDays, lastRewardDay);

      const patch: Record<string, unknown> = {
        practice_timestamps: next,
        has_completed_onboarding: true,
      };
      if (awardedMilestone > 0) {
        patch.session_credits = currentCredits + 1;
        patch.last_streak_reward_day = awardedMilestone;
        streakReward = { milestone: awardedMilestone, bonusCredits: 1 };
      }

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(patch),
        },
      );
      if (patchRes.ok) {
        practiceAppended = true;
      } else {
        const t = await patchRes.text().catch(() => "");
        // If the reward columns are missing in this environment, retry without
        // them so we still persist the timestamp — reward is a bonus, not core.
        if (awardedMilestone > 0 && /session_credits|last_streak_reward_day/.test(t)) {
          console.warn(`[save-session] reward columns missing; retrying core patch only`);
          const retry = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ practice_timestamps: next, has_completed_onboarding: true }),
            },
          );
          if (retry.ok) { practiceAppended = true; streakReward = null; }
        } else {
          console.warn(`[save-session] practice_timestamps patch failed HTTP ${patchRes.status}: ${t.slice(0, 200)}`);
        }
      }
    } else {
      console.warn(`[save-session] profile read failed HTTP ${getRes.status}`);
    }
  } catch (err) {
    console.warn(`[save-session] practice_timestamps update threw: ${(err as Error).message}`);
  }

  console.log(`[save-session] OK user=${auth.userId.slice(0, 8)} session=${sessionRow.id.slice(0, 8)} practiceAppended=${practiceAppended} streakReward=${streakReward ? streakReward.milestone : "-"} stripped=${strippedSession.join(",") || "-"} latency=${Date.now() - t0}ms`);

  await captureServerEvent("interview_completed", distinctIdFrom(req, auth.userId), {
    session_id: sessionRow.id,
    streak_milestone: streakReward?.milestone ?? null,
    practice_appended: practiceAppended,
  }, req);

  return new Response(JSON.stringify({
    ok: true,
    sessionId: sessionRow.id,
    practiceAppended,
    timestamp: nowIso,
    strippedColumns: strippedSession,
    streakReward, // { milestone, bonusCredits } or null — client can show a toast
  }), { status: 200, headers });
}

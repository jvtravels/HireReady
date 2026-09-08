/* Vercel Edge Function — Record Session Start
 *
 * Appends the current timestamp to practice_timestamps the moment a
 * candidate enters /interview, NOT when the session completes. This
 * matches user expectation ("if I started, I used a session") and
 * closes the loophole where users could test-drive sessions without
 * affecting their quota.
 *
 * Pairs with save-session.ts which now checks started_session_ids
 * before appending — if the session was already recorded at start,
 * the completion path skips the practice_timestamps bump.
 *
 * POST /api/record-session-start { sessionId, type? }
 *
 * Idempotent: if sessionId already in started_session_ids for this
 * user, returns ok without re-appending. Safe to call from engine
 * useEffect even with React StrictMode double-mount.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId, slog, checkSessionLimit } from "./_shared";
import { detectConcurrentSession } from "./_record-session-start-helpers";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface StartBody {
  sessionId?: unknown;
  type?: unknown;
}

function asString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503, headers: withRequestId(corsHeaders(req)),
    });
  }

  /* Lightweight limits — this fires once per session start. The user
     limit is intentionally low (5/min) to prevent script abuse, but
     should never bother a real user. */
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "record-session-start",
    ipLimit: 20,
    userLimit: 5,
    maxBytes: 2_000,
    checkQuota: false,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  if (!auth.userId || typeof auth.userId !== "string") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: StartBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const sessionId = asString(body.sessionId, 64);
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers });
  }

  /* Read profile, check if this session was already recorded as
     started, append if not. The 90-day filter on started_session_ids
     keeps the column small — older entries get pruned on each write. */
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(auth.userId)}&select=practice_timestamps,started_session_ids,started_session_ts`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    if (!getRes.ok) {
      slog.error("record-session-start profile read failed", {
        code: "record_session_start_profile_read_failed",
        httpStatus: getRes.status,
        userId: auth.userId,
        sessionId,
      });
      return new Response(JSON.stringify({ ok: false, recorded: false }), { status: 500, headers });
    }
    const arr = await getRes.json().catch(() => []);
    const row = Array.isArray(arr) && arr[0] ? arr[0] : {};
    const existingStarts: string[] = Array.isArray(row.started_session_ids) ? row.started_session_ids : [];
    /* B-EMP1: timestamps for existingStarts, same order/cap as started_session_ids,
       used only to decide whether an unsaved prior start is still "in-flight" for
       the concurrent-session check below. Column may not exist pre-migration —
       falls back to no known timestamps (never flagged concurrent, see helper). */
    const existingStartTs: string[] = Array.isArray(row.started_session_ts) ? row.started_session_ts : [];
    const startedAtById: Record<string, string> = {};
    existingStarts.forEach((id, i) => {
      if (existingStartTs[i]) startedAtById[id] = existingStartTs[i];
    });

    /* Idempotency: if this sessionId was already recorded, return ok
       without re-appending or re-checking credits. Handles React StrictMode
       double-mount and any client retry — credit was already spent on the
       first call that inserted this session into started_session_ids. */
    if (existingStarts.includes(sessionId)) {
      return new Response(JSON.stringify({ ok: true, allowed: true, recorded: false, reason: "already counted" }), { status: 200, headers });
    }

    // S9-B24 — session credit enforcement gate. Credit deduction moved here
    // from generate-questions (which fired on page mount, burning a credit
    // before the user answered anything). Placement here is correct because:
    // (a) idempotency on sessionId ensures at most one deduction per session,
    // (b) this fires at the same semantic moment as the practice_timestamps
    //     bump ("user entered the interview"), not at question pre-fetch time,
    // (c) the 403 response redirects the user to the upgrade modal before the
    //     interview UI becomes interactive — no transcript is created.
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const limit = await checkSessionLimit(auth.userId, { consumeCredit: true });
      if (!limit.allowed) {
        slog.warn("record-session-start credit gate blocked", {
          code: "record_session_start_credit_gate_blocked",
          userId: auth.userId,
          sessionId,
          reason: limit.reason,
        });
        return new Response(JSON.stringify({ ok: false, allowed: false, reason: limit.reason }), { status: 403, headers });
      }
    }

    // OA-B50: detect concurrent sessions across devices. BroadcastChannel
    // only guards same-browser tabs; mobile + desktop running simultaneously
    // can't detect each other client-side. The server check: if any recent
    // started IDs are not yet present in the sessions table, they're in-flight
    // on another device. Non-critical — soft warning only, never blocks.
    let concurrent = false;
    const recentPriorStarts = existingStarts.filter(id => id !== sessionId).slice(-5);
    if (recentPriorStarts.length > 0) {
      try {
        const idParam = recentPriorStarts.map(id => encodeURIComponent(id)).join(",");
        const sessionsCheckRes = await fetch(
          `${SUPABASE_URL}/rest/v1/sessions?id=in.(${idParam})&select=id`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } },
        );
        if (sessionsCheckRes.ok) {
          const savedRows = await sessionsCheckRes.json().catch(() => []);
          const savedIds = new Set<string>(
            Array.isArray(savedRows) ? savedRows.map((r: { id: string }) => r.id) : [],
          );
          concurrent = detectConcurrentSession({
            existingStarts,
            currentSessionId: sessionId,
            savedSessionIds: savedIds,
            startedAtById,
          });
        }
      } catch { /* non-critical — never block session start */ }
    }

    const existingTimestamps: string[] = Array.isArray(row.practice_timestamps) ? row.practice_timestamps : [];
    const nowIso = new Date().toISOString();
    /* Cap at 500 timestamps + 50 session-id IDs — both bounds match
       the existing save-session.ts cap pattern. */
    const nextTimestamps = [...existingTimestamps, nowIso].slice(-500);
    const nextStarts = [...existingStarts, sessionId].slice(-50);
    /* Same cap as nextStarts (50) so the two arrays stay index-aligned —
       startedAtById is rebuilt from them by position on the next call. */
    const nextStartTs = [...existingStartTs, nowIso].slice(-50);

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
        body: JSON.stringify({
          practice_timestamps: nextTimestamps,
          started_session_ids: nextStarts,
          started_session_ts: nextStartTs,
          has_completed_onboarding: true,
        }),
      },
    );

    if (!patchRes.ok) {
      const t = await patchRes.text().catch(() => "");
      /* Schema may not yet have started_session_ids/started_session_ts columns —
         retry without them so the practice_timestamps bump still happens. */
      if (/started_session_ids|started_session_ts/.test(t)) {
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
            body: JSON.stringify({ practice_timestamps: nextTimestamps, has_completed_onboarding: true }),
          },
        );
        /* Deliberate soft case: started_session_ids column not yet
           migrated. Stays a 200 so the client/engine doesn't treat it
           as a hard error, but emit a structured signal so a monitor
           can alarm that the migration is still pending. */
        slog.warn("record-session-start schema migration pending", {
          code: "record_session_start_schema_migration_pending",
          retryOk: retry.ok,
          retryHttpStatus: retry.status,
          userId: auth.userId,
          sessionId,
        });
        return new Response(JSON.stringify({ ok: retry.ok, allowed: true, recorded: retry.ok, schemaMigrationPending: true }), { status: 200, headers });
      }
      slog.error("record-session-start patch failed", {
        code: "record_session_start_patch_failed",
        httpStatus: patchRes.status,
        body: t.slice(0, 200),
        userId: auth.userId,
        sessionId,
      });
      return new Response(JSON.stringify({ ok: false, recorded: false }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true, allowed: true, recorded: true, concurrent }), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    slog.error("record-session-start threw", {
      code: "record_session_start_unexpected_error",
      error: msg.slice(0, 200),
      userId: auth.userId,
      sessionId,
    });
    return new Response(JSON.stringify({ ok: false, recorded: false, error: msg }), { status: 500, headers });
  }
}

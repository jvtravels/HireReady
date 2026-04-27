/* Vercel Edge Function — Report Sharing
 *
 * POST   /api/share-report?action=create    auth required
 *   body: { sessionId, ttlDays?, includeTranscript?, includePerQuestion? }
 *   → { token, expiresAt, url }
 *
 * POST   /api/share-report?action=revoke    auth required
 *   body: { token }
 *   → { ok: true }
 *
 * POST   /api/share-report?action=list      auth required
 *   body: {}
 *   → { shares: [{ token, sessionId, expiresAt, viewCount, revokedAt? }] }
 *
 * GET    /api/share-report?token=xxx        public (no auth)
 *   → { report, meta, expiresAt }
 *
 * The public read path (action=read) returns a sanitized report: PII like
 * transcripts and per-question answer text is stripped UNLESS the share
 * was created with includeTranscript / includePerQuestion = true.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DEFAULT_TTL_DAYS = 14;
const MAX_TTL_DAYS = 90;

function generateToken(): string {
  // 24-byte random → 32-char base64url. Cryptographically random, URL-safe,
  // long enough to be unguessable without rate limiting.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function supa(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  });
}

interface CreatePayload {
  sessionId: string;
  ttlDays?: number;
  includeTranscript?: boolean;
  includePerQuestion?: boolean;
}

interface ShareRow {
  token: string;
  session_id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  include_transcript: boolean;
  include_per_question: boolean;
  created_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  date: string;
  type: string;
  difficulty: string;
  duration: number;
  score: number;
  transcript: Array<{ speaker: string; text: string }>;
  ai_feedback: string;
  skill_scores: Record<string, unknown> | null;
  report_json: Record<string, unknown> | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  target_role: string | null;
  target_company: string | null;
}

/**
 * Strip sensitive fields from the report before returning it publicly.
 * Owner-controlled flags can opt PII back in (e.g. include_transcript=true
 * for a recruiter who wants to see the full answer).
 */
function sanitizeReport(
  rawReport: Record<string, unknown> | null,
  flags: { includeTranscript: boolean; includePerQuestion: boolean },
): Record<string, unknown> | null {
  if (!rawReport) return null;
  const out: Record<string, unknown> = { ...rawReport };

  // Always strip raw transcripts unless explicitly opted in.
  if (!flags.includeTranscript) {
    delete out.transcript;
  }

  // Per-question content has the most PII (verbatim answers, embedded names).
  // Strip answerText/restructured/topPerformerAnswer unless owner opted in.
  if (!flags.includePerQuestion && Array.isArray(out.perQuestion)) {
    out.perQuestion = (out.perQuestion as Array<Record<string, unknown>>).map((pq) => {
      const stripped = { ...pq };
      delete stripped.answerText;
      delete stripped.restructured;
      delete stripped.topPerformerAnswer;
      return stripped;
    });
  }

  // Wins/fixes quotes can leak PII — strip the quote, keep the coaching text.
  for (const key of ["wins", "fixes"] as const) {
    if (Array.isArray(out[key])) {
      out[key] = (out[key] as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        quote: flags.includeTranscript ? item.quote : "",
      }));
    }
  }

  // Red-flag quotes: same rule.
  if (Array.isArray(out.redFlags)) {
    out.redFlags = (out.redFlags as Array<Record<string, unknown>>).map((rf) => ({
      ...rf,
      quote: flags.includeTranscript ? rf.quote : "",
    }));
  }

  return out;
}

export default async function handler(req: Request): Promise<Response> {
  // Manual OPTIONS handling — handleCorsPreflightOrMethod rejects non-POST.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  const headers = withRequestId(corsHeaders(req));
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Not configured" }), { status: 503, headers });
  }

  const url = new URL(req.url);

  // ── Public read path (no auth required) ─────────────────────
  if (req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token || typeof token !== "string" || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid share link" }), { status: 404, headers });
    }
    return await readShare(token, headers);
  }

  // ── Authenticated paths (create / revoke / list) ────────────
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "share-report",
    ipLimit: 30,
    userLimit: 20,
    checkQuota: false,
    maxBytes: 8_000,
  });
  if (pre instanceof Response) return pre;
  const { auth } = pre;

  const action = url.searchParams.get("action") || "create";

  try {
    switch (action) {
      case "create":  return await createShare(req, auth.userId!, headers);
      case "revoke":  return await revokeShare(req, auth.userId!, headers);
      case "list":    return await listShares(auth.userId!, headers);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[share-report] ${action} failed: ${msg.slice(0, 200)}`);
    return new Response(JSON.stringify({ error: msg.slice(0, 200) }), { status: 500, headers });
  }
}

async function createShare(req: Request, userId: string, headers: Record<string, string>): Promise<Response> {
  const body = (await req.json()) as Partial<CreatePayload>;
  const { sessionId, ttlDays, includeTranscript, includePerQuestion } = body;

  if (!sessionId || typeof sessionId !== "string") {
    return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers });
  }

  // Verify the session belongs to the caller — prevents creating shares for
  // sessions you don't own.
  const ownerCheck = await supa(`sessions?id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`, {
    headers: { Accept: "application/json" },
  });
  if (!ownerCheck.ok) {
    return new Response(JSON.stringify({ error: "Could not verify session ownership" }), { status: 500, headers });
  }
  const ownerRows = await ownerCheck.json() as Array<{ id: string }>;
  if (ownerRows.length === 0) {
    return new Response(JSON.stringify({ error: "Session not found or not owned by you" }), { status: 403, headers });
  }

  const ttl = Math.max(1, Math.min(MAX_TTL_DAYS, Number(ttlDays) || DEFAULT_TTL_DAYS));
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttl * 86_400_000).toISOString();

  const insertRes = await supa("report_shares", {
    method: "POST",
    body: JSON.stringify({
      token,
      session_id: sessionId,
      user_id: userId,
      expires_at: expiresAt,
      include_transcript: !!includeTranscript,
      include_per_question: !!includePerQuestion,
    }),
    headers: { Prefer: "return=minimal" },
  });
  if (!insertRes.ok) {
    const body = await insertRes.text().catch(() => "");
    console.error(`[share-report] insert failed HTTP ${insertRes.status}: ${body.slice(0, 200)}`);
    return new Response(JSON.stringify({ error: "Failed to create share link" }), { status: 500, headers });
  }

  // Public URL is built relative to the host so staging vs prod work transparently.
  const origin = req.headers.get("origin") || `https://${req.headers.get("host")}` || "";
  const publicUrl = `${origin}/report/share/${token}`;

  return new Response(JSON.stringify({ token, expiresAt, url: publicUrl, ttlDays: ttl }), { status: 200, headers });
}

async function revokeShare(req: Request, userId: string, headers: Record<string, string>): Promise<Response> {
  const body = (await req.json()) as { token?: string };
  const token = body?.token;
  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ error: "token required" }), { status: 400, headers });
  }
  const updateRes = await supa(
    `report_shares?token=eq.${encodeURIComponent(token)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    },
  );
  if (!updateRes.ok) {
    return new Response(JSON.stringify({ error: "Failed to revoke" }), { status: 500, headers });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function listShares(userId: string, headers: Record<string, string>): Promise<Response> {
  const res = await supa(
    `report_shares?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=50&select=token,session_id,expires_at,revoked_at,view_count,last_viewed_at,include_transcript,include_per_question,created_at`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    return new Response(JSON.stringify({ shares: [] }), { status: 200, headers });
  }
  const rows = (await res.json()) as ShareRow[];
  return new Response(
    JSON.stringify({
      shares: rows.map((r) => ({
        token: r.token,
        sessionId: r.session_id,
        expiresAt: r.expires_at,
        revokedAt: r.revoked_at,
        viewCount: r.view_count,
        lastViewedAt: r.last_viewed_at,
        includeTranscript: r.include_transcript,
        includePerQuestion: r.include_per_question,
        createdAt: r.created_at,
      })),
    }),
    { status: 200, headers },
  );
}

async function readShare(token: string, headers: Record<string, string>): Promise<Response> {
  const shareRes = await supa(
    `report_shares?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { headers: { Accept: "application/json" } },
  );
  if (!shareRes.ok) {
    return new Response(JSON.stringify({ error: "Share not found" }), { status: 404, headers });
  }
  const shareRows = (await shareRes.json()) as ShareRow[];
  const share = shareRows[0];
  if (!share) {
    return new Response(JSON.stringify({ error: "Share not found" }), { status: 404, headers });
  }
  if (share.revoked_at) {
    return new Response(JSON.stringify({ error: "This share link has been revoked." }), { status: 410, headers });
  }
  if (new Date(share.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: "This share link has expired." }), { status: 410, headers });
  }

  // Fetch the underlying session + owner profile (small fields only; sanitized below).
  const [sessionRes, profileRes] = await Promise.all([
    supa(`sessions?id=eq.${encodeURIComponent(share.session_id)}&select=*&limit=1`, { headers: { Accept: "application/json" } }),
    supa(`profiles?id=eq.${encodeURIComponent(share.user_id)}&select=id,name,target_role,target_company&limit=1`, { headers: { Accept: "application/json" } }),
  ]);
  if (!sessionRes.ok) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers });
  }
  const sessionRows = (await sessionRes.json()) as SessionRow[];
  const session = sessionRows[0];
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers });
  }
  const profile = profileRes.ok ? (((await profileRes.json()) as ProfileRow[])[0] || null) : null;

  // Fire-and-forget view tracking — non-blocking.
  void supa(`report_shares?token=eq.${encodeURIComponent(token)}`, {
    method: "PATCH",
    body: JSON.stringify({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() }),
    headers: { Prefer: "return=minimal" },
  });

  const flags = {
    includeTranscript: !!share.include_transcript,
    includePerQuestion: !!share.include_per_question,
  };
  const sanitizedReport = sanitizeReport(session.report_json, flags);

  // Build a minimal response so the public view never sees more than necessary.
  return new Response(
    JSON.stringify({
      report: sanitizedReport,
      meta: {
        candidateName: profile?.name || "Candidate",
        targetRole: profile?.target_role || session.type,
        targetCompany: profile?.target_company || "",
        sessionType: session.type,
        difficulty: session.difficulty,
        score: session.score,
        durationSec: session.duration,
        date: session.created_at,
        skillScores: session.skill_scores,
      },
      expiresAt: share.expires_at,
      includeTranscript: flags.includeTranscript,
      includePerQuestion: flags.includePerQuestion,
    }),
    { status: 200, headers },
  );
}

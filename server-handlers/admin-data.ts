/* Admin Dashboard API — returns aggregated metrics for the admin panel.
 * Security: timing-safe password comparison, rate limiting, session tokens with expiry. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";
import { categorizeLlmError, emptyBreakdown } from "./_admin-llm-categorizer";
import { createAdminToken, verifyAdminToken } from "./_admin-auth";
import { costBreakdown, kFactor, DEFAULT_COST_RATES, llmInr } from "./_cost-helpers";
import { getSarvamMonthlySpend } from "./_sarvam-credit-guard";
import { getDeepgramMonthlySpend } from "./_deepgram-credit-guard";

/* ─── Config ─── */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "").trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();

/* Query limits — reasonable caps to prevent huge payloads */
const LIMIT_PROFILES = 2000;
const LIMIT_SESSIONS = 2000;
const LIMIT_PAYMENTS = 1000;
const LIMIT_LLM = 2000;
const LIMIT_RECENT = 30;


/* ─── Auth ─── */

function verifyPassword(input: string): boolean {
  if (!ADMIN_PASSWORD || !input) return false;
  // HMAC both sides to a fixed-length 32-byte digest. This eliminates
  // length-based timing leaks (the comparison itself sees only equal-
  // length buffers) and we use the comparison result directly so static
  // analyzers don't flag a discarded timingSafeEqual return.
  const a = createHmac("sha256", "hsx-admin-pw-v1").update(input).digest();
  const b = createHmac("sha256", "hsx-admin-pw-v1").update(ADMIN_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

/** Check auth: either password (for login) or token (for subsequent requests) */
function verifyAuth(req: VercelRequest): { ok: boolean; isLogin?: boolean } {
  // Check x-admin-token header (in-memory token from client state)
  const token = req.headers["x-admin-token"];
  if (token && typeof token === "string" && verifyAdminToken(token)) {
    return { ok: true };
  }
  // Fallback: read token from HttpOnly admin_token cookie (session resume on
  // page refresh, when the client has no in-memory token yet).
  const cookieHeader = typeof req.headers["cookie"] === "string" ? req.headers["cookie"] : "";
  if (cookieHeader) {
    const cookieToken = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("admin_token="))
      ?.slice("admin_token=".length);
    if (cookieToken && verifyAdminToken(cookieToken)) {
      return { ok: true };
    }
  }
  // Check for password (login attempt)
  const key = req.headers["x-admin-key"];
  if (key && typeof key === "string" && verifyPassword(key)) {
    return { ok: true, isLogin: true };
  }
  return { ok: false };
}

/* ─── Supabase Helpers ─── */

function supa(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts?.headers || {}),
    },
  });
}

async function fetchJSON<T = unknown>(path: string): Promise<T[]> {
  const res = await supa(path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[admin-data] supabase query failed: ${path.slice(0, 120)} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchCount(table: string, filter = ""): Promise<number> {
  const path = `${table}?select=id${filter}&limit=0`;
  const res = await supa(path, { headers: { Prefer: "count=exact" } });
  const range = res.headers.get("content-range");
  if (range) {
    const match = range.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

/* ─── Section Handlers ─── */

async function getOverview() {
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);
  const today = daysAgo(0).slice(0, 10);

  // Use counts + targeted queries instead of loading everything
  const [
    totalUserCount,
    weekUserCount,
    totalSessionCount,
    weekSessionCount,
    monthSessionCount,
    profiles,
    recentSessions,
    payments,
    llmRecent,
    serviceRecent,
  ] = await Promise.all([
    fetchCount("profiles"),
    fetchCount("profiles", `&created_at=gte.${weekAgo}`),
    fetchCount("sessions"),
    fetchCount("sessions", `&created_at=gte.${weekAgo}`),
    fetchCount("sessions", `&created_at=gte.${monthAgo}`),
    fetchJSON<{ id: string; subscription_tier: string | null; subscription_end: string | null; practice_timestamps: string[] | null; created_at: string }>(
      `profiles?select=id,subscription_tier,subscription_end,practice_timestamps,created_at&limit=${LIMIT_PROFILES}`
    ),
    fetchJSON<{ user_id: string; score: number; created_at: string }>(
      `sessions?select=user_id,score,created_at&order=created_at.desc&limit=${LIMIT_SESSIONS}`
    ),
    fetchJSON<{ amount: number; status: string; created_at: string }>(
      `payments?select=amount,status,created_at&order=created_at.desc&limit=${LIMIT_PAYMENTS}`
    ),
    fetchJSON<{ total_tokens: number; is_fallback: boolean; status: string; created_at: string }>(
      `llm_usage?select=total_tokens,is_fallback,status,created_at&order=created_at.desc&limit=${LIMIT_LLM}`
    ),
    // Voice cost lives in service_usage: TTS request_chars (precise) + STT
    // token-issuance calls (count only — STT minutes aren't logged). Scoped to
    // the 30-day window to match the per-session divisor.
    fetchJSON<{ service: string; request_chars: number | null; status: string; created_at: string }>(
      `service_usage?select=service,request_chars,status,created_at&created_at=gte.${monthAgo}&limit=5000`
    ),
  ]);

  const now = Date.now();

  // Tier breakdown + active users
  const tierBreakdown: Record<string, number> = { free: 0, starter: 0, pro: 0, team: 0 };
  let activeLastWeek = 0;
  const sevenDaysFromNow = new Date(now + 7 * 86400000).toISOString().slice(0, 10);
  let churningThisWeek = 0;
  let paidUserCount = 0;
  for (const p of profiles) {
    const tier = p.subscription_tier || "free";
    tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
    if (p.practice_timestamps?.length) {
      const last = new Date(p.practice_timestamps[p.practice_timestamps.length - 1]).getTime();
      if (now - last < 7 * 86400000) activeLastWeek++;
    }
    if (tier !== "free" && tier != null) {
      paidUserCount++;
      // Subscription ending within the next 7 days
      if (p.subscription_end && p.subscription_end >= today && p.subscription_end <= sevenDaysFromNow) {
        churningThisWeek++;
      }
    }
  }
  const conversionRate = profiles.length > 0 ? Math.round((paidUserCount / profiles.length) * 100) : 0;

  // Avg score
  const scoredSessions = recentSessions.filter(s => s.score != null && s.score > 0);
  const avgScore = scoredSessions.length > 0
    ? Math.round(scoredSessions.reduce((sum, s) => sum + s.score, 0) / scoredSessions.length)
    : 0;

  // Sessions per day (last 30 days)
  const sessionsPerDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    sessionsPerDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0;
  }
  for (const s of recentSessions) {
    const d = s.created_at?.slice(0, 10);
    if (d && d in sessionsPerDay) sessionsPerDay[d]++;
  }

  // Revenue
  const successPayments = payments.filter(p => p.status === "captured" || p.status === "paid" || p.status === "success");
  const totalRevenue = successPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const revenueThisMonth = successPayments.filter(p => p.created_at >= monthAgo).reduce((sum, p) => sum + (p.amount || 0), 0);

  // LLM
  const todayLlm = llmRecent.filter(u => u.created_at?.startsWith(today));
  const tokensToday = todayLlm.reduce((sum, u) => sum + (u.total_tokens || 0), 0);
  const fallbackRate = llmRecent.length > 0
    ? Math.round((llmRecent.filter(u => u.is_fallback).length / llmRecent.length) * 100) : 0;
  const errorRate = llmRecent.length > 0
    ? Math.round((llmRecent.filter(u => u.status === "error" || u.status === "timeout").length / llmRecent.length) * 100) : 0;

  // ── Marginal cost (estimate, rate-card based — see _cost-helpers.ts) ──
  // 30-day window so the per-session number isn't whipsawed by a quiet day.
  // llmRecent is capped at LIMIT_LLM; on high volume this undercounts and the
  // estimate reads low — acceptable for a dashboard signal, flagged in the UI.
  const TTS_SERVICES = new Set(["azure_tts", "cartesia_tts", "sarvam_tts"]);
  const STT_SERVICES = new Set(["deepgram_stt", "sarvam_stt"]);
  let llmTokens30dPrimary = 0, llmTokens30dFallback = 0;
  for (const u of llmRecent) {
    if (!u.created_at || u.created_at < monthAgo) continue;
    if (u.is_fallback) llmTokens30dFallback += u.total_tokens || 0;
    else llmTokens30dPrimary += u.total_tokens || 0;
  }
  let ttsChars30d = 0, sttCalls30d = 0;
  let llmTokensTodayPrimary = 0, llmTokensTodayFallback = 0, ttsCharsToday = 0, sttCallsToday = 0;
  for (const u of llmRecent) {
    if (!u.created_at?.startsWith(today)) continue;
    if (u.is_fallback) llmTokensTodayFallback += u.total_tokens || 0;
    else llmTokensTodayPrimary += u.total_tokens || 0;
  }
  for (const r of serviceRecent) {
    const isToday = r.created_at?.startsWith(today);
    if (TTS_SERVICES.has(r.service)) {
      ttsChars30d += r.request_chars || 0;
      if (isToday) ttsCharsToday += r.request_chars || 0;
    } else if (STT_SERVICES.has(r.service) && r.status === "success") {
      sttCalls30d += 1;
      if (isToday) sttCallsToday += 1;
    }
  }
  const cost30d = costBreakdown({
    llmTokensPrimary: llmTokens30dPrimary,
    llmTokensFallback: llmTokens30dFallback,
    ttsChars: ttsChars30d,
    sttCalls: sttCalls30d,
    sessions: monthSessionCount,
  });
  const costToday = costBreakdown({
    llmTokensPrimary: llmTokensTodayPrimary,
    llmTokensFallback: llmTokensTodayFallback,
    ttsChars: ttsCharsToday,
    sttCalls: sttCallsToday,
    sessions: recentSessions.filter(s => s.created_at?.startsWith(today)).length,
  });

  // Activation funnel (30d): signups → first session → paid
  const signups30dProfiles = profiles.filter(p => p.created_at >= monthAgo);
  const signups30dIds = new Set(signups30dProfiles.map(p => p.id));
  const sessionUserIds = new Set(recentSessions.filter(s => s.created_at >= monthAgo && signups30dIds.has(s.user_id)).map(s => s.user_id));
  const activatedCount = sessionUserIds.size;
  const convertedCount = signups30dProfiles.filter(p => {
    const tier = p.subscription_tier;
    return tier && tier !== "free" && sessionUserIds.has(p.id);
  }).length;
  const activationRate = signups30dIds.size > 0 ? Math.round((activatedCount / signups30dIds.size) * 100) : 0;
  const paidConversionRate = activatedCount > 0 ? Math.round((convertedCount / activatedCount) * 100) : 0;

  const anomalies = await getAnomalies();

  // Prepaid/free credit grants — separate from the estimated-spend cost
  // breakdown above, these track real remaining balance against the fixed
  // Sarvam startup-program and Deepgram startup-credit grants.
  const [sarvamCredits, deepgramCredits] = await Promise.all([
    getSarvamMonthlySpend(),
    getDeepgramMonthlySpend(),
  ]);

  return {
    users: {
      total: totalUserCount,
      today: profiles.filter(p => p.created_at?.startsWith(today)).length,
      thisWeek: weekUserCount,
      activeLastWeek,
      tierBreakdown,
      churningThisWeek,
      conversionRate,
      paidUserCount,
    },
    sessions: { total: totalSessionCount, today: recentSessions.filter(s => s.created_at?.startsWith(today)).length, thisWeek: weekSessionCount, avgScore, perDay: sessionsPerDay },
    revenue: { totalPaise: totalRevenue, thisMonthPaise: revenueThisMonth, paymentCount: successPayments.length },
    activation: {
      signups30d: signups30dIds.size,
      activatedCount,
      activationRate,
      convertedCount,
      paidConversionRate,
    },
    llm: { tokensToday, fallbackRate, errorRate, totalCalls: llmRecent.length },
    cost: {
      perSessionInr: cost30d.perSessionInr,
      todayInr: costToday.totalInr,
      month: { totalInr: cost30d.totalInr, llmInr: cost30d.llmInr, ttsInr: cost30d.ttsInr, sttInr: cost30d.sttInr, sessions: cost30d.sessions },
      estimate: true,
    },
    credits: {
      sarvam: { usedCredits: sarvamCredits.usedCredits, capCredits: sarvamCredits.capCredits },
      deepgram: { usedUsd: deepgramCredits.usedUsd, capUsd: deepgramCredits.capUsd },
    },
    anomalies,
  };
}

async function getUsers(search?: string, offset = 0, limit = 50) {
  let profilePath = `profiles?select=id,name,email,subscription_tier,created_at,practice_timestamps,has_completed_onboarding,subscription_end&order=created_at.desc&offset=${offset}&limit=${limit}`;
  if (search) {
    profilePath += `&or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)`;
  }

  // Get total count and profiles in parallel — use Supabase count header instead of fetching all sessions
  const [profilesRes, totalCount] = await Promise.all([
    supa(profilePath),
    fetchCount("profiles", search ? `&or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)` : ""),
  ]);

  const profiles = profilesRes.ok ? await profilesRes.json() : [];

  // Get session counts + last-7d counts for the users on this page
  const userIds = (profiles as Array<{ id: string }>).map(p => p.id);
  const countMap: Record<string, number> = {};
  const last7dMap: Record<string, number> = {};
  if (userIds.length > 0) {
    const idList = userIds.map(id => encodeURIComponent(id)).join(",");
    const sevenDaysAgo = daysAgo(7);
    const [allSessions, recentSessions] = await Promise.all([
      fetchJSON<{ user_id: string }>(
        `sessions?select=user_id&user_id=in.(${idList})&limit=10000`,
      ),
      fetchJSON<{ user_id: string }>(
        `sessions?select=user_id&user_id=in.(${idList})&created_at=gte.${sevenDaysAgo}&limit=5000`,
      ),
    ]);
    for (const s of allSessions) countMap[s.user_id] = (countMap[s.user_id] || 0) + 1;
    for (const s of recentSessions) last7dMap[s.user_id] = (last7dMap[s.user_id] || 0) + 1;
  }

  const users = (profiles as Array<{
    id: string; name: string | null; email: string; subscription_tier: string;
    created_at: string; practice_timestamps: string[] | null;
    has_completed_onboarding: boolean; subscription_end: string | null;
  }>).map(p => ({
    id: p.id,
    name: p.name || "—",
    email: p.email,
    tier: p.subscription_tier || "free",
    sessionsCount: countMap[p.id] || 0,
    sessionsLast7d: last7dMap[p.id] || 0,
    lastActive: p.practice_timestamps?.length
      ? p.practice_timestamps[p.practice_timestamps.length - 1]
      : null,
    onboarded: !!p.has_completed_onboarding,
    joined: p.created_at,
    subscriptionEnd: p.subscription_end,
  }));

  return { users, total: totalCount };
}

async function getUserDetail(userId: string) {
  const encoded = encodeURIComponent(userId);
  const [profile, sessions, payments, llmUsage, feedback, credits] = await Promise.all([
    fetchJSON(`profiles?id=eq.${encoded}&select=id,name,email,subscription_tier,target_role,target_company,experience_level,industry,subscription_start,subscription_end,cancel_at_period_end,has_completed_onboarding,created_at&limit=1`),
    fetchJSON<{ id: string; date: string; type: string; difficulty: string; duration: number; score: number; skill_scores: Record<string, unknown> | null; created_at: string; llm_cost_inr: number | null; prompt_tokens: number | null; completion_tokens: number | null }>(`sessions?user_id=eq.${encoded}&select=id,date,type,difficulty,duration,score,skill_scores,created_at,llm_cost_inr,prompt_tokens,completion_tokens&order=created_at.desc&limit=50`),
    fetchJSON(`payments?user_id=eq.${encoded}&select=id,razorpay_payment_id,amount,currency,status,plan,tier,created_at&order=created_at.desc&limit=30`),
    fetchJSON(`llm_usage?user_id=eq.${encoded}&select=endpoint,model,total_tokens,latency_ms,status,created_at&order=created_at.desc&limit=100`),
    fetchJSON(`feedback?user_id=eq.${encoded}&select=id,rating,comment,session_score,session_type,created_at&order=created_at.desc&limit=20`),
    fetchJSON<{ balance: number }>(`session_credits?user_id=eq.${encoded}&select=balance&limit=1`),
  ]);

  // Compute total LLM cost across this user's sessions
  const totalLlmCostInr = sessions.reduce((sum, s) => sum + (s.llm_cost_inr || 0), 0);
  const totalPromptTokens = sessions.reduce((sum, s) => sum + (s.prompt_tokens || 0), 0);
  const totalCompletionTokens = sessions.reduce((sum, s) => sum + (s.completion_tokens || 0), 0);

  // Top 3 most expensive sessions
  const top3ExpensiveSessions = [...sessions]
    .filter(s => s.llm_cost_inr != null && s.llm_cost_inr > 0)
    .sort((a, b) => (b.llm_cost_inr || 0) - (a.llm_cost_inr || 0))
    .slice(0, 3)
    .map(s => ({ id: s.id, type: s.type, date: s.created_at, llmCostInr: s.llm_cost_inr, promptTokens: s.prompt_tokens, completionTokens: s.completion_tokens }));

  return {
    profile: profile[0] || null,
    sessions,
    payments,
    llmUsage,
    feedback,
    creditBalance: Array.isArray(credits) && credits.length > 0 ? (credits[0].balance ?? 0) : 0,
    costSummary: {
      totalLlmCostInr: Math.round(totalLlmCostInr * 100) / 100,
      totalPromptTokens,
      totalCompletionTokens,
      top3ExpensiveSessions,
    },
  };
}

/**
 * Full session payload for admin drill-down: metadata + transcript + skill
 * scores + cached report (if generated). Q&A pairing is done client-side
 * from the transcript array since the engine writes interleaved
 * { speaker: "ai"|"user", text } turns.
 */
async function getSessionDetail(sessionId: string) {
  const encoded = encodeURIComponent(sessionId);
  const [sessionRows, llmUsage] = await Promise.all([
    fetchJSON<{
      id: string; user_id: string; date: string; type: string; difficulty: string;
      focus: string; duration: number; score: number; questions: number;
      transcript: Array<{ speaker: string; text: string; time?: string }>;
      ai_feedback: string;
      skill_scores: Record<string, unknown> | null;
      job_description?: string;
      jd_analysis?: Record<string, unknown> | null;
      report_json?: Record<string, unknown> | null;
      report_version?: string | null;
      report_generated_at?: string | null;
      created_at: string;
    }>(
      `sessions?id=eq.${encoded}&select=*&limit=1`,
    ),
    fetchJSON<{ endpoint: string; model: string; total_tokens: number; prompt_tokens: number; completion_tokens: number; is_fallback: boolean; latency_ms: number; status: string; created_at: string }>(
      `llm_usage?session_id=eq.${encoded}&select=endpoint,model,total_tokens,prompt_tokens,completion_tokens,is_fallback,latency_ms,status,created_at&order=created_at.desc&limit=20`,
    ),
  ]);
  const session = sessionRows[0];
  if (!session) return { session: null, profile: null, qaPairs: [], llmCalls: [], costInr: 0 };

  // Fetch the user's profile so admins can see who this session belongs to.
  const profileRows = await fetchJSON<{ id: string; name: string | null; email: string }>(
    `profiles?id=eq.${encodeURIComponent(session.user_id)}&select=id,name,email&limit=1`,
  );
  const profile = profileRows[0] || null;

  // Pair AI questions with the candidate answers that follow them.
  const transcript = Array.isArray(session.transcript) ? session.transcript : [];
  const qaPairs: Array<{ question: string; answer: string; questionTime?: string; answerTime?: string }> = [];
  let pendingQuestion: { text: string; time?: string } | null = null;
  for (const turn of transcript) {
    const speaker = String(turn?.speaker ?? "").toLowerCase();
    const text = String(turn?.text ?? "").trim();
    if (!text) continue;
    const isAI = speaker === "ai" || speaker === "interviewer" || speaker === "assistant";
    const isUser = speaker === "user" || speaker === "candidate";
    if (isAI) {
      // Flush any orphaned question (interviewer asked twice, candidate didn't answer).
      if (pendingQuestion) {
        qaPairs.push({ question: pendingQuestion.text, answer: "(no answer)", questionTime: pendingQuestion.time });
      }
      pendingQuestion = { text, time: turn.time };
    } else if (isUser && pendingQuestion) {
      qaPairs.push({
        question: pendingQuestion.text,
        answer: text,
        questionTime: pendingQuestion.time,
        answerTime: turn.time,
      });
      pendingQuestion = null;
    } else if (isUser) {
      // Candidate spoke without a paired question (initial monologue, etc.)
      qaPairs.push({ question: "(no question recorded)", answer: text, answerTime: turn.time });
    }
  }
  if (pendingQuestion) {
    qaPairs.push({ question: pendingQuestion.text, answer: "(no answer)", questionTime: pendingQuestion.time });
  }

  // Compute cost from session-scoped llm_usage rows
  let primaryTok = 0, fallbackTok = 0, promptTok = 0, completionTok = 0;
  for (const u of llmUsage) {
    promptTok += u.prompt_tokens || 0;
    completionTok += u.completion_tokens || 0;
    if (u.is_fallback) fallbackTok += u.total_tokens || 0;
    else primaryTok += u.total_tokens || 0;
  }
  const sessionCost = costBreakdown(
    { llmTokensPrimary: primaryTok, llmTokensFallback: fallbackTok, ttsChars: 0, sttCalls: 0, sessions: 1 },
    DEFAULT_COST_RATES,
  );

  return { session, profile, qaPairs, llmCalls: llmUsage, costInr: sessionCost.llmInr, promptTokens: promptTok, completionTokens: completionTok };
}

async function getFinancials() {
  const [payments, activeProfiles] = await Promise.all([
    fetchJSON<{
      id: string; user_id: string; amount: number; currency: string; status: string; tier: string; plan: string; created_at: string;
    }>(`payments?select=id,user_id,amount,currency,status,tier,plan,created_at&order=created_at.desc&limit=2000`),
    // Active paid subscriptions: tier not free AND subscription_end in the future
    fetchJSON<{ subscription_tier: string; subscription_end: string | null }>(
      `profiles?select=subscription_tier,subscription_end&subscription_tier=neq.free&subscription_tier=not.is.null&limit=5000`,
    ),
  ]);

  const now = Date.now();
  const isSuccess = (p: { status: string }) =>
    p.status === "captured" || p.status === "paid" || p.status === "success";
  const isFailed = (p: { status: string }) =>
    p.status === "failed" || p.status === "cancelled" || p.status === "cancelled_by_user" || p.status === "expired";

  const success = payments.filter(isSuccess);
  const failed = payments.filter(isFailed);
  const pending = payments.filter(p => !isSuccess(p) && !isFailed(p));

  const totalRevenue = success.reduce((s, p) => s + (p.amount || 0), 0);

  const monthAgo = daysAgo(30);
  const lastMonthAgo = daysAgo(60);
  const thisMonthPayments = success.filter(p => p.created_at >= monthAgo);
  const lastMonthPayments = success.filter(p => p.created_at >= lastMonthAgo && p.created_at < monthAgo);
  const revenueThisMonth = thisMonthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const revenueLastMonth = lastMonthPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const momGrowthPct = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
    : (revenueThisMonth > 0 ? 100 : 0);

  const successRate = payments.length > 0 ? Math.round((success.length / payments.length) * 100) : 100;
  const avgTransactionPaise = success.length > 0 ? Math.round(totalRevenue / success.length) : 0;

  // Plan breakdown with count
  const byPlan: Record<string, { revenue: number; count: number }> = {};
  for (const p of success) {
    const k = p.plan || p.tier || "unknown";
    if (!byPlan[k]) byPlan[k] = { revenue: 0, count: 0 };
    byPlan[k].revenue += p.amount || 0;
    byPlan[k].count += 1;
  }

  // Per day (30d)
  const perDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) { perDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0; }
  for (const p of success) { const d = p.created_at?.slice(0, 10); if (d && d in perDay) perDay[d] += p.amount || 0; }

  // Per month (12 months)
  const perMonth: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i, 1);
    perMonth[d.toISOString().slice(0, 7)] = 0;
  }
  for (const p of success) { const m = p.created_at?.slice(0, 7); if (m && m in perMonth) perMonth[m] += p.amount || 0; }

  // Top spenders aggregation
  const spenderMap = new Map<string, { total: number; count: number; lastDate: string }>();
  for (const p of success) {
    if (!p.user_id) continue;
    const e = spenderMap.get(p.user_id);
    if (!e) {
      spenderMap.set(p.user_id, { total: p.amount || 0, count: 1, lastDate: p.created_at });
    } else {
      e.total += p.amount || 0;
      e.count += 1;
      if (p.created_at > e.lastDate) e.lastDate = p.created_at;
    }
  }
  const topSpenderIds = Array.from(spenderMap.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 10)
    .map(([id]) => id);

  const profileMap = new Map<string, { name: string; email: string }>();
  if (topSpenderIds.length > 0) {
    const idList = topSpenderIds.map(id => `"${id}"`).join(",");
    const profiles = await fetchJSON<{ id: string; name: string | null; email: string }>(
      `profiles?select=id,name,email&id=in.(${idList})`,
    );
    for (const pr of profiles) profileMap.set(pr.id, { name: pr.name || "(no name)", email: pr.email });
  }

  const topSpenders = topSpenderIds.map(id => {
    const data = spenderMap.get(id)!;
    const pr = profileMap.get(id);
    return { userId: id, name: pr?.name || "(unknown)", email: pr?.email || "", totalPaise: data.total, paymentCount: data.count, lastPayment: data.lastDate };
  });

  const paidUserCount = spenderMap.size;
  const arpuPaise = paidUserCount > 0 ? Math.round(totalRevenue / paidUserCount) : 0;

  // MRR: estimate from active subscriptions × avg monthly revenue per plan
  // "Active" = subscription_end is in the future or null (lifetime)
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeSubs = activeProfiles.filter(p =>
    p.subscription_tier && p.subscription_tier !== "free" &&
    (p.subscription_end == null || p.subscription_end > todayStr)
  );
  const activeByTier: Record<string, number> = {};
  for (const p of activeSubs) {
    const t = p.subscription_tier || "unknown";
    activeByTier[t] = (activeByTier[t] || 0) + 1;
  }
  // Monthly revenue per plan from payments (avg payment / plan, ignoring annual vs monthly)
  const planRevenueMap: Record<string, { total: number; count: number }> = {};
  for (const p of success) {
    const k = p.plan || p.tier || "unknown";
    if (!planRevenueMap[k]) planRevenueMap[k] = { total: 0, count: 0 };
    planRevenueMap[k].total += p.amount || 0;
    planRevenueMap[k].count++;
  }
  // Annualise: detect "annual"/"yearly" in plan name → divide by 12
  const avgMonthlyPaiseByPlan: Record<string, number> = {};
  for (const [plan, { total, count }] of Object.entries(planRevenueMap)) {
    const avgPmt = count > 0 ? total / count : 0;
    const isAnnual = /annual|yearly|year/i.test(plan);
    avgMonthlyPaiseByPlan[plan] = Math.round(isAnnual ? avgPmt / 12 : avgPmt);
  }
  // MRR = sum(active subs per tier × avg monthly price for that tier)
  let estimatedMrrPaise = 0;
  for (const [tier, subCount] of Object.entries(activeByTier)) {
    const monthlyPaise = avgMonthlyPaiseByPlan[tier] || 0;
    estimatedMrrPaise += subCount * monthlyPaise;
  }
  const activeSubsCount = activeSubs.length;

  return {
    totalRevenuePaise: totalRevenue,
    revenueThisMonthPaise: revenueThisMonth,
    revenueLastMonthPaise: revenueLastMonth,
    momGrowthPct,
    totalPayments: success.length,
    failedPayments: failed.length,
    pendingPayments: pending.length,
    successRate,
    avgTransactionPaise,
    paidUserCount,
    arpuPaise,
    estimatedMrrPaise,
    activeSubsCount,
    byPlan,
    perDay,
    perMonth,
    topSpenders,
    recent: payments.slice(0, 50).map(p => ({
      id: p.id, amount: p.amount, currency: p.currency, status: p.status,
      plan: p.plan || p.tier, date: p.created_at, userId: p.user_id,
    })),
    recentFailed: failed.slice(0, 20).map(p => ({
      id: p.id, amount: p.amount, plan: p.plan || p.tier, status: p.status, date: p.created_at,
    })),
  };
}

interface AnomalyHighSpendUser {
  userId: string;
  tokens: number;
  zScore: number;
}

interface AnomaliesResult {
  highSpendUsers: AnomalyHighSpendUser[];
  runawayCallsToday: number;
}

async function getAnomalies(): Promise<AnomaliesResult> {
  const since = daysAgo(1);
  const [recentRows, runawayRows] = await Promise.all([
    fetchJSON<{ user_id: string; total_tokens: number; created_at: string }>(
      `llm_usage?select=user_id,total_tokens,created_at&created_at=gte.${since}&limit=5000`,
    ),
    fetchJSON<{ id: string }>(
      `llm_usage?select=id&total_tokens=gt.8000&created_at=gte.${since}&limit=1000`,
    ),
  ]);

  // Sum tokens per user_id
  const perUser = new Map<string, number>();
  for (const row of recentRows) {
    if (!row.user_id) continue;
    perUser.set(row.user_id, (perUser.get(row.user_id) || 0) + (row.total_tokens || 0));
  }

  const values = Array.from(perUser.values()).filter(v => v > 0);
  const highSpendUsers: AnomalyHighSpendUser[] = [];

  if (values.length === 1) {
    // Only one user — flag if over 10,000 tokens
    const [userId, tokens] = Array.from(perUser.entries())[0];
    if (tokens > 10000) {
      highSpendUsers.push({ userId, tokens, zScore: 0 });
    }
  } else if (values.length > 1) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const threshold = stddev > 0 ? mean + 2.5 * stddev : mean * 3;

    for (const [userId, tokens] of perUser.entries()) {
      if (tokens > threshold) {
        const zScore = stddev > 0 ? Math.round(((tokens - mean) / stddev) * 100) / 100 : 0;
        highSpendUsers.push({ userId, tokens, zScore });
      }
    }
    highSpendUsers.sort((a, b) => b.tokens - a.tokens);
  }

  return {
    highSpendUsers,
    runawayCallsToday: runawayRows.length,
  };
}

async function getLLMUsage() {
  const usage = await fetchJSON<{
    id: string; user_id: string; endpoint: string; model: string; is_fallback: boolean;
    prompt_tokens: number; completion_tokens: number; total_tokens: number;
    latency_ms: number; status: string; error_message: string | null; created_at: string;
  }>(`llm_usage?select=id,user_id,endpoint,model,is_fallback,prompt_tokens,completion_tokens,total_tokens,latency_ms,status,error_message,created_at&order=created_at.desc&limit=${LIMIT_LLM}`);

  const now = Date.now();
  const today = daysAgo(0).slice(0, 10);

  const byEndpoint: Record<string, { calls: number; tokens: number; avgLatency: number; errors: number; _latencySum: number }> = {};
  const byModel: Record<string, { calls: number; tokens: number }> = {};
  const tokensPerDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) { tokensPerDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0; }

  for (const u of usage) {
    // By endpoint
    const ep = u.endpoint || "unknown";
    if (!byEndpoint[ep]) byEndpoint[ep] = { calls: 0, tokens: 0, avgLatency: 0, errors: 0, _latencySum: 0 };
    byEndpoint[ep].calls++;
    byEndpoint[ep].tokens += u.total_tokens || 0;
    byEndpoint[ep]._latencySum += u.latency_ms || 0;
    if (u.status === "error" || u.status === "timeout") byEndpoint[ep].errors++;

    // By model
    const m = u.model || "unknown";
    if (!byModel[m]) byModel[m] = { calls: 0, tokens: 0 };
    byModel[m].calls++;
    byModel[m].tokens += u.total_tokens || 0;

    // Per day
    const d = u.created_at?.slice(0, 10);
    if (d && d in tokensPerDay) tokensPerDay[d] += u.total_tokens || 0;
  }

  // Compute avg latency
  const cleanEndpoints: Record<string, { calls: number; tokens: number; avgLatency: number; errors: number }> = {};
  for (const [ep, d] of Object.entries(byEndpoint)) {
    cleanEndpoints[ep] = { calls: d.calls, tokens: d.tokens, avgLatency: d.calls > 0 ? Math.round(d._latencySum / d.calls) : 0, errors: d.errors };
  }

  const totalTokens = usage.reduce((s, u) => s + (u.total_tokens || 0), 0);
  const todayTokens = usage.filter(u => u.created_at?.startsWith(today)).reduce((s, u) => s + (u.total_tokens || 0), 0);
  const fallbackCount = usage.filter(u => u.is_fallback).length;
  const errored = usage.filter(u => u.status === "error" || u.status === "timeout");

  // Categorize each error so the dashboard surfaces *why* calls fail. Token
  // quota is one of many failure modes; per-minute rate limits, context-length
  // overflow, and provider 5xxs are far more common in practice.
  // Pure regex logic lives in _admin-llm-categorizer.ts so it can be unit-tested.
  const errorBreakdown = emptyBreakdown();
  for (const u of errored) {
    errorBreakdown[categorizeLlmError(u.status, u.error_message)]++;
  }

  return {
    totalCalls: usage.length,
    totalTokens,
    todayTokens,
    fallbackRate: usage.length > 0 ? Math.round((fallbackCount / usage.length) * 100) : 0,
    errorRate: usage.length > 0 ? Math.round((errored.length / usage.length) * 100) : 0,
    errorBreakdown,
    byEndpoint: cleanEndpoints,
    byModel,
    tokensPerDay,
    recentErrors: errored.slice(0, 20).map(u => ({
      endpoint: u.endpoint, model: u.model, error: u.error_message, status: u.status, date: u.created_at,
    })),
    // Service details for the enhanced Services view
    services: await buildServiceDetails(usage),
    anomalies: await getAnomalies(),
  };
}

/** Build detailed per-service breakdown with real usage from service_usage table + llm_usage */
async function buildServiceDetails(
  llmUsage: Array<{ model: string; is_fallback: boolean; total_tokens: number; latency_ms: number; status: string; created_at: string }>,
) {
  const today = daysAgo(0).slice(0, 10);
  const monthAgo = daysAgo(30).slice(0, 10);
  const todayUsage = llmUsage.filter(u => u.created_at?.startsWith(today));

  // Classify by `is_fallback` only — that column is the canonical signal for which
  // provider served the call. Sniffing the model string double-counts rows when
  // both predicates match and drops rows whose model field doesn't contain a
  // known substring.
  const groqCalls = llmUsage.filter(u => !u.is_fallback);
  const groqToday = todayUsage.filter(u => !u.is_fallback);
  const groqTokensToday = groqToday.reduce((s, u) => s + (u.total_tokens || 0), 0);
  const groqWindowErrors = groqCalls.filter(u => u.status === "error" || u.status === "timeout").length;
  const groqAvgLatency = groqCalls.length > 0 ? Math.round(groqCalls.reduce((s, u) => s + (u.latency_ms || 0), 0) / groqCalls.length) : 0;

  const geminiCalls = llmUsage.filter(u => u.is_fallback);
  const geminiToday = todayUsage.filter(u => u.is_fallback);
  const geminiTokensToday = geminiToday.reduce((s, u) => s + (u.total_tokens || 0), 0);
  const geminiWindowErrors = geminiCalls.filter(u => u.status === "error" || u.status === "timeout").length;
  const geminiAvgLatency = geminiCalls.length > 0 ? Math.round(geminiCalls.reduce((s, u) => s + (u.latency_ms || 0), 0) / geminiCalls.length) : 0;

  // True all-time totals — `llmUsage` is capped at LIMIT_LLM rows so summing it
  // would silently undercount once the table grows past that window.
  const [groqCallsTotal, groqErrorsTotal, geminiCallsTotal, geminiErrorsTotal] = await Promise.all([
    fetchCount("llm_usage", "&is_fallback=eq.false"),
    fetchCount("llm_usage", "&is_fallback=eq.false&status=in.(error,timeout)"),
    fetchCount("llm_usage", "&is_fallback=eq.true"),
    fetchCount("llm_usage", "&is_fallback=eq.true&status=in.(error,timeout)"),
  ]);

  // Fetch service_usage for all non-LLM services
  const serviceRows = await fetchJSON<{
    service: string; status: string; latency_ms: number | null;
    request_chars: number | null; response_bytes: number | null; created_at: string;
  }>(`service_usage?select=service,status,latency_ms,request_chars,response_bytes,created_at&created_at=gte.${monthAgo}&order=created_at.desc&limit=5000`);

  // Aggregate per service
  type Agg = { callsTotal: number; callsToday: number; errorsTotal: number; errorsToday: number; latencySum: number; latencyCount: number; charsTotal: number; charsToday: number; bytesTotal: number };
  const agg: Record<string, Agg> = {};
  for (const r of serviceRows) {
    if (!agg[r.service]) agg[r.service] = { callsTotal: 0, callsToday: 0, errorsTotal: 0, errorsToday: 0, latencySum: 0, latencyCount: 0, charsTotal: 0, charsToday: 0, bytesTotal: 0 };
    const a = agg[r.service];
    const isToday = r.created_at?.startsWith(today);
    a.callsTotal++;
    if (isToday) a.callsToday++;
    if (r.status === "error" || r.status === "timeout") {
      a.errorsTotal++;
      if (isToday) a.errorsToday++;
    }
    if (r.latency_ms) { a.latencySum += r.latency_ms; a.latencyCount++; }
    if (r.request_chars) { a.charsTotal += r.request_chars; if (isToday) a.charsToday += r.request_chars; }
    if (r.response_bytes) a.bytesTotal += r.response_bytes;
  }

  const svc = (name: string): Agg => agg[name] || { callsTotal: 0, callsToday: 0, errorsTotal: 0, errorsToday: 0, latencySum: 0, latencyCount: 0, charsTotal: 0, charsToday: 0, bytesTotal: 0 };
  const avgLat = (a: Agg) => a.latencyCount > 0 ? Math.round(a.latencySum / a.latencyCount) : 0;
  const svcStatus = (a: Agg) => a.callsTotal > 0 && a.errorsTotal > a.callsTotal * 0.1 ? "degraded" : "healthy";

  const az = svc("azure_tts");
  const ca = svc("cartesia_tts");
  const dg = svc("deepgram_stt");
  const sv = svc("sarvam_stt");
  const re = svc("resend_email");

  // Upstash: estimate commands from total service calls (each rate-limited req = ~2 Redis commands)
  const totalServiceCalls = serviceRows.length + llmUsage.length;
  const todayServiceCalls = serviceRows.filter(r => r.created_at?.startsWith(today)).length + todayUsage.length;
  const upstashEstCmdsTotal = totalServiceCalls * 2;
  const upstashEstCmdsToday = todayServiceCalls * 2;

  return [
    {
      name: "Groq",
      type: "LLM",
      role: "Primary",
      model: "llama-3.3-70b-specdec",
      status: groqWindowErrors > groqCalls.length * 0.1 ? "degraded" : "healthy",
      usage: {
        callsTotal: groqCallsTotal,
        callsToday: groqToday.length,
        tokensToday: groqTokensToday,
        tokensTotal: groqCalls.reduce((s, u) => s + (u.total_tokens || 0), 0),
        errorsTotal: groqErrorsTotal,
        errorsToday: groqToday.filter(u => u.status === "error" || u.status === "timeout").length,
        avgLatencyMs: groqAvgLatency,
      },
      limits: { requestsPerDay: 1000, requestsPerMinute: 30, tokensPerMinute: 12000 },
      notes: "Free tier: 30 RPM, 1,000 RPD, 12,000 TPM (verified via x-ratelimit headers). Per-minute token cap is the bottleneck during interviews — upgrade at console.groq.com to lift TPM.",
    },
    {
      name: "Google Gemini",
      type: "LLM",
      role: "Fallback",
      model: "gemini-2.5-flash",
      status: geminiWindowErrors > geminiCalls.length * 0.2 ? "degraded" : "healthy",
      usage: {
        callsTotal: geminiCallsTotal,
        callsToday: geminiToday.length,
        tokensToday: geminiTokensToday,
        tokensTotal: geminiCalls.reduce((s, u) => s + (u.total_tokens || 0), 0),
        errorsTotal: geminiErrorsTotal,
        errorsToday: geminiToday.filter(u => u.status === "error" || u.status === "timeout").length,
        avgLatencyMs: geminiAvgLatency,
      },
      limits: { requestsPerDay: 250, requestsPerMinute: 10, tokensPerMinute: 250_000 },
      notes: "Free tier (gemini-2.5-flash): 10 RPM, 250 RPD, 250K TPM. Lower RPM than the -lite variant but ~10× higher TPM, which is what large eval prompts need on the fallback path. Upgrade at aistudio.google.com to lift RPD.",
    },
    {
      name: "Azure TTS",
      type: "TTS",
      role: "Primary",
      model: "Neural voices (Indian English)",
      status: svcStatus(az),
      usage: {
        callsTotal: az.callsTotal,
        callsToday: az.callsToday,
        charsToday: az.charsToday,
        charsTotal: az.charsTotal,
        errorsTotal: az.errorsTotal,
        errorsToday: az.errorsToday,
        avgLatencyMs: avgLat(az),
      },
      limits: { freeCharsPerMonth: 500_000 },
      notes: "Free tier: 0.5M chars/month (F0). Standard: $16/1M chars. Check portal.azure.com for usage.",
    },
    {
      name: "Cartesia",
      type: "TTS",
      role: "Fallback",
      model: "sonic-3",
      status: svcStatus(ca),
      usage: {
        callsTotal: ca.callsTotal,
        callsToday: ca.callsToday,
        charsToday: ca.charsToday,
        charsTotal: ca.charsTotal,
        errorsTotal: ca.errorsTotal,
        errorsToday: ca.errorsToday,
        avgLatencyMs: avgLat(ca),
      },
      limits: { freeSecondsPerMonth: 600 },
      notes: "Free: 10 min/month. Only used when Azure TTS fails. Check play.cartesia.ai for usage.",
    },
    {
      name: "Deepgram",
      type: "STT",
      role: "Primary",
      model: "Nova-3",
      status: svcStatus(dg),
      usage: {
        callsTotal: dg.callsTotal,
        callsToday: dg.callsToday,
        errorsTotal: dg.errorsTotal,
        errorsToday: dg.errorsToday,
        avgLatencyMs: avgLat(dg),
      },
      limits: { freeCredits: 200 },
      notes: "Pay-as-you-go with $200 free credit. Each token request = 1 STT session. Check console.deepgram.com.",
    },
    {
      name: "Sarvam AI",
      type: "STT",
      role: "Fallback (Indian English)",
      model: "saaras:v2",
      status: svcStatus(sv),
      usage: {
        callsTotal: sv.callsTotal,
        callsToday: sv.callsToday,
        errorsTotal: sv.errorsTotal,
        errorsToday: sv.errorsToday,
        avgLatencyMs: avgLat(sv),
      },
      limits: { freeRequestsPerDay: 50 },
      notes: "Used for Indian-English STT after Deepgram. Check dashboard.sarvam.ai for usage.",
    },
    {
      name: "Resend",
      type: "Email",
      role: "Transactional",
      model: "—",
      status: svcStatus(re),
      usage: {
        callsTotal: re.callsTotal,
        callsToday: re.callsToday,
        errorsTotal: re.errorsTotal,
        errorsToday: re.errorsToday,
        avgLatencyMs: avgLat(re),
      },
      limits: { freeEmailsPerDay: 100, freeEmailsPerMonth: 3000 },
      notes: "Free: 100/day, 3K/month. Sends: welcome, payment, renewal, re-engagement. Check resend.com/overview.",
    },
    {
      name: "Upstash Redis",
      type: "Cache / Rate Limiting",
      role: "Rate limiter",
      model: "—",
      status: "healthy",
      usage: {
        callsTotal: upstashEstCmdsTotal,
        callsToday: upstashEstCmdsToday,
        errorsTotal: 0,
        errorsToday: 0,
        avgLatencyMs: null,
      },
      limits: { freeCommandsPerDay: 10_000, freeStorageMb: 256 },
      notes: "Free: 10K commands/day, 256MB. ~2 cmds per rate-limited request. Check console.upstash.com.",
    },
  ];
}

async function getSessions() {
  const [sessions, totalCount] = await Promise.all([
    fetchJSON<{
      id: string; user_id: string; date: string; type: string; difficulty: string; focus: string;
      duration: number; score: number; skill_scores: Record<string, number> | null; created_at: string;
      llm_cost_inr: number | null; prompt_tokens: number | null; completion_tokens: number | null;
    }>(`sessions?select=id,user_id,date,type,difficulty,focus,duration,score,skill_scores,created_at,llm_cost_inr,prompt_tokens,completion_tokens&order=created_at.desc&limit=${LIMIT_SESSIONS}`),
    fetchCount("sessions"),
  ]);

  const scoreDistribution: Record<string, number> = {};
  for (let i = 0; i <= 90; i += 10) { scoreDistribution[`${i}-${i + 9}`] = 0; }
  const byType: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const skillTotals: Record<string, { sum: number; count: number }> = {};
  let durationSum = 0; let durationCount = 0;

  for (const s of sessions) {
    if (s.score != null) { const b = Math.min(90, Math.floor(s.score / 10) * 10); scoreDistribution[`${b}-${b + 9}`]++; }
    byType[s.type || "unknown"] = (byType[s.type || "unknown"] || 0) + 1;
    byDifficulty[s.difficulty || "unknown"] = (byDifficulty[s.difficulty || "unknown"] || 0) + 1;
    if (s.duration > 0) { durationSum += s.duration; durationCount++; }
    if (s.skill_scores) {
      for (const [skill, score] of Object.entries(s.skill_scores)) {
        if (!skillTotals[skill]) skillTotals[skill] = { sum: 0, count: 0 };
        skillTotals[skill].sum += score as number;
        skillTotals[skill].count++;
      }
    }
  }

  const avgSkillScores: Record<string, number> = {};
  for (const [skill, { sum, count }] of Object.entries(skillTotals)) { avgSkillScores[skill] = Math.round(sum / count); }

  return {
    total: totalCount,
    avgScore: sessions.length > 0 ? Math.round(sessions.reduce((s, x) => s + (x.score || 0), 0) / sessions.length) : 0,
    avgDuration: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    scoreDistribution, byType, byDifficulty, avgSkillScores,
    recent: sessions.slice(0, LIMIT_RECENT).map(s => ({
      id: s.id, userId: s.user_id, type: s.type, difficulty: s.difficulty, focus: s.focus,
      score: s.score, duration: s.duration, date: s.created_at,
      llmCostInr: s.llm_cost_inr ?? null, promptTokens: s.prompt_tokens ?? null, completionTokens: s.completion_tokens ?? null,
      isFallback: false,
    })),
  };
}

async function getFeedback() {
  const [feedback, totalCount] = await Promise.all([
    fetchJSON<{
      id: string; user_id: string; session_id: string; rating: string; comment: string;
      session_score: number; session_type: string; created_at: string;
    }>("feedback?select=id,user_id,session_id,rating,comment,session_score,session_type,created_at&order=created_at.desc&limit=200"),
    fetchCount("feedback"),
  ]);

  const byRating: Record<string, number> = {};
  for (const f of feedback) { byRating[f.rating] = (byRating[f.rating] || 0) + 1; }

  return { total: totalCount, byRating, recent: feedback.slice(0, LIMIT_RECENT) };
}

export async function updateSupportStatus(
  id: string,
  status: "new" | "seen" | "resolved",
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  // Set SLA timestamps: first_response_at on first acknowledgement, resolved_at on close.
  // We use ?id=eq.X&first_response_at=is.null so the timestamp only stamps once.
  const patch: Record<string, string | null> = { status };
  if (status === "seen") {
    // Stamp first_response_at only if not already set — done via a conditional filter below
    patch["first_response_at"] = now;
  } else if (status === "resolved") {
    patch["resolved_at"] = now;
  }

  try {
    // For seen: only set first_response_at when it is currently null (first touch)
    const filterSuffix = status === "seen" ? "&first_response_at=is.null" : "";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/support_messages?id=eq.${encodeURIComponent(id)}${filterSuffix}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    // If the conditional filter matched 0 rows (first_response_at already set),
    // still update status without overwriting the timestamp
    if (status === "seen") {
      await fetch(
        `${SUPABASE_URL}/rest/v1/support_messages?id=eq.${encodeURIComponent(id)}&first_response_at=not.is.null`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ status }),
        },
      ).catch(() => { /* best-effort */ });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getSupportMessages() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [messages, totalCount] = await Promise.all([
    fetchJSON<{
      id: string; user_id: string | null; email: string | null; message: string;
      page: string | null; user_agent: string | null; status: string; created_at: string;
      type: string | null; plan_tier: string | null; session_count_30d: number | null;
      first_response_at: string | null; resolved_at: string | null;
    }>("support_messages?select=id,user_id,email,message,page,user_agent,status,created_at,type,plan_tier,session_count_30d,first_response_at,resolved_at&order=created_at.desc&limit=200"),
    fetchCount("support_messages"),
  ]);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalResponseMs = 0;
  let respondedCount = 0;
  let resolvedCount = 0;
  let totalResolutionMs = 0;

  // Volume by day (last 30 days)
  const volumeByDay: Record<string, number> = {};
  const cutoff = new Date(thirtyDaysAgo);

  for (const m of messages) {
    byStatus[m.status || "new"] = (byStatus[m.status || "new"] || 0) + 1;
    const t = m.type || "other";
    byType[t] = (byType[t] || 0) + 1;

    const createdAt = new Date(m.created_at);
    if (createdAt >= cutoff) {
      const day = m.created_at.slice(0, 10);
      volumeByDay[day] = (volumeByDay[day] || 0) + 1;
    }

    if (m.first_response_at) {
      const responseMs = new Date(m.first_response_at).getTime() - new Date(m.created_at).getTime();
      if (responseMs > 0) { totalResponseMs += responseMs; respondedCount++; }
    }
    if (m.resolved_at) {
      const resMs = new Date(m.resolved_at).getTime() - new Date(m.created_at).getTime();
      if (resMs > 0) { totalResolutionMs += resMs; resolvedCount++; }
    }
  }

  const avgResponseHours = respondedCount > 0 ? Math.round((totalResponseMs / respondedCount) / 3_600_000 * 10) / 10 : null;
  const avgResolutionHours = resolvedCount > 0 ? Math.round((totalResolutionMs / resolvedCount) / 3_600_000 * 10) / 10 : null;

  return {
    total: totalCount,
    byStatus,
    byType,
    avgResponseHours,
    avgResolutionHours,
    volumeByDay,
    recent: messages.slice(0, 100),
  };
}

/* ─── New section handlers (referrals, promo codes, calendar) ─── */

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id?: string;
  referred_email?: string;
  status: string;
  reward_granted_at?: string | null;
  created_at: string;
}

// A referral counts as "converted" once the reward has been paid out — i.e.
// status 'rewarded' or a non-null reward_granted_at (the CAS stamp). The legacy
// 'converted' status string never existed in this schema; the canonical values
// are pending | redeemed | rewarded.
function isReferralConverted(r: ReferralRow): boolean {
  return r.status === "rewarded" || !!r.reward_granted_at;
}

interface EmployerRow {
  id: string;
  company_name: string;
  website: string;
  gstin: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  approved_at: string | null;
}

async function getEmployers() {
  const [employers, profiles] = await Promise.all([
    fetchJSON<EmployerRow>("employers?select=id,company_name,website,gstin,status,submitted_at,approved_at&order=submitted_at.desc&limit=1000"),
    fetchJSON<{ id: string; name: string | null; email: string }>("profiles?select=id,name,email&limit=2000"),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, { name: p.name || "(no name)", email: p.email }]));

  const rows = employers.map((e) => ({
    id: e.id,
    companyName: e.company_name,
    website: e.website,
    gstin: e.gstin || null,
    status: e.status,
    submittedAt: e.submitted_at,
    approvedAt: e.approved_at,
    contactName: profileMap.get(e.id)?.name || "(deleted user)",
    contactEmail: profileMap.get(e.id)?.email || "—",
  }));

  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    rows,
  };
}

async function getReferrals() {
  const monthAgo = daysAgo(30);
  const [allReferrals, recentProfiles] = await Promise.all([
    fetchJSON<ReferralRow>("referrals?select=id,referrer_id,referred_id,referred_email,status,reward_granted_at,created_at&order=created_at.desc&limit=500"),
    fetchJSON<{ id: string; name: string | null; email: string; practice_timestamps: string[] | null }>("profiles?select=id,name,email,practice_timestamps&limit=2000"),
  ]);
  const profileMap = new Map(recentProfiles.map((p) => [p.id, { name: p.name || "(no name)", email: p.email }]));

  const total = allReferrals.length;
  const last30d = allReferrals.filter((r) => r.created_at >= monthAgo).length;
  const converted = allReferrals.filter(isReferralConverted).length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  // K-factor = referred signups in the last 30d / users active in the last 30d.
  // The doc's go/no-go metric for the referral loop (target > 0.3). Active =
  // practiced at least once in the window. Reads 0 cleanly when there's no
  // traffic yet (vs. a misleading Infinity).
  const now = Date.now();
  let activeLast30d = 0;
  for (const p of recentProfiles) {
    const ts = p.practice_timestamps;
    if (ts?.length && now - new Date(ts[ts.length - 1]).getTime() < 30 * 86400000) activeLast30d++;
  }
  const k = kFactor(last30d, activeLast30d);

  // Top referrers by total referrals brought in
  const referrerCounts = new Map<string, { count: number; converted: number }>();
  for (const r of allReferrals) {
    const cur = referrerCounts.get(r.referrer_id) || { count: 0, converted: 0 };
    cur.count++;
    if (isReferralConverted(r)) cur.converted++;
    referrerCounts.set(r.referrer_id, cur);
  }
  const topReferrers = Array.from(referrerCounts.entries())
    .map(([id, stats]) => ({
      id,
      name: profileMap.get(id)?.name || "(deleted user)",
      email: profileMap.get(id)?.email || "—",
      total: stats.count,
      converted: stats.converted,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const recent = allReferrals.slice(0, 50).map((r) => ({
    id: r.id,
    referrerName: profileMap.get(r.referrer_id)?.name || "(deleted)",
    refereeEmail: r.referred_email || (r.referred_id ? (profileMap.get(r.referred_id)?.email || "—") : "—"),
    status: r.status,
    rewardGranted: !!r.reward_granted_at,
    createdAt: r.created_at,
  }));

  return { total, last30d, converted, conversionRate, kFactor: k, activeLast30d, topReferrers, recent };
}

interface PromoRow {
  id: string;
  code: string;
  discount_pct?: number;
  discount_amount?: number;
  max_uses: number | null;
  uses: number;
  active: boolean;
  applies_to: string;
  expires_at: string | null;
  created_at: string;
}

async function getPromoCodes() {
  const codes = await fetchJSON<PromoRow>("promo_codes?select=*&order=created_at.desc&limit=200");
  const active = codes.filter((c) => c.active && (!c.expires_at || c.expires_at > new Date().toISOString())).length;
  const expired = codes.filter((c) => c.expires_at && c.expires_at <= new Date().toISOString()).length;
  const totalUses = codes.reduce((sum, c) => sum + (c.uses || 0), 0);
  return {
    total: codes.length,
    active,
    expired,
    totalUses,
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      discountPct: c.discount_pct ?? null,
      discountAmount: c.discount_amount ?? null,
      maxUses: c.max_uses,
      uses: c.uses || 0,
      active: c.active,
      appliesTo: c.applies_to,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
    })),
  };
}

interface CalendarEvent {
  id: string;
  user_id: string;
  type: string;
  date: string;
  time?: string;
  company?: string;
  reminded?: boolean;
  created_at: string;
}

async function getCalendar() {
  const weekAgo = daysAgo(7);
  const today = new Date().toISOString();
  const [allEvents, profiles] = await Promise.all([
    fetchJSON<CalendarEvent>("calendar_events?select=id,user_id,type,date,time,company,reminded,created_at&order=date.desc&limit=500"),
    fetchJSON<{ id: string; name: string | null; email: string }>("profiles?select=id,name,email&limit=2000"),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, { name: p.name || "(no name)", email: p.email }]));

  const upcoming = allEvents.filter((e) => e.date >= today).length;
  const pastWeek = allEvents.filter((e) => e.date >= weekAgo && e.date < today).length;

  // Events grouped by type
  const byType: Record<string, number> = {};
  for (const e of allEvents) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }

  const recent = allEvents.slice(0, 50).map((e) => ({
    id: e.id,
    userName: profileMap.get(e.user_id)?.name || "(deleted user)",
    userEmail: profileMap.get(e.user_id)?.email || "—",
    type: e.type,
    company: e.company || "—",
    date: e.date,
    time: e.time || "",
    reminded: !!e.reminded,
  }));

  return {
    total: allEvents.length,
    upcoming,
    pastWeek,
    byType,
    recent,
  };
}

/**
 * User outcomes — voluntary self-reports of post-HireStepX job-search
 * results. The data unlock for fundraising case studies. Returns counts
 * + the share-permitted testimonials (anonymized: only first name).
 */
async function getOutcomes() {
  const [outcomes, profiles] = await Promise.all([
    fetchJSON<{
      user_id: string; applied: boolean | null; interviewed: boolean | null;
      offer: boolean | null; accepted: boolean | null;
      company: string | null; role_landed: string | null;
      testimonial: string | null; may_share_publicly: boolean;
      reported_at: string;
    }>("user_outcomes?select=*&order=reported_at.desc&limit=500"),
    fetchJSON<{ id: string; name: string | null }>("profiles?select=id,name&limit=2000"),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, p.name || ""]));
  const total = outcomes.length;
  const applied = outcomes.filter((o) => o.applied === true).length;
  const interviewed = outcomes.filter((o) => o.interviewed === true).length;
  const offer = outcomes.filter((o) => o.offer === true).length;
  const accepted = outcomes.filter((o) => o.accepted === true).length;
  const offerRate = total > 0 ? Math.round((offer / total) * 100) : 0;

  const shareableTestimonials = outcomes
    .filter((o) => o.may_share_publicly && o.testimonial)
    .slice(0, 30)
    .map((o) => ({
      firstName: (profileMap.get(o.user_id) || "Anonymous").split(" ")[0],
      company: o.company || "—",
      roleLanded: o.role_landed || "—",
      testimonial: o.testimonial || "",
      reportedAt: o.reported_at,
    }));

  const recent = outcomes.slice(0, 50).map((o) => ({
    name: profileMap.get(o.user_id) || "(deleted user)",
    applied: o.applied,
    interviewed: o.interviewed,
    offer: o.offer,
    accepted: o.accepted,
    company: o.company || "—",
    roleLanded: o.role_landed || "—",
    reportedAt: o.reported_at,
  }));

  return { total, applied, interviewed, offer, accepted, offerRate, shareableTestimonials, recent };
}

/* ─── Cost Analytics ─── */

async function getCostData() {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const thirtyDaysAgo = daysAgo(30);
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);

  const [recentSessions, topSessions, endpointUsage, lastWeekSessions] = await Promise.all([
    // All sessions last 30d with cost fields — includes user_id for per-user aggregation
    fetchJSON<{
      id: string; user_id: string; type: string; focus: string; score: number; duration: number;
      llm_cost_inr: number | null; prompt_tokens: number | null; completion_tokens: number | null;
      created_at: string;
    }>(`sessions?select=id,user_id,type,focus,score,duration,llm_cost_inr,prompt_tokens,completion_tokens,created_at&created_at=gte.${thirtyDaysAgo}&order=created_at.desc&limit=2000`),
    // Top 30 most expensive sessions all-time
    fetchJSON<{
      id: string; user_id: string; type: string; focus: string; score: number; duration: number;
      llm_cost_inr: number | null; prompt_tokens: number | null; completion_tokens: number | null;
      created_at: string;
    }>(`sessions?select=id,user_id,type,focus,score,duration,llm_cost_inr,prompt_tokens,completion_tokens,created_at&llm_cost_inr=not.is.null&order=llm_cost_inr.desc.nullslast&limit=30`),
    // LLM usage by endpoint for cost-per-endpoint breakdown
    fetchJSON<{ endpoint: string; total_tokens: number; is_fallback: boolean; created_at: string }>(
      `llm_usage?select=endpoint,total_tokens,is_fallback,created_at&created_at=gte.${thirtyDaysAgo}&limit=5000`,
    ),
    // Sessions 8–14 days ago (prior week) for week-over-week comparison
    fetchJSON<{ llm_cost_inr: number | null }>(
      `sessions?select=llm_cost_inr&created_at=gte.${fourteenDaysAgo}&created_at=lt.${sevenDaysAgo}&limit=2000`,
    ),
  ]);

  const costedSessions = recentSessions.filter(s => s.llm_cost_inr != null && s.llm_cost_inr > 0);
  const totalLlmInr = costedSessions.reduce((sum, s) => sum + (s.llm_cost_inr || 0), 0);
  const avgCostPerSession = costedSessions.length > 0 ? totalLlmInr / costedSessions.length : 0;
  const highestSessionCostInr = topSessions.length > 0 ? (topSessions[0].llm_cost_inr || 0) : 0;

  // Data coverage — how many sessions have cost data vs total
  const nullCostCount = recentSessions.length - costedSessions.length;
  const dataCoveragePercent = recentSessions.length > 0
    ? Math.round((costedSessions.length / recentSessions.length) * 100)
    : 0;

  // Week-over-week: this week vs prior week
  const thisWeekSessions = costedSessions.filter(s => s.created_at >= sevenDaysAgo);
  const thisWeekInr = round2(thisWeekSessions.reduce((sum, s) => sum + (s.llm_cost_inr || 0), 0));
  const lastWeekInr = round2(lastWeekSessions.filter(s => s.llm_cost_inr != null && s.llm_cost_inr > 0)
    .reduce((sum, s) => sum + (s.llm_cost_inr || 0), 0));
  const wowDeltaPct = lastWeekInr > 0
    ? Math.round(((thisWeekInr - lastWeekInr) / lastWeekInr) * 100)
    : null;

  // Today's cost + anomaly detection (today vs 30d daily average)
  const todayCostInr = round2(costedSessions
    .filter(s => s.created_at?.slice(0, 10) === today)
    .reduce((sum, s) => sum + (s.llm_cost_inr || 0), 0));
  const dailyAvgInr = round2(totalLlmInr / 30);
  // Spike if today is 2× the 30d daily average and exceeds ₹0.20 absolute
  const isCostSpike = todayCostInr > dailyAvgInr * 2 && todayCostInr > 0.2;

  // Cost by focus type
  const focusMap: Record<string, { total: number; count: number }> = {};
  for (const s of costedSessions) {
    const key = s.focus || s.type || "unknown";
    if (!focusMap[key]) focusMap[key] = { total: 0, count: 0 };
    focusMap[key].total += s.llm_cost_inr || 0;
    focusMap[key].count++;
  }
  const byFocus: Record<string, { totalInr: number; sessions: number; avgInr: number }> = {};
  for (const [k, v] of Object.entries(focusMap)) {
    byFocus[k] = {
      totalInr: round2(v.total),
      sessions: v.count,
      avgInr: round2(v.count > 0 ? v.total / v.count : 0),
    };
  }

  // Daily cost trend (30d)
  const perDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    perDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0;
  }
  for (const s of costedSessions) {
    const d = s.created_at?.slice(0, 10);
    if (d && d in perDay) perDay[d] = round2((perDay[d] || 0) + (s.llm_cost_inr || 0));
  }

  // Cost by endpoint (estimated from token counts × rate card)
  const epMap: Record<string, { primaryTokens: number; fallbackTokens: number; calls: number }> = {};
  for (const u of endpointUsage) {
    const ep = u.endpoint || "unknown";
    if (!epMap[ep]) epMap[ep] = { primaryTokens: 0, fallbackTokens: 0, calls: 0 };
    epMap[ep].calls++;
    if (u.is_fallback) epMap[ep].fallbackTokens += u.total_tokens || 0;
    else epMap[ep].primaryTokens += u.total_tokens || 0;
  }
  const byEndpoint: Record<string, { estimatedInr: number; tokens: number; calls: number }> = {};
  for (const [ep, d] of Object.entries(epMap)) {
    byEndpoint[ep] = {
      estimatedInr: round2(llmInr(d.primaryTokens, false) + llmInr(d.fallbackTokens, true)),
      tokens: d.primaryTokens + d.fallbackTokens,
      calls: d.calls,
    };
  }

  // Top 5 users by LLM spend (30d) — compute from costedSessions
  const userCostMap: Record<string, { total: number; sessions: number }> = {};
  for (const s of costedSessions) {
    const uid = s.user_id || "unknown";
    if (!userCostMap[uid]) userCostMap[uid] = { total: 0, sessions: 0 };
    userCostMap[uid].total += s.llm_cost_inr || 0;
    userCostMap[uid].sessions++;
  }
  const topUserIds = Object.entries(userCostMap)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5)
    .map(([uid]) => uid);
  // Fetch profiles for top users
  let topUserProfiles: { id: string; name: string | null; email: string }[] = [];
  if (topUserIds.length > 0) {
    topUserProfiles = await fetchJSON<{ id: string; name: string | null; email: string }>(
      `profiles?id=in.(${topUserIds.map(id => encodeURIComponent(id)).join(",")})&select=id,name,email&limit=5`,
    );
  }
  const profileMap = new Map(topUserProfiles.map(p => [p.id, { name: p.name || "(no name)", email: p.email }]));
  const topUsersByCost = topUserIds.map(uid => ({
    userId: uid,
    name: profileMap.get(uid)?.name || "(no name)",
    email: profileMap.get(uid)?.email || "—",
    totalLlmInr: round2(userCostMap[uid].total),
    sessions: userCostMap[uid].sessions,
    avgInr: round2(userCostMap[uid].sessions > 0 ? userCostMap[uid].total / userCostMap[uid].sessions : 0),
  }));

  return {
    totalLlmInr: round2(totalLlmInr),
    avgCostPerSession: round2(avgCostPerSession),
    highestSessionCostInr: round2(highestSessionCostInr),
    sessionCount: costedSessions.length,
    totalSessions30d: recentSessions.length,
    nullCostCount,
    dataCoveragePercent,
    thisWeekInr,
    lastWeekInr,
    wowDeltaPct,
    todayCostInr,
    dailyAvgInr,
    isCostSpike,
    byFocus,
    perDay,
    byEndpoint,
    topUsersByCost,
    topExpensiveSessions: topSessions.map(s => ({
      id: s.id,
      userId: s.user_id,
      focus: s.focus || s.type || "—",
      score: s.score || 0,
      duration: s.duration || 0,
      llmCostInr: round2(s.llm_cost_inr || 0),
      promptTokens: s.prompt_tokens || 0,
      completionTokens: s.completion_tokens || 0,
      date: s.created_at,
    })),
  };
}

/* ─── Health Alerts ─── */

type AlertSeverity = "critical" | "warning";
interface HealthAlert {
  severity: AlertSeverity;
  code: string;
  message: string;
  action: string;
}

async function getHealthAlerts(): Promise<{ alerts: HealthAlert[]; checkedAt: string }> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);

  const [todaySessions, recentSessions, llmUsageRecent, llmUsagePrev] = await Promise.all([
    // Sessions today (count + cost coverage)
    fetchJSON<{ id: string; llm_cost_inr: number | null; score: number | null; created_at: string }>(
      `sessions?select=id,llm_cost_inr,score,created_at&created_at=gte.${today}&limit=500`,
    ),
    // Sessions last 30d for volume baseline (just ids + date, cheap)
    fetchJSON<{ created_at: string }>(
      `sessions?select=created_at&created_at=gte.${sevenDaysAgo}&limit=2000`,
    ),
    // LLM usage last 24h for fallback rate
    fetchJSON<{ is_fallback: boolean; total_tokens: number }>(
      `llm_usage?select=is_fallback,total_tokens&created_at=gte.${yesterday}&limit=2000`,
    ),
    // LLM usage prior week for WoW fallback comparison
    fetchJSON<{ is_fallback: boolean }>(
      `llm_usage?select=is_fallback&created_at=gte.${fourteenDaysAgo}&created_at=lt.${sevenDaysAgo}&limit=2000`,
    ),
  ]);

  const alerts: HealthAlert[] = [];
  const round1 = (n: number) => Math.round(n * 10) / 10;

  // ── Signal 1: LLM fallback rate ──
  const totalCalls24h = llmUsageRecent.length;
  const fallbackCalls24h = llmUsageRecent.filter(u => u.is_fallback).length;
  const fallbackRate = totalCalls24h > 0 ? fallbackCalls24h / totalCalls24h : 0;
  const prevFallbackRate = llmUsagePrev.length > 0
    ? llmUsagePrev.filter(u => u.is_fallback).length / llmUsagePrev.length
    : 0;

  if (fallbackRate > 0.5 && totalCalls24h >= 5) {
    alerts.push({
      severity: "critical",
      code: "llm_groq_down",
      message: `Groq is down or heavily throttled — ${Math.round(fallbackRate * 100)}% of LLM calls in the last 24h routed to Gemini fallback (${fallbackCalls24h}/${totalCalls24h} calls).`,
      action: "Check status.groq.com and Groq dashboard. Gemini fallback is active but costs ~2.3× more per token.",
    });
  } else if (fallbackRate > 0.2 && totalCalls24h >= 5 && fallbackRate > prevFallbackRate * 1.5) {
    alerts.push({
      severity: "warning",
      code: "llm_fallback_elevated",
      message: `Groq fallback rate elevated — ${Math.round(fallbackRate * 100)}% vs ${Math.round(prevFallbackRate * 100)}% last week (${fallbackCalls24h}/${totalCalls24h} calls in 24h).`,
      action: "Monitor Groq latency. If this continues, check rate limits on the Groq console.",
    });
  }

  // ── Signal 2: Session cost coverage ──
  if (todaySessions.length >= 3) {
    const costed = todaySessions.filter(s => s.llm_cost_inr != null && s.llm_cost_inr > 0).length;
    const coverage = costed / todaySessions.length;
    if (coverage < 0.4) {
      alerts.push({
        severity: "critical",
        code: "cost_patch_broken",
        message: `Cost tracking broken — only ${Math.round(coverage * 100)}% of today's ${todaySessions.length} sessions have llm_cost_inr (${costed} have data, ${todaySessions.length - costed} missing).`,
        action: "Check save-session.ts fire-and-forget PATCH. The llm_usage insert or the PATCH itself is failing silently.",
      });
    } else if (coverage < 0.7) {
      alerts.push({
        severity: "warning",
        code: "cost_coverage_low",
        message: `Cost coverage is ${Math.round(coverage * 100)}% today (${costed}/${todaySessions.length} sessions). Missing data will skew averages.`,
        action: "Investigate llm_usage write failures in save-session.ts.",
      });
    }
  }

  // ── Signal 3: Session volume anomaly ──
  // Compare today vs prior 7-day daily average
  const priorDayCounts: Record<string, number> = {};
  for (const s of recentSessions) {
    const d = s.created_at?.slice(0, 10);
    if (d && d !== today) priorDayCounts[d] = (priorDayCounts[d] || 0) + 1;
  }
  const priorDays = Object.values(priorDayCounts);
  if (priorDays.length >= 3) {
    const dailyAvg = priorDays.reduce((a, b) => a + b, 0) / priorDays.length;
    const todayCount = todaySessions.length;
    const hourOfDay = new Date(now).getUTCHours();
    // Pro-rate today based on how far through the day we are (avoid false alerts at midnight)
    const prorated = hourOfDay >= 8 ? (todayCount / (hourOfDay / 24)) : null;

    if (prorated != null && dailyAvg > 5) {
      if (prorated < dailyAvg * 0.2) {
        alerts.push({
          severity: "critical",
          code: "session_volume_crash",
          message: `Session volume is critically low — ${todayCount} sessions so far today (est. ${Math.round(prorated)}/day extrapolated), vs ${round1(dailyAvg)} daily avg. Possible app outage.`,
          action: "Check Vercel function logs, Supabase status, and the interview flow end-to-end.",
        });
      } else if (prorated < dailyAvg * 0.4) {
        alerts.push({
          severity: "warning",
          code: "session_volume_low",
          message: `Session volume is down — ${todayCount} sessions so far today (est. ${Math.round(prorated)}/day), vs ${round1(dailyAvg)} daily avg (7d).`,
          action: "Monitor for the next hour. Could be time-of-day variation or a soft funnel issue.",
        });
      }
    }
  }

  // ── Signal 4: Failed sessions (score=null or score=0) ──
  if (todaySessions.length >= 3) {
    const failed = todaySessions.filter(s => s.score == null || s.score === 0).length;
    const failRate = failed / todaySessions.length;
    if (failRate > 0.4) {
      alerts.push({
        severity: "critical",
        code: "session_failures_high",
        message: `${Math.round(failRate * 100)}% of today's sessions have null/zero score (${failed}/${todaySessions.length}). Likely evaluation pipeline failing.`,
        action: "Check evaluate-session.ts, Groq/Gemini response parsing, and recent error logs.",
      });
    } else if (failRate > 0.2) {
      alerts.push({
        severity: "warning",
        code: "session_failures_elevated",
        message: `${Math.round(failRate * 100)}% of today's sessions scored 0 or null (${failed}/${todaySessions.length}).`,
        action: "Spot-check recent sessions in the Sessions tab. May indicate LLM JSON parse errors.",
      });
    }
  }

  return {
    alerts,
    checkedAt: new Date(now).toISOString(),
  };
}

/* ─── Handler ─── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();

  const auth = verifyAuth(req);
  if (!auth.ok) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  const body = req.body as { section?: string; action?: string; search?: string; offset?: number; userId?: string; sessionId?: string; id?: string; status?: string; tier?: string; days?: number; qty?: number; note?: string; paymentId?: string; amountPaise?: number; subject?: string; htmlBody?: string } | undefined;
  const section = body?.section || body?.action || "overview";

  try {
    const data = await (async () => {
      switch (section) {
        case "overview": return getOverview();
        case "users": return getUsers(body?.search, body?.offset);
        case "user-detail":
          if (!body?.userId) throw new Error("userId required");
          return getUserDetail(body.userId);
        case "session-detail":
          if (!body?.sessionId) throw new Error("sessionId required");
          return getSessionDetail(body.sessionId);
        case "financials": return getFinancials();
        case "llm": return getLLMUsage();
        case "sessions": return getSessions();
        case "feedback": return getFeedback();
        case "support-messages": return getSupportMessages();
        case "referrals": return getReferrals();
        case "employers": return getEmployers();
        case "promo-codes": return getPromoCodes();
        case "calendar": return getCalendar();
        case "outcomes": return getOutcomes();
        case "costs": return getCostData();
        case "health": return getHealthAlerts();
        case "update-support-status": {
          if (!body?.id) throw new Error("id required");
          const s = body.status;
          if (s !== "new" && s !== "seen" && s !== "resolved") throw new Error("status must be new | seen | resolved");
          return updateSupportStatus(body.id, s);
        }
        case "extend-subscription": {
          if (!body?.userId) throw new Error("userId required");
          const tier = body.tier as string | undefined;
          const days = Number(body.days ?? 30);
          if (!tier || !["free", "starter"].includes(tier)) throw new Error("tier must be free | starter");
          if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("days must be 1–366");
          const now = new Date();
          const newEnd = new Date(now.getTime() + days * 86400000).toISOString();
          // For starter (Sprint Pack): the session limit counts sessions since subscription_start,
          // NOT since subscription_end. If the user has exhausted their 5 sessions, only resetting
          // subscription_start opens a fresh window — pushing subscription_end alone does nothing.
          const patchPayload: Record<string, string> = {
            subscription_tier: tier,
            subscription_end: newEnd,
          };
          if (tier === "starter") {
            patchPayload.subscription_start = now.toISOString();
          }
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(body.userId)}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify(patchPayload),
            },
          );
          if (!patchRes.ok) {
            const body2 = await patchRes.text().catch(() => "");
            return { ok: false, error: `Supabase PATCH failed: HTTP ${patchRes.status}: ${body2.slice(0, 200)}` };
          }
          return { ok: true, tier, days, newEnd };
        }
        case "grant-credits": {
          if (!body?.userId) throw new Error("userId required");
          const qty = Number(body.qty ?? 0);
          if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error("qty must be 1–100");
          const note = typeof body.note === "string" ? body.note.slice(0, 200) : "admin grant";
          const rpcRes = await fetch(
            `${SUPABASE_URL}/rest/v1/rpc/grant_session_credits`,
            {
              method: "POST",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ p_user_id: body.userId, p_qty: qty, p_note: note }),
            },
          );
          if (!rpcRes.ok) {
            const body2 = await rpcRes.text().catch(() => "");
            return { ok: false, error: `RPC failed: HTTP ${rpcRes.status}: ${body2.slice(0, 200)}` };
          }
          const newBalance = await rpcRes.json().catch(() => null);
          return { ok: true, qty, note, newBalance: typeof newBalance === "number" ? newBalance : null };
        }
        case "ban-user": {
          if (!body?.userId) throw new Error("userId required");
          const banRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(body.userId)}`,
            {
              method: "PUT",
              headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ ban_duration: "876000h" }),
            },
          );
          if (!banRes.ok) return { ok: false, error: `Auth ban failed: HTTP ${banRes.status}` };
          return { ok: true };
        }
        case "approve-employer": {
          if (!body?.id) throw new Error("id required");
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/employers?id=eq.${encodeURIComponent(body.id)}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString() }),
            },
          );
          if (!patchRes.ok) return { ok: false, error: `Approve failed: HTTP ${patchRes.status}` };
          return { ok: true };
        }
        case "reject-employer": {
          if (!body?.id) throw new Error("id required");
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/employers?id=eq.${encodeURIComponent(body.id)}`,
            {
              method: "PATCH",
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ status: "rejected", approved_at: null }),
            },
          );
          if (!patchRes.ok) return { ok: false, error: `Reject failed: HTTP ${patchRes.status}` };
          return { ok: true };
        }
        case "unban-user": {
          if (!body?.userId) throw new Error("userId required");
          const unbanRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(body.userId)}`,
            {
              method: "PUT",
              headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ ban_duration: "none" }),
            },
          );
          if (!unbanRes.ok) return { ok: false, error: `Auth unban failed: HTTP ${unbanRes.status}` };
          return { ok: true };
        }
        case "delete-user": {
          if (!body?.userId) throw new Error("userId required");
          const encoded2 = encodeURIComponent(body.userId);
          // Hard-delete auth user; FK cascades delete sessions, payments, etc.
          const delRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${encoded2}`,
            {
              method: "DELETE",
              headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            },
          );
          if (!delRes.ok) {
            const txt = await delRes.text().catch(() => "");
            return { ok: false, error: `Delete failed: HTTP ${delRes.status}: ${txt.slice(0, 200)}` };
          }
          return { ok: true };
        }
        case "refund-payment": {
          if (!body?.paymentId) throw new Error("paymentId required");
          if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return { ok: false, error: "Razorpay keys not configured" };
          const amountPaise = body.amountPaise ? Number(body.amountPaise) : undefined;
          if (amountPaise !== undefined && (!Number.isInteger(amountPaise) || amountPaise < 100)) {
            throw new Error("amountPaise must be an integer ≥ 100");
          }
          const rzpAuth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
          const refundBody: Record<string, unknown> = {};
          if (amountPaise) refundBody.amount = amountPaise;
          const rzpRes = await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(String(body.paymentId))}/refund`,
            {
              method: "POST",
              headers: { Authorization: `Basic ${rzpAuth}`, "Content-Type": "application/json" },
              body: JSON.stringify(refundBody),
            },
          );
          if (!rzpRes.ok) {
            const txt = await rzpRes.text().catch(() => "");
            return { ok: false, error: `Razorpay refund failed: HTTP ${rzpRes.status}: ${txt.slice(0, 300)}` };
          }
          const refundData = await rzpRes.json() as { id?: string; amount?: number; status?: string };
          return { ok: true, refundId: refundData.id, amount: refundData.amount, status: refundData.status };
        }
        case "send-email": {
          if (!body?.userId || !body?.subject || !body?.htmlBody) throw new Error("userId, subject, and htmlBody required");
          if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not configured" };
          const subjectStr = String(body.subject).slice(0, 200);
          const htmlStr = String(body.htmlBody).slice(0, 20000);
          // Fetch user email from profiles
          const prof = await fetchJSON<{ email: string }>(`profiles?id=eq.${encodeURIComponent(body.userId)}&select=email&limit=1`);
          const toEmail = prof[0]?.email;
          if (!toEmail) return { ok: false, error: "User email not found" };
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "HireStepX <noreply@hirestepx.com>",
              to: [toEmail],
              subject: subjectStr,
              html: htmlStr,
            }),
          });
          if (!emailRes.ok) {
            const txt = await emailRes.text().catch(() => "");
            return { ok: false, error: `Resend failed: HTTP ${emailRes.status}: ${txt.slice(0, 200)}` };
          }
          const emailData = await emailRes.json() as { id?: string };
          return { ok: true, emailId: emailData.id, to: toEmail };
        }
        case "live": {
          const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const liveSessions = await fetchJSON<{ id: string; user_id: string; type: string; difficulty: string; score: number | null; created_at: string }>(
            `sessions?created_at=gte.${encodeURIComponent(since)}&select=id,user_id,type,difficulty,score,created_at&order=created_at.desc&limit=50`,
          );
          return { sessions: liveSessions, since };
        }
        default: throw new Error(`Unknown section: ${section}`);
      }
    })();

    // Include a fresh token in every response so the client stays authenticated
    return res.status(200).json({ ...data as object, _token: createAdminToken() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch admin data";
    console.error("Admin data error:", msg);
    const status = msg.includes("required") || msg.includes("Unknown") ? 400 : 500;
    return res.status(status).json({ error: status === 400 ? "Bad request" : "Internal server error" });
  }
}

/* Admin Dashboard API — returns aggregated metrics for the admin panel.
 * Security: timing-safe password comparison, rate limiting, session tokens with expiry. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";

/* ─── Config ─── */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || "").trim();
const TOKEN_SECRET = process.env.ADMIN_PASSWORD || "fallback-secret";
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/* Query limits — reasonable caps to prevent huge payloads */
const LIMIT_PROFILES = 2000;
const LIMIT_SESSIONS = 2000;
const LIMIT_PAYMENTS = 1000;
const LIMIT_LLM = 2000;
const LIMIT_RECENT = 30;

/* ─── Rate Limiting (in-memory, per serverless instance) ─── */

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return "unknown";
}

/* ─── Session Tokens ─── */

function createToken(): string {
  const payload = { iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS };
  const data = JSON.stringify(payload);
  const sig = createHmac("sha256", TOKEN_SECRET).update(data).digest("hex");
  return Buffer.from(data).toString("base64") + "." + sig;
}

function verifyToken(token: string): boolean {
  try {
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return false;
    const data = Buffer.from(dataB64, "base64").toString();
    const expectedSig = createHmac("sha256", TOKEN_SECRET).update(data).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false;
    const payload = JSON.parse(data);
    if (Date.now() > payload.exp) return false;
    return true;
  } catch { return false; }
}

/* ─── Auth ─── */

function verifyPassword(input: string): boolean {
  if (!ADMIN_PASSWORD || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) {
    // Compare against padded buffer to prevent length-based timing leaks
    const padded = Buffer.alloc(b.length);
    a.copy(padded, 0, 0, Math.min(a.length, b.length));
    timingSafeEqual(padded, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Check auth: either password (for login) or token (for subsequent requests) */
function verifyAuth(req: VercelRequest): { ok: boolean; isLogin?: boolean } {
  // Check for session token first
  const token = req.headers["x-admin-token"];
  if (token && typeof token === "string" && verifyToken(token)) {
    return { ok: true };
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
    profiles,
    recentSessions,
    payments,
    llmRecent,
  ] = await Promise.all([
    fetchCount("profiles"),
    fetchCount("profiles", `&created_at=gte.${weekAgo}`),
    fetchCount("sessions"),
    fetchCount("sessions", `&created_at=gte.${weekAgo}`),
    fetchJSON<{ id: string; subscription_tier: string; practice_timestamps: string[] | null }>(
      `profiles?select=id,subscription_tier,practice_timestamps&limit=${LIMIT_PROFILES}`
    ),
    fetchJSON<{ score: number; created_at: string }>(
      `sessions?select=score,created_at&order=created_at.desc&limit=${LIMIT_SESSIONS}`
    ),
    fetchJSON<{ amount: number; status: string; created_at: string }>(
      `payments?select=amount,status,created_at&order=created_at.desc&limit=${LIMIT_PAYMENTS}`
    ),
    fetchJSON<{ total_tokens: number; is_fallback: boolean; status: string; created_at: string }>(
      `llm_usage?select=total_tokens,is_fallback,status,created_at&order=created_at.desc&limit=${LIMIT_LLM}`
    ),
  ]);

  const now = Date.now();

  // Tier breakdown + active users
  const tierBreakdown: Record<string, number> = { free: 0, starter: 0, pro: 0, team: 0 };
  let activeLastWeek = 0;
  for (const p of profiles) {
    tierBreakdown[p.subscription_tier || "free"] = (tierBreakdown[p.subscription_tier || "free"] || 0) + 1;
    if (p.practice_timestamps?.length) {
      const last = new Date(p.practice_timestamps[p.practice_timestamps.length - 1]).getTime();
      if (now - last < 7 * 86400000) activeLastWeek++;
    }
  }

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

  return {
    users: { total: totalUserCount, today: profiles.filter(p => false).length, thisWeek: weekUserCount, activeLastWeek, tierBreakdown },
    sessions: { total: totalSessionCount, today: recentSessions.filter(s => s.created_at?.startsWith(today)).length, thisWeek: weekSessionCount, avgScore, perDay: sessionsPerDay },
    revenue: { totalPaise: totalRevenue, thisMonthPaise: revenueThisMonth, paymentCount: successPayments.length },
    llm: { tokensToday, fallbackRate, errorRate, totalCalls: llmRecent.length },
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

  // Get session counts only for the users on this page (not ALL users)
  const userIds = (profiles as Array<{ id: string }>).map(p => p.id);
  const countMap: Record<string, number> = {};
  if (userIds.length > 0) {
    // Batch query: get sessions for these specific users
    const sessionData = await fetchJSON<{ user_id: string }>(
      `sessions?select=user_id&user_id=in.(${userIds.map(id => encodeURIComponent(id)).join(",")})&limit=10000`
    );
    for (const s of sessionData) {
      countMap[s.user_id] = (countMap[s.user_id] || 0) + 1;
    }
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
  const [profile, sessions, payments, llmUsage, feedback] = await Promise.all([
    fetchJSON(`profiles?id=eq.${encoded}&select=id,name,email,subscription_tier,target_role,target_company,experience_level,industry,subscription_start,subscription_end,cancel_at_period_end,has_completed_onboarding,created_at&limit=1`),
    fetchJSON(`sessions?user_id=eq.${encoded}&select=id,date,type,difficulty,duration,score,skill_scores,created_at&order=created_at.desc&limit=50`),
    fetchJSON(`payments?user_id=eq.${encoded}&select=id,amount,currency,status,plan,tier,created_at&order=created_at.desc&limit=30`),
    fetchJSON(`llm_usage?user_id=eq.${encoded}&select=endpoint,model,total_tokens,latency_ms,status,created_at&order=created_at.desc&limit=100`),
    fetchJSON(`feedback?user_id=eq.${encoded}&select=id,rating,comment,session_score,session_type,created_at&order=created_at.desc&limit=20`),
  ]);

  return { profile: profile[0] || null, sessions, payments, llmUsage, feedback };
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
    fetchJSON<{ endpoint: string; model: string; total_tokens: number; latency_ms: number; status: string; created_at: string }>(
      `llm_usage?endpoint=ilike.evaluate*&select=endpoint,model,total_tokens,latency_ms,status,created_at&order=created_at.desc&limit=20`,
    ),
  ]);
  const session = sessionRows[0];
  if (!session) return { session: null, profile: null, qaPairs: [], llmCalls: [] };

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

  return { session, profile, qaPairs, llmCalls: llmUsage };
}

async function getFinancials() {
  const payments = await fetchJSON<{
    id: string; user_id: string; amount: number; currency: string; status: string; tier: string; plan: string; created_at: string;
  }>(`payments?select=id,user_id,amount,currency,status,tier,plan,created_at&order=created_at.desc&limit=${LIMIT_PAYMENTS}`);

  const now = Date.now();
  const monthAgo = daysAgo(30);
  const success = payments.filter(p => p.status === "captured" || p.status === "paid" || p.status === "success");

  const totalRevenue = success.reduce((s, p) => s + (p.amount || 0), 0);
  const revenueThisMonth = success.filter(p => p.created_at >= monthAgo).reduce((s, p) => s + (p.amount || 0), 0);

  const byPlan: Record<string, number> = {};
  for (const p of success) { const k = p.plan || p.tier || "unknown"; byPlan[k] = (byPlan[k] || 0) + p.amount; }

  const perDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) { perDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0; }
  for (const p of success) { const d = p.created_at?.slice(0, 10); if (d && d in perDay) perDay[d] += p.amount || 0; }

  return {
    totalRevenuePaise: totalRevenue,
    revenueThisMonthPaise: revenueThisMonth,
    totalPayments: success.length,
    byPlan,
    perDay,
    recent: payments.slice(0, LIMIT_RECENT).map(p => ({
      id: p.id, amount: p.amount, currency: p.currency, status: p.status, plan: p.plan || p.tier, date: p.created_at,
    })),
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
  const errorCount = usage.filter(u => u.status === "error" || u.status === "timeout").length;

  return {
    totalCalls: usage.length,
    totalTokens,
    todayTokens,
    fallbackRate: usage.length > 0 ? Math.round((fallbackCount / usage.length) * 100) : 0,
    errorRate: usage.length > 0 ? Math.round((errorCount / usage.length) * 100) : 0,
    byEndpoint: cleanEndpoints,
    byModel,
    tokensPerDay,
    recentErrors: usage.filter(u => u.status === "error" || u.status === "timeout").slice(0, 20).map(u => ({
      endpoint: u.endpoint, model: u.model, error: u.error_message, date: u.created_at,
    })),
    // Service details for the enhanced Services view
    services: await buildServiceDetails(usage),
  };
}

/** Build detailed per-service breakdown with real usage from service_usage table + llm_usage */
async function buildServiceDetails(
  llmUsage: Array<{ model: string; is_fallback: boolean; total_tokens: number; latency_ms: number; status: string; created_at: string }>,
) {
  const today = daysAgo(0).slice(0, 10);
  const monthAgo = daysAgo(30).slice(0, 10);
  const todayUsage = llmUsage.filter(u => u.created_at?.startsWith(today));

  // Groq usage (primary LLM)
  const groqCalls = llmUsage.filter(u => !u.is_fallback && (u.model?.includes("llama") || u.model?.includes("groq")));
  const groqToday = todayUsage.filter(u => !u.is_fallback && (u.model?.includes("llama") || u.model?.includes("groq")));
  const groqTokensToday = groqToday.reduce((s, u) => s + (u.total_tokens || 0), 0);
  const groqErrors = groqCalls.filter(u => u.status === "error" || u.status === "timeout").length;
  const groqAvgLatency = groqCalls.length > 0 ? Math.round(groqCalls.reduce((s, u) => s + (u.latency_ms || 0), 0) / groqCalls.length) : 0;

  // Gemini usage (fallback LLM)
  const geminiCalls = llmUsage.filter(u => u.is_fallback || u.model?.includes("gemini"));
  const geminiToday = todayUsage.filter(u => u.is_fallback || u.model?.includes("gemini"));
  const geminiTokensToday = geminiToday.reduce((s, u) => s + (u.total_tokens || 0), 0);
  const geminiErrors = geminiCalls.filter(u => u.status === "error" || u.status === "timeout").length;
  const geminiAvgLatency = geminiCalls.length > 0 ? Math.round(geminiCalls.reduce((s, u) => s + (u.latency_ms || 0), 0) / geminiCalls.length) : 0;

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
      model: "llama-3.3-70b-versatile",
      status: groqErrors > groqCalls.length * 0.1 ? "degraded" : "healthy",
      usage: {
        callsTotal: groqCalls.length,
        callsToday: groqToday.length,
        tokensToday: groqTokensToday,
        tokensTotal: groqCalls.reduce((s, u) => s + (u.total_tokens || 0), 0),
        errorsTotal: groqErrors,
        errorsToday: groqToday.filter(u => u.status === "error" || u.status === "timeout").length,
        avgLatencyMs: groqAvgLatency,
      },
      limits: { requestsPerDay: 14400, tokensPerDay: 1_000_000 },
      notes: "Free tier: 30 RPM, ~1M TPD. Upgrade at console.groq.com if hitting limits.",
    },
    {
      name: "Google Gemini",
      type: "LLM",
      role: "Fallback",
      model: "gemini-2.0-flash",
      status: geminiErrors > geminiCalls.length * 0.2 ? "degraded" : "healthy",
      usage: {
        callsTotal: geminiCalls.length,
        callsToday: geminiToday.length,
        tokensToday: geminiTokensToday,
        tokensTotal: geminiCalls.reduce((s, u) => s + (u.total_tokens || 0), 0),
        errorsTotal: geminiErrors,
        errorsToday: geminiToday.filter(u => u.is_fallback && (u.status === "error" || u.status === "timeout")).length,
        avgLatencyMs: geminiAvgLatency,
      },
      limits: { requestsPerDay: 100_000, tokensPerDay: 10_000_000 },
      notes: "Free tier: 1500 RPM, 10M TPD. Only used when Groq fails. Upgrade at aistudio.google.com.",
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
      role: "Fallback (Hinglish)",
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
      notes: "Used for Hinglish code-switching. Check dashboard.sarvam.ai for usage.",
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
      id: string; user_id: string; date: string; type: string; difficulty: string;
      duration: number; score: number; skill_scores: Record<string, number> | null; created_at: string;
    }>(`sessions?select=id,user_id,date,type,difficulty,duration,score,skill_scores,created_at&order=created_at.desc&limit=${LIMIT_SESSIONS}`),
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
      id: s.id, userId: s.user_id, type: s.type, difficulty: s.difficulty, score: s.score, duration: s.duration, date: s.created_at,
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

/* ─── New section handlers (referrals, promo codes, calendar, story notebook) ─── */

interface ReferralRow {
  id: string;
  referrer_id: string;
  referee_id?: string;
  referee_email?: string;
  status: string;
  reward_granted_at?: string | null;
  created_at: string;
}

async function getReferrals() {
  const monthAgo = daysAgo(30);
  const [allReferrals, recentProfiles] = await Promise.all([
    fetchJSON<ReferralRow>("referrals?select=id,referrer_id,referee_id,referee_email,status,reward_granted_at,created_at&order=created_at.desc&limit=500"),
    fetchJSON<{ id: string; name: string | null; email: string }>("profiles?select=id,name,email&limit=2000"),
  ]);
  const profileMap = new Map(recentProfiles.map((p) => [p.id, { name: p.name || "(no name)", email: p.email }]));

  const total = allReferrals.length;
  const last30d = allReferrals.filter((r) => r.created_at >= monthAgo).length;
  const converted = allReferrals.filter((r) => r.status === "converted" || !!r.reward_granted_at).length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  // Top referrers by total referrals brought in
  const referrerCounts = new Map<string, { count: number; converted: number }>();
  for (const r of allReferrals) {
    const cur = referrerCounts.get(r.referrer_id) || { count: 0, converted: 0 };
    cur.count++;
    if (r.status === "converted" || r.reward_granted_at) cur.converted++;
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
    refereeEmail: r.referee_email || (r.referee_id ? (profileMap.get(r.referee_id)?.email || "—") : "—"),
    status: r.status,
    rewardGranted: !!r.reward_granted_at,
    createdAt: r.created_at,
  }));

  return { total, last30d, converted, conversionRate, topReferrers, recent };
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

async function getStoryNotebookStats() {
  const [stories, profiles] = await Promise.all([
    fetchJSON<{ id: string; user_id: string; title: string; tags: string[] | null; created_at: string; last_used_at: string | null }>(
      "story_notebook?select=id,user_id,title,tags,created_at,last_used_at&order=created_at.desc&limit=500",
    ),
    fetchJSON<{ id: string; name: string | null; email: string }>("profiles?select=id,name,email&limit=2000"),
  ]);
  const profileMap = new Map(profiles.map((p) => [p.id, { name: p.name || "(no name)", email: p.email }]));

  const now = Date.now();
  const sevenDaysMs = 7 * 86400000;
  const dueForReview = stories.filter((s) => {
    const ref = new Date(s.last_used_at || s.created_at).getTime();
    return now - ref >= sevenDaysMs;
  }).length;

  // Top users by story count
  const userCounts = new Map<string, number>();
  for (const s of stories) userCounts.set(s.user_id, (userCounts.get(s.user_id) || 0) + 1);
  const topUsers = Array.from(userCounts.entries())
    .map(([id, count]) => ({
      id, count,
      name: profileMap.get(id)?.name || "(deleted)",
      email: profileMap.get(id)?.email || "—",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    total: stories.length,
    dueForReview,
    topUsers,
    recent: stories.slice(0, 30).map((s) => ({
      id: s.id,
      userEmail: profileMap.get(s.user_id)?.email || "—",
      title: s.title || "(untitled)",
      tags: s.tags || [],
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
    })),
  };
}

/* ─── Handler ─── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();

  const ip = getClientIp(req);

  // Rate limit check
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const auth = verifyAuth(req);
  if (!auth.ok) {
    recordAttempt(ip);
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Successful auth — clear rate limit and issue token if this was a password login
  clearAttempts(ip);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  const body = req.body as { section?: string; search?: string; offset?: number; userId?: string; sessionId?: string } | undefined;
  const section = body?.section || "overview";

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
        case "referrals": return getReferrals();
        case "promo-codes": return getPromoCodes();
        case "calendar": return getCalendar();
        case "story-notebook": return getStoryNotebookStats();
        default: throw new Error(`Unknown section: ${section}`);
      }
    })();

    // Include a fresh token in every response so the client stays authenticated
    return res.status(200).json({ ...data as object, _token: createToken() });
  } catch (err) {
    console.error("Admin data error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch admin data";
    return res.status(msg.includes("required") || msg.includes("Unknown") ? 400 : 500).json({ error: msg });
  }
}

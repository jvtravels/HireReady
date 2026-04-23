/* Vercel Serverless Function — GDPR Data Export
 * Returns all user data as a JSON download for "right to data portability" compliance.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  supabaseUrl,
  supabaseAnonKey,
} from "./_shared";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = applyCorsHeaders(req, res);
  res.setHeader("X-Request-ID", crypto.randomUUID());

  if (handlePreflightAndMethod(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CSRF: validate Origin header
  if (!origin) return res.status(403).json({ error: "Forbidden" });

  const SUPABASE_URL = supabaseUrl();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  // Verify user auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_ANON_KEY = supabaseAnonKey();
  const token = authHeader.slice(7);
  let userId: string;
  let userEmail: string;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
    userEmail = userData.email || "";
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const encodedId = encodeURIComponent(userId);

  // Fetch all user-owned rows in parallel (gracefully handle missing tables)
  async function safeFetch(path: string): Promise<unknown[]> {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(`${SUPABASE_URL}${path}`, { headers, signal: ac.signal });
      clearTimeout(timer);
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  }

  const [profile, sessions, events, payments, feedback, interviewTurns, llmUsage] = await Promise.all([
    safeFetch(`/rest/v1/profiles?id=eq.${encodedId}`),
    safeFetch(`/rest/v1/sessions?user_id=eq.${encodedId}&order=created_at.desc`),
    safeFetch(`/rest/v1/calendar_events?user_id=eq.${encodedId}&order=date.desc`),
    safeFetch(`/rest/v1/payments?user_id=eq.${encodedId}&order=created_at.desc`),
    safeFetch(`/rest/v1/feedback?user_id=eq.${encodedId}`),
    safeFetch(`/rest/v1/interview_turns?user_id=eq.${encodedId}&order=created_at.desc&limit=5000`),
    safeFetch(`/rest/v1/llm_usage?user_id=eq.${encodedId}&order=created_at.desc&limit=1000`),
  ]);

  const exportData = {
    _meta: {
      format: "HireStepX User Data Export v1",
      exportedAt: new Date().toISOString(),
      userId,
      userEmail,
      notice: "This file contains all personal data stored for your account. Retain securely.",
    },
    profile: Array.isArray(profile) ? profile[0] || null : null,
    sessions,
    calendar_events: events,
    payments,
    feedback,
    interview_turns: interviewTurns,
    llm_usage: llmUsage,
  };

  const filename = `hirestepx-export-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(JSON.stringify(exportData, null, 2));
}

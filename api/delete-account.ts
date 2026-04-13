/* Vercel Serverless Function — Delete User Account & Data */

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

  // Body size check
  const bodyContentLength = parseInt((req.headers["content-length"] as string) || "0", 10);
  if (bodyContentLength > 1048576) {
    return res.status(413).json({ error: "Request too large" });
  }

  // CSRF: validate Origin header
  if (!origin) {
    return res.status(403).json({ error: "Forbidden" });
  }

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
  try {
    const authAc = new AbortController();
    const authTimer = setTimeout(() => authAc.abort(), 5000);
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: authAc.signal,
    });
    clearTimeout(authTimer);
    if (!userRes.ok) return res.status(401).json({ error: "Invalid auth token" });
    const userData = await userRes.json();
    userId = userData.id;
  } catch (authErr) {
    if (authErr instanceof Error && authErr.name === "AbortError") {
      return res.status(504).json({ error: "Auth verification timed out" });
    }
    return res.status(401).json({ error: "Auth verification failed" });
  }

  try {
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    const encodedId = encodeURIComponent(userId);

    // Delete all user data in parallel with timeout (order doesn't matter — all keyed by user_id)
    const ac = new AbortController();
    const acTimer = setTimeout(() => ac.abort(), 8_000);
    const results = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodedId}`, { method: "DELETE", headers, signal: ac.signal }),
      fetch(`${SUPABASE_URL}/rest/v1/calendar_events?user_id=eq.${encodedId}`, { method: "DELETE", headers, signal: ac.signal }),
      fetch(`${SUPABASE_URL}/rest/v1/payments?user_id=eq.${encodedId}`, { method: "DELETE", headers, signal: ac.signal }),
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodedId}`, { method: "DELETE", headers, signal: ac.signal }),
      fetch(`${SUPABASE_URL}/rest/v1/feedback?user_id=eq.${encodedId}`, { method: "DELETE", headers, signal: ac.signal }),
    ]);
    clearTimeout(acTimer);

    const tableNames = ["sessions", "events", "payments", "profile", "feedback"];
    const failures = results
      .map((r, i) => (r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)) ? tableNames[i] : null)
      .filter(Boolean);

    if (failures.length > 0) {
      console.error("Partial delete failure:", failures.join(", "), "for user", userId.slice(0, 8));
      return res.status(500).json({ error: `Failed to delete data from: ${failures.join(", ")}. Account not deleted. Please try again or contact support.` });
    }

    // Delete the auth user (requires admin/service role)
    const authDeleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodedId}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!authDeleteRes.ok) {
      const statusCode = authDeleteRes.status;
      console.error("Auth user delete failed:", statusCode);
      // Data already deleted but auth record remains — report partial failure
      return res.status(207).json({ success: true, partial: true, warning: "Account data deleted but auth cleanup incomplete. You can still sign up again with the same email." });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
}

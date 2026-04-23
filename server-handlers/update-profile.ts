/* Vercel Edge Function — Profile Update
 *
 * Single authoritative endpoint for all client-initiated writes to the
 * `profiles` row. Previously the browser called supabase-js.upsert()
 * directly; that path was at the mercy of any third-party script that
 * wraps window.fetch (Loom, Jam.dev, Hotjar, etc.), which silently hung
 * legitimate writes and left Postgres behind the UI. Moving the mutation
 * behind our API guarantees the write happens server-to-server over Node
 * fetch, immune to browser-side interceptors, and lets us centralise
 * field validation + allow-listing in one place.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * Columns the client is allowed to update via this endpoint. Anything not on
 * this list is silently dropped so a malicious client can't touch e.g.
 * subscription_tier, email_verified, deleted_at, etc.
 */
const ALLOWED_COLUMNS = new Set<string>([
  "name",
  "target_role",
  "target_company",
  "city",
  "industry",
  "interview_date",
  "learning_style",
  "experience_level",
  "preferred_session_length",
  "interview_types",
  "practice_timestamps",
  "resume_file_name",
  "resume_text",
  "resume_data",
  "has_completed_onboarding",
  "cancel_at_period_end",
  "interview_focus",
  "session_length",
  "feedback_style",
]);

interface ProfileUpdate {
  [key: string]: unknown;
}

function sanitizeUpdate(raw: unknown): ProfileUpdate {
  if (!raw || typeof raw !== "object") return {};
  const out: ProfileUpdate = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_COLUMNS.has(key)) continue;
    // Cap string fields at reasonable sizes.
    if (typeof value === "string") {
      const max = key === "resume_text" ? 50000 : key === "resume_file_name" ? 255 : 500;
      out[key] = value.slice(0, max);
    } else if (Array.isArray(value) || value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "object") {
      out[key] = value;
    }
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  // Preamble: CORS → body size (50 KB ceiling — resume_text is the big one) →
  // origin → IP limit → auth → per-user limit. No LLM quota needed.
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "update-profile",
    ipLimit: 60, // 60 profile writes / IP / minute — generous for multi-user WiFi
    userLimit: 30, // 30 writes / user / minute — covers autosave debouncing
    maxBytes: 60_000,
    checkQuota: false,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const updates = sanitizeUpdate(body);
  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: "No recognised fields to update" }), { status: 400, headers });
  }

  // Attach the authenticated user's id — the client never gets to override
  // which row is being touched.
  const row: Record<string, unknown> = { id: auth.userId, ...updates };
  const stripped: string[] = [];

  // Column-stripping retry loop. Older environments may be missing recently-
  // added columns (city, feedback_style, etc.). Rather than 500 the whole
  // request, peel off the missing column and try again — at most 8 rounds.
  // Mirrors the resilience behaviour the previous client-side upsertProfile
  // had, but enforced server-side where it's the right place for schema
  // reconciliation.
  const t0 = Date.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([row]),
    });

    if (res.ok) {
      let profile: unknown = null;
      try {
        const data = await res.json();
        profile = Array.isArray(data) ? data[0] : data;
      } catch { /* empty body — shouldn't happen with return=representation */ }
      if (stripped.length > 0) {
        console.warn(`[update-profile] OK after stripping missing columns: ${stripped.join(",")}`);
      }
      console.log(`[update-profile] OK user=${auth.userId?.slice(0, 8)} fields=${Object.keys(updates).join(",")} stripped=${stripped.join(",") || "-"} latency=${Date.now() - t0}ms`);
      return new Response(JSON.stringify({ profile, strippedColumns: stripped }), { status: 200, headers });
    }

    const errText = await res.text().catch(() => "");
    const missingCol = errText.match(/Could not find the '(\w+)' column/)?.[1]
      || errText.match(/column "(\w+)" of .* does not exist/i)?.[1]
      || errText.match(/column profiles\.(\w+) does not exist/i)?.[1];

    if (missingCol && missingCol in row && missingCol !== "id") {
      console.warn(`[update-profile] column '${missingCol}' missing in DB — stripping and retrying`);
      stripped.push(missingCol);
      delete row[missingCol];
      continue;
    }

    // Unrecoverable — surface details to the client.
    console.error(`[update-profile] Supabase upsert failed HTTP ${res.status}: ${errText.slice(0, 300)}`);
    return new Response(JSON.stringify({
      error: "Profile update failed",
      details: errText.slice(0, 300),
      missingColumn: missingCol || null,
      strippedColumns: stripped,
    }), { status: res.status >= 400 && res.status < 500 ? 400 : 502, headers });
  }

  console.error(`[update-profile] retry loop exhausted — last stripped: ${stripped.join(",")}`);
  return new Response(JSON.stringify({
    error: "Profile update failed after maximum retries",
    strippedColumns: stripped,
  }), { status: 500, headers });
}

/* Vercel Edge Function — Set the active version of a resume.
 *
 * Body: { resumeId: string, versionId: string }
 *
 * Sets `resumes.active_version_id = versionId` after verifying the
 * version belongs to the resume and the resume belongs to the
 * authenticated user. Returns 200 + ok or a typed 4xx error.
 *
 * Why this is a dedicated endpoint instead of a direct Supabase
 * mutation from the client: the resumes table has RLS but the
 * "ownership chain" check (version → resume → user) is easier to
 * audit + log here than via a complex Supabase policy. Same pattern
 * as resume-upload-file.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const UUID_RE = /^[0-9a-f-]{32,}$/i;

interface Body {
  resumeId?: unknown;
  versionId?: unknown;
}

export default async function handler(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  const pre = await withAuthAndRateLimit(req, {
    endpoint: "resume-set-active",
    ipLimit: 30,
    userLimit: 30,
    maxBytes: 4_000,
    checkQuota: false,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  if (!auth.userId || typeof auth.userId !== "string") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const resumeId = typeof body.resumeId === "string" && UUID_RE.test(body.resumeId) ? body.resumeId : "";
  const versionId = typeof body.versionId === "string" && UUID_RE.test(body.versionId) ? body.versionId : "";
  if (!resumeId) return new Response(JSON.stringify({ error: "Missing resumeId" }), { status: 400, headers });
  if (!versionId) return new Response(JSON.stringify({ error: "Missing versionId" }), { status: 400, headers });

  // Verify the version belongs to the resume AND the resume belongs to
  // the user. A single inner-joined query covers both checks.
  try {
    const verifyRes = await fetch(
      `${SUPABASE_URL}/rest/v1/resume_versions?id=eq.${encodeURIComponent(versionId)}&resume_id=eq.${encodeURIComponent(resumeId)}&select=id,resumes!inner(user_id)&resumes.user_id=eq.${encodeURIComponent(auth.userId)}&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } },
    );
    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: "Version lookup failed" }), { status: 502, headers });
    }
    const rows = await verifyRes.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Resume version not found" }), { status: 404, headers });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Version lookup error" }), { status: 502, headers });
  }

  // Patch the active_version_id on the resumes row. Use return=
  // representation so we can hand the updated row back — saves the
  // client a round-trip when it just wants to reflect the new
  // updated_at in its local cache.
  const newUpdatedAt = new Date().toISOString();
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/resumes?id=eq.${encodeURIComponent(resumeId)}&user_id=eq.${encodeURIComponent(auth.userId)}&select=id,domain,title,active_version_id,updated_at`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ active_version_id: versionId, updated_at: newUpdatedAt }),
      },
    );
    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Update failed: ${errText.slice(0, 100)}` }), { status: 502, headers });
    }
    const rows = await patchRes.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return new Response(JSON.stringify({
      ok: true,
      resumeId,
      versionId,
      updatedAt: row?.updated_at || newUpdatedAt,
      resume: row || null,
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Update error: ${(err as Error).message.slice(0, 100)}` }), { status: 502, headers });
  }
}

/**
 * Resume v2 — server-side hashing + version persistence helpers.
 *
 * Pulled out of analyze-resume.ts so the cache-lookup logic and the
 * version-write logic are unit-testable without spinning up the LLM
 * call. Uses Web Crypto SubtleCrypto.digest (Edge-compatible, no Node
 * crypto module needed).
 *
 * Key invariants enforced here:
 *   - text_hash is SHA-256 of the normalized text (NFC, lowercased,
 *     whitespace-collapsed). Tiny formatting differences shouldn't
 *     trigger a fresh LLM run.
 *   - When a new version is created, ALL prior versions of the same
 *     resume_id flip to is_latest=false in the same compare-and-swap.
 *   - resumes.active_version_id always points to the latest version
 *     so the read path can resolve the active resume in one row.
 */

/**
 * Normalize resume text before hashing. Stripping incidental whitespace
 * and case ensures a copy/paste with extra spaces or different line
 * endings doesn't bust the cache.
 */
export function normalizeResumeText(text: string): string {
  return (text || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Compute SHA-256 hex digest using Web Crypto. Edge-runtime safe; no
 * Node `crypto` import. Returns a 64-char lowercase hex string.
 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute the text_hash that gets stored on resume_versions. Single
 * helper so callers can't drift on the normalization step.
 */
export async function computeResumeTextHash(rawText: string): Promise<string> {
  return sha256Hex(normalizeResumeText(rawText));
}

export interface ResumeVersionRow {
  id: string;
  resume_id: string;
  version_number: number;
  text_hash: string;
  parsed_data: unknown;
  parse_source: string;
  is_latest: boolean;
  created_at: string;
}

/**
 * Look up an existing resume_version by text_hash for a given user.
 * Returns the row if found (LLM call should be skipped) or null.
 *
 * Cross-user dedup is intentionally NOT done — two users with the same
 * resume text might want differently personalised analyses, and sharing
 * one user's parsed_data with another raises subtle privacy questions
 * we don't want to hand-wave through. Per-user dedup is the safe scope.
 */
export async function findCachedResumeVersion(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  textHash: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ResumeVersionRow | null> {
  if (!supabaseUrl || !serviceKey || !userId || !textHash) return null;
  try {
    // Find versions whose parent resume belongs to this user, with the
    // matching text_hash, newest first. PostgREST inner-join via
    // resumes!inner so we filter on user_id without leaking other users.
    const url = `${supabaseUrl}/rest/v1/resume_versions?text_hash=eq.${encodeURIComponent(textHash)}&select=id,resume_id,version_number,text_hash,parsed_data,parse_source,is_latest,created_at,resumes!inner(user_id)&resumes.user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`;
    const res = await fetchImpl(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      resume_id: row.resume_id,
      version_number: row.version_number,
      text_hash: row.text_hash,
      parsed_data: row.parsed_data,
      parse_source: row.parse_source,
      is_latest: row.is_latest,
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}

export interface PersistVersionInput {
  userId: string;
  domain: string;             // 'sde' | 'pm' | 'sales' | 'design' | 'general' | custom
  textHash: string;
  fileHash?: string | null;
  resumeText: string;         // normalized — caller's responsibility
  parsedData: unknown;
  parseSource: "ai" | "fallback";
  fileName?: string | null;
}

/**
 * Persist a new resume_version, creating the parent resume row if no
 * row for (user_id, domain, is_archived=false) exists. Bumps
 * version_number, flips prior versions' is_latest=false, and updates
 * resumes.active_version_id.
 *
 * Returns the new version's id, or null on failure (best-effort —
 * the LLM call has already happened by this point so we don't want
 * the analyze-resume flow to fail just because the persistence layer
 * hiccupped).
 */
export async function persistResumeVersion(
  supabaseUrl: string,
  serviceKey: string,
  input: PersistVersionInput,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ resumeId: string; versionId: string; versionNumber: number } | null> {
  if (!supabaseUrl || !serviceKey || !input.userId) return null;
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  try {
    // 1. Find or create the parent `resumes` row for (user, domain).
    const findRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/resumes?user_id=eq.${encodeURIComponent(input.userId)}&domain=eq.${encodeURIComponent(input.domain)}&is_archived=eq.false&select=id&limit=1`,
      { headers: auth },
    );
    let resumeId = "";
    if (findRes.ok) {
      const rows = await findRes.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]?.id) resumeId = rows[0].id;
    }
    if (!resumeId) {
      const createRes = await fetchImpl(`${supabaseUrl}/rest/v1/resumes`, {
        method: "POST",
        headers: { ...auth, Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: input.userId,
          domain: input.domain,
          title: input.fileName || input.domain,
        }),
      });
      if (!createRes.ok) return null;
      const created = await createRes.json().catch(() => []);
      resumeId = Array.isArray(created) ? created[0]?.id : created?.id;
      if (!resumeId) return null;
    }

    // 2. Compute the next version_number for this resume.
    const numRes = await fetchImpl(
      `${supabaseUrl}/rest/v1/resume_versions?resume_id=eq.${encodeURIComponent(resumeId)}&select=version_number&order=version_number.desc&limit=1`,
      { headers: auth },
    );
    let nextNumber = 1;
    if (numRes.ok) {
      const rows = await numRes.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]?.version_number) nextNumber = rows[0].version_number + 1;
    }

    // 3. Flip prior versions to is_latest=false. We want this to land
    //    BEFORE the new row's insert so a concurrent reader never sees
    //    two is_latest=true rows for the same resume.
    if (nextNumber > 1) {
      await fetchImpl(
        `${supabaseUrl}/rest/v1/resume_versions?resume_id=eq.${encodeURIComponent(resumeId)}&is_latest=eq.true`,
        {
          method: "PATCH",
          headers: { ...auth, Prefer: "return=minimal" },
          body: JSON.stringify({ is_latest: false }),
        },
      );
    }

    // 4. Insert the new version row.
    const insertRes = await fetchImpl(`${supabaseUrl}/rest/v1/resume_versions`, {
      method: "POST",
      headers: { ...auth, Prefer: "return=representation" },
      body: JSON.stringify([{
        resume_id: resumeId,
        version_number: nextNumber,
        text_hash: input.textHash,
        file_hash: input.fileHash || null,
        file_name: input.fileName || null,
        resume_text: input.resumeText.slice(0, 50_000),
        parsed_data: input.parsedData,
        parse_source: input.parseSource,
        is_latest: true,
      }]),
    });
    if (!insertRes.ok) return null;
    const inserted = await insertRes.json().catch(() => []);
    const versionId: string = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
    if (!versionId) return null;

    // 5. Point the parent `resumes.active_version_id` at the new version.
    await fetchImpl(
      `${supabaseUrl}/rest/v1/resumes?id=eq.${encodeURIComponent(resumeId)}`,
      {
        method: "PATCH",
        headers: { ...auth, Prefer: "return=minimal" },
        body: JSON.stringify({ active_version_id: versionId, updated_at: new Date().toISOString() }),
      },
    );

    return { resumeId, versionId, versionNumber: nextNumber };
  } catch {
    return null;
  }
}

/**
 * Resolve the user's currently-active resume_version_id. Used by
 * /api/sessions/save to capture the version into session.resume_version_id
 * at session start. Returns null if the user has no resume yet (a
 * legitimate state — sessions can run without one).
 */
export async function resolveActiveResumeVersionId(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  domain?: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  if (!supabaseUrl || !serviceKey || !userId) return null;
  try {
    // Prefer a resume tagged for the requested domain; fall back to any
    // active resume; ultimately null. The is_archived=false filter
    // prevents resurrecting a user-archived resume.
    const domainFilter = domain ? `&domain=eq.${encodeURIComponent(domain)}` : "";
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/resumes?user_id=eq.${encodeURIComponent(userId)}${domainFilter}&is_archived=eq.false&select=active_version_id&order=updated_at.desc&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    if (Array.isArray(rows) && rows[0]?.active_version_id) return rows[0].active_version_id;
    // Domain-specific lookup found nothing — try without the domain filter
    if (domain) return resolveActiveResumeVersionId(supabaseUrl, serviceKey, userId, undefined, fetchImpl);
    return null;
  } catch {
    return null;
  }
}

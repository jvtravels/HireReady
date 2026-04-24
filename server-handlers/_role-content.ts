/**
 * Read-through helper for role_competencies + company_guidance tables.
 *
 * Returns the DB row if present and fresh; otherwise returns null and lets
 * the caller use its in-code fallback constant (generate-questions.ts ships
 * authoritative copies today). Short per-instance memo cache keeps edge
 * cold-starts cheap and bounds Supabase reads to one round-trip per slug
 * per cold start.
 *
 * Seeding the tables is a separate step. Until a row exists, this helper
 * always returns null and the caller's fallback path runs — zero behaviour
 * change on an empty DB.
 */

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** 5-minute in-memory cache per edge instance. Good enough given edge cold
    starts are frequent and the data is slow-changing. */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { body: string | null; at: number }>();

async function loadFromTable(
  table: "role_competencies" | "company_guidance",
  column: "role_slug" | "company_slug",
  slug: string,
): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY || !slug) return null;
  const cacheKey = `${table}:${slug}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body;

  try {
    // 1.5s timeout: this runs during question generation. If the DB is slow
    // we don't want to block the whole LLM call — fall back silently.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1_500);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(slug)}&select=body&limit=1`,
      {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        signal: ac.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) {
      cache.set(cacheKey, { body: null, at: Date.now() });
      return null;
    }
    const rows = await res.json().catch(() => []);
    const body: string | null = Array.isArray(rows) && rows[0]?.body ? rows[0].body : null;
    cache.set(cacheKey, { body, at: Date.now() });
    return body;
  } catch {
    // AbortError, network error, JSON parse error — fall through to the
    // caller's fallback. Cache the miss briefly so repeated failures don't
    // keep hitting the wire.
    cache.set(cacheKey, { body: null, at: Date.now() });
    return null;
  }
}

/** Look up role competency text. Returns null if absent — caller uses fallback. */
export function loadRoleCompetency(slug: string): Promise<string | null> {
  return loadFromTable("role_competencies", "role_slug", slug);
}

/** Look up company guidance text. Returns null if absent — caller uses fallback. */
export function loadCompanyGuidance(slug: string): Promise<string | null> {
  return loadFromTable("company_guidance", "company_slug", slug);
}

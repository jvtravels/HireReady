/* Vercel Edge Function — User Outcome Self-Report
 *
 * Lets a candidate voluntarily report whether they landed an offer after
 * using HireStepX. This is the data unlock that turns "stock-photo
 * testimonials" into "X verified candidates landed Y offers." Schema:
 * one row per user, upsert on every report so users can update as their
 * job search progresses.
 *
 * GET  /api/user-outcome           → existing report or null
 * POST /api/user-outcome           → upsert
 *   { applied, interviewed, offer, accepted, company?, roleLanded?,
 *     testimonial?, mayShare? }
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface OutcomePayload {
  applied?: boolean;
  interviewed?: boolean;
  offer?: boolean;
  accepted?: boolean;
  company?: string;
  roleLanded?: string;
  testimonial?: string;
  mayShare?: boolean;
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: withRequestId(corsHeaders(req)),
    });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  const pre = await withAuthAndRateLimit(req, {
    endpoint: "user-outcome",
    ipLimit: 30,
    userLimit: 20,
    checkQuota: false,
    maxBytes: 4_000,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;
  const userId = auth.userId!;

  if (req.method === "GET") {
    const res = await supa(`user_outcomes?user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    if (!res.ok) {
      return new Response(JSON.stringify({ outcome: null }), { status: 200, headers });
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return new Response(JSON.stringify({ outcome: rows[0] || null }), { status: 200, headers });
  }

  // POST = upsert
  try {
    const body = (await req.json()) as Partial<OutcomePayload>;
    const payload: Record<string, unknown> = {
      user_id: userId,
      applied: body.applied ?? null,
      interviewed: body.interviewed ?? null,
      offer: body.offer ?? null,
      accepted: body.accepted ?? null,
      company: typeof body.company === "string" ? body.company.slice(0, 120) : null,
      role_landed: typeof body.roleLanded === "string" ? body.roleLanded.slice(0, 120) : null,
      testimonial: typeof body.testimonial === "string" ? body.testimonial.slice(0, 1000) : null,
      may_share_publicly: !!body.mayShare,
      updated_at: new Date().toISOString(),
    };
    const res = await supa(
      `user_outcomes?on_conflict=user_id`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      },
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[user-outcome] upsert failed HTTP ${res.status}: ${err.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: "Failed to save outcome" }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg.slice(0, 200) }), { status: 500, headers });
  }
}

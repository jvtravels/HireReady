/* Vercel Cron — Hard-delete accounts soft-deleted 7+ days ago.
 * Runs daily. Invoked by Vercel Cron (authenticated via CRON_SECRET header).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseUrl } from "./_shared";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow from Vercel Cron (x-vercel-cron or Authorization: Bearer CRON_SECRET)
  const authHeader = req.headers.authorization || "";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  if (!isVercelCron && !hasValidSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_URL = supabaseUrl();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // Cutoff: 7 days ago
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const encodedCutoff = encodeURIComponent(cutoff);

  try {
    // Find accounts to hard-delete
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?deleted_at=not.is.null&deleted_at=lt.${encodedCutoff}&select=id`,
      { headers },
    );
    if (!findRes.ok) {
      return res.status(500).json({ error: "Failed to query profiles" });
    }
    const rows = (await findRes.json()) as { id: string }[];
    if (rows.length === 0) return res.status(200).json({ deleted: 0 });

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const { id } of rows) {
      const encodedId = encodeURIComponent(id);
      try {
        // Delete all user data in parallel
        await Promise.allSettled([
          fetch(`${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodedId}`, { method: "DELETE", headers }),
          fetch(`${SUPABASE_URL}/rest/v1/calendar_events?user_id=eq.${encodedId}`, { method: "DELETE", headers }),
          fetch(`${SUPABASE_URL}/rest/v1/payments?user_id=eq.${encodedId}`, { method: "DELETE", headers }),
          fetch(`${SUPABASE_URL}/rest/v1/feedback?user_id=eq.${encodedId}`, { method: "DELETE", headers }),
          fetch(`${SUPABASE_URL}/rest/v1/interview_turns?user_id=eq.${encodedId}`, { method: "DELETE", headers }),
        ]);
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodedId}`, { method: "DELETE", headers });
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodedId}`, { method: "DELETE", headers });
        deleted.push(id);
      } catch (err) {
        console.error(`[cleanup-deleted-accounts] Failed for ${id.slice(0, 8)}:`, err);
        failed.push(id);
      }
    }

    console.log(`[cleanup-deleted-accounts] Deleted ${deleted.length}, failed ${failed.length}`);
    return res.status(200).json({ deleted: deleted.length, failed: failed.length });
  } catch (err) {
    console.error("[cleanup-deleted-accounts] Error:", err);
    return res.status(500).json({ error: "Cleanup failed" });
  }
}

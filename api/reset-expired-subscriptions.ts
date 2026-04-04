/* Vercel Cron Function — Downgrade expired subscriptions */
/* Runs daily at midnight UTC. Finds subscriptions that have expired and sets tier to 'free'. */
/* This ensures server-side enforcement even if users don't log in (frontend check is client-side only). */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_SECRET = (process.env.CRON_SECRET || "").trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Not configured" });
  }

  try {
    const now = new Date().toISOString();

    // Find all non-free profiles where subscription_end is in the past
    const expiredRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?subscription_tier=neq.free&subscription_end=lt.${now}&select=id,subscription_tier,subscription_end`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!expiredRes.ok) {
      return res.status(500).json({ error: "Failed to query expired subscriptions" });
    }

    const expired = await expiredRes.json();
    if (!Array.isArray(expired) || expired.length === 0) {
      return res.status(200).json({ downgraded: 0, message: "No expired subscriptions" });
    }

    let downgraded = 0;
    let failed = 0;

    for (const profile of expired) {
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ subscription_tier: "free" }),
        },
      );

      if (updateRes.ok) {
        downgraded++;
        console.log(`[cron] Downgraded ${profile.id.slice(0, 8)}... from ${profile.subscription_tier} (expired ${profile.subscription_end})`);
      } else {
        failed++;
        console.error(`[cron] Failed to downgrade ${profile.id.slice(0, 8)}...`);
      }
    }

    return res.status(200).json({ downgraded, failed, total: expired.length });
  } catch (err) {
    console.error("Reset expired subscriptions error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

/* Vercel Cron — Weekly Progress Email
 * Runs daily; sends a per-user weekly digest on the user's weekday-of-signup.
 *
 * STATUS: scaffold. To enable:
 *   1. Add RESEND_API_KEY to Vercel env (or swap sendEmail() for SendGrid/Postmark).
 *   2. Add this to vercel.json:
 *        { "crons": [{ "path": "/api/cron/weekly-summary", "schedule": "0 15 * * *" }] }
 *      (15:00 UTC daily; adjust for your users' primary timezone.)
 *   3. Uncomment the sendEmail() call below after the key is configured.
 *
 * Safeguards built in:
 *   - Only runs when CRON_SECRET matches the Authorization header (Vercel sets this).
 *   - Rate-limits to at most 1 email per user per 6 days (via profiles.last_summary_email_at).
 *   - Skips users with no sessions in the last 14 days (no signal, no email).
 *   - Digests are capped at 50 per cron invocation to stay within Vercel function limits.
 */

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const MAX_EMAILS_PER_RUN = 50;
const MIN_HOURS_BETWEEN_EMAILS = 6 * 24;

interface SessionRow {
  id: string;
  user_id: string;
  score: number;
  created_at: string;
  report_json: Record<string, unknown> | null;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string | null;
  last_summary_email_at: string | null;
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

async function candidateUsers(): Promise<ProfileRow[]> {
  // Users with ≥1 session in the last 14d who haven't been emailed in the last 6d.
  const sinceIso = new Date(Date.now() - MIN_HOURS_BETWEEN_EMAILS * 3600_000).toISOString();
  const path = `profiles?select=id,email,name,last_summary_email_at&or=(last_summary_email_at.is.null,last_summary_email_at.lt.${encodeURIComponent(sinceIso)})&limit=${MAX_EMAILS_PER_RUN}`;
  const res = await supa(path);
  if (!res.ok) return [];
  return (await res.json()) as ProfileRow[];
}

async function recentSessions(userId: string): Promise<SessionRow[]> {
  const sinceIso = new Date(Date.now() - 14 * 86400_000).toISOString();
  const path = `sessions?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=5&select=id,user_id,score,created_at,report_json`;
  const res = await supa(path);
  if (!res.ok) return [];
  return (await res.json()) as SessionRow[];
}

function buildDigest(profile: ProfileRow, sessions: SessionRow[]): { subject: string; html: string } | null {
  if (sessions.length === 0) return null;
  const latest = sessions[0];
  const latestReport = (latest.report_json || {}) as Record<string, unknown>;
  const score = latest.score || (latestReport.overallScore as number) || 0;
  const band = (latestReport.band as string) || "";
  const firstName = (profile.name || "").split(" ")[0] || "there";

  const prev = sessions[1];
  const delta = prev ? score - prev.score : 0;
  const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—";

  const subject = `Your HireStepX week: ${sessions.length} session${sessions.length === 1 ? "" : "s"}, score ${score}`;
  const html = `<!doctype html>
<html><body style="font-family:system-ui;background:#0b0b0c;color:#f5f2ed;padding:24px;max-width:560px;margin:0 auto">
  <h1 style="color:#d4b37f;font-family:Georgia,serif;font-weight:400;letter-spacing:-0.02em">Hi ${firstName},</h1>
  <p>You ran <strong>${sessions.length} mock interview${sessions.length === 1 ? "" : "s"}</strong> this week. Latest score: <strong>${score}</strong> (${band || "uncalibrated"}), delta from prior <strong>${deltaStr}</strong>.</p>
  <p style="color:#9a9590">Open your latest report → <a href="https://app.hirestepx.com/sessions" style="color:#d4b37f">view on HireStepX</a></p>
  <hr style="border:none;border-top:1px solid rgba(245,242,237,0.1);margin:24px 0"/>
  <p style="font-size:12px;color:#9a9590">Not useful? <a href="https://app.hirestepx.com/settings" style="color:#9a9590">Unsubscribe</a>.</p>
</body></html>`;
  return { subject, html };
}

async function sendEmail(_to: string, _subject: string, _html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  // Uncomment when RESEND_API_KEY is configured in Vercel:
  // const res = await fetch("https://api.resend.com/emails", {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Bearer ${RESEND_API_KEY}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     from: "HireStepX <reports@hirestepx.com>",
  //     to: [to],
  //     subject,
  //     html,
  //   }),
  // });
  // return res.ok;
  return false;
}

async function markSent(userId: string): Promise<void> {
  await supa(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ last_summary_email_at: new Date().toISOString() }),
  });
}

export default async function handler(req: Request): Promise<Response> {
  // Authenticate: Vercel cron attaches the secret as a bearer token.
  const auth = req.headers.get("authorization") || "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "supabase not configured" }), { status: 503 });
  }

  const users = await candidateUsers();
  let sent = 0;
  let skipped = 0;
  for (const user of users) {
    const sessions = await recentSessions(user.id);
    const digest = buildDigest(user, sessions);
    if (!digest) { skipped++; continue; }
    const ok = await sendEmail(user.email, digest.subject, digest.html);
    if (ok) {
      await markSent(user.id);
      sent++;
    } else {
      skipped++;
    }
  }

  return new Response(
    JSON.stringify({ sent, skipped, total: users.length, emailEnabled: !!RESEND_API_KEY }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

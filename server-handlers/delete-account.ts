/* Vercel Serverless Function — Delete User Account & Data */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  handlePreflightAndMethod,
  supabaseUrl,
  supabaseAnonKey,
  escapeHtml,
} from "./_shared";
import { captureServerEvent } from "./_posthog";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const FROM_EMAIL = process.env.FROM_EMAIL || "HireStepX <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");

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

  // Default: soft-delete with 7-day grace period. Pass { hard: true } to permanently delete immediately.
  const hardDelete = req.body && typeof req.body === "object" && "hard" in req.body ? !!(req.body as Record<string, unknown>).hard : false;
  const restore = req.body && typeof req.body === "object" && "restore" in req.body ? !!(req.body as Record<string, unknown>).restore : false;

  try {
    const headers = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    const encodedId = encodeURIComponent(userId);

    // Restore path: clear deleted_at on the profile
    if (restore) {
      try {
        const restoreRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodedId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ deleted_at: null }),
        });
        if (!restoreRes.ok) return res.status(500).json({ error: "Failed to restore account" });
        return res.status(200).json({ success: true, restored: true });
      } catch (err) {
        console.error("[delete-account] Restore failed:", err);
        return res.status(500).json({ error: "Failed to restore account" });
      }
    }

    // Soft-delete path: mark profile with deleted_at (scheduled for permanent removal in 7 days)
    if (!hardDelete) {
      try {
        const softRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodedId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ deleted_at: new Date().toISOString() }),
        });
        if (!softRes.ok) {
          // If column is missing, fall through to hard delete
          const msg = await softRes.text().catch(() => "");
          if (msg.includes("deleted_at")) {
            console.warn("[delete-account] deleted_at column missing, falling back to hard delete");
          } else {
            return res.status(500).json({ error: "Failed to schedule account deletion" });
          }
        } else {
          const deletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          return res.status(200).json({
            success: true,
            scheduled: true,
            deletionDate: deletionDate.toISOString(),
            message: `Your account is scheduled for deletion on ${deletionDate.toDateString()}. Log in any time before then to cancel.`,
          });
        }
      } catch (err) {
        console.error("[delete-account] Soft-delete failed:", err);
        // Fall through to hard delete
      }
    }

    // Capture user email & name BEFORE deletion (data will be gone after)
    let userEmail: string | undefined;
    let userName: string | undefined;
    try {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodedId}&select=email,name`,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
      );
      if (profileRes.ok) {
        const profiles = await profileRes.json();
        const profile = Array.isArray(profiles) && profiles[0];
        userEmail = profile?.email;
        userName = profile?.name;
      }
    } catch {
      // Non-critical — email won't be sent but deletion continues
    }

    // Send deletion confirmation email BEFORE data is removed (best-effort)
    if (RESEND_API_KEY && userEmail) {
      const safeName = escapeHtml(userName || "there");
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [userEmail],
            subject: "Your HireStepX account has been deleted",
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#060607;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060607;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border-radius:16px;border:1px solid #2A2A2C;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2A2A2C;">
          <span style="font-size:18px;font-weight:600;color:#F5F2ED;letter-spacing:0.06em;">HireStepX</span>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#F5F2ED;">Account Deleted</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Hi ${safeName}, your HireStepX account and all associated data have been permanently removed as requested.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1C;border-radius:12px;border:1px solid #2A2A2C;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#D4B37F;">What was removed:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:13px;color:#F5F2ED;">Profile and account credentials</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#F5F2ED;">Interview sessions and evaluations</td></tr>
                <tr><td style="padding:4px 0;font-size:13px;color:#F5F2ED;">Payment history and subscription data</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;font-size:14px;color:#9A9590;line-height:1.6;">
            Changed your mind? You can create a new account anytime at <a href="${APP_URL}" style="color:#D4B37F;text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>.
          </p>
          <p style="margin:0;font-size:12px;color:#6A6560;line-height:1.5;text-align:center;">
            Questions? Contact us at <a href="mailto:support@hirestepx.com" style="color:#D4B37F;text-decoration:none;">support@hirestepx.com</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2A2A2C;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6A6560;">HireStepX by Silva Vitalis LLC</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
          }),
        });
      } catch (emailErr) {
        console.warn("[delete-account] Confirmation email failed (non-critical):", emailErr);
      }
    }

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
      // Hash the user id so logs don't enable user enumeration
      const userHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId))
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12))
        .catch(() => "unknown");
      console.error("Partial delete failure:", failures.join(", "), "for user hash", userHash);
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

    await captureServerEvent("account_deleted", userId, { mode: "hard" });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
}

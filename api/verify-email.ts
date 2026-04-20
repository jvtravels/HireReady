/* Vercel Serverless Function — Email Verification Handler */
/* Validates HMAC token and sets email_confirmed_at on Supabase Auth user */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const EMAIL_SECRET = process.env.EMAIL_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

/** Generate a time-limited verification token (must match send-welcome.ts) */
function generateVerifyToken(email: string, expiresAt?: number): string {
  const expiry = expiresAt ?? Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return createHmac("sha256", EMAIL_SECRET).update(`${email.toLowerCase().trim()}:${expiry}`).digest("hex") + "." + expiry;
}

function validateToken(email: string, token: string): boolean {
  // Token format: "<hmac>.<expiryWindow>"
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) {
    // Legacy token without expiry — accept if HMAC matches (backwards compat)
    const legacyExpected = createHmac("sha256", EMAIL_SECRET).update(email.toLowerCase().trim()).digest("hex");
    return token === legacyExpected;
  }
  const expiryStr = token.slice(dotIdx + 1);
  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry)) return false;

  // Token is valid for the window it was created in + 1 window (≈24-48 hours)
  const currentWindow = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  if (currentWindow - expiry > 1) return false; // Expired (more than ~48 hours old)

  // Regenerate and compare using timing-safe comparison
  const expected = generateVerifyToken(email, expiry);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // This endpoint is GET (user clicks link in email)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = (req.query.email as string || "").trim();
  const token = (req.query.token as string || "").trim();

  if (!email || !token) {
    return res.redirect(302, `${APP_URL}/login?error=invalid-link`);
  }

  // Validate HMAC token with expiry check
  if (!validateToken(email, token)) {
    // Distinguish expired vs invalid
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx !== -1) {
      const expiryStr = token.slice(dotIdx + 1);
      const expiry = parseInt(expiryStr, 10);
      const currentWindow = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
      if (!isNaN(expiry) && currentWindow - expiry > 1) {
        return res.redirect(302, `${APP_URL}/login?error=link-expired`);
      }
    }
    return res.redirect(302, `${APP_URL}/login?error=invalid-token`);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase not configured for email verification");
    return res.redirect(302, `${APP_URL}/login?error=config`);
  }

  try {
    // Find user by email using Supabase Admin API
    const searchRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!searchRes.ok) {
      console.error("Failed to search user:", searchRes.status);
      return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
    }

    const searchData = await searchRes.json();
    const users = searchData.users || searchData;
    const user = Array.isArray(users)
      ? users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
      : null;

    if (!user) {
      console.error("User not found for email:", email);
      return res.redirect(302, `${APP_URL}/login?error=user-not-found`);
    }

    // If already verified, redirect with success (idempotent)
    if (user.email_confirmed_at) {
      return res.redirect(302, `${APP_URL}/login?verified=already`);
    }

    // Set email_confirmed_at via admin API
    const updateRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${user.id}`,
      {
        method: "PUT",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_confirm: true,
        }),
      }
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error("Failed to confirm email:", updateRes.status, errBody);
      return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
    }

    // Generate a magic link so the user is auto-logged-in after verification.
    // Supabase admin generate_link returns an action_link that goes through the
    // Supabase auth server → sets session cookies → redirects to our app.
    try {
      const magicRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/generate_link`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "magiclink",
            email: email.toLowerCase().trim(),
            options: { redirectTo: `${APP_URL}/onboarding` },
          }),
        }
      );
      if (magicRes.ok) {
        const magicData = await magicRes.json();
        // Supabase returns action_link — a URL through the Supabase auth server
        const actionLink = magicData.action_link
          || magicData.properties?.action_link;
        if (actionLink && typeof actionLink === "string" && actionLink.startsWith("http")) {
          // Rewrite the redirect_to in the action link to point to our app
          // (in case Supabase used its own default redirect)
          const linkUrl = new URL(actionLink);
          linkUrl.searchParams.set("redirect_to", `${APP_URL}/onboarding`);
          return res.redirect(302, linkUrl.toString());
        }
        console.warn("generate_link returned no action_link:", JSON.stringify(magicData).slice(0, 200));
      } else {
        const errText = await magicRes.text().catch(() => "");
        console.warn("generate_link failed:", magicRes.status, errText.slice(0, 200));
      }
    } catch (magicErr) {
      console.error("Magic link generation failed, falling back to manual login:", magicErr);
    }

    // Fallback — redirect to login with success banner
    return res.redirect(302, `${APP_URL}/login?verified=true`);
  } catch (err) {
    console.error("Email verification error:", err);
    return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
  }
}

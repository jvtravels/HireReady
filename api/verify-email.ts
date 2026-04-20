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
    // Find user by email using Supabase Admin API generate_link (most reliable method)
    // This generates a magic link for the email, which implicitly finds the user
    // If user doesn't exist, it returns an error
    let user: { id: string; email?: string; email_confirmed_at?: string; user_metadata?: Record<string, unknown> } | null = null;

    // Method 1: Use admin generate_link to find user (always works if user exists)
    const genRes = await fetch(
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
        }),
      }
    );
    if (genRes.ok) {
      const genData = await genRes.json();
      // generate_link returns user data alongside the link
      if (genData.id) {
        user = genData;
      }
    }

    // Method 2: Fallback to filter search
    if (!user) {
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
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const users = searchData.users || searchData;
        if (Array.isArray(users)) {
          user = users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()) || null;
        }
      }
    }

    // Method 3: Paginated list search as last resort
    if (!user) {
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        const allUsers = listData.users || listData;
        if (Array.isArray(allUsers)) {
          user = allUsers.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()) || null;
        }
      }
    }

    if (!user) {
      console.error("User not found for email:", email, "— tried all 3 lookup methods");
      return res.redirect(302, `${APP_URL}/login?error=user-not-found`);
    }

    // If already verified via our custom flow, redirect with success (idempotent)
    if (user.user_metadata?.custom_email_verified === true) {
      return res.redirect(302, `${APP_URL}/login?verified=already`);
    }

    // Set email_confirmed_at via admin API AND our custom flag
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
          user_metadata: { ...user.user_metadata, custom_email_verified: true },
        }),
      }
    );

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error("Failed to confirm email:", updateRes.status, errBody);
      return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
    }

    // Redirect to login page — user must log in manually after verification
    return res.redirect(302, `${APP_URL}/login?verified=true`);
  } catch (err) {
    console.error("Email verification error:", err);
    return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
  }
}

/* Vercel Serverless Function — Email Verification Handler */
/* Validates HMAC token and sets email_confirmed_at on Supabase Auth user */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_URL = (process.env.APP_URL || "https://hirestepx.vercel.app").replace(/\/$/, "");
const EMAIL_SECRET = process.env.EMAIL_VERIFICATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

function generateVerifyToken(email: string): string {
  return createHmac("sha256", EMAIL_SECRET).update(email.toLowerCase().trim()).digest("hex");
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

  // Validate HMAC token
  const expectedToken = generateVerifyToken(email);
  if (token !== expectedToken) {
    return res.redirect(302, `${APP_URL}/login?error=invalid-token`);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase not configured for email verification");
    return res.redirect(302, `${APP_URL}/login?error=config`);
  }

  try {
    // Find user by email using Supabase Admin API
    const listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!listRes.ok) {
      console.error("Failed to list users:", listRes.status);
      return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
    }

    // Search for user by email using the filter endpoint
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

    // Success — redirect to login with success message
    return res.redirect(302, `${APP_URL}/login?verified=true`);
  } catch (err) {
    console.error("Email verification error:", err);
    return res.redirect(302, `${APP_URL}/login?error=verification-failed`);
  }
}

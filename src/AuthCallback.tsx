/**
 * OAuth Callback Handler
 *
 * Handles the redirect from Google OAuth. Exchanges the authorization code
 * for an ID token via our serverless function, then signs into Supabase
 * using signInWithIdToken. This approach shows "hirestepx.com" on Google's
 * account chooser instead of the Supabase project URL.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "./supabase";
import { c, font } from "./tokens";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) {
      setError("Authentication is not configured.");
      return;
    }

    (async () => {
      try {
        // Parse the authorization code from the URL query params
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const storedState = sessionStorage.getItem("hirestepx_oauth_state");
        const returnedState = params.get("state");

        // Validate state to prevent CSRF attacks
        if (!storedState || storedState !== returnedState) {
          setError("Security check failed. Please try again.");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }
        sessionStorage.removeItem("hirestepx_oauth_state");

        if (!code) {
          // Check for error in URL (user denied access, etc.)
          const errorParam = params.get("error");
          if (errorParam) {
            setError(errorParam === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed: ${errorParam}`);
          } else {
            setError("No authorization code received from Google.");
          }
          setTimeout(() => navigate("/login"), 2000);
          return;
        }

        // Exchange the authorization code for tokens via our serverless function
        sessionStorage.removeItem("hirestepx_oauth_nonce");

        const tokenRes = await fetch("/api/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "google-token-exchange",
            code,
            redirectUri: `${window.location.origin}/auth/callback`,
          }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          setError(errData.error || "Failed to complete Google sign-in.");
          setTimeout(() => navigate("/login"), 3000);
          return;
        }

        const { id_token, access_token } = await tokenRes.json();

        if (!id_token) {
          setError("No ID token received. Please try again.");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }

        // Sign into Supabase with the Google ID token
        const client = await getSupabase();
        const { error: signInError } = await client.auth.signInWithIdToken({
          provider: "google",
          token: id_token,
          access_token: access_token || undefined,
        });

        if (signInError) {
          console.error("[auth] signInWithIdToken failed:", signInError.message);
          setError("Failed to sign in. Please try again.");
          setTimeout(() => navigate("/login"), 2000);
          return;
        }

        // Store the Google access token for Calendar API access
        if (access_token) {
          try { sessionStorage.setItem("hirestepx_google_token", access_token); } catch { /* noop */ }
        }

        // Retrieve the saved return path
        const returnTo = sessionStorage.getItem("hirestepx_oauth_return") || "/dashboard";
        sessionStorage.removeItem("hirestepx_oauth_return");

        // Redirect to the intended destination
        navigate(returnTo, { replace: true });
      } catch (err) {
        console.error("[auth] OAuth callback error:", err);
        setError("An unexpected error occurred. Please try again.");
        setTimeout(() => navigate("/login"), 3000);
      }
    })();
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh", background: c.obsidian,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: font.ui,
    }}>
      <div style={{ textAlign: "center" }}>
        {error ? (
          <>
            <div style={{
              padding: "16px 24px", borderRadius: 12, marginBottom: 16,
              background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.3)",
              maxWidth: 360,
            }}>
              <p style={{ color: c.ember, fontSize: 14, margin: 0 }}>{error}</p>
            </div>
            <p style={{ color: c.stone, fontSize: 13 }}>Redirecting to login...</p>
          </>
        ) : (
          <>
            <div style={{
              width: 36, height: 36, border: "2px solid rgba(212,179,127,0.15)",
              borderTopColor: c.gilt, borderRadius: "50%",
              animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
            }} />
            <p style={{ color: c.ivory, fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
              Completing sign-in...
            </p>
            <p style={{ color: c.stone, fontSize: 13 }}>Please wait</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}

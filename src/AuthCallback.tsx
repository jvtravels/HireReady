"use client";
/**
 * OAuth Callback Handler
 *
 * Handles the redirect from Google OAuth. Exchanges the authorization code
 * for an ID token via our serverless function, then signs into Supabase
 * using signInWithIdToken. This approach shows "hirestepx.com" on Google's
 * account chooser instead of the Supabase project URL.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, supabaseConfigured } from "./supabase";
import { c, font } from "./tokens";

export default function AuthCallback() {
  const router = useRouter();
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
          setTimeout(() => router.push("/login"), 2000);
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
          setTimeout(() => router.push("/login"), 2000);
          return;
        }

        // Exchange the authorization code for tokens via our serverless function
        sessionStorage.removeItem("hirestepx_oauth_nonce"); // clean up any stale nonce

        // 30-second timeout prevents indefinite hang if server is slow
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 30_000);

        let tokenRes: Response;
        try {
          tokenRes = await fetch("/api/send-welcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({
              action: "google-token-exchange",
              code,
              redirectUri: `${window.location.origin}/auth/callback`,
            }),
          });
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
            setError("Sign-in timed out. Please try again.");
          } else {
            setError("Network error during sign-in. Check your connection.");
          }
          return;
        }
        clearTimeout(timeoutId);

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          setError(errData.error || "Failed to complete Google sign-in.");
          return;
        }

        const { id_token, access_token } = await tokenRes.json();

        if (!id_token) {
          setError("No ID token received. Please try again.");
          return;
        }

        // Sign into Supabase with the Google ID token
        // Note: nonce is not used — Google doesn't embed nonce in ID tokens for authorization_code flow.
        // CSRF protection is handled by the state parameter validated above.
        const client = await getSupabase();
        const { error: signInError } = await client.auth.signInWithIdToken({
          provider: "google",
          token: id_token,
          access_token: access_token || undefined,
        });

        if (signInError) {
          console.error("[auth] signInWithIdToken failed:", signInError.message);
          setError("Failed to sign in. Please try again.");
          setTimeout(() => router.push("/login"), 2000);
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
        router.replace(returnTo);
      } catch (err) {
        console.error("[auth] OAuth callback error:", err);
        setError("An unexpected error occurred. Please try again.");
        setTimeout(() => router.push("/login"), 3000);
      }
    })();
  }, [router]);

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
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
              <button
                onClick={() => router.push("/login")}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory,
                  background: "transparent", border: `1px solid ${c.border}`,
                  borderRadius: 8, padding: "8px 20px", cursor: "pointer",
                }}
              >
                Back to Login
              </button>
              <button
                onClick={() => {
                  setError("");
                  router.push("/login");
                  setTimeout(() => {
                    // Re-trigger Google OAuth from login page
                  }, 100);
                }}
                style={{
                  fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
                  background: c.gilt, border: "none",
                  borderRadius: 8, padding: "8px 20px", cursor: "pointer",
                }}
              >
                Try Again
              </button>
            </div>
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

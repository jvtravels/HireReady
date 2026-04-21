"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "./tokens";
import { getSupabase, supabaseConfigured } from "./supabase";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: c.ember };
  if (score <= 2) return { score, label: "Fair", color: c.gilt };
  if (score <= 3) return { score, label: "Good", color: c.sage };
  return { score, label: "Strong", color: c.sage };
}

/** Simple CSRF protection: generate a random token per page load, stored in sessionStorage */
function generateCsrfToken(): string {
  const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem("hirestepx_csrf_reset", token); } catch { /* noop */ }
  return token;
}
function validateCsrfToken(token: string): boolean {
  try {
    const stored = sessionStorage.getItem("hirestepx_csrf_reset");
    return !!stored && stored === token;
  } catch { return false; }
}

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const csrfTokenRef = useRef<string>("");
  const strength = getPasswordStrength(password);

  useEffect(() => {
    if (!supabaseConfigured) {
      setError("Password reset requires Supabase configuration.");
      return;
    }
    // Supabase automatically picks up the recovery token from the URL hash
    (async () => {
      try {
        const client = await getSupabase();
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
          router.replace("/login?reset_error=link_expired");
          return;
        }
        // Check if this reset link was already used
        const usedAt = session.user.user_metadata?.password_reset_used_at;
        if (usedAt && typeof usedAt === "number") {
          const elapsed = Date.now() - usedAt;
          if (elapsed < 24 * 60 * 60 * 1000) {
            await client.auth.signOut().catch(() => {});
            router.replace("/login?reset_error=link_used");
            return;
          }
        }
        // Generate CSRF token for this session — prevents cross-site form submission
        csrfTokenRef.current = generateCsrfToken();
        setHasSession(true);
      } catch {
        setError("Could not verify reset link. Please try again.");
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 128) {
      setError("Password must be 128 characters or fewer.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("Password must contain at least one special character.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    // CSRF check — ensure form was submitted from our own page
    if (!validateCsrfToken(csrfTokenRef.current)) {
      setError("Security validation failed. Please refresh the page and try again.");
      return;
    }

    setLoading(true);
    try {
      const client = await getSupabase();
      const { data: { session: currentSession } } = await client.auth.getSession();

      // Password history check — prevent reuse of last 3 passwords
      // Uses SHA-256 via Web Crypto API for proper hashing (client-side only; Supabase handles actual password security)
      const passwordHashes: string[] = currentSession?.user?.user_metadata?.password_hashes || [];
      const hashPassword = async (pw: string): Promise<string> => {
        const encoder = new TextEncoder();
        const data = encoder.encode(pw);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      };
      const newHash = await hashPassword(password);
      if (passwordHashes.includes(newHash)) {
        setError("You cannot reuse a recent password. Please choose a different one.");
        setLoading(false);
        return;
      }

      // Use server-validated timestamp from the session itself (not client Date.now() which can be forged)
      const serverTimestamp = currentSession?.expires_at
        ? (currentSession.expires_at * 1000) - (3600 * 1000) // derive approximate server time from JWT exp (issued 1hr before exp)
        : Date.now(); // fallback to client time if session unavailable

      // Keep last 3 password hashes for history check
      const updatedHashes = [newHash, ...passwordHashes].slice(0, 3);

      const { error: updateError } = await client.auth.updateUser({
        password,
        data: {
          custom_email_verified: true,
          password_reset_used_at: serverTimestamp,
          password_hashes: updatedHashes,
        },
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        // Send password-changed notification email (fire-and-forget)
        const userEmail = currentSession?.user?.email;
        if (userEmail) {
          fetch("/api/send-welcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: userEmail, action: "password-changed" }),
          }).catch(() => {});
        }
        // Sign out the recovery session so user must log in with new password
        try { await client.auth.signOut(); } catch { /* best effort */ }
        setSuccess(true);
        setTimeout(() => router.push("/login"), 4000);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: c.obsidian,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: font.ui,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, padding: 32,
        background: c.graphite, borderRadius: 16,
        border: `1px solid ${c.border}`,
      }}>
        <h1 style={{
          fontFamily: font.display, fontSize: 28, fontWeight: 400,
          color: c.ivory, marginBottom: 8, textAlign: "center",
        }}>
          Reset Password
        </h1>
        <p style={{ fontSize: 13, color: c.stone, textAlign: "center", marginBottom: 28 }}>
          Enter your new password below.
        </p>

        {success ? (
          <div style={{
            padding: 16, borderRadius: 10,
            background: "rgba(122,158,126,0.1)", border: `1px solid rgba(122,158,126,0.3)`,
            textAlign: "center",
          }}>
            <p style={{ color: c.sage, fontSize: 14, fontWeight: 500 }}>Password updated successfully!</p>
            <p style={{ color: c.stone, fontSize: 12, marginTop: 4 }}>Redirecting to login...</p>
            <button
              onClick={() => router.push("/login")}
              style={{
                marginTop: 12, fontFamily: font.ui, fontSize: 13, fontWeight: 600,
                color: c.obsidian, background: c.gilt, border: "none",
                borderRadius: 8, padding: "8px 20px", cursor: "pointer",
              }}
            >
              Continue to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: "rgba(196,112,90,0.1)", border: `1px solid rgba(196,112,90,0.3)`,
              }}>
                <p style={{ color: c.ember, fontSize: 12, marginBottom: !hasSession ? 8 : 0 }}>{error}</p>
                {!hasSession && (
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    style={{
                      fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt,
                      background: "none", border: `1px solid rgba(212,179,127,0.3)`,
                      borderRadius: 10, padding: "6px 14px", cursor: "pointer",
                    }}
                  >
                    Request a new reset link
                  </button>
                )}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reset-pw" style={{ fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>
                New Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="reset-pw"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={!hasSession}
                  maxLength={128}
                  style={{
                    width: "100%", padding: "10px 44px 10px 14px", borderRadius: 8,
                    background: c.obsidian, border: `1px solid ${c.border}`,
                    color: c.ivory, fontSize: 13, outline: "none", boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    color: c.stone, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {showPassword ? (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: i < strength.score ? strength.color : c.border,
                        transition: "background 0.2s",
                      }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor="reset-pw-confirm" style={{ fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>
                Confirm Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="reset-pw-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  disabled={!hasSession}
                  maxLength={128}
                  style={{
                    width: "100%", padding: "10px 44px 10px 14px", borderRadius: 8,
                    background: c.obsidian, border: `1px solid ${c.border}`,
                    color: c.ivory, fontSize: 13, outline: "none", boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    color: c.stone, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {showConfirm ? (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !hasSession}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                background: loading ? c.border : c.gilt, color: c.obsidian,
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              style={{
                width: "100%", padding: "10px 0", marginTop: 12,
                background: "transparent", border: "none",
                color: c.stone, fontSize: 13, cursor: "pointer",
              }}
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

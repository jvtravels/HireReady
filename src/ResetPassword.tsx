import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const strength = getPasswordStrength(password);

  useEffect(() => {
    if (!supabaseConfigured) {
      setError("Password reset requires Supabase configuration.");
      return;
    }
    // Supabase automatically picks up the recovery token from the URL hash
    getSupabase().then(c => c.auth.getSession()).then(({ data: { session } }) => {
      if (session) setHasSession(true);
      else setError("Invalid or expired reset link. Please request a new one.");
    }).catch(() => {
      setError("Could not verify reset link. Please try again.");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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

    setLoading(true);
    const client = await getSupabase();
    const { error: updateError } = await client.auth.updateUser({
      password,
      data: { custom_email_verified: true },
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
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
                    onClick={() => navigate("/login")}
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
              <input
                id="reset-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={!hasSession}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: c.obsidian, border: `1px solid ${c.border}`,
                  color: c.ivory, fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
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
              <input
                id="reset-pw-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                disabled={!hasSession}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: c.obsidian, border: `1px solid ${c.border}`,
                  color: c.ivory, fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
              />
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
              onClick={() => navigate("/login")}
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

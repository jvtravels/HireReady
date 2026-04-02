import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";

export default function SignUp({ isLogin = false }: { isLogin?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, loginWithGoogle, resetPassword, isLoggedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [signupSent, setSignupSent] = useState(false);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (isLoggedIn) {
      const from = (location.state as any)?.from || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [isLoggedIn, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        const result = await login(email, password);
        if (!result.success) {
          setError(result.error || "Login failed");
          return;
        }
        const from = (location.state as any)?.from || "/dashboard";
        navigate(from, { replace: true });
      } else {
        const result = await signup(email, name, password);
        if (!result.success) {
          setError(result.error || "Signup failed");
          return;
        }
        // If user is now logged in (email confirmation disabled), go to onboarding
        // Otherwise show "check your email" message
        // Small delay to let auth state update
        await new Promise(r => setTimeout(r, 1000));
        if (!isLoggedIn) {
          setSignupSent(true);
        } else {
          navigate("/onboarding");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    const result = await loginWithGoogle();
    if (!result.success) {
      setError(result.error || "Google login failed");
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address first");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await resetPassword(email);
      if (result.success) {
        setResetSent(true);
      } else {
        setError(result.error || "Failed to send reset email");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-grid" style={{
      minHeight: "100vh", background: c.obsidian, display: "grid",
      gridTemplateColumns: "1fr 1fr",
    }}>
      {/* Left: Form */}
      <div className="signup-form" style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "60px 80px", maxWidth: 520, margin: "0 auto", width: "100%",
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: "none", marginBottom: 56 }}>
          <span style={{
            fontFamily: font.ui, fontSize: 16, fontWeight: 600,
            color: c.ivory, letterSpacing: "0.06em",
          }}>
            Level Up
          </span>
        </Link>

        <h1 style={{
          fontFamily: font.display, fontSize: 36, fontWeight: 400,
          color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8,
        }}>
          {showReset ? "Reset your password" : isLogin ? "Welcome back" : "Start practicing today"}
        </h1>
        <p style={{
          fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6, marginBottom: 36,
        }}>
          {showReset
            ? "Enter your email and we'll send you a reset link."
            : isLogin
              ? "Log in to continue your interview practice."
              : "Your first AI mock interview is free. No credit card needed."
          }
        </p>

        {/* Signup confirmation */}
        {signupSent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ padding: "20px 24px", borderRadius: 12, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.sage }}>Account created!</span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.6, margin: 0 }}>
                We've sent a confirmation link to <strong>{email}</strong>. Click the link in your email to activate your account, then come back and log in.
              </p>
            </div>
            <button onClick={() => { setSignupSent(false); }}
              style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 13, color: c.gilt, cursor: "pointer", marginTop: 4 }}>
              Back to login
            </button>
          </div>
        ) : showReset ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {resetSent ? (
              <div style={{ padding: "16px 20px", borderRadius: 8, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.2)" }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.sage, margin: 0, lineHeight: 1.6 }}>
                  Check your email for a password reset link. It may take a minute to arrive.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required
                    style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                    onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                    onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                  />
                </div>
                {error && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.2)" }}>
                    <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ember, margin: 0 }}>{error}</p>
                  </div>
                )}
                <button onClick={handleResetPassword} disabled={loading} className="shimmer-btn"
                  style={{ width: "100%", padding: "14px 24px", borderRadius: 8, background: c.ivory, color: c.obsidian, border: "none", fontFamily: font.ui, fontSize: 15, fontWeight: 500, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </>
            )}
            <button onClick={() => { setShowReset(false); setResetSent(false); setError(""); }}
              style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 13, color: c.gilt, cursor: "pointer", marginTop: 8 }}>
              Back to login
            </button>
          </div>
        ) : (
          <>
            {/* Google login */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              <button onClick={handleGoogleLogin}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                  width: "100%", padding: "13px 20px", borderRadius: 8,
                  background: "transparent", border: `1px solid ${c.borderHover}`,
                  color: c.ivory, cursor: "pointer", fontFamily: font.ui, fontSize: 14,
                  fontWeight: 500, transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.04)"; e.currentTarget.style.borderColor = c.chalk; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = c.borderHover; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>

            {/* Email/password form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {!isLogin && (
                <div>
                  <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Full name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required
                    style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                    onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                    onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                  />
                </div>
              )}

              <div>
                <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                />
              </div>

              <div>
                <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? "Enter your password" : "Create a password (8+ chars)"} required minLength={8}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                />
                {!isLogin && password.length > 0 && (() => {
                  const strength = password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) ? 4
                    : password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password) ? 3
                    : password.length >= 8 ? 2 : 1;
                  const labels = ["", "Weak", "Fair", "Good", "Strong"];
                  const colors = ["", c.ember, c.gilt, c.sage, c.sage];
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 3, flex: 1 }}>
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength ? colors[strength] : c.border, transition: "background 0.2s" }} />
                        ))}
                      </div>
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: colors[strength], fontWeight: 500 }}>{labels[strength]}</span>
                    </div>
                  );
                })()}
              </div>

              {isLogin && (
                <button type="button" onClick={() => { setShowReset(true); setError(""); }}
                  style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 12, color: c.gilt, cursor: "pointer", textAlign: "right", padding: 0, marginTop: -8 }}>
                  Forgot password?
                </button>
              )}

              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.2)", marginBottom: 4 }}>
                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ember, margin: 0 }}>{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading} className="shimmer-btn"
                style={{
                  width: "100%", padding: "14px 24px", borderRadius: 8,
                  background: c.ivory, color: c.obsidian, border: "none",
                  fontFamily: font.ui, fontSize: 15, fontWeight: 500,
                  cursor: loading ? "wait" : "pointer", marginTop: 4, letterSpacing: "0.01em",
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = c.gilt; e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.2)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = c.ivory; e.currentTarget.style.boxShadow = "none"; }}
              >
                {loading ? "Please wait..." : isLogin ? "Log in" : "Create account"}
              </button>
            </form>

            {/* Toggle */}
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 28, textAlign: "center" }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Link to={isLogin ? "/signup" : "/login"}
                style={{ color: c.gilt, textDecoration: "none", fontWeight: 500, transition: "opacity 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                {isLogin ? "Sign up" : "Log in"}
              </Link>
            </p>

            {/* Terms */}
            {!isLogin && (
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 20, textAlign: "center", lineHeight: 1.5 }}>
                By creating an account, you agree to our{" "}
                <span style={{ color: c.chalk, textDecoration: "underline", cursor: "pointer" }}>Terms of Service</span>{" "}
                and <span style={{ color: c.chalk, textDecoration: "underline", cursor: "pointer" }}>Privacy Policy</span>.
              </p>
            )}
          </>
        )}
      </div>

      {/* Right: Visual panel */}
      <div className="signup-visual" style={{ position: "relative", overflow: "hidden", background: c.graphite }}>
        <img src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=900&h=1200&fit=crop&crop=face" alt="Professional preparing for an interview"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${c.obsidian}40 0%, transparent 30%, transparent 50%, ${c.obsidian}E6 85%)` }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${c.obsidian}80 0%, transparent 40%)` }} />

        {/* Floating product mockup */}
        <div style={{ position: "absolute", top: "12%", right: "8%", width: 260, background: "rgba(22,22,24,0.65)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRadius: 14, border: "1px solid rgba(240,237,232,0.08)", padding: "20px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)", animation: "floatSlow 6s ease-in-out infinite" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory }}>Live Session</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.sage, animation: "giltPulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage }}>Active</span>
            </span>
          </div>
          <div style={{ background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.gilt, marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>Interviewer</p>
            <p style={{ fontFamily: font.ui, fontSize: 11, lineHeight: 1.5, color: c.ivory }}>Walk me through how you scaled the engineering org...</p>
          </div>
          <div style={{ display: "flex", gap: 2, height: 16 }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: `${20 + Math.sin(i * 0.8) * 40 + Math.random() * 40}%`, background: "linear-gradient(180deg, rgba(201,169,110,0.6), rgba(196,112,90,0.4))", borderRadius: 1, alignSelf: "flex-end" }} />
            ))}
          </div>
        </div>

        {/* Floating score badge */}
        <div style={{ position: "absolute", top: "45%", left: "10%", width: 160, background: "rgba(22,22,24,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, border: "1px solid rgba(240,237,232,0.08)", padding: "16px 18px", boxShadow: "0 16px 48px rgba(0,0,0,0.4)", animation: "floatSlow 5s ease-in-out 1s infinite" }}>
          <span style={{ fontFamily: font.mono, fontSize: 36, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em", display: "block", lineHeight: 1 }}>92</span>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase" }}>Session Score</span>
          <div style={{ marginTop: 10, height: 3, background: "rgba(240,237,232,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "92%", background: c.sage, borderRadius: 2 }} />
          </div>
        </div>

        {/* Bottom testimonial */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px 40px 36px", zIndex: 2 }}>
          <div style={{ background: "rgba(22,22,24,0.6)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 14, border: "1px solid rgba(240,237,232,0.06)", padding: "24px 28px" }}>
            <p style={{ fontFamily: font.display, fontSize: 18, fontWeight: 400, fontStyle: "italic", color: c.ivory, lineHeight: 1.55, marginBottom: 16 }}>
              "The AI feedback transformed how I prepare for executive interviews."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${c.gilt}, ${c.sage})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.obsidian }}>P</span>
              </div>
              <div>
                <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Beta User</p>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Engineering Leader</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

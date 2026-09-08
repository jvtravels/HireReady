/* HireStepX — Login (production)
   Wires real Supabase auth via useAuth(), redirect handling,
   plan param preservation, login lockout, error mapping. */
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { tokens as t, fonts as f, shadows } from "./_tokens";
import {
  Field,
  Checkbox,
  Wordmark,
  GoogleIcon,
  Spinner,
  EyeIcon,
} from "./_fields";
import { AUTH_STYLES } from "./_styles";
import {
  passwordHasEdgeWhitespace,
  sanitizeEmail,
  validateEmail,
  validatePassword,
} from "./_validation";
import { trackAuth, loginViewedEvent } from "./_analytics";
import {
  buildAuthLink,
  computeAuthRedirect,
  isResetInProgress,
  mapAuthError,
  markSessionStart,
  readStaySignedInPref,
  useIsMounted,
} from "./_shell";

// Auto-hide password if visible for this long (over-shoulder protection)
const PASSWORD_VISIBLE_TIMEOUT_MS = 10_000;
const EMAIL_MAX_LENGTH = 254; // RFC 5321 hard ceiling — no real mail server accepts longer
const PASSWORD_MAX_LENGTH = 128;

// Login lockout — AuthContext.login() is the single source of truth for
// the failed-attempt counter, threshold, and lockout window. This screen
// only READS the shared lockout timestamp to render the countdown, so the
// two surfaces can never diverge or double-count attempts. (Previously a
// second counter lived here and incremented in parallel, locking users out
// in half the intended attempts.)
const LOCKOUT_STORAGE_KEY = "hirestepx_login_lockout";

function readLockoutSeconds(): number {
  try {
    const until = parseInt(
      localStorage.getItem(LOCKOUT_STORAGE_KEY) || "0",
      10,
    );
    if (until && Date.now() < until) {
      return Math.ceil((until - Date.now()) / 1000);
    }
  } catch {
    /* localStorage may be blocked (incognito, ITP) */
  }
  return 0;
}

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, isLoggedIn, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Anti-autofill: clear fields on mount if the browser auto-populated
  // them without user interaction. Spec: "saved credentials may appear
  // as suggestions only — fields should remain empty until the user
  // explicitly selects a suggestion." We can't disable the dropdown
  // (browsers ignore autoComplete="off" on login fields), so we use a
  // delayed clear that only runs if the user hasn't typed/clicked yet.
  const userInteractedRef = React.useRef(false);
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (userInteractedRef.current) return;
      setEmail((cur) => (cur && !userInteractedRef.current ? "" : cur));
      setPassword((cur) => (cur && !userInteractedRef.current ? "" : cur));
    }, 250);
    return () => clearTimeout(id);
  }, []);
  const [loading, setLoading] = useState(false);
  const [googleInFlight, setGoogleInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SSR-safe: starts at 0, reads from localStorage in useEffect after mount
  // to avoid hydration mismatch when the user is already locked.
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const isMounted = useIsMounted();

  // Validation
  const emailV = validateEmail(email);
  const passwordV = validatePassword(password);
  const isLocked = lockoutSeconds > 0;
  const canSubmit = emailV.valid && passwordV.valid && !loading && !isLocked;

  const emailError = emailTouched ? emailV.message : null;
  const passwordError = passwordTouched
    ? passwordV.message ||
      (passwordHasEdgeWhitespace(password)
        ? "Password has leading or trailing spaces — check your paste."
        : null)
    : null;

  // Plan + redirect param preservation (matches existing SignUp behavior)
  const planParam = searchParams?.get("plan") ?? null;
  const nextParam = searchParams?.get("next") ?? null;
  const isEmployerFlow = !!nextParam?.startsWith("/employer");

  const computeRedirect = useCallback(
    () =>
      computeAuthRedirect({
        next: nextParam,
        plan: planParam,
        hasCompletedOnboarding: !!user?.hasCompletedOnboarding,
      }),
    [nextParam, planParam, user],
  );

  // Already-logged-in: bounce to destination — UNLESS another tab is
  // mid password-reset, in which case the recovery session is briefly
  // propagating across tabs and we'd yank this tab to /dashboard with
  // a stale session about to be invalidated.
  useEffect(() => {
    if (isLoggedIn && user && !isResetInProgress()) {
      router.replace(computeRedirect());
    }
  }, [isLoggedIn, user, router, computeRedirect]);

  // Analytics: viewed once. Pass the screen variant for funnel symmetry
  // with Signup which fires "signup".
  useEffect(() => {
    trackAuth(loginViewedEvent("login"));
  }, []);

  // Initialize lockout on the client (SSR-safe — runs after mount).
  // Also hydrate the user's previous Stay-signed-in preference so the
  // checkbox remembers what they picked last time.
  useEffect(() => {
    setLockoutSeconds(readLockoutSeconds());
    setStaySignedIn(readStaySignedInPref());
  }, []);

  // Clear stale error banner when the user navigates back to this page
  // via the browser back button (bfcache restore preserves component
  // state, so a previous "incorrect password" error would persist).
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted) setError(null);
    };
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }, []);

  // Auto-hide password timeout
  useEffect(() => {
    if (!showPassword) return;
    const id = setTimeout(
      () => setShowPassword(false),
      PASSWORD_VISIBLE_TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [showPassword]);

  // Lockout countdown
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => setLockoutSeconds(readLockoutSeconds()), 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds]);

  // autoFocus only if tab is active at mount
  const [shouldAutoFocus] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.visibilityState === "visible";
  });

  const handleGoogle = useCallback(async () => {
    if (googleInFlight || loading) return;
    setGoogleInFlight(true);
    setError(null);
    trackAuth({ type: "login_method_selected", method: "google" });
    trackAuth({ type: "login_submitted", method: "google" });

    // Fallback timer — if OAuth redirect doesn't fire (popup blocker,
    // network blip, browser cancel), re-enable the button after 8s
    // so users aren't stranded on a permanently disabled button.
    const fallback = setTimeout(() => {
      if (isMounted.current) setGoogleInFlight(false);
    }, 8000);

    const start = Date.now();
    try {
      const result = await loginWithGoogle(computeRedirect());
      if (!isMounted.current) return;
      if (!result.success) {
        setError(mapAuthError(result.error));
        trackAuth({
          type: "login_failed",
          method: "google",
          reason: "unknown",
        });
      } else {
        // Apply the same Stay-signed-in preference to OAuth flows.
        markSessionStart(staySignedIn);
        trackAuth({
          type: "login_succeeded",
          method: "google",
          timeMs: Date.now() - start,
        });
        // OAuth redirect will navigate away. Leave googleInFlight true
        // so the button stays disabled until navigation actually happens
        // (or the fallback timer trips).
        return;
      }
    } catch (e) {
      if (!isMounted.current) return;
      setError(mapAuthError(e instanceof Error ? e.message : undefined));
      trackAuth({ type: "login_failed", method: "google", reason: "unknown" });
    } finally {
      clearTimeout(fallback);
    }
    if (isMounted.current) setGoogleInFlight(false);
  }, [googleInFlight, loading, loginWithGoogle, computeRedirect, isMounted, staySignedIn]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setEmailTouched(true);
      setPasswordTouched(true);
      if (!canSubmit) return;

      setError(null);
      setLoading(true);
      const cleanEmail = sanitizeEmail(email);
      trackAuth({ type: "login_method_selected", method: "email" });
      trackAuth({ type: "login_submitted", method: "email" });
      const start = Date.now();
      try {
        const result = await login(cleanEmail, password);
        if (!isMounted.current) return;
        if (!result.success) {
          // AuthContext.login() has already recorded the failed attempt and
          // armed the lockout if the threshold was crossed; just refresh the
          // countdown from the shared key it owns.
          setLockoutSeconds(readLockoutSeconds());
          setError(mapAuthError(result.error));
          trackAuth({
            type: "login_failed",
            method: "email",
            reason: result.error?.toLowerCase().includes("rate")
              ? "rate_limited"
              : "invalid_credentials",
          });
        } else {
          // AuthContext.login() clears the shared attempt counter + lockout
          // on success; nothing to clear here.
          // Record the user's Stay-signed-in preference so AuthContext
          // can enforce the right TTL (30d if checked, 24h if not).
          markSessionStart(staySignedIn);
          trackAuth({
            type: "login_succeeded",
            method: "email",
            timeMs: Date.now() - start,
          });
        }
      } catch (err) {
        if (!isMounted.current) return;
        const msg = err instanceof Error ? err.message : undefined;
        setError(mapAuthError(msg));
        trackAuth({ type: "login_failed", method: "email", reason: "network" });
      } finally {
        if (isMounted.current) setLoading(false);
      }
    },
    [canSubmit, email, password, login, isMounted, staySignedIn],
  );

  const handlePasswordVisibility = () => {
    setShowPassword((v) => {
      trackAuth({ type: "login_password_visibility_toggled", visible: !v });
      return !v;
    });
  };

  // Notices set by upstream redirects (verify-email handler, OAuth callback,
  // expired reset link, single-device eviction, etc.) — read from query params.
  const verifiedParam = searchParams?.get("verified") ?? null;
  const errorParam = searchParams?.get("error") ?? null;
  const reasonParam = searchParams?.get("reason") ?? null;

  // Map known error codes to user-facing copy. Falls back to a generic
  // message for unrecognized codes so users never see raw error tokens.
  const errorParamMessage = errorParam
    ? errorParam === "verification-failed"
      ? "We couldn't verify your email. The link may have expired — sign up again or try a fresh reset link."
      : errorParam === "verification-expired"
        ? "Your verification link has expired. Sign up again to receive a new one."
        : errorParam === "session-expired"
          ? "Your session expired. Please log in again."
          : "Something went wrong. Try again or contact support."
    : null;

  const reasonNotice =
    reasonParam === "device_evicted"
      ? "You were signed in on another device, so this session was ended. Log in again to continue."
      : null;

  const verifiedNotice =
    verifiedParam === "true"
      ? "Email verified — you're all set. Log in below to continue."
      : verifiedParam === "already"
        ? "This email is already verified. Log in below to continue."
        : null;

  const displayError = isLocked
    ? `Account temporarily locked after too many attempts. Try again in ${Math.ceil(lockoutSeconds / 60)} minute${lockoutSeconds > 60 ? "s" : ""}.`
    : error || errorParamMessage;

  return (
    <>
      <style>{AUTH_STYLES}</style>
      <div
        style={{
          background: t.cream,
          minHeight: "100dvh",
          fontFamily: f.sans,
          color: t.coal,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar */}
        <header
          className="hsx-login-topbar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "32px 48px",
            gap: 16,
          }}
        >
          <a
            href="/"
            aria-label="HireStepX home"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Wordmark />
          </a>
          <div
            className="hsx-login-signup-prompt"
            style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft }}
          >
            <span className="hsx-login-signup-text">
              Don't have an account?{" "}
            </span>
            <a
              href={buildAuthLink("/signup", searchParams)}
              className="hsx-link-indigo"
              onClick={() => trackAuth({ type: "login_signup_clicked" })}
              style={{
                color: t.indigo,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign up
            </a>
          </div>
        </header>

        <main
          className="hsx-login-main"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(24px, 4vh, 64px) 24px",
          }}
        >
          {/* Hero — full-width container with one-line headline at desktop.
              CSS @media in _styles re-enables wrapping below 760px viewport. */}
          <div
            className="hsx-login-hero"
            style={{
              width: "100%",
              textAlign: "center",
              marginBottom: 36,
            }}
          >
            <h1
              id="login-heading"
              style={{
                fontFamily: f.serif,
                fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
                lineHeight: 1.05,
                fontWeight: 400,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
                margin: 0,
                color: t.coal,
              }}
            >
              {isEmployerFlow ? (
                <>
                  Hire{" "}
                  <em
                    style={{
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: t.copper,
                    }}
                  >
                    faster
                  </em>{" "}
                  with proof
                </>
              ) : (
                <>
                  Clarity{" "}
                  <em
                    style={{
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: t.copper,
                    }}
                  >
                    wins
                  </em>{" "}
                  interviews
                </>
              )}
            </h1>
            <p
              className="hsx-login-subtitle"
              style={{
                fontFamily: f.sans,
                fontSize: 16,
                lineHeight: 1.55,
                color: t.inkSoft,
                marginTop: 18,
                marginBottom: 0,
                textWrap: "balance",
              }}
            >
              {isEmployerFlow
                ? "Sign in to review your shortlist of candidates who've already been scored on real interview practice."
                : "Practise interviews with an AI coach. Get scored, structured feedback after every session."}
            </p>
          </div>

          <div
            className="hsx-login-form"
            style={{ width: "100%", maxWidth: 540 }}
          >
            <button
              type="button"
              className="hsx-login-google"
              onClick={handleGoogle}
              disabled={googleInFlight || loading || isLocked}
              aria-busy={googleInFlight ? "true" : "false"}
              style={{
                width: "100%",
                fontFamily: f.sans,
                fontSize: 15,
                fontWeight: 500,
                color: t.coal,
                background: t.white,
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                padding: "14px 18px",
                cursor:
                  googleInFlight || loading || isLocked
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                boxShadow: shadows.card,
                opacity: googleInFlight || loading || isLocked ? 0.7 : 1,
              }}
            >
              <GoogleIcon />
              {googleInFlight ? "Opening Google…" : "Continue with Google"}
            </button>

            <div
              className="hsx-login-divider"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                margin: "20px 0",
              }}
            >
              <div style={{ flex: 1, height: 1, background: t.line }} />
              <span
                style={{ fontFamily: f.sans, fontSize: 13, color: t.inkFaint }}
              >
                or
              </span>
              <div style={{ flex: 1, height: 1, background: t.line }} />
            </div>

            {/* Device-eviction notice — shown when single-device enforcement
                signed the user out on this device. */}
            {!displayError && reasonNotice && (
              <div
                role="status"
                aria-live="polite"
                className="hsx-error-banner"
                style={{
                  background: "#FFF8EB",
                  border: "1px solid #D97706",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                  fontFamily: f.sans,
                  fontSize: 13,
                  color: "#92400E",
                  lineHeight: 1.4,
                }}
              >
                {reasonNotice}
              </div>
            )}

            {/* Success notice from upstream redirects (e.g. /api/verify-email
                → /login?verified=true). Shown only when there's no error. */}
            {!displayError && !reasonNotice && verifiedNotice && (
              <div
                role="status"
                aria-live="polite"
                className="hsx-error-banner"
                style={{
                  background: t.success100,
                  border: `1px solid ${t.success}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                  fontFamily: f.sans,
                  fontSize: 13,
                  color: t.success,
                  lineHeight: 1.4,
                }}
              >
                {verifiedNotice}
              </div>
            )}

            {displayError && (
              <div
                role="alert"
                id="login-error"
                className="hsx-error-banner"
                style={{
                  background: t.error100,
                  border: `1px solid ${t.error}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 16,
                  fontFamily: f.sans,
                  fontSize: 13,
                  color: t.error,
                  lineHeight: 1.4,
                }}
              >
                {displayError}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              aria-labelledby="login-heading"
              aria-describedby={displayError ? "login-error" : undefined}
              className="hsx-login-form-fields"
              style={{ display: "flex", flexDirection: "column", gap: 18 }}
            >
              <Field
                label="Email Address"
                type="email"
                name="email"
                value={email}
                onChange={(v) => {
                  userInteractedRef.current = true;
                  setEmail(v);
                  if (error) setError(null);
                }}
                onFocus={() => {
                  if (!emailTouched) {
                    trackAuth({ type: "login_field_focused", field: "email" });
                  }
                  setEmailTouched(true);
                }}
                onAutofill={() => { userInteractedRef.current = true; setEmailTouched(true); }}
                autoComplete="email"
                placeholder="rahul@example.com"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={shouldAutoFocus}
                inputMode="email"
                enterKeyHint="next"
                maxLength={EMAIL_MAX_LENGTH}
                invalid={!!error || (emailTouched && !!emailV.message)}
                errorMessage={emailError}
              />
              <Field
                label="Password"
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(v) => {
                  userInteractedRef.current = true;
                  setPassword(v);
                  if (error) setError(null);
                }}
                onFocus={() => {
                  if (!passwordTouched) {
                    trackAuth({
                      type: "login_field_focused",
                      field: "password",
                    });
                  }
                  setPasswordTouched(true);
                }}
                onAutofill={() => { userInteractedRef.current = true; setPasswordTouched(true); }}
                autoComplete="current-password"
                placeholder="Enter your password"
                enterKeyHint="go"
                maxLength={PASSWORD_MAX_LENGTH}
                invalid={
                  !!error || (passwordTouched && !!passwordV.message)
                }
                errorMessage={passwordError}
                rightSlot={
                  <button
                    type="button"
                    className="hsx-eye-toggle"
                    onClick={handlePasswordVisibility}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: t.inkSoft,
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                }
              />

              <div
                className="hsx-login-meta-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 2,
                  minHeight: 20,
                }}
              >
                <Checkbox
                  checked={staySignedIn}
                  onChange={setStaySignedIn}
                  label="Stay signed in"
                  description="Stay signed in for 30 days. Leave unchecked on shared devices — you'll be signed out after 24 hours."
                />
                <a
                  href="/forgot-password"
                  className="hsx-link-indigo"
                  onClick={() =>
                    trackAuth({ type: "login_forgot_password_clicked" })
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 20,
                    fontFamily: f.sans,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1,
                    color: t.indigo,
                    textDecoration: "none",
                  }}
                >
                  Forgot password
                </a>
              </div>

              {(() => {
                // Three states: enabled CTA, in-flight (loading), or
                // ghost-disabled (form not yet valid). The ghost treatment
                // signals "no action available" without looking dimmed-active.
                const isGhost = !canSubmit && !loading;
                const tooltip = isGhost
                  ? !emailV.valid
                    ? "Enter a valid email to continue"
                    : !passwordV.valid
                      ? "Enter your password to continue"
                      : "Complete the form to continue"
                  : undefined;
                return (
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    aria-busy={loading ? "true" : "false"}
                    title={tooltip}
                    className="hsx-login-cta"
                    style={{
                      width: "100%",
                      fontFamily: f.sans,
                      fontSize: 15,
                      fontWeight: 600,
                      color: isGhost ? t.inkSoft : t.cream,
                      background: isGhost ? t.creamSoft : t.indigo,
                      /* lineStrong instead of line — more definition against
                         the cream page background so the button reads as
                         "waiting" rather than absent. */
                      border: isGhost
                        ? `1px solid ${t.lineStrong}`
                        : "1px solid transparent",
                      borderRadius: 10,
                      padding: "16px 18px",
                      cursor: canSubmit ? "pointer" : "not-allowed",
                      marginTop: 14,
                      boxShadow: isGhost ? "none" : shadows.cta,
                      letterSpacing: 0.1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      opacity: loading ? 0.95 : 1,
                    }}
                  >
                    {loading ? (
                      <>
                        <Spinner color={t.cream} />
                        Signing in…
                      </>
                    ) : (
                      <>
                        {isEmployerFlow ? "Continue to your roster" : "Continue to practise"}
                        <svg
                          className="hsx-login-cta-arrow"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                );
              })()}
            </form>
          </div>
        </main>

        <footer
          className="hsx-login-footer"
          style={{
            textAlign: "center",
            padding: "20px 24px 28px",
            fontFamily: f.sans,
            fontSize: 12,
            color: t.inkFaint,
            lineHeight: 1.6,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          By clicking "Log in with Google" or "Continue with email" you agree to
          our{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hsx-link-muted"
            style={{
              color: t.inkSoft,
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            Terms of Use
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hsx-link-muted"
            style={{
              color: t.inkSoft,
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            Privacy Policy
          </a>
        </footer>
      </div>
    </>
  );
}

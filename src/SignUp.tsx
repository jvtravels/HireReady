"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams as useNextSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";

import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { supabaseConfigured } from "./supabase";

// Remember me preference
const REMEMBER_ME_KEY = "hirestepx_remember_me";
function saveRememberMe(val: boolean) {
  try { localStorage.setItem(REMEMBER_ME_KEY, val ? "1" : "0"); } catch { /* expected: localStorage may be unavailable */ }
}
function getRememberMe(): boolean {
  try { return localStorage.getItem(REMEMBER_ME_KEY) !== "0"; } catch { return true; }
}

// Track last login method for returning users
const LOGIN_METHOD_KEY = "hirestepx_login_method";
function saveLoginMethod(method: "email" | "google") {
  try { localStorage.setItem(LOGIN_METHOD_KEY, method); } catch { /* expected: localStorage may be unavailable */ }
}
function getLastLoginMethod(): "email" | "google" | null {
  try { return localStorage.getItem(LOGIN_METHOD_KEY) as "email" | "google" | null; } catch { return null; }
}

// Simple Levenshtein distance for email typo detection
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

// Map raw Supabase errors to user-friendly messages with suggestions
function friendlyError(raw: string, isLogin: boolean): { message: string; suggestion?: string } {
  const lower = raw.toLowerCase();
  // Login-specific
  if (lower.includes("invalid login credentials"))
    return { message: "Incorrect email or password.", suggestion: "Double-check your credentials or reset your password below." };
  // Email verification
  if (lower.includes("email not confirmed"))
    return { message: "Your email hasn't been verified yet.", suggestion: "Check your inbox (and spam folder) for the verification link. If it expired, sign up again with the same email to get a new link." };
  // Signup-specific
  if (lower.includes("user already registered") || lower.includes("already been registered"))
    return { message: "An account with this email already exists.", suggestion: isLogin ? "Try resetting your password if you forgot it." : "Try logging in instead, or reset your password if you forgot it." };
  if (lower.includes("signup is not allowed") || lower.includes("signups not allowed"))
    return { message: "Sign-ups are currently disabled.", suggestion: "Please try again later or contact support@hirestepx.com." };
  // Rate limiting / lockout
  if (lower.includes("too many failed") || lower.includes("login_locked"))
    return { message: "Account temporarily locked.", suggestion: "Too many failed attempts. Please wait 5 minutes and try again." };
  if (lower.includes("rate limit") || lower.includes("too many requests"))
    return { message: "Too many attempts.", suggestion: "Please wait a minute before trying again." };
  // Network
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection error"))
    return { message: "Connection error.", suggestion: "Check your internet connection and try again." };
  if (lower.includes("timeout") || lower.includes("timed out"))
    return { message: "Request timed out.", suggestion: "The server is slow. Please try again in a moment." };
  // Password
  if (lower.includes("weak password") || lower.includes("password should"))
    return { message: "Password is too weak.", suggestion: "Use at least 8 characters with a mix of letters, numbers, and symbols." };
  // Email format
  if (lower.includes("invalid email") && !lower.includes("password") && !lower.includes("credentials"))
    return { message: "That doesn't look like a valid email address.", suggestion: "Please check for typos." };
  // Signup failed (generic)
  if (!isLogin && lower.includes("signup failed"))
    return { message: "Could not create your account.", suggestion: "Please try again. If the problem persists, contact support@hirestepx.com." };
  return { message: raw };
}

// Check login lockout from localStorage
function checkLoginLocked(): { locked: boolean; remainingSeconds: number } {
  try {
    const until = parseInt(localStorage.getItem("hirestepx_login_lockout") || "0", 10);
    if (until && Date.now() < until) return { locked: true, remainingSeconds: Math.ceil((until - Date.now()) / 1000) };
  } catch { /* expected: localStorage may be unavailable */ }
  return { locked: false, remainingSeconds: 0 };
}

export default function SignUp({ isLogin = false }: { isLogin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const nextSearchParams = useNextSearchParams();
  const { login, signup, loginWithGoogle, resetPassword, isLoggedIn, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [signupSent, setSignupSent] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberMe());
  const [emailSuggestion, setEmailSuggestion] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [honeypot, setHoneypot] = useState(""); // Hidden bot-trap field
  const [resendCooldown, setResendCooldown] = useState(0);
  const lastSignupUserId = useRef<string | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Track online/offline status
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); setError(""); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // Resend button cooldown timer (60 seconds)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Login lockout countdown timer
  useEffect(() => {
    if (!isLogin) return;
    const check = () => {
      const { locked, remainingSeconds } = checkLoginLocked();
      setLockoutRemaining(locked ? remainingSeconds : 0);
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isLogin]);

  const verifiedParam = nextSearchParams.get("verified");
  const errorParam = nextSearchParams.get("error");
  const resetErrorParam = nextSearchParams.get("reset_error");
  const expiredParam = nextSearchParams.get("expired");
  const firstInputRef = useRef<HTMLInputElement>(null);
  const verifiedBanner = verifiedParam === "true" || verifiedParam === "already";

  // Auto-open reset form when redirected from expired/used reset link
  useEffect(() => {
    if (resetErrorParam && isLogin) {
      setShowReset(true);
      if (resetErrorParam === "link_expired") {
        setError("Your reset link has expired. Please request a new one.");
      } else if (resetErrorParam === "link_used") {
        setError("This reset link has already been used. Request a new one below.");
      }
    }
  }, [resetErrorParam, isLogin]);

  // Common email domain typo detection
  const COMMON_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "protonmail.com", "mail.com", "aol.com", "zoho.com", "yandex.com"];
  const checkEmailTypo = (emailVal: string) => {
    const parts = emailVal.split("@");
    if (parts.length !== 2 || !parts[1]) { setEmailSuggestion(""); return; }
    const domain = parts[1].toLowerCase();
    if (COMMON_DOMAINS.includes(domain)) { setEmailSuggestion(""); return; }
    // Find closest match with edit distance 1-2
    for (const d of COMMON_DOMAINS) {
      const dist = levenshtein(domain, d);
      if (dist > 0 && dist <= 2) {
        setEmailSuggestion(`${parts[0]}@${d}`);
        return;
      }
    }
    setEmailSuggestion("");
  };

  // Preserve plan intent from pricing page
  const planParam = nextSearchParams.get("plan");

  // If already logged in, redirect based on onboarding status
  useEffect(() => {
    if (isLoggedIn && user) {
      const defaultDest = user.hasCompletedOnboarding ? "/dashboard" : "/onboarding";
      const dest = planParam ? `${defaultDest}?plan=${planParam}` : defaultDest;
      router.replace(dest);
    }
  }, [isLoggedIn, user, router, planParam]);

  // Auto-focus first input field
  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [isLogin, showReset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Honeypot check — if filled, silently reject (it's a bot)
    if (honeypot) {
      // Fake success to not alert bot
      setSignupSent(true);
      return;
    }

    // Client-side validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError(isLogin ? "Password is required." : "Password must be at least 8 characters.");
      return;
    }
    if (!isLogin && password.length > 128) {
      setError("Password must be 128 characters or fewer.");
      return;
    }
    if (!isLogin && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isLogin && name.trim().length > 48) {
      setError("Name must be 48 characters or fewer.");
      return;
    }
    if (!isLogin) {
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);
      if (!hasUpper || !hasNumber || !hasSpecial) {
        setError("Password must include an uppercase letter, a number, and a special character.");
        return;
      }
      // Common password blocklist — catches the 99% attackers try first
      const COMMON_PASSWORDS = new Set([
        "password", "password1", "password123", "password1!", "password123!",
        "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl", "zxcvbnm",
        "abc123", "abc12345", "abcd1234", "admin", "admin123", "admin1234",
        "letmein", "letmein1", "welcome", "welcome1", "welcome123",
        "iloveyou", "princess", "monkey", "dragon", "sunshine",
        "123456", "12345678", "123456789", "1234567890", "111111", "000000",
        "qazwsx", "trustno1", "master", "hello123", "login1234",
        "p@ssw0rd", "pa$$w0rd", "p@ssword1", "passw0rd1", "passw0rd!",
      ]);
      const pwLower = password.toLowerCase();
      if (COMMON_PASSWORDS.has(pwLower) || COMMON_PASSWORDS.has(pwLower.replace(/[!@#$%^&*]/g, ""))) {
        setError("This password is too common. Please choose something unique.");
        return;
      }
      // Check for email-in-password (low entropy)
      const emailLocal = trimmedEmail.split("@")[0].toLowerCase();
      if (emailLocal.length >= 4 && pwLower.includes(emailLocal)) {
        setError("Your password shouldn't contain your email address.");
        return;
      }
      // Check for sequential/repeated patterns
      if (/(.)\1{4,}/.test(password) || /(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|xyz)/i.test(password)) {
        setError("Avoid sequential or repeated characters in your password.");
        return;
      }
    }
    // Warn on likely email typo before submitting
    if (emailSuggestion) {
      setError(`Did you mean ${emailSuggestion}? Click the suggestion or submit again to continue.`);
      setEmailSuggestion("");
      return;
    }

    setLoading(true);
    track(isLogin ? "login_submit" : "signup_submit");
    try {
      if (isLogin) {
        const result = await login(trimmedEmail, password);
        if (!result.success) {
          setError(result.error || "Login failed");
          return;
        }
        saveLoginMethod("email");
        saveRememberMe(rememberMe);
        if (!rememberMe) {
          // Mark session as ephemeral — will be cleared on tab close
          try { sessionStorage.setItem("hirestepx_ephemeral", "1"); } catch { /* expected: sessionStorage may be unavailable */ }
        }
        // Navigation handled by useEffect when isLoggedIn changes
        // This avoids double-redirect since useEffect checks onboarding status
      } else {
        const result = await signup(trimmedEmail, name.trim(), password);
        if (!result.success) {
          setError(result.error || "Signup failed");
          return;
        }
        if (result.userId) lastSignupUserId.current = result.userId;
        track("signup_completed", { method: "email" });
        if (!supabaseConfigured) {
          // localStorage fallback — user is already logged in, useEffect handles redirect
          return;
        }
        // Signup signs the user out after sending verification email.
        // Show the check-email screen.
        setSignupSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        setError(result.error || "Google login failed");
        setGoogleLoading(false);
      } else {
        saveLoginMethod("google");
      }
      // Don't reset loading on success — page will redirect via OAuth
    } catch {
      setGoogleLoading(false);
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
        setError(result.error || "Failed to send reset email. Try again or contact support@hirestepx.com");
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
      <style>{`
        @media (max-width: 900px) {
          .signup-grid { grid-template-columns: 1fr !important; }
          .signup-visual { display: none !important; }
          .signup-form { padding: 32px 20px !important; max-width: 100% !important; }
          .signup-form h1 { font-size: 28px !important; }
        }
        @media (max-width: 480px) {
          .signup-form { padding: 24px 16px !important; }
          .signup-form h1 { font-size: 24px !important; }
        }
      `}</style>
      {/* Left: Form */}
      <div className="signup-form" style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "60px 80px", maxWidth: 520, margin: "0 auto", width: "100%",
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", marginBottom: 56 }}>
          <span style={{
            fontFamily: font.display, fontSize: 24, fontWeight: 400,
            color: c.ivory, letterSpacing: "0.02em",
          }}>
            HireStepX
          </span>
        </Link>

        <h1 style={{
          fontFamily: font.display, fontSize: 40, fontWeight: 400,
          color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 10,
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

        {/* Offline banner */}
        {isOffline && (
          <div role="alert" style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(196,112,90,0.1)", border: "1px solid rgba(196,112,90,0.25)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ember }}>You're offline. Check your connection to continue.</span>
          </div>
        )}

        {/* Email verified success banner */}
        {verifiedBanner && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.2)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.sage }}>
                {verifiedParam === "already" ? "Your email is already verified. You can log in." : "Email verified! You can now log in."}
              </span>
            </div>
          </div>
        )}

        {/* Session expired banner */}
        {expiredParam === "true" && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.2)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.gilt }}>
                Your session has expired. Please log in again.
              </span>
            </div>
          </div>
        )}

        {/* Verification error banners */}
        {errorParam === "link-expired" && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, margin: 0 }}>Verification link has expired</p>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0", lineHeight: 1.5 }}>Please sign up again to receive a new verification link.</p>
              </div>
            </div>
          </div>
        )}
        {errorParam === "invalid-token" && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, margin: 0 }}>Invalid verification link</p>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0", lineHeight: 1.5 }}>This link may have been corrupted. Please sign up again to get a new one.</p>
              </div>
            </div>
          </div>
        )}
        {errorParam === "user-not-found" && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div>
                <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, margin: 0 }}>Account not found</p>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0", lineHeight: 1.5 }}>No account exists for this email. Please sign up first.</p>
              </div>
            </div>
          </div>
        )}

        {/* Signup confirmation */}
        {signupSent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ padding: "20px 24px", borderRadius: 12, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.sage }}>Account created!</span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.6, margin: 0 }}>
                We've sent a verification link to <strong>{email}</strong>. Click the link in your email to activate your account. Check your spam folder if you don't see it within a few minutes.
              </p>
            </div>
            <button onClick={() => { setSignupSent(false); router.push("/login"); }}
              style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "12px 24px", borderRadius: 10, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer", transition: "all 0.2s ease" }}>
              Continue to Login
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {supabaseConfigured && (
                <button
                  onClick={async () => {
                    if (resendCooldown > 0) return;
                    setResendCooldown(60);
                    try {
                      const res = await fetch("/api/send-welcome", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, name, userId: lastSignupUserId.current, action: "verify-reminder" }),
                      });
                      if (res.status === 429) {
                        setError("Too many resend attempts. Please try again later.");
                        return;
                      }
                      setError("");
                      setResendMsg("Verification email resent! Check your inbox and spam folder.");
                      setTimeout(() => setResendMsg(""), 5000);
                    } catch { setError("Could not resend email. Try again later."); }
                  }}
                  disabled={resendCooldown > 0}
                  style={{
                    background: "none", border: "none", fontFamily: font.ui, fontSize: 13,
                    color: resendCooldown > 0 ? c.border : c.stone,
                    cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                    textDecoration: resendCooldown > 0 ? "none" : "underline",
                    opacity: resendCooldown > 0 ? 0.6 : 1,
                  }}>
                  {resendCooldown > 0
                    ? `Resend available in ${resendCooldown}s`
                    : "Didn't receive it? Resend verification email"
                  }
                </button>
              )}
              {resendMsg && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.sage }}>{resendMsg}</span>}
            </div>
          </div>
        ) : showReset ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {resetSent ? (
              <div style={{ padding: "16px 20px", borderRadius: 8, background: "rgba(122,158,126,0.08)", border: "1px solid rgba(122,158,126,0.2)" }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.sage, margin: 0, lineHeight: 1.6 }}>
                  Check your email for a password reset link. It may take a minute to arrive. Check your spam folder too.
                </p>
                <button onClick={() => setResetSent(false)} style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 13, color: c.gilt, cursor: "pointer", marginTop: 12 }}>
                  Didn't receive it? Try again
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="reset-email" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Email</label>
                  <input id="reset-email" ref={showReset ? firstInputRef : undefined} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="off"
                    aria-describedby={error ? "reset-error" : undefined}
                    style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                    onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                    onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                  />
                </div>
                {error && (() => {
                  const { message, suggestion } = friendlyError(error, isLogin);
                  return (
                    <div id="reset-error" role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <div>
                          <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ember, margin: 0 }}>{message}</p>
                          {suggestion && (
                            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0", lineHeight: 1.5 }}>{suggestion}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
              <button onClick={handleGoogleLogin} disabled={googleLoading}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                  width: "100%", padding: "13px 20px", borderRadius: 8,
                  background: "transparent", border: `1px solid ${c.borderHover}`,
                  color: c.ivory, cursor: googleLoading ? "wait" : "pointer", fontFamily: font.ui, fontSize: 14,
                  fontWeight: 500, transition: "all 0.2s ease",
                  opacity: googleLoading ? 0.7 : 1,
                }}
                onMouseEnter={(e) => { if (!googleLoading) { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; e.currentTarget.style.borderColor = c.chalk; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = c.borderHover; }}
              >
                {googleLoading ? (
                  <div style={{ width: 18, height: 18, border: "2px solid rgba(245,242,237,0.3)", borderTopColor: c.ivory, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                ) : (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                )}
                {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>

            {/* Email/password form */}
            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Honeypot field — invisible to users, bots will fill it */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
                <label htmlFor="website-url">Website</label>
                <input
                  id="website-url"
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              {!isLogin && (
                <div>
                  <label htmlFor="signup-name" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Full name</label>
                  <input id="signup-name" ref={!isLogin ? firstInputRef : undefined} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required maxLength={48} autoComplete="name"
                    style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                    onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                    onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                  />
                </div>
              )}

              <div>
                <label htmlFor="signup-email" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Email</label>
                <input id="signup-email" ref={isLogin ? firstInputRef : undefined} type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); checkEmailTypo(e.target.value); }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = c.border; checkEmailTypo(email); }}
                  placeholder="you@company.com" required autoComplete="email"
                  aria-describedby={error ? "form-error" : undefined}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                />
                <div role="alert" aria-live="polite">
                  {emailSuggestion && (
                    <button type="button" onClick={() => { setEmail(emailSuggestion); setEmailSuggestion(""); }}
                      style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 12, color: c.gilt, cursor: "pointer", padding: "4px 0 0", display: "block" }}>
                      Did you mean <strong>{emailSuggestion}</strong>?
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6, letterSpacing: "0.02em" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input id="signup-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? "Enter your password" : "Create a password (8+ chars)"} required maxLength={128} autoComplete={isLogin ? "current-password" : "new-password"}
                    aria-describedby={error ? "form-error" : undefined}
                    style={{ width: "100%", padding: "12px 44px 12px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 14, outline: "none", transition: "border-color 0.2s ease", boxSizing: "border-box" }}
                    onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                    onBlur={(e) => e.currentTarget.style.borderColor = c.border}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", padding: 4,
                      color: c.stone, display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "color 0.2s", borderRadius: 4,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
                    onMouseLeave={(e) => e.currentTarget.style.color = c.stone}
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
                {!isLogin && (() => {
                  if (password.length === 0) {
                    // Show requirement hints before typing
                    const reqs = [
                      { label: "8+ characters", met: false },
                      { label: "Uppercase letter", met: false },
                      { label: "Number", met: false },
                      { label: "Special character", met: false },
                    ];
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8 }}>
                        {reqs.map(r => (
                          <span key={r.label} style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.border, display: "inline-block" }} />
                            {r.label}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  const reqs = [
                    { label: "8+ characters", met: password.length >= 8 },
                    { label: "Uppercase", met: /[A-Z]/.test(password) },
                    { label: "Number", met: /[0-9]/.test(password) },
                    { label: "Special char", met: /[^A-Za-z0-9]/.test(password) },
                  ];
                  const metCount = reqs.filter(r => r.met).length;
                  // Penalize common patterns: sequential, repeated, or email-in-password
                  const pwLower = password.toLowerCase();
                  const emailLocal = email.trim().split("@")[0].toLowerCase();
                  const hasSequential = /(012|123|234|345|456|567|678|789|890|abc|bcd|cde|xyz|qwe|asd|zxc)/i.test(password);
                  const hasRepeated = /(.)\1{4,}/.test(password);
                  const containsEmail = emailLocal.length >= 4 && pwLower.includes(emailLocal);
                  const isCommon = pwLower === "password123!" || pwLower === "password123" || pwLower === "qwerty123!" || pwLower === "abc12345";
                  const weakPattern = hasSequential || hasRepeated || containsEmail || isCommon;
                  let strength = metCount === 4 && password.length >= 12 ? 4 : metCount >= 3 ? 3 : password.length >= 8 ? 2 : 1;
                  if (weakPattern && strength > 2) strength = 2; // cap at "Fair" if pattern is weak
                  const labels = ["", "Weak", "Fair", "Good", "Strong"];
                  const colors = ["", c.ember, c.gilt, c.sage, c.sage];
                  return (
                    <>
                      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <div aria-hidden="true" style={{ display: "flex", gap: 3, flex: 1 }}>
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength ? colors[strength] : c.border, transition: "background 0.2s" }} />
                          ))}
                        </div>
                        <span style={{ fontFamily: font.ui, fontSize: 11, color: colors[strength], fontWeight: 500 }}>
                          <span className="sr-only">Password strength: </span>{labels[strength]}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 6 }}>
                        {reqs.map(r => (
                          <span key={r.label} style={{ fontFamily: font.ui, fontSize: 10, color: r.met ? c.sage : c.ember, display: "flex", alignItems: "center", gap: 3, transition: "color 0.2s" }}>
                            {r.met ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            )}
                            {r.label}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {isLogin && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <div
                      onClick={() => setRememberMe(!rememberMe)}
                      role="checkbox"
                      aria-checked={rememberMe}
                      aria-label="Remember me"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRememberMe(!rememberMe); } }}
                      style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${rememberMe ? c.gilt : c.border}`,
                        background: rememberMe ? `${c.gilt}18` : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s ease", cursor: "pointer",
                      }}
                    >
                      {rememberMe && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    {/*
                      The copy used to say "· persists for 7 days" but there's
                      no 7-day timer anywhere in the code. Reality:
                        checked → session survives browser restarts (Supabase
                                 refresh-token window, typically weeks)
                        unchecked → beforeunload handler clears the tokens on
                                   tab/browser close
                      Updated copy reflects what actually happens.
                    */}
                    <span
                      style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}
                      title={rememberMe
                        ? "Your session will survive browser restarts."
                        : "You'll be signed out when you close this tab."}
                    >
                      Keep me signed in
                      <span style={{ fontSize: 11, opacity: 0.7 }}>
                        {" · "}
                        {rememberMe ? "stays signed in next visit" : "sign out when I close the tab"}
                      </span>
                    </span>
                  </label>
                  <button type="button" onClick={() => { setShowReset(true); setError(""); }}
                    style={{ background: "none", border: "none", fontFamily: font.ui, fontSize: 12, color: c.gilt, cursor: "pointer", textAlign: "right", padding: 0 }}>
                    Forgot password?
                  </button>
                </div>
              )}

              {isLogin && lockoutRemaining > 0 && (
                <div role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <div>
                      <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ember, margin: 0 }}>Account temporarily locked</p>
                      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0" }}>
                        Try again in {Math.floor(lockoutRemaining / 60)}:{String(lockoutRemaining % 60).padStart(2, "0")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (() => {
                const { message, suggestion } = friendlyError(error, isLogin);
                const isNetworkError = error.toLowerCase().includes("network") || error.toLowerCase().includes("fetch") || error.toLowerCase().includes("connection");
                return (
                  <div id="form-error" role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.15)", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <div>
                        <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ember, margin: 0 }}>{message}</p>
                        {suggestion && (
                          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "4px 0 0", lineHeight: 1.5 }}>{suggestion}</p>
                        )}
                        {isNetworkError && (
                          <button type="button" onClick={() => { setError(""); const form = document.querySelector("form"); form?.requestSubmit(); }}
                            style={{ marginTop: 8, fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "none", border: `1px solid rgba(212,179,127,0.3)`, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const signupDisabled = !isLogin && (
                  !name.trim() || name.trim().length > 48 ||
                  !email.trim() || password.length < 8 || password.length > 128 ||
                  !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)
                );
                const btnDisabled = loading || signupDisabled || (isLogin && lockoutRemaining > 0);
                return (
              <button type="submit" disabled={btnDisabled} className="shimmer-btn"
                style={{
                  width: "100%", padding: "14px 24px", borderRadius: 8,
                  background: btnDisabled ? "rgba(245,242,237,0.3)" : c.ivory, color: c.obsidian, border: "none",
                  fontFamily: font.ui, fontSize: 15, fontWeight: 500,
                  cursor: btnDisabled ? "not-allowed" : "pointer", marginTop: 4, letterSpacing: "0.01em",
                  opacity: btnDisabled ? 0.5 : 1, transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { if (!btnDisabled) { e.currentTarget.style.background = c.gilt; e.currentTarget.style.boxShadow = "0 8px 32px rgba(212,179,127,0.2)"; } }}
                onMouseLeave={(e) => { if (!btnDisabled) { e.currentTarget.style.background = c.ivory; e.currentTarget.style.boxShadow = "none"; } }}
              >
                {loading ? "Please wait..." : isLogin ? (lockoutRemaining > 0 ? `Locked (${Math.floor(lockoutRemaining / 60)}:${String(lockoutRemaining % 60).padStart(2, "0")})` : "Log in") : "Create account"}
              </button>
                );
              })()}
            </form>

            {/* Toggle */}
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 28, textAlign: "center" }}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Link href={isLogin ? "/signup" : "/login"}
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
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: c.chalk, textDecoration: "underline" }}>Terms of Service</a>{" "}
                and <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: c.chalk, textDecoration: "underline" }}>Privacy Policy</a>.
              </p>
            )}
          </>
        )}
      </div>

      {/* Right: Visual panel */}
      <div className="signup-visual" style={{ position: "relative", overflow: "hidden", background: c.graphite }}>
        <Image src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=900&h=1200&fit=crop&crop=face" alt="Professional preparing for an interview"
          fill sizes="50vw"
          style={{ objectFit: "cover", objectPosition: "center 20%" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${c.obsidian}40 0%, transparent 30%, transparent 50%, ${c.obsidian}E6 85%)` }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${c.obsidian}80 0%, transparent 40%)` }} />

        {/* Floating product mockup */}
        <div style={{ position: "absolute", top: "12%", right: "8%", width: 260, background: "rgba(17,17,19,0.65)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRadius: 14, border: "1px solid rgba(245,242,237,0.08)", padding: "20px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)", animation: "floatSlow 6s ease-in-out infinite" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory }}>Live Session</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.sage, animation: "giltPulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage }}>Active</span>
            </span>
          </div>
          <div style={{ background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>Interviewer</p>
            <p style={{ fontFamily: font.ui, fontSize: 11, lineHeight: 1.5, color: c.ivory }}>Walk me through how you scaled the engineering org...</p>
          </div>
          <div style={{ display: "flex", gap: 2, height: 16 }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: `${20 + Math.sin(i * 0.8) * 40 + Math.random() * 40}%`, background: "linear-gradient(180deg, rgba(212,179,127,0.6), rgba(196,112,90,0.4))", borderRadius: 1, alignSelf: "flex-end" }} />
            ))}
          </div>
        </div>

        {/* Floating score badge */}
        <div style={{ position: "absolute", top: "45%", left: "10%", width: 160, background: "rgba(17,17,19,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, border: "1px solid rgba(245,242,237,0.08)", padding: "16px 18px", boxShadow: "0 16px 48px rgba(0,0,0,0.4)", animation: "floatSlow 5s ease-in-out 1s infinite" }}>
          <span style={{ fontFamily: font.mono, fontSize: 36, fontWeight: 600, color: c.ivory, letterSpacing: "-0.02em", display: "block", lineHeight: 1 }}>92</span>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase" }}>Session Score</span>
          <div style={{ marginTop: 10, height: 3, background: "rgba(245,242,237,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "92%", background: c.sage, borderRadius: 2 }} />
          </div>
        </div>

        {/* Bottom testimonial */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px 40px 36px", zIndex: 2 }}>
          <div style={{ background: "rgba(17,17,19,0.6)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 14, border: "1px solid rgba(245,242,237,0.06)", padding: "24px 28px" }}>
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

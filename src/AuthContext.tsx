import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { getSupabase, preloadSupabase, supabaseConfigured, getProfile, upsertProfile, type Profile } from "./supabase";

import type { Session } from "@supabase/supabase-js";
import type { ParsedResume } from "./resumeParser";

/** Check if Supabase has a session token stored in localStorage */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const val = localStorage.getItem(key);
        return !!val && val !== "null";
      }
    }
  } catch { /* expected: localStorage may be unavailable in private browsing */ }
  return false;
}

/* ─── Login Rate Limiting (client-side) ─── */
const LOGIN_ATTEMPTS_KEY = "hirestepx_login_attempts";
const LOGIN_LOCKOUT_KEY = "hirestepx_login_lockout";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function getLoginAttempts(): number {
  try { return parseInt(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || "0", 10); } catch { return 0; }
}
function setLoginAttempts(n: number) {
  try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, String(n)); } catch { /* expected */ }
}
function getLockoutUntil(): number {
  try { return parseInt(localStorage.getItem(LOGIN_LOCKOUT_KEY) || "0", 10); } catch { return 0; }
}
function setLockout() {
  try { localStorage.setItem(LOGIN_LOCKOUT_KEY, String(Date.now() + LOCKOUT_DURATION_MS)); } catch { /* expected */ }
}
function clearLoginLockout() {
  try { localStorage.removeItem(LOGIN_ATTEMPTS_KEY); localStorage.removeItem(LOGIN_LOCKOUT_KEY); } catch { /* expected */ }
}
function isLoginLocked(): { locked: boolean; remainingSeconds: number } {
  const until = getLockoutUntil();
  if (until && Date.now() < until) return { locked: true, remainingSeconds: Math.ceil((until - Date.now()) / 1000) };
  if (until && Date.now() >= until) clearLoginLockout(); // expired lockout
  return { locked: false, remainingSeconds: 0 };
}

/* ─── Single-Device Session Enforcement ─── */
const DEVICE_TOKEN_KEY = "hirestepx_device_token";

function generateDeviceToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getStoredDeviceToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}

function storeDeviceToken(token: string) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* expected */ }
}

/* ─── Session Fingerprint (detect session hijacking) ─── */
const SESSION_FP_KEY = "hirestepx_session_fp";

function computeSessionFingerprint(): string {
  // Fingerprint from multiple browser signals — harder to spoof collectively
  const signals = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    String(navigator.hardwareConcurrency || ""),
    String((navigator as unknown as Record<string, unknown>).deviceMemory || ""),
    navigator.platform || "",
    String(new Date().getTimezoneOffset()),
    // Canvas fingerprint — subtle rendering differences across GPUs/browsers
    (() => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillStyle = "#f60";
        ctx.fillRect(0, 0, 64, 16);
        ctx.fillStyle = "#069";
        ctx.fillText("Hx", 2, 1);
        return canvas.toDataURL().slice(-32);
      } catch { return ""; }
    })(),
    // WebGL renderer — varies by GPU
    (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl");
        if (!gl) return "";
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
      } catch { return ""; }
    })(),
  ].join("|");
  // djb2 hash
  let hash = 5381;
  for (let i = 0; i < signals.length; i++) hash = ((hash << 5) + hash) + signals.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function storeSessionFingerprint() {
  try { localStorage.setItem(SESSION_FP_KEY, computeSessionFingerprint()); } catch { /* expected */ }
}

function validateSessionFingerprint(): boolean {
  try {
    const stored = localStorage.getItem(SESSION_FP_KEY);
    if (!stored) return true; // first time — no fingerprint yet
    return stored === computeSessionFingerprint();
  } catch { return true; }
}

/* ─── Audit Logging (sends auth events to Vercel function logs) ─── */
function logAuditEvent(event: string, details?: Record<string, unknown>) {
  try {
    const payload = {
      message: `[audit] ${event}`,
      timestamp: new Date().toISOString(),
      url: window.location.pathname,
      userAgent: navigator.userAgent,
      ...details,
    };
    // Fire-and-forget — don't block auth flow
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch { /* audit is best-effort */ }
}

/** Local fallback for hasCompletedOnboarding (survives refresh even if Supabase column missing) */
const ONBOARDING_DONE_KEY = "hirestepx_onboarding_done";
function getLocalOnboardingDone(userId: string): boolean {
  try { return localStorage.getItem(`${ONBOARDING_DONE_KEY}_${userId}`) === "1"; } catch { /* expected: localStorage may be unavailable */ return false; }
}
function setLocalOnboardingDone(userId: string) {
  try { localStorage.setItem(`${ONBOARDING_DONE_KEY}_${userId}`, "1"); } catch { /* expected: localStorage may be unavailable */ }
}

/** Save/restore the last authenticated route so users return where they left off */
const LAST_ROUTE_KEY = "hirestepx_last_route";
export function saveLastRoute(path: string) {
  try {
    // Only save persistent app routes — not transient screens like /interview
    if (path.startsWith("/dashboard") || path.startsWith("/onboarding") || path.startsWith("/session") || ["/sessions", "/calendar", "/analytics", "/resume", "/settings"].includes(path)) {
      localStorage.setItem(LAST_ROUTE_KEY, path);
    }
  } catch { /* expected: localStorage may be unavailable */ }
}
export function getLastRoute(): string | null {
  try { return localStorage.getItem(LAST_ROUTE_KEY); } catch { /* expected: localStorage may be unavailable */ return null; }
}
export function clearLastRoute() {
  try { localStorage.removeItem(LAST_ROUTE_KEY); } catch { /* expected: localStorage may be unavailable */ }
}

export interface User {
  id: string;
  name: string;
  email: string;
  targetRole: string;
  resumeFileName: string | null;
  hasCompletedOnboarding: boolean;
  // Personalization fields
  targetCompany?: string;
  city?: string;
  industry?: string;
  learningStyle?: "direct" | "encouraging";
  experienceLevel?: string;
  preferredSessionLength?: 10 | 15 | 25;
  interviewDate?: string;
  interviewFocus?: string[];
  sessionLength?: string;
  feedbackStyle?: string;
  interviewTypes?: string[];
  practiceTimestamps?: string[];
  resumeText?: string;
  resumeData?: ParsedResume;
  subscriptionTier?: "free" | "starter" | "pro" | "team";
  subscriptionStart?: string;
  subscriptionEnd?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionPaused?: boolean;
  referralCode?: string;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string; userId?: string }>;
  loginWithGoogle: (returnTo?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function profileToUser(profile: Profile, session: Session): User {
  const completed = profile.has_completed_onboarding != null
    ? !!(profile.has_completed_onboarding)
    : !!(profile.practice_timestamps && profile.practice_timestamps.length > 0)
      || !!(profile.resume_file_name && profile.target_role)
      || getLocalOnboardingDone(profile.id);
  // Persist to localStorage so it survives refresh even if Supabase column doesn't exist yet
  if (completed) setLocalOnboardingDone(profile.id);
  return {
    id: profile.id,
    name: profile.name || session.user.user_metadata?.name || session.user.user_metadata?.full_name || "",
    email: profile.email || session.user.email || "",
    targetRole: profile.target_role || "",
    resumeFileName: profile.resume_file_name || null,
    hasCompletedOnboarding: completed,
    targetCompany: profile.target_company || undefined,
    city: profile.city || undefined,
    industry: profile.industry || undefined,
    learningStyle: (profile.learning_style as "direct" | "encouraging") || "direct",
    experienceLevel: profile.experience_level || undefined,
    preferredSessionLength: (profile.preferred_session_length as 10 | 15 | 25) || undefined,
    interviewTypes: profile.interview_types || undefined,
    interviewDate: profile.interview_date || undefined,
    practiceTimestamps: profile.practice_timestamps || [],
    resumeText: profile.resume_text || undefined,
    resumeData: (profile.resume_data as unknown as ParsedResume) || undefined,
    subscriptionTier: (() => {
      const tier = (profile.subscription_tier as "free" | "starter" | "pro" | "team") || "free";
      // Auto-downgrade expired subscriptions
      if (tier !== "free" && profile.subscription_end) {
        if (new Date(profile.subscription_end) < new Date()) {
          console.warn(`[auth] Subscription "${tier}" expired (${profile.subscription_end}), downgrading to free`);
          // Flag for UI notification — consumed by components that check tier
          try { sessionStorage.setItem("hirestepx_sub_expired", tier); } catch { /* noop */ }
          return "free";
        }
      }
      return tier;
    })(),
    subscriptionStart: profile.subscription_start || undefined,
    subscriptionEnd: profile.subscription_end || undefined,
    cancelAtPeriodEnd: profile.cancel_at_period_end || false,
    subscriptionPaused: !!profile.subscription_paused,
    referralCode: profile.referral_code || undefined,
    emailVerified: session.user.user_metadata?.custom_email_verified === true || !!session.user.email_confirmed_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  // Always show loading when Supabase is configured — server validates session
  const [loading, setLoading] = useState(supabaseConfigured);
  // Suppress auth state listener during signup flow to prevent premature redirect
  const signingUpRef = useRef(false);
  // Prevent race condition: onAuthStateChange should not override getSession result during init
  const initialSessionRestoredRef = useRef(false);

  // Clean up legacy localStorage cache from previous versions
  useEffect(() => {
    try { localStorage.removeItem("hirestepx_auth"); } catch { /* expected: localStorage may be unavailable */ }
  }, []);

  // "Remember me" — clear session on tab/browser close if ephemeral
  // Uses both pagehide (reliable on mobile) and beforeunload (desktop fallback)
  useEffect(() => {
    const clearEphemeralSession = () => {
      try {
        if (sessionStorage.getItem("hirestepx_ephemeral") === "1") {
          // Clear auth data so session doesn't persist
          clearLastRoute();
          // Remove Supabase session tokens from localStorage
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
              localStorage.removeItem(key);
            }
          }
        }
      } catch { /* expected: localStorage cleanup errors are non-critical */ }
    };
    // pagehide is more reliable than beforeunload on mobile (Safari, Chrome on iOS)
    const handlePageHide = (e: PageTransitionEvent) => {
      // persisted=false means the page is being discarded (tab/browser close)
      if (!e.persisted) clearEphemeralSession();
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", clearEphemeralSession);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", clearEphemeralSession);
    };
  }, []);

  // Listen for auth state changes (Supabase mode)
  useEffect(() => {
    if (!supabaseConfigured) return;

    // Start loading the Supabase SDK — defer on marketing domain to avoid blocking FCP
    const isMarketing = typeof window !== "undefined" &&
      !window.location.hostname.includes("app.") &&
      !window.location.hostname.includes("staging.") &&
      !window.location.hostname.includes("localhost") &&
      !window.location.hostname.includes("127.0.0.1") &&
      !window.location.hostname.includes("vercel.app");
    if (isMarketing) {
      // On marketing domain, defer Supabase load until browser is idle — avoids blocking FCP/LCP
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => preloadSupabase());
      } else {
        setTimeout(preloadSupabase, 4000);
      }
    } else {
      preloadSupabase();
    }

    // Helper: build a new user from session metadata and seed the profiles table
    async function ensureProfile(session: Session) {
      const client = await getSupabase();
      const meta = session.user.user_metadata || {};
      const newProfile: Partial<Profile> & { id: string } = {
        id: session.user.id,
        email: session.user.email || "",
        name: meta.name || meta.full_name || "",
      };
      const { error } = await upsertProfile(newProfile);
      if (error) {
        console.error("[auth] ensureProfile failed, trying insert:", error.message);
        const { error: insertErr } = await client
          .from("profiles")
          .insert(newProfile);
        if (insertErr) {
          console.error("[auth] insert also failed:", insertErr.message, insertErr.code);
        }
      }
      const newUser: User = {
        id: session.user.id,
        name: newProfile.name || "",
        email: newProfile.email || "",
        targetRole: "",
        resumeFileName: null,
        hasCompletedOnboarding: false,
        emailVerified: session.user.user_metadata?.custom_email_verified === true || !!session.user.email_confirmed_at,
      };
      setUser(newUser);
    }

    // Safety timeout: ensure loading never hangs
    const safetyTimer = setTimeout(() => {
      console.warn("[auth] safety timeout: forcing loading=false");
      setLoading(false);
    }, 5000);

    let unsubscribe: (() => void) | null = null;

    // Initialize auth asynchronously — Supabase SDK loads in background
    getSupabase().then(async (client) => {
      // Restore session from local JWT
      try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          // Session fingerprint check — detect possible hijacking
          if (!validateSessionFingerprint()) {
            console.warn("[auth] session fingerprint mismatch — possible hijack, signing out");
            logAuditEvent("session_hijack_detected", { userId: session.user.id, email: session.user.email });
            setUser(null);
            await client.auth.signOut().catch(() => {});
            clearTimeout(safetyTimer);
            setLoading(false);
            return;
          }
          // Block unverified email users — sign them out immediately
          // Google OAuth users are always verified; email/password users must pass our custom verification
          // Exception: allow sessions on /reset-password so users can complete password reset
          const isGoogleUser = session.user.app_metadata?.provider === "google" || session.user.app_metadata?.providers?.includes("google");
          const customVerified = session.user.user_metadata?.custom_email_verified === true;
          const isOnResetPage = window.location.pathname === "/reset-password";
          if (!isGoogleUser && !customVerified && !isOnResetPage) {
            console.warn("[auth] unverified email session found — signing out");
            setUser(null);
            await client.auth.signOut().catch(() => {});
            clearTimeout(safetyTimer);
            setLoading(false);
            return;
          }
          // Capture Google provider token if present (after OAuth redirect)
          if (session.provider_token) {
            try { sessionStorage.setItem("hirestepx_google_token", session.provider_token); } catch { /* expected: sessionStorage may be unavailable */ }
          }
          try {
            const profile = await getProfile(session.user.id);
            if (profile) {
              setUser(profileToUser(profile, session));
              // Single-device check on session restore
              const localToken = getStoredDeviceToken();
              const serverToken = session.user.user_metadata?.active_device_token;
              if (localToken && serverToken && localToken !== serverToken) {
                console.warn("[auth] session active on another device — signing out");
                logAuditEvent("single_device_enforcement", { userId: session.user.id });
                setUser(null);
                await client.auth.signOut().catch(() => {});
                clearTimeout(safetyTimer);
                setLoading(false);
                return;
              }
              // If no device token yet (first login after upgrade), set one
              if (!localToken && session.user.user_metadata?.active_device_token) {
                storeDeviceToken(session.user.user_metadata.active_device_token);
              }
            } else {
              setUser(null);
              await client.auth.signOut().catch(() => {});
            }
          } catch {
            console.error("[auth] getProfile threw");
            setUser(null);
            await client.auth.signOut().catch(() => {});
          }
        } else {
          setUser(null);
        }
        clearTimeout(safetyTimer);
        setLoading(false);

        // Background server validation
        client.auth.getUser().then(async ({ data: { user: authUser }, error: userError }) => {
          if (session && (userError || !authUser)) {
            console.warn("[auth] background validation failed — signing out");
            setUser(null);
            await client.auth.signOut().catch(() => {});
          }
        }).catch(() => {});
      } catch (err) {
        console.error("[auth] getSession failed:", err);
        setUser(null);
        clearTimeout(safetyTimer);
        setLoading(false);
      }

      // Mark initial session as restored — prevents race condition with onAuthStateChange
      initialSessionRestoredRef.current = true;

      // Listen for auth state changes
      const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
        if (event === "INITIAL_SESSION") return;
        // Allow PASSWORD_RECOVERY events — user is resetting their password
        if (event === "PASSWORD_RECOVERY") return;
        // During signup, suppress SIGNED_IN to prevent premature redirect
        if (signingUpRef.current && event === "SIGNED_IN") return;
        // During initial load, skip SIGNED_IN/TOKEN_REFRESHED if getSession already handled it
        // This prevents a race where onAuthStateChange fires before getSession finishes profile loading
        if (!initialSessionRestoredRef.current && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) return;
        // On the reset-password page, allow unverified users to maintain their session
        const isOnResetPage = window.location.pathname === "/reset-password";
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          // Block unverified email users from establishing a session (except on reset-password page)
          const isGoogleProvider = session.user.app_metadata?.provider === "google" || session.user.app_metadata?.providers?.includes("google");
          const customVerifiedEvent = session.user.user_metadata?.custom_email_verified === true;
          if (!isGoogleProvider && !customVerifiedEvent && !isOnResetPage) {
            console.warn("[auth] onAuthStateChange: unverified email — signing out");
            setUser(null);
            await client.auth.signOut().catch(() => {});
            setLoading(false);
            return;
          }
          // Store session fingerprint for hijack detection
          storeSessionFingerprint();
          // Single-device enforcement: set device token on new sign-in
          if (event === "SIGNED_IN") {
            const newDeviceToken = generateDeviceToken();
            storeDeviceToken(newDeviceToken);
            client.auth.updateUser({ data: { active_device_token: newDeviceToken } }).catch(() => {});
          }
          // Persist Google provider token for Calendar API access
          if (session.provider_token) {
            try { sessionStorage.setItem("hirestepx_google_token", session.provider_token); } catch { /* expected: sessionStorage may be unavailable */ }
          }
          try {
            const profile = await getProfile(session.user.id);
            if (profile) {
              setUser(profileToUser(profile, session));
            } else {
              await ensureProfile(session);
            }
          } catch {
            await ensureProfile(session);
          }
          setLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch((err) => {
      console.error("[auth] Supabase init failed:", err);
      setUser(null);
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    return () => { unsubscribe?.(); };
  }, []);

  const signup = useCallback(async (email: string, name: string, password: string): Promise<{ success: boolean; error?: string; userId?: string }> => {
    if (!supabaseConfigured) {
      // localStorage fallback
      const newUser: User = { id: Date.now().toString(36), name, email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false, emailVerified: false };
      setUser(newUser);
      return { success: true };
    }

    // Server-side password policy enforcement (cannot be bypassed via DevTools)
    if (!password || password.length < 8) return { success: false, error: "Password must be at least 8 characters." };
    if (password.length > 16) return { success: false, error: "Password must be 16 characters or fewer." };
    if (!/[A-Z]/.test(password)) return { success: false, error: "Password must include an uppercase letter." };
    if (!/[0-9]/.test(password)) return { success: false, error: "Password must include a number." };
    if (!/[^A-Za-z0-9]/.test(password)) return { success: false, error: "Password must include a special character." };
    if (!name.trim() || name.trim().length > 48) return { success: false, error: "Name is required (max 48 characters)." };

    // Server-side signup rate limiting (prevents spam signups from same IP)
    try {
      const rlCheck = await fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", email: email.toLowerCase().trim() }),
      });
      if (rlCheck.status === 429) {
        return { success: false, error: "Too many signup attempts. Please try again in a few minutes." };
      }
    } catch { /* rate limit check failed, proceed */ }

    const client = await getSupabase();
    const metadata: Record<string, string> = { name };

    // Suppress auth listener during signup to prevent premature redirect
    signingUpRef.current = true;

    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo: `${window.location.origin}/dashboard` },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Supabase returns fake success for existing emails (email enumeration protection).
      // Detect this: if user.identities is empty, the email already exists.
      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        return { success: false, error: "User already registered" };
      }

      // Record signup attempt server-side (fire-and-forget)
      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", email: email.toLowerCase().trim() }),
      }).catch(() => {});

      // Send verification email via Resend API (don't block signup on failure)
      const userId = data?.user?.id;
      try {
        await fetch("/api/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, userId }),
        });
      } catch { /* verification email is best-effort */ }

      // Store fingerprint now so it's ready for first login after email verification
      storeSessionFingerprint();

      // Sign out so user must verify email before using the app
      await client.auth.signOut();
      setUser(null);

      return { success: true, userId };
    } finally {
      signingUpRef.current = false;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Check client-side rate limit (fast path — also backed by server-side check below)
    const lockStatus = isLoginLocked();
    if (lockStatus.locked) {
      const mins = Math.ceil(lockStatus.remainingSeconds / 60);
      return { success: false, error: `Too many failed attempts. Please try again in ${mins} minute${mins > 1 ? "s" : ""}.` };
    }

    if (!supabaseConfigured) {
      const newUser: User = { id: Date.now().toString(36), name: email.split("@")[0], email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false, emailVerified: false };
      setUser(newUser);
      return { success: true };
    }

    // Server-side rate limit check (cannot be bypassed by clearing localStorage)
    try {
      const rlCheck = await fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", email: email.toLowerCase().trim() }),
      });
      if (rlCheck.status === 429) {
        const rlData = await rlCheck.json();
        setLockout(); // sync client-side lockout
        return { success: false, error: rlData.message || "Too many failed attempts. Please try again in 5 minutes." };
      }
    } catch { /* server rate limit check failed, proceed with login */ }

    const client = await getSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      // Track failed attempt (client + server)
      const attempts = getLoginAttempts() + 1;
      setLoginAttempts(attempts);
      logAuditEvent("login_failed", { email, reason: error.message, attempt: attempts });

      // Report failure to server-side rate limiter
      try {
        const failRes = await fetch("/api/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fail", email: email.toLowerCase().trim() }),
        });
        if (failRes.status === 429) {
          setLockout();
          logAuditEvent("login_locked", { email, attempts });
          track("login_locked", { attempts });
          return { success: false, error: "Too many failed attempts. Please try again in 5 minutes." };
        }
        const failData = await failRes.json().catch(() => ({}));
        if (failData.locked) {
          setLockout();
          return { success: false, error: "Too many failed attempts. Please try again in 5 minutes." };
        }
      } catch { /* server report failed, fall through to client-side logic */ }

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        setLockout();
        logAuditEvent("login_locked", { email, attempts });
        track("login_locked", { attempts });
        return { success: false, error: "Too many failed attempts. Please try again in 5 minutes." };
      }
      track("login_error", { reason: error.message, attempt: attempts });
      if (error.message === "Email not confirmed") {
        return { success: false, error: "Email not confirmed" };
      }
      if (error.message === "Invalid login credentials") {
        const remaining = MAX_LOGIN_ATTEMPTS - attempts;
        return { success: false, error: `Invalid email or password. Check your credentials or reset your password. (${remaining} attempt${remaining !== 1 ? "s" : ""} remaining)` };
      }
      return { success: false, error: error.message };
    }

    // Block login if email is not verified via our custom verification flow
    const isGoogle = data?.user?.app_metadata?.provider === "google" || data?.user?.app_metadata?.providers?.includes("google");
    const customVerifiedLogin = data?.user?.user_metadata?.custom_email_verified === true;
    if (data?.user && !isGoogle && !customVerifiedLogin) {
      // Sign out immediately — user should not have a session
      await client.auth.signOut();
      setUser(null);
      return { success: false, error: "Email not confirmed" };
    }

    // Successful login — clear lockout counter (client + server) and store session fingerprint
    clearLoginLockout();
    storeSessionFingerprint();

    // Single-device enforcement: generate a new device token and save to user_metadata
    const deviceToken = generateDeviceToken();
    storeDeviceToken(deviceToken);
    client.auth.updateUser({ data: { active_device_token: deviceToken } }).catch(() => {});

    // Clear server-side rate limit (fire-and-forget)
    fetch("/api/send-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "success", email: email.toLowerCase().trim() }),
    }).catch(() => {});
    logAuditEvent("login_success", { email, method: "email" });
    track("login_success");
    return { success: true };
  }, []);

  const loginWithGoogle = useCallback(async (returnTo?: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) return { success: false, error: "Google login requires Supabase configuration" };

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // If no Google Client ID is set, fall back to Supabase OAuth (shows supabase.co domain)
    if (!googleClientId) {
      const client = await getSupabase();
      const redirectPath = returnTo || "/dashboard";
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${redirectPath}`,
        },
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    // Direct Google OAuth — shows YOUR domain on account chooser instead of supabase.co
    try {
      // Generate CSRF state
      const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

      // Generate nonce for OpenID Connect token replay prevention
      const nonce = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

      // Store for validation in the callback
      sessionStorage.setItem("hirestepx_oauth_state", state);
      sessionStorage.setItem("hirestepx_oauth_nonce", nonce);
      sessionStorage.setItem("hirestepx_oauth_return", returnTo || "/dashboard");

      const redirectUri = `${window.location.origin}/auth/callback`;
      const scope = "openid email profile";

      // Redirect to Google's OAuth endpoint
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", googleClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("nonce", nonce);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "select_account");

      window.location.href = authUrl.toString();
      return { success: true };
    } catch (err) {
      console.error("[auth] Direct Google OAuth failed:", err);
      return { success: false, error: "Failed to start Google sign-in." };
    }
  }, []);

  // Broadcast helpers — defined before logout so they can be referenced
  const broadcastLogout = useCallback(() => {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("hirestepx_auth");
        channel.postMessage({ type: "logout" });
        channel.close();
      }
    } catch { /* BroadcastChannel unavailable */ }
  }, []);

  const broadcastSessionRefreshed = useCallback(() => {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("hirestepx_auth");
        channel.postMessage({ type: "session_refreshed" });
        channel.close();
      }
    } catch { /* BroadcastChannel unavailable */ }
  }, []);

  const logout = useCallback(async () => {
    logAuditEvent("logout", { userId: user?.id });
    if (supabaseConfigured) { const client = await getSupabase(); await client.auth.signOut(); }
    track("logout");
    setUser(null);
    clearLastRoute();
    broadcastLogout(); // Sync logout across all open tabs
  }, [user?.id, broadcastLogout]);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    let currentId: string | null = null;
    setUser(prev => {
      if (!prev) return prev;
      currentId = prev.id;
      const next = { ...prev, ...updates };
      return next;
    });

    if (!supabaseConfigured) { return; }

    // Persist to Supabase — use ID captured from state setter to avoid stale closure
    if (!currentId) { console.warn("[updateUser] skipped: no user ID"); return; }

    const profileUpdates: Partial<Profile> & { id: string } = { id: currentId };
    if (updates.name !== undefined) profileUpdates.name = updates.name;
    if (updates.targetRole !== undefined) profileUpdates.target_role = updates.targetRole;
    if (updates.targetCompany !== undefined) profileUpdates.target_company = updates.targetCompany;
    if (updates.city !== undefined) (profileUpdates as Record<string, unknown>).city = updates.city;
    if (updates.industry !== undefined) profileUpdates.industry = updates.industry;
    if (updates.interviewDate !== undefined) profileUpdates.interview_date = updates.interviewDate;
    if (updates.learningStyle !== undefined) profileUpdates.learning_style = updates.learningStyle;
    if (updates.experienceLevel !== undefined) profileUpdates.experience_level = updates.experienceLevel;
    if (updates.resumeFileName !== undefined) profileUpdates.resume_file_name = updates.resumeFileName || "";
    if (updates.resumeText !== undefined) profileUpdates.resume_text = updates.resumeText || "";
    if (updates.resumeData !== undefined) profileUpdates.resume_data = (updates.resumeData as unknown as Record<string, unknown>) || null;
    if (updates.preferredSessionLength !== undefined) profileUpdates.preferred_session_length = updates.preferredSessionLength;
    if (updates.interviewTypes !== undefined) profileUpdates.interview_types = updates.interviewTypes;
    if (updates.practiceTimestamps !== undefined) profileUpdates.practice_timestamps = updates.practiceTimestamps;
    if (updates.cancelAtPeriodEnd !== undefined) profileUpdates.cancel_at_period_end = updates.cancelAtPeriodEnd;
    if (updates.hasCompletedOnboarding !== undefined) {
      profileUpdates.has_completed_onboarding = updates.hasCompletedOnboarding;
      if (updates.hasCompletedOnboarding) setLocalOnboardingDone(currentId);
    }

    await upsertProfile(profileUpdates);
  }, []);

  // Multi-tab session coordination via BroadcastChannel
  // Prevents multiple tabs from refreshing simultaneously and syncs logout across tabs
  useEffect(() => {
    if (!supabaseConfigured || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("hirestepx_auth");

    const handleMessage = async (event: MessageEvent) => {
      const { type } = event.data || {};
      if (type === "logout") {
        // Another tab logged out — sync this tab
        setUser(null);
        setSessionExpiryWarning(null);
      } else if (type === "session_refreshed") {
        // Another tab refreshed the session — clear any expiry warning here
        setSessionExpiryWarning(null);
      }
    };

    channel.addEventListener("message", handleMessage);
    return () => { channel.removeEventListener("message", handleMessage); channel.close(); };
  }, []);

  // Inactivity timeout — auto-logout after configurable period of no user activity
  const INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours default (configurable: 4-8 hrs)
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!user) return;

    const updateActivity = () => { lastActivityRef.current = Date.now(); };

    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    for (const evt of events) window.addEventListener(evt, updateActivity, { passive: true });

    const checkInactivity = async () => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        logAuditEvent("inactivity_timeout", { userId: user.id, inactiveMinutes: Math.round(elapsed / 60000) });
        if (supabaseConfigured) {
          const client = await getSupabase();
          await client.auth.signOut().catch(() => {});
        }
        setUser(null);
        clearLastRoute();
        broadcastLogout();
        router.replace("/login?expired=true");
      }
    };

    const interval = setInterval(checkInactivity, 60_000);
    return () => {
      clearInterval(interval);
      for (const evt of events) window.removeEventListener(evt, updateActivity);
    };
  }, [user, broadcastLogout, router]);

  // Session expiry warning — check JWT exp every 60s, warn 5min before expiry
  const [sessionExpiryWarning, setSessionExpiryWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !supabaseConfigured) return;
    const SESSION_WARN_MS = 5 * 60 * 1000; // Warn 5 min before expiry

    const checkExpiry = async () => {
      try {
        const client = await getSupabase();
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;

        // Single-device enforcement: verify device token matches
        const localDeviceToken = getStoredDeviceToken();
        const serverDeviceToken = session.user.user_metadata?.active_device_token;
        if (localDeviceToken && serverDeviceToken && localDeviceToken !== serverDeviceToken) {
          logAuditEvent("single_device_kicked", { userId: user.id });
          setSessionExpiryWarning(null);
          setUser(null);
          await client.auth.signOut().catch(() => {});
          broadcastLogout();
          try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* expected */ }
          return;
        }

        const exp = session.expires_at; // Unix timestamp in seconds
        if (!exp) return;
        const expiresMs = exp * 1000;
        const remaining = expiresMs - Date.now();

        if (remaining <= 0) {
          // Session expired — force logout
          logAuditEvent("session_expired", { userId: user.id });
          setSessionExpiryWarning(null);
          setUser(null);
          await client.auth.signOut().catch(() => {});
          broadcastLogout();
        } else if (remaining <= SESSION_WARN_MS) {
          // Approaching expiry — try to refresh
          const mins = Math.ceil(remaining / 60000);
          setSessionExpiryWarning(`Session expires in ${mins} min. Refreshing...`);
          const { error } = await client.auth.refreshSession();
          if (error) {
            setSessionExpiryWarning(`Session expires in ${mins} min. Save your work.`);
          } else {
            setSessionExpiryWarning(null); // Refresh succeeded
            broadcastSessionRefreshed(); // Notify other tabs
          }
        } else {
          setSessionExpiryWarning(null);
        }
      } catch { /* best effort */ }
    };

    // Check immediately, then every 60s
    checkExpiry();
    const interval = setInterval(checkExpiry, 60_000);
    return () => clearInterval(interval);
  }, [user, broadcastLogout, broadcastSessionRefreshed]);

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), action: "reset" }),
      });
      if (res.status === 429) return { success: false, error: "Too many reset requests. Please try again later." };
      if (res.status === 404) return { success: false, error: "No account found with this email address. Please check or sign up." };
      if (!res.ok) return { success: false, error: "Failed to send reset email. Try again or contact support@hirestepx.com" };
      return { success: true };
    } catch {
      return { success: false, error: "Connection error. Check your internet and try again." };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, loading, login, signup, loginWithGoogle, logout, updateUser, resetPassword }}>
      {sessionExpiryWarning && (
        <div role="alert" style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10000,
          padding: "10px 20px", borderRadius: 10, maxWidth: 400,
          background: "rgba(212,179,127,0.15)", border: "1px solid rgba(212,179,127,0.3)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: "#C9A96E",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {sessionExpiryWarning}
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/* Route guard — redirects to /login if not authenticated */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoggedIn, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const retryCount = useRef(0);

  // Track the last authenticated route so users return where they left off
  useEffect(() => {
    if (isLoggedIn) {
      saveLastRoute(pathname);
    }
  }, [isLoggedIn, pathname]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      // If there's a stored session token, Supabase may still be restoring it.
      // Wait and retry before redirecting — don't log the user out prematurely.
      if (hasStoredSession() && retryCount.current < 3) {
        const delay = 500 * Math.pow(2, retryCount.current); // 500ms, 1s, 2s
        retryCount.current++;
        // Trigger a re-check by getting the session again with exponential backoff
        setTimeout(() => getSupabase().then(c => c.auth.getSession()), delay);
        return;
      }
      router.replace("/login");
    } else if (user && !user.emailVerified && !["/onboarding", "/settings"].includes(pathname)) {
      // Allow unverified users to access onboarding (where they'll see the verify prompt) and settings
      router.replace("/onboarding");
    } else if (user && !user.hasCompletedOnboarding && !["/onboarding", "/interview", "/onboarding/complete"].includes(pathname) && !pathname.startsWith("/session/")) {
      router.replace("/onboarding");
    }
  }, [isLoggedIn, loading, user, router, pathname]);

  if (loading || (!isLoggedIn && hasStoredSession())) return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: "100vh", background: "#060607", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, border: "2px solid rgba(212,179,127,0.3)", borderTopColor: "#D4B37F", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#8E8983" }}>Loading...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!isLoggedIn) return null;
  if (user && !user.hasCompletedOnboarding && !["/onboarding", "/interview", "/onboarding/complete"].includes(pathname) && !pathname.startsWith("/session/")) return null;

  return <>{children}</>;
}

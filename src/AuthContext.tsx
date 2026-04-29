import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { getSupabase, preloadSupabase, supabaseConfigured, getProfile, upsertProfile, type Profile } from "./supabase";
import { captureClientEvent, identifyClient, resetClient } from "./posthogClient";

import type { Session } from "@supabase/supabase-js";
import type { StoredResume } from "./resumeParser";

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

// getHeavySignals() with canvas+webgl fingerprinting previously lived here
// but was never referenced. The lightweight signals below are what the
// session-fingerprint check actually uses. Canvas/webgl signals were
// expensive (~50-150ms on cold start) and contributed nothing, so they're
// gone. If a future fraud-detection pass wants them, add back with a real
// consumer and a Web Worker to keep them off the main thread.

function computeSessionFingerprint(): string {
  const signals = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    String(navigator.hardwareConcurrency || ""),
    String((navigator as unknown as Record<string, unknown>).deviceMemory || ""),
    navigator.platform || "",
    String(new Date().getTimezoneOffset()),
  ].join("|");
  let hash = 5381;
  for (let i = 0; i < signals.length; i++) hash = ((hash << 5) + hash) + signals.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

function storeSessionFingerprint() {
  try { localStorage.setItem(SESSION_FP_KEY, computeSessionFingerprint()); } catch { /* expected */ }
}

// validateSessionFingerprint() was exported for a rollback path that was
// never wired. The active path uses storeSessionFingerprint() on login +
// compares in-memory; no localStorage comparison is performed today.

/* ─── Audit Logging (persists security events to audit_log table + function logs) ─── */
function logAuditEvent(event: string, details?: Record<string, unknown>) {
  try {
    // 1. Server-side persistence (queryable audit table)
    fetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, details: { ...details, path: window.location.pathname } }),
      keepalive: true,
    }).catch(() => {});
    // 2. Function-log backup (for events that arrive before the table exists)
    const payload = {
      message: `[audit] ${event}`,
      timestamp: new Date().toISOString(),
      url: window.location.pathname,
      userAgent: navigator.userAgent,
      ...details,
    };
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
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

/**
 * User-scoped localStorage keys that hold per-account state. These MUST be
 * wiped whenever the authenticated user changes — otherwise signup #2 on a
 * browser previously used by signup #1 sees the wrong user's resume,
 * dashboard data, onboarding form state, etc. Keeping them scoped-by-key
 * (rather than keyed by userId) is a legacy we live with; the cross-user
 * wipe below is the industry-standard mitigation.
 */
const USER_SCOPED_KEYS = [
  "hirestepx_resume",
  "hirestepx_resume_history",
  "hirestepx_ob_step",
  "hirestepx_ob_form",
  "hirestepx_dashboard",
  "hirestepx_sessions",
  // `hirestepx_last_route` is written by saveLastRoute() on every navigation
  // for the currently-signed-in user. Without wiping it, signup B lands on
  // signup A's last page (e.g. /settings) instead of /dashboard.
  "hirestepx_last_route",
] as const;

/**
 * Tracks the last user id we rendered for. If the next auth event hands us a
 * different id (new signup, different person logging in on a shared browser,
 * etc.) we wipe the user-scoped cache so nothing leaks across accounts.
 */
const LAST_USER_ID_KEY = "hirestepx_last_user_id";

function wipeUserScopedStorage() {
  try {
    for (const key of USER_SCOPED_KEYS) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

function reconcileUserScopedStorage(currentUserId: string | null) {
  try {
    const previous = localStorage.getItem(LAST_USER_ID_KEY);
    if (!currentUserId) {
      // Fully logged out — wipe per-user caches. Keep LAST_USER_ID_KEY so
      // next login can still detect a user change.
      wipeUserScopedStorage();
      return;
    }
    if (previous && previous !== currentUserId) {
      console.info(`[auth] user changed (${previous.slice(0, 8)} → ${currentUserId.slice(0, 8)}) — wiping per-user localStorage`);
      wipeUserScopedStorage();
    }
    if (previous !== currentUserId) localStorage.setItem(LAST_USER_ID_KEY, currentUserId);
  } catch { /* storage unavailable */ }
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
  resumeData?: StoredResume | null;
  subscriptionTier?: "free" | "starter" | "pro" | "team";
  subscriptionStart?: string;
  subscriptionEnd?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionPaused?: boolean;
  referralCode?: string;
  /**
   * Bonus session credits. Granted by:
   *   - Streak milestones (+1 at 7/14/30 day streaks)
   *   - Successful referrals (+1 when a referee subscribes)
   *   - One-time single-session purchases (₹10 per credit)
   * Consumed when a free-tier user exceeds the 3-session free limit.
   * Paid tiers ignore this value.
   */
  sessionCredits?: number;
  /** Highest streak milestone (7/14/30) the user has already been rewarded for. Internal use only. */
  lastStreakRewardDay?: number;
  emailVerified: boolean;
  deletedAt?: string | null;
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
  // Completion signals, strongest to weakest:
  //   1. Postgres column explicitly true — canonical source of truth.
  //   2. Per-user localStorage flag (hirestepx_onboarding_done_<id>) — set
  //      during finalize, survives even if the DB write was briefly lost.
  //   3. practice_timestamps — they've run at least one interview, so they
  //      must have finished onboarding first.
  // We deliberately no longer treat "resume_file_name present" or
  // "target_role present" as proof of onboarding. Both can become truthy
  // from stale writes that happened before we introduced per-user cache
  // wipes, and neither guarantees the full finalize step ran.
  const completed =
    profile.has_completed_onboarding === true
    || getLocalOnboardingDone(profile.id)
    || !!(profile.practice_timestamps && profile.practice_timestamps.length > 0);
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
    // resume_data is persisted as jsonb; the in-app discriminated union
    // StoredResume (see resumeParser.ts) tags AI vs fallback variants.
    // Older rows predating the _type discriminator fall through as
    // undefined — callers use isAiResume/isFallbackResume to narrow.
    resumeData: (profile.resume_data as StoredResume | null | undefined) || undefined,
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
    sessionCredits: typeof profile.session_credits === "number" ? profile.session_credits : 0,
    lastStreakRewardDay: typeof profile.last_streak_reward_day === "number" ? profile.last_streak_reward_day : 0,
    emailVerified: session.user.user_metadata?.custom_email_verified === true || !!session.user.email_confirmed_at,
    deletedAt: (profile as unknown as Record<string, unknown>).deleted_at as string | null | undefined,
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
  // Suppresses the "session active on another device" kick-out during the
  // brief window between a fresh login and the device-token updateUser
  // landing on Supabase. Without this, the user who just logged in is
  // signed out immediately because the session snapshot still carries the
  // previous device's token while our localStorage already has the new
  // one. Login/signup set this to true; it clears after a few seconds.
  const justAuthenticatedRef = useRef(false);

  // Clean up legacy localStorage cache from previous versions
  useEffect(() => {
    try { localStorage.removeItem("hirestepx_auth"); } catch { /* expected: localStorage may be unavailable */ }
  }, []);

  // Global unhandled rejection handler — catches promises without .catch()
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      // Ignore expected abort errors
      if (msg.includes("abort") || msg.includes("AbortError")) return;
      console.error("[unhandled-rejection]", msg, reason);
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
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
      await getSupabase(); // ensure client is initialised before upsertProfile fires
      const meta = session.user.user_metadata || {};
      const newProfile: Partial<Profile> & { id: string } = {
        id: session.user.id,
        email: session.user.email || "",
        name: meta.name || meta.full_name || "",
      };
      const { error } = await upsertProfile(newProfile);
      if (error) {
        console.error("[auth] ensureProfile failed:", (error as { message?: string })?.message);
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
    // Use longer timeout on slow connections (common on Indian mobile networks)
    const isSlow = typeof navigator !== "undefined" && "connection" in navigator &&
      ((navigator as unknown as { connection: { effectiveType?: string } }).connection?.effectiveType === "2g" ||
       (navigator as unknown as { connection: { effectiveType?: string } }).connection?.effectiveType === "slow-2g");
    const safetyMs = isSlow ? 15000 : 10000;
    const safetyTimer = setTimeout(() => {
      console.warn("[auth] safety timeout: forcing loading=false after", safetyMs, "ms");
      // Defensive: if we never resolved a user, ensure state is clean so the
      // login form can render. Without this, a half-restored state can cause
      // RequireAuth-driven hydration mismatches (React error #418).
      setUser((current) => current ?? null);
      setLoading(false);
    }, safetyMs);

    let unsubscribe: (() => void) | null = null;

    // On the OAuth callback page, AuthCallback.tsx handles signInWithIdToken.
    // We must NOT call getSession() concurrently — it fights for the same Supabase
    // navigator lock and causes a 5s timeout. Let onAuthStateChange handle it instead.
    const isCallbackPage = typeof window !== "undefined" && window.location.pathname.startsWith("/auth/callback");

    // Initialize auth asynchronously — Supabase SDK loads in background
    getSupabase().then(async (client) => {
      if (isCallbackPage) {
        // On callback page, skip getSession — let signInWithIdToken + onAuthStateChange handle auth
        clearTimeout(safetyTimer);
        initialSessionRestoredRef.current = true;
        // Still register the listener below, but don't do getSession
        setLoading(true); // stays loading until onAuthStateChange fires SIGNED_IN
      } else {
      // Restore session from local JWT
      try {
        // Race getSession() against an 8s timeout. Some browser extensions
        // (Jam.dev, Loom, Hotjar) wrap window.fetch and silently hang the
        // Supabase navigator-lock acquisition. Without this race, the page
        // would sit on the loading spinner until the 10s safety timer fires
        // and the user couldn't even see the login form. Falling through
        // to "no session" lets the form render; sign-in itself uses a
        // separate code path that doesn't share the same lock contention.
        const session = await Promise.race([
          client.auth.getSession().then(r => r.data.session ?? null),
          new Promise<null>((resolve) => setTimeout(() => {
            console.warn("[auth] getSession() exceeded 8s — treating as no session (browser extension may be blocking fetch)");
            resolve(null);
          }, 8000)),
        ]);
        if (session) {
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
              // ─── Single-device enforcement (restore path) ───
              // Semantics:
              //   • local == server  → this device is still the active one. Keep session.
              //   • local missing    → first login post-upgrade; adopt server token.
              //   • local ≠ server   → someone else logged in more recently from
              //                        another device. Sign THIS device out. The
              //                        user's data is safe; they just get kicked to /login.
              //
              // The 15s grace window (justAuthenticatedRef) protects the brand-new
              // login on Device B — its session snapshot may still contain Device A's
              // stale server token until the updateUser() call lands. Without grace,
              // the freshly-logged-in user would immediately sign themselves out.
              const localToken = getStoredDeviceToken();
              const serverToken = session.user.user_metadata?.active_device_token;
              if (!justAuthenticatedRef.current && localToken && serverToken && localToken !== serverToken) {
                console.warn("[auth] single-device: another device has taken over — signing out");
                logAuditEvent("single_device_enforcement", { userId: session.user.id });
                setUser(null);
                await client.auth.signOut().catch(() => {});
                try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* expected */ }
                clearTimeout(safetyTimer);
                setLoading(false);
                return;
              }
              // No local token yet (first login after upgrade, or cleared localStorage):
              // adopt server's so next check compares apples to apples.
              if (!localToken && serverToken) {
                storeDeviceToken(serverToken);
              }
            } else {
              // No profile found — create one rather than signing out
              await ensureProfile(session);
            }
          } catch (profileErr) {
            console.error("[auth] getProfile threw:", profileErr);
            // Network error loading profile — keep the session alive with basic user info
            const meta = session.user.user_metadata || {};
            setUser({
              id: session.user.id,
              name: meta.name || meta.full_name || "",
              email: session.user.email || "",
              targetRole: "",
              resumeFileName: null,
              hasCompletedOnboarding: meta.has_completed_onboarding || getLocalOnboardingDone(session.user.id) || false,
              emailVerified: meta.custom_email_verified === true || !!session.user.email_confirmed_at,
            });
          }
        } else {
          setUser(null);
        }
        clearTimeout(safetyTimer);
        setLoading(false);

        // Background validation (deferred — don't block session restore or fight for auth lock)
        // Skip on /auth/callback — signInWithIdToken is still holding the lock there
        if (session && !window.location.pathname.startsWith("/auth/callback")) {
          // Wait for onAuthStateChange listener to be fully registered and any pending
          // auth operations (e.g. token refresh) to complete before we touch the lock
          setTimeout(() => {
            client.auth.refreshSession().then(({ data: refreshData, error: refreshError }) => {
              if (refreshError || !refreshData.session) {
                // Only sign out if the refresh token is truly invalid (not a transient network error)
                if (refreshError?.message?.includes("Invalid Refresh Token") ||
                    refreshError?.message?.includes("Refresh Token Not Found") ||
                    refreshError?.status === 401) {
                  console.warn("[auth] refresh token invalid — signing out");
                  setUser(null);
                  client.auth.signOut().catch(err => console.warn("[auth] signOut failed:", err?.message));
                }
              }
            }).catch(err => console.warn("[auth] background refreshSession failed:", err?.message));
          }, 5000);
        }
      } catch (err) {
        console.error("[auth] getSession failed:", err);
        setUser(null);
        clearTimeout(safetyTimer);
        setLoading(false);
      }

      // Mark initial session as restored — prevents race condition with onAuthStateChange
      initialSessionRestoredRef.current = true;
      } // end else (non-callback page)

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
          // Single-device enforcement: only set new device token on genuine new logins,
          // not on session restores/refreshes (which also fire SIGNED_IN)
          if (event === "SIGNED_IN" && !getStoredDeviceToken()) {
            const newDeviceToken = generateDeviceToken();
            storeDeviceToken(newDeviceToken);
            // Grace window: the downstream mismatch check below would
            // otherwise see local=newToken but session cache=oldToken (or
            // undefined) and sign out the just-authenticated user.
            justAuthenticatedRef.current = true;
            setTimeout(() => { justAuthenticatedRef.current = false; }, 10_000);
            client.auth.updateUser({ data: { active_device_token: newDeviceToken } }).catch(err => console.warn("[auth] updateUser(device_token) failed:", err?.message));
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
    track("signup_started");
    if (!supabaseConfigured) {
      // localStorage fallback
      const newUser: User = { id: Date.now().toString(36), name, email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false, emailVerified: false };
      setUser(newUser);
      track("signup_completed", { method: "local" });
      return { success: true };
    }

    // Server-side password policy enforcement (cannot be bypassed via DevTools)
    if (!password || password.length < 8) return { success: false, error: "Password must be at least 8 characters." };
    if (password.length > 128) return { success: false, error: "Password must be 128 characters or fewer." };
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
      }).catch(err => console.warn("[auth] signup rate-limit tracking failed (non-blocking):", err?.message));

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

      track("signup_completed", { method: "email" });
      if (userId) {
        identifyClient(userId, { email, name, signup_method: "email" });
        captureClientEvent("user_signed_up", { method: "email", email });
      }
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
        const warning = remaining <= 2 ? ` ⚠️ ${remaining} attempt${remaining !== 1 ? "s" : ""} before temporary lockout.` : ` (${remaining} attempts remaining)`;
        return { success: false, error: `Invalid email or password.${warning}` };
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

    // ─── Single-device enforcement — token rotation ───
    // New login wins: we generate a fresh device token, write it to
    // user_metadata on the server, and store it locally. Any other device
    // that still holds the old token will be kicked on its next session
    // restore or 60-second checkExpiry poll.
    //
    // Grace window (15s) protects THIS tab from the onAuthStateChange
    // handler's enforcement check — the session snapshot it has was
    // captured BEFORE updateUser() completed, so it still shows the old
    // server token. Without grace, we'd kick ourselves out immediately.
    //
    // We AWAIT the updateUser call so the rest of the flow knows the server
    // really has the new token; previously this was fire-and-forget which
    // made the Device A kick-out unreliable (sometimes Device A polled
    // before the write landed and saw no mismatch).
    justAuthenticatedRef.current = true;
    setTimeout(() => { justAuthenticatedRef.current = false; }, 15_000);
    const existingServerToken = data?.user?.user_metadata?.active_device_token;
    const deviceToken = generateDeviceToken();
    storeDeviceToken(deviceToken);
    try {
      await client.auth.updateUser({ data: { active_device_token: deviceToken } });
      // Refresh so THIS tab's next getSession() returns metadata containing
      // the new token — eliminates the race where our own check would see
      // the stale pre-update snapshot.
      await client.auth.refreshSession().catch(() => {});
    } catch (err) {
      console.warn("[auth] updateUser(device_token) failed:", err instanceof Error ? err.message : err);
    }

    // Security: if an existing session on another device is being displaced, notify user via email
    if (existingServerToken && existingServerToken !== deviceToken) {
      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "new_device_login",
          email: email.toLowerCase().trim(),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
        }),
      }).catch(err => console.warn("[auth] new-device email failed (non-blocking):", err?.message));
      logAuditEvent("new_device_login", { email });
    }

    // Clear server-side rate limit (fire-and-forget)
    fetch("/api/send-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "success", email: email.toLowerCase().trim() }),
    }).catch(err => console.warn("[auth] login rate-limit clear failed (non-blocking):", err?.message));
    logAuditEvent("login_success", { email, method: "email" });
    track("login_success");
    if (data?.user?.id) {
      identifyClient(data.user.id, { email });
      captureClientEvent("user_logged_in", { method: "email" });
    }
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

      // Store for validation in the callback
      sessionStorage.setItem("hirestepx_oauth_state", state);
      sessionStorage.setItem("hirestepx_oauth_return", returnTo || "/dashboard");

      const redirectUri = `${window.location.origin}/auth/callback`;
      const scope = "openid email profile";

      // Redirect to Google's OAuth endpoint
      // Note: nonce is NOT used here because Google only embeds nonce in the ID token
      // for implicit flow (response_type=id_token), not authorization_code flow.
      // CSRF protection is handled by the state parameter instead.
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", googleClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("state", state);
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
    resetClient();
    setUser(null);
    // Clear stored session tokens BEFORE signOut to prevent the routing guard
    // from re-restoring the session via hasStoredSession() retry logic
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) localStorage.removeItem(key);
      }
    } catch { /* expected */ }
    if (supabaseConfigured) { const client = await getSupabase(); await client.auth.signOut().catch(() => {}); }
    track("logout");
    clearLastRoute();
    broadcastLogout();
  }, [user?.id, broadcastLogout]);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    // 1. Update the in-memory user immediately so the UI doesn't stall on
    //    the network round-trip. All downstream consumers see the new value
    //    synchronously; the server persistence below catches up asynchronously.
    let currentId: string | null = null;
    setUser(prev => {
      if (!prev) return prev;
      currentId = prev.id;
      return { ...prev, ...updates };
    });

    if (!supabaseConfigured) return;
    if (!currentId) { console.warn("[updateUser] skipped: no user ID"); return; }

    // 2. Mirror hasCompletedOnboarding to localStorage. This is a resilience
    //    measure: even if the network write below fails, the next page
    //    refresh will read the localStorage flag and keep the user on the
    //    dashboard instead of bouncing back to /onboarding.
    if (updates.hasCompletedOnboarding === true) setLocalOnboardingDone(currentId);

    // 3. Translate the camelCase User-shaped update into the snake_case
    //    column names the server endpoint accepts. We don't include the
    //    user id — the server derives that from the JWT.
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.targetRole !== undefined) payload.target_role = updates.targetRole;
    if (updates.targetCompany !== undefined) payload.target_company = updates.targetCompany;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.industry !== undefined) payload.industry = updates.industry;
    if (updates.interviewDate !== undefined) payload.interview_date = updates.interviewDate;
    if (updates.learningStyle !== undefined) payload.learning_style = updates.learningStyle;
    if (updates.experienceLevel !== undefined) payload.experience_level = updates.experienceLevel;
    if (updates.resumeFileName !== undefined) payload.resume_file_name = (updates.resumeFileName || "").slice(0, 255);
    if (updates.resumeText !== undefined) payload.resume_text = (updates.resumeText || "").slice(0, 50000);
    if (updates.resumeData !== undefined) payload.resume_data = updates.resumeData || null;
    if (updates.preferredSessionLength !== undefined) payload.preferred_session_length = updates.preferredSessionLength;
    if (updates.interviewTypes !== undefined) payload.interview_types = updates.interviewTypes;
    if (updates.practiceTimestamps !== undefined) payload.practice_timestamps = updates.practiceTimestamps;
    if (updates.cancelAtPeriodEnd !== undefined) payload.cancel_at_period_end = updates.cancelAtPeriodEnd;
    if (updates.hasCompletedOnboarding !== undefined) payload.has_completed_onboarding = updates.hasCompletedOnboarding;

    if (Object.keys(payload).length === 0) return;

    // 4. Persist via our own API endpoint. The server validates the bearer
    //    token, allow-lists columns, and upserts with the service role key.
    //    This replaces the previous direct supabase-js call so third-party
    //    fetch wrappers can't silently drop the write.
    const { apiFetch } = await import("./apiClient");
    const result = await apiFetch<{ profile: unknown; details?: string; missingColumn?: string }>("/api/profile/update", payload);
    if (!result.ok) {
      const details = result.data?.details || "";
      const missing = result.data?.missingColumn;
      console.error(`[updateUser] API update failed (${result.status}): ${result.error}${details ? ` — ${details}` : ""}${missing ? ` [missingColumn=${missing}]` : ""}`);
      console.error("[updateUser] payload keys:", Object.keys(payload));
    }
  }, []);

  // Multi-tab session coordination via BroadcastChannel
  // Prevents multiple tabs from refreshing simultaneously and syncs logout across tabs
  useEffect(() => {
    if (!supabaseConfigured || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("hirestepx_auth");

    const handleMessage = async (event: MessageEvent) => {
      const { type } = event.data || {};
      if (type === "logout") {
        // Another tab logged out — sync this tab with an explanation
        setUser(null);
        setSessionExpiryWarning("You were signed out on another tab or device.");
        setTimeout(() => setSessionExpiryWarning(null), 8000);
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

        // ─── Single-device enforcement (periodic check) ───
        // Runs every 60s. If another device has logged in since we last
        // synced, THIS tab's local token will no longer match the server's.
        // That means a more-recent login has displaced us → sign out cleanly
        // and let the multi-tab broadcast take care of the others.
        // (The freshly-logged-in tab's localToken === server's — it stays.)
        const localDeviceToken = getStoredDeviceToken();
        const serverDeviceToken = session.user.user_metadata?.active_device_token;
        if (localDeviceToken && serverDeviceToken && localDeviceToken !== serverDeviceToken) {
          logAuditEvent("single_device_kicked", { userId: user.id });
          setSessionExpiryWarning("Signed in on another device — signing out here.");
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
          // Session JWT expired — try to refresh before logging out
          const { data: refreshed } = await client.auth.refreshSession();
          if (refreshed?.session) {
            setSessionExpiryWarning(null);
            return;
          }
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

    // Delay first check to let Supabase auto-refresh the token on page load
    const initialTimer = setTimeout(checkExpiry, 10_000);
    const interval = setInterval(checkExpiry, 60_000);
    return () => { clearTimeout(initialTimer); clearInterval(interval); };
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

  // Restore handler for soft-deleted accounts
  const [restoring, setRestoring] = useState(false);
  const restoreAccount = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const client = await getSupabase();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error("No session");
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reload to refresh profile with deletedAt cleared
      window.location.reload();
    } catch (err) {
      console.error("[auth] Restore account failed:", err);
      setRestoring(false);
    }
  };

  // Manual session refresh (invoked from expiry modal)
  const [refreshing, setRefreshing] = useState(false);
  const refreshSessionNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const client = await getSupabase();
      const { error } = await client.auth.refreshSession();
      if (!error) {
        setSessionExpiryWarning(null);
        broadcastSessionRefreshed();
      }
    } catch (err) {
      console.warn("[auth] Manual refresh failed:", err);
    } finally { setRefreshing(false); }
  };

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, loading, login, signup, loginWithGoogle, logout, updateUser, resetPassword }}>
      {/* Soft-delete restore banner */}
      {user?.deletedAt && (
        <div role="alert" style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 10001,
          padding: "12px 20px",
          background: "rgba(196,112,90,0.12)", borderBottom: "1px solid rgba(196,112,90,0.3)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: "#E5A590",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap",
        }}>
          <span>
            ⚠️ Your account is scheduled for permanent deletion on{" "}
            <strong>{new Date(new Date(user.deletedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong>.
          </span>
          <button
            type="button"
            onClick={restoreAccount}
            disabled={restoring}
            style={{
              fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              color: "#060607", background: "#E5A590",
              border: "none", borderRadius: 6, padding: "6px 14px",
              cursor: restoring ? "default" : "pointer", opacity: restoring ? 0.6 : 1,
            }}
          >
            {restoring ? "Restoring..." : "Restore account"}
          </button>
        </div>
      )}
      {/* Session expiry banner with Refresh Now action */}
      {sessionExpiryWarning && (
        <div role="alert" style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10000,
          padding: "10px 16px 10px 20px", borderRadius: 10, maxWidth: 480,
          background: "rgba(212,179,127,0.15)", border: "1px solid rgba(212,179,127,0.3)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: "#C9A96E",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ flex: 1 }}>{sessionExpiryWarning}</span>
          <button
            type="button"
            onClick={refreshSessionNow}
            disabled={refreshing}
            style={{
              fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              color: "#C9A96E", background: "transparent",
              border: "1px solid rgba(212,179,127,0.4)", borderRadius: 6, padding: "4px 10px",
              cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
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

  // Reconcile per-user localStorage on every auth state transition. Runs
  // after loading resolves so we don't wipe the cache during the transient
  // null → profile period of session restore. A different user id than
  // last time we rendered → wipe user-scoped keys. Logout → wipe too.
  useEffect(() => {
    if (loading) return;
    reconcileUserScopedStorage(user?.id || null);
  }, [loading, user?.id]);

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
    } else if (user && !user.hasCompletedOnboarding && !getLocalOnboardingDone(user.id) && !["/onboarding", "/interview", "/onboarding/complete"].includes(pathname) && !pathname.startsWith("/session/")) {
      // Only bounce to onboarding when we're confident the user hasn't
      // been through it. hasCompletedOnboarding (derived server-side from
      // the profile column or explicit heuristics in profileToUser) plus
      // the per-user localStorage flag are the two authoritative signals.
      // We no longer treat "has a resumeFileName" as onboarded-proof —
      // cross-user localStorage leakage used to surface stale resume
      // data that would trick this guard into letting a brand-new user
      // through.
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
  if (user && !user.hasCompletedOnboarding && !getLocalOnboardingDone(user.id) && !["/onboarding", "/interview", "/onboarding/complete"].includes(pathname) && !pathname.startsWith("/session/")) return null;

  return <>{children}</>;
}

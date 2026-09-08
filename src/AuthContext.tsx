import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { getSupabase, preloadSupabase, supabaseConfigured, getProfile, upsertProfile, authHeaders, type Profile } from "./supabase";
import {
  clearSessionStart,
  isSessionExpiredByPreference,
} from "./auth/_shell";
import { captureClientEvent, identifyClient, resetClient } from "./posthogClient";
import { isSlowConnection } from "./_browser-api-guards";
import { tokens } from "./auth/_tokens";
import {
  decideDeviceAction,
  markDeviceGrace,
  isWithinDeviceGrace,
  clearDeviceGrace,
  DEVICE_GRACE_MS,
} from "./deviceSession";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
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

/**
 * Synchronous fast-path session reader. Pulls the supabase-js auth
 * blob out of localStorage and reconstructs a usable Session object,
 * bypassing the `client.auth.getSession()` navigator-lock acquisition
 * that browser extensions (Jam, Loom, Hotjar, screen-recorders) can
 * hang by wrapping window.fetch.
 *
 * Returns null when:
 *   • no token stored
 *   • the token is malformed
 *   • the access_token has expired (we let the slow path refresh it)
 *
 * The returned object is structurally compatible with the parts of
 * Session our AuthContext actually reads (`access_token`, `user`,
 * `user.user_metadata`, `user.app_metadata`, `user.email`,
 * `user.id`). Less-used Session fields are omitted; consumers that
 * need them must wait for the SDK's getSession to resolve.
 */
export function readSessionFromLocalStorage(): Session | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    const ref = new URL(url).hostname.split(".")[0];
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      expires_in?: number;
      token_type?: string;
      provider_token?: string | null;
      provider_refresh_token?: string | null;
      user?: Session["user"];
      currentSession?: { access_token?: string; user?: Session["user"]; expires_at?: number };
    };
    const token = parsed.access_token || parsed.currentSession?.access_token;
    const user = parsed.user || parsed.currentSession?.user;
    const expiresAt = parsed.expires_at || parsed.currentSession?.expires_at || 0;
    if (!token || !user) return null;
    // Reject expired tokens — let the slow path's refresh handle it.
    // 30s skew so we don't ship a token that's about to die mid-request.
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - 30 < nowSec) return null;
    return {
      access_token: token,
      refresh_token: parsed.refresh_token ?? "",
      expires_at: expiresAt,
      expires_in: parsed.expires_in ?? Math.max(0, expiresAt - nowSec),
      token_type: (parsed.token_type ?? "bearer") as "bearer",
      provider_token: parsed.provider_token ?? null,
      provider_refresh_token: parsed.provider_refresh_token ?? null,
      user,
    };
  } catch {
    return null;
  }
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

/* ─── Subscription tier local cache ───
 * Persists the user's last-known tier so the Plan Status widget can render
 * the correct plan immediately on page load, even before getProfile() returns
 * (which can take 1–5s on slow Indian mobile connections or when a browser
 * extension wraps fetch). Keyed by userId so the cache is always scoped to
 * the current account. Cleared via USER_SCOPED_KEYS wipe on user-change. */
function tierCacheKey(userId: string): string {
  return `hirestepx_tier_${userId}`;
}
function cacheTier(
  userId: string,
  tier: string | undefined,
  subscriptionEnd?: string,
  practiceTimestamps?: string[],
  targetRole?: string,
): void {
  if (!tier) return;
  try {
    localStorage.setItem(tierCacheKey(userId), JSON.stringify({
      tier, subscriptionEnd, practiceTimestamps, targetRole,
    }));
  } catch { /* storage unavailable */ }
}
function getCachedTier(userId: string): {
  tier: "free" | "starter" | "pro" | "team";
  subscriptionEnd?: string;
  practiceTimestamps?: string[];
  targetRole?: string;
} | null {
  try {
    const raw = localStorage.getItem(tierCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/* ─── Single-Device Session Enforcement ─── */
const INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours default (configurable: 4-8 hrs)
const DEVICE_TOKEN_KEY = "hirestepx_device_token";

function generateDeviceToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function getStoredDeviceToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}

function storeDeviceToken(token: string) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* expected */ }
}

/** Confirm a would-be single-device eviction against AUTHORITATIVE server
 *  metadata before signing out. The JWT in a cached session is a snapshot — it
 *  can still carry the PREVIOUS session's device token for a beat after our own
 *  login rotated it, which is exactly what produced the self-eviction bug.
 *  getUser() hits Supabase for the current value. Returns the decideDeviceAction
 *  verdict against that fresh read plus the fresh token (so an "adopt" can store
 *  it without a second round-trip). Fail-safe: any error → "keep", because
 *  eviction is destructive and must never fire on an inconclusive read. */
async function resolveDeviceWithServer(
  client: SupabaseClient,
  localToken: string | null,
): Promise<{ action: "keep" | "adopt" | "evict"; serverToken: string | null }> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return { action: "keep", serverToken: null };
    const freshServerToken = (data.user.user_metadata?.active_device_token as string | undefined) ?? null;
    return {
      action: decideDeviceAction({ localToken, serverToken: freshServerToken, withinGrace: isWithinDeviceGrace() }),
      serverToken: freshServerToken,
    };
  } catch {
    return { action: "keep", serverToken: null };
  }
}

/* ─── Referral capture/apply ───
   A referral link lands on /signup?ref=HSX-XXXXXX. The code is stashed here at
   page load and applied once the user reaches an authenticated session (after
   email verification, or immediately for Google). The apply call is what closes
   the loop — it rewards both sides server-side (see referral.ts). */
const PENDING_REFERRAL_KEY = "hirestepx_pending_ref";
const REFERRAL_CODE_RE = /^HSX-[A-Z0-9]{4,8}$/;

/** Stash a referral code from a signup link for later application. No-ops on a
 *  malformed code. Exported for the signup page to call on mount. */
export function storePendingReferralCode(raw: string | null | undefined): void {
  if (typeof raw !== "string") return;
  const code = raw.trim().toUpperCase();
  if (!REFERRAL_CODE_RE.test(code)) return;
  try { localStorage.setItem(PENDING_REFERRAL_KEY, code); } catch { /* expected */ }
}

function readPendingReferralCode(): string | null {
  try { return localStorage.getItem(PENDING_REFERRAL_KEY); } catch { return null; }
}

function clearPendingReferralCode(): void {
  try { localStorage.removeItem(PENDING_REFERRAL_KEY); } catch { /* expected */ }
}

/* ─── Deferred-onboarding redirect (SEO signups only) ───
   Salary/questions SEO CTAs append ?next=/interview so that cohort can reach
   a session immediately after verifying instead of being forced through
   onboarding first (SEO copy promises "practice free" — onboarding's resume
   upload + profile analysis broke that promise). Stashed at /signup mount,
   consumed once the user is verified and would otherwise be bounced to
   /onboarding. Allowlisted to exactly "/interview" — this is a targeted
   funnel fix, not a general redirect mechanism. */
const PENDING_NEXT_KEY = "hirestepx_pending_next";
/* Fixed prefix, not an arbitrary-path allowlist — the only supported skip
 * target is /interview, optionally with a ?role= query string carried over
 * from the SEO page for personalization. Same-origin path always, so the
 * query content can't turn this into an open redirect. */
function isAllowedPendingNext(raw: string): boolean {
  return raw === "/interview" || raw.startsWith("/interview?");
}

/** Stash a post-verification redirect target from a signup link. No-ops
 *  unless the target is in the allowlist. Exported for the signup page. */
export function storePendingNextTarget(raw: string | null | undefined): void {
  if (typeof raw !== "string" || !isAllowedPendingNext(raw)) return;
  try { localStorage.setItem(PENDING_NEXT_KEY, raw); } catch { /* expected */ }
}

function consumePendingNextTarget(): string | null {
  try {
    const target = localStorage.getItem(PENDING_NEXT_KEY);
    if (target) localStorage.removeItem(PENDING_NEXT_KEY);
    return target && isAllowedPendingNext(target) ? target : null;
  } catch {
    return null;
  }
}

/** Build the canonical referral signup URL for a code. Falls back to the app
 *  origin (or the prod app URL during SSR) when no code is available, so every
 *  share surface always emits a working — and, when possible, attributed —
 *  link. The single source of truth for "what link do we share". */
export function referralSignupUrl(code?: string | null): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://app.hirestepx.com";
  return code ? `${origin}/signup?ref=${encodeURIComponent(code)}` : origin;
}

/** Apply a captured referral code now that we have an authenticated session.
 *  Fire-and-forget: a referral failure must NEVER block login. Clears the
 *  pending code on a definitive outcome (applied/already-used/invalid) but
 *  keeps it on a transient 5xx/network error so a later session can retry. */
async function applyPendingReferral(accessToken: string): Promise<void> {
  const code = readPendingReferralCode();
  if (!code) return;
  try {
    const res = await fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ code }),
    });
    // K-factor instrumentation: a fresh attribution = a referred signup; a
    // server-granted reward = the loop actually paid out. Both fire on the
    // referred user's client. alreadyReferred re-applies are not new signups.
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { rewarded?: boolean; alreadyReferred?: boolean };
      if (!body.alreadyReferred) captureClientEvent("referral_signup", { code });
      if (body.rewarded) captureClientEvent("referral_reward_granted", { code, side: "referred" });
    }
    if (res.ok || (res.status >= 400 && res.status < 500)) clearPendingReferralCode();
  } catch {
    /* transient — keep the pending code for the next SIGNED_IN */
  }
}

/* Session-fingerprint hijack detection used to live here. Removed —
   the only path was storeSessionFingerprint() at login, but no code
   ever read the stored value back to compare against a fresh
   fingerprint. It looked like security but provided none, and wiring
   the comparison would create false positives (UA changes on browser
   updates, screen res changes when docking laptops, timezone shifts
   when traveling) that lock out legitimate users.

   Real session-hijack defence in this codebase comes from:
   - Supabase HttpOnly secure cookies + SameSite=Lax
   - Single-device token rotation (active_device_token in user_metadata)
   - Server-side rate-limit on /api/send-welcome
   - Lockout after 5 failed login attempts

   Add server-side IP-based heuristics if/when fraud signal warrants. */

/* ─── Audit Logging (persists security events to audit_log table + function logs) ─── */
function logAuditEvent(event: string, details?: Record<string, unknown>) {
  try {
    // H-4: include the session bearer token so /api/audit-log can authenticate
    // the caller. readSessionFromLocalStorage() is already used for fast-render
    // and is safe here — audit events only fire when we have an active session.
    const session = readSessionFromLocalStorage();
    const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) authHeaders["Authorization"] = `Bearer ${session.access_token}`;

    // 1. Server-side persistence (queryable audit table)
    fetch("/api/audit-log", {
      method: "POST",
      headers: authHeaders,
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
      if (previous) {
        try { localStorage.removeItem(tierCacheKey(previous)); } catch { /* expected */ }
      }
      wipeUserScopedStorage();
      return;
    }
    if (previous && previous !== currentUserId) {
      console.info(`[auth] user changed (${previous.slice(0, 8)} → ${currentUserId.slice(0, 8)}) — wiping per-user localStorage`);
      try { localStorage.removeItem(tierCacheKey(previous)); } catch { /* expected */ }
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
/* ─── Interview-in-progress flag ───────────────────────────────────────
 * Module-scoped boolean. The interview engine flips it true on session
 * start and false on completion/abort. checkExpiry consults it before
 * the destructive signout path so we don't nuke a user's 25-minute
 * session mid-question on a transient refresh failure.
 *
 * Why a module global and not React state: AuthContext's interval is a
 * closure over its own state; passing this through props/context would
 * require refactoring every interview surface. The flag is read by
 * exactly one consumer (checkExpiry) and written by exactly one writer
 * (useInterviewEngine on mount/unmount), so a global is the simplest
 * shape that actually works.
 * ─────────────────────────────────────────────────────────────────── */
/* Refcounted so multiple interview surfaces (multi-tab, dev StrictMode
 * double-mount, an embedded preview canvas) don't race each other into
 * a stale `false`. The writer pairs setInterviewInProgress(true) on
 * mount with setInterviewInProgress(false) on unmount; with a boolean
 * the second unmount would re-enable destructive signout while the
 * first interview is still active. */
let _interviewRefcount = 0;
export function setInterviewInProgress(v: boolean): void {
  _interviewRefcount = Math.max(0, _interviewRefcount + (v ? 1 : -1));
}
export function isInterviewInProgress(): boolean { return _interviewRefcount > 0; }

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
  /** "email" for password-account users, "google" for OAuth users.
   *  Drives password-reset visibility in Settings — Google users have
   *  no internal-app password to reset. */
  signedInVia?: "email" | "google";
  /**
   * Pointer to the row in `resume_versions` whose AI parse produced
   * `resumeData`. When a session is created, this id is captured into
   * sessions.resume_version_id so the report can be replayed against
   * the exact resume the user was scored against, even if they later
   * re-upload. Set immediately after analyze-resume returns; cleared
   * on resume removal.
   */
  resumeVersionId?: string | null;
  subscriptionTier?: "free" | "starter" | "pro" | "team";
  subscriptionStart?: string;
  subscriptionEnd?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionPaused?: boolean;
  referralCode?: string;
  emailVerified: boolean;
  deletedAt?: string | null;
  /** Opt-in to being included in the employer talent-roster candidate
      pool. Private by default — see settingsSections.tsx AccountSection. */
  isDiscoverableToEmployers?: boolean;
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

export function profileToUser(profile: Profile, session: Session): User {
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
    resumeVersionId: (profile.resume_version_id as string | null | undefined) || null,
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
    isDiscoverableToEmployers: profile.is_discoverable_to_employers ?? false,
    emailVerified:
      session.user.user_metadata?.custom_email_verified === true ||
      !!session.user.email_confirmed_at ||
      // Google verifies the email address as part of OAuth — treat the
      // provider tag as a verified-email signal even if Supabase didn't
      // backfill email_confirmed_at on the first session restore.
      session.user.app_metadata?.provider === "google" ||
      session.user.app_metadata?.providers?.includes?.("google") === true,
    deletedAt: profile.deleted_at,
    // OAuth provider — used by Settings to hide "Reset Password" for
    // Google-only users (they have no internal-app password to reset).
    // Checked against the linked-providers list, not the current
    // session's provider: a dual-provider account (email + Google both
    // linked) has a real password to reset even on a session where they
    // happened to sign in via Google, so it must not be misreported as
    // Google-only just because Google is one of the linked providers.
    signedInVia:
      session.user.app_metadata?.providers?.includes?.("email")
        ? "email"
        : "google",
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
  // The post-login "don't evict me yet" grace window now lives in localStorage
  // (see deviceSession.ts: markDeviceGrace / isWithinDeviceGrace) rather than an
  // in-memory ref, so it survives the (auth)→(app) route-group provider remount
  // that the old ref could not — that remount resetting the ref to false was the
  // root cause of the post-login self-eviction.
  // Stable ref so checkExpiry can read user.id without depending on the full user object.
  // The full user dep caused the effect to restart on every setUser() call (fast-render,
  // profile load, TOKEN_REFRESHED → 3+ restarts on page load), stacking 10s timers and
  // causing spurious getSession() calls.
  const userRef = useRef<User | null>(null);

  // Keep userRef in sync with user state so the checkExpiry effect can read
  // user.id without depending on the full user object (which would restart
  // the effect on every setUser() call).
  userRef.current = user;

  // Clean up legacy localStorage cache from previous versions
  useEffect(() => {
    try { localStorage.removeItem("hirestepx_auth"); } catch { /* expected: localStorage may be unavailable */ }
  }, []);

  // Auto-assign referral code: every user gets one, but it's lazy (created on
  // first GET /api/referral). Without this, new users complete their first
  // session and see no WhatsApp/LinkedIn share option because their profile
  // still has referral_code = null. This fires once per authenticated session
  // when the code is absent, silently updating state so the share section is
  // live the next time the report renders.
  useEffect(() => {
    if (!user?.id || user.referralCode) return;
    authHeaders()
      .then((headers) => fetch("/api/referral", { headers }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { code?: string } | null) => {
        if (data?.code) {
          setUser((prev) => prev ? { ...prev, referralCode: data.code } : prev);
        }
      })
      .catch(() => { /* non-critical — share section stays hidden this session */ });
  }, [user?.id, user?.referralCode]);

  // Register global error reporter: captures unhandled errors + promise rejections
  // and forwards them to /api/log-error (and optional Sentry). Idempotent.
  // Dynamic import keeps errorReporter's optional @sentry/browser dynamic import
  // out of the static module graph (Vitest transform can't resolve @sentry/browser).
  useEffect(() => {
    import("./errorReporter").then(m => m.initErrorReporter()).catch(() => {});
  }, []);

  // "Remember me" — clear session on tab/browser close if ephemeral
  // Uses both pagehide (reliable on mobile) and beforeunload (desktop fallback)
  useEffect(() => {
    const clearEphemeralSession = () => {
      try {
        if (sessionStorage.getItem("hirestepx_ephemeral") === "1") {
          // Clear auth data so session doesn't persist
          clearLastRoute();
          // Remove Supabase session tokens from localStorage.
          // Collect keys first — iterating by index while removing items is
          // browser-implementation-specific and can skip entries on some engines
          // when indices shift mid-loop. Snapshot the list, then remove.
          const sbKeys = Object.keys(localStorage).filter(
            k => k.startsWith("sb-") && k.endsWith("-auth-token"),
          );
          sbKeys.forEach(k => localStorage.removeItem(k));
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

    // Start loading the Supabase SDK eagerly when an app route is active (dashboard,
    // session, interview, onboarding, settings, login/signup). The SDK (~191KB) dynamic
    // import must be underway BEFORE getSession() is awaited — otherwise the import
    // itself consumes most of the 7s getSession timeout on slow Indian mobile connections.
    //
    // On pure marketing paths (homepage, pricing, blog …) with no authenticated route
    // in the URL, defer until browser idle to avoid blocking FCP/LCP.
    const isAppRoute = typeof window !== "undefined" && (
      window.location.hostname.includes("staging.") ||
      window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("127.0.0.1") ||
      window.location.hostname.includes("vercel.app") ||
      window.location.pathname.startsWith("/dashboard") ||
      window.location.pathname.startsWith("/session") ||
      window.location.pathname.startsWith("/interview") ||
      window.location.pathname.startsWith("/onboarding") ||
      window.location.pathname.startsWith("/settings") ||
      window.location.pathname.startsWith("/login") ||
      window.location.pathname.startsWith("/signup") ||
      window.location.pathname.startsWith("/auth/")
    );
    if (isAppRoute) {
      preloadSupabase();
    } else {
      // Pure marketing page — defer until browser is idle to avoid blocking FCP/LCP
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(() => preloadSupabase());
      } else {
        setTimeout(preloadSupabase, 4000);
      }
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
      const cachedTierForEnsure = getCachedTier(session.user.id);
      const newUser: User = {
        id: session.user.id,
        name: newProfile.name || "",
        email: newProfile.email || "",
        targetRole: cachedTierForEnsure?.targetRole || "",
        resumeFileName: null,
        hasCompletedOnboarding: false,
        emailVerified:
      session.user.user_metadata?.custom_email_verified === true ||
      !!session.user.email_confirmed_at ||
      // Google verifies the email address as part of OAuth — treat the
      // provider tag as a verified-email signal even if Supabase didn't
      // backfill email_confirmed_at on the first session restore.
      session.user.app_metadata?.provider === "google" ||
      session.user.app_metadata?.providers?.includes?.("google") === true,
        // Always set subscriptionTier so tierKnown is never false for a set user.
        // Seed from localStorage cache if available; otherwise "free" is the safe default.
        subscriptionTier: cachedTierForEnsure?.tier ?? "free",
        ...(cachedTierForEnsure ? { subscriptionEnd: cachedTierForEnsure.subscriptionEnd } : {}),
      };
      setUser(newUser);
    }

    // When getProfile times out (extension-blocked fetch), we set a basic
    // user from the JWT alone — missing subscriptionTier, resumeData, etc.
    // That makes Pro users briefly see "Free Plan" in the sidebar until a
    // hard refresh re-fetches the profile. Retry in the background with
    // exponential backoff so the UI self-corrects without user action.
    const retryProfileInBackground = (sess: Session) => {
      let cancelled = false;
      const delays = [1000, 2000, 4000, 8000, 16000];
      (async () => {
        for (const delay of delays) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, delay));
          if (cancelled) return;
          try {
            const profile = await Promise.race([
              getProfile(sess.user.id),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("getProfile retry timeout (8s)")), 8000),
              ),
            ]);
            if (profile && !cancelled) {
              const retriedUser = profileToUser(profile, sess);
              setUser(retriedUser);
              cacheTier(sess.user.id, retriedUser.subscriptionTier, retriedUser.subscriptionEnd, retriedUser.practiceTimestamps, retriedUser.targetRole);
              return;
            }
          } catch { /* keep retrying */ }
        }
      })();
      return () => { cancelled = true; };
    };

    // Safety timeout: ensure loading never hangs
    // Use longer timeout on slow connections (common on Indian mobile networks)
    const safetyMs = isSlowConnection() ? 15000 : 10000;
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
      // Restore session from local JWT.
      //
      // FAST PATH first: read the supabase-js storage slot synchronously
      // and reconstruct a usable Session. This avoids the
      // navigator-lock acquisition that browser extensions (Jam.dev,
      // Loom, Hotjar, screen-recorders) wrap via window.fetch, which
      // can hang `client.auth.getSession()` for the full 8s timeout.
      // The token in localStorage is the source of truth — getSession()
      // returns the same object after merely refreshing if expired.
      //
      // We then run getSession() in the background (no await) so any
      // refresh-needed cases still flow through the SDK's normal path
      // (onAuthStateChange will fire if the token changes). If the
      // local copy turns out to be expired, we drop back to the slow
      // path with a 3s timeout (was 8s — still long enough for a real
      // network round-trip, short enough that the user doesn't sit on
      // a spinner).
      try {
        let session = readSessionFromLocalStorage();
        // Hoisted so the background refreshSession guard below (outside if(session))
        // can read it. Set to true inside if(session) when fast render ran.
        let didFastRender = false;
        if (!session) {
          session = await Promise.race([
            client.auth.getSession().then(r => r.data.session ?? null),
            new Promise<null>((resolve) => setTimeout(() => {
              console.warn("[auth] getSession() exceeded 7s — treating as no session (browser extension may be blocking fetch)");
              resolve(null);
            }, 7000)),
          ]);
        } else {
          // Background refresh — fire-and-forget. If the SDK manages to
          // resolve quickly it'll merely confirm what we already have;
          // if it hangs we're already past it. onAuthStateChange will
          // surface any token rotation.
          client.auth.getSession().catch(() => { /* fire-and-forget */ });
        }
        if (session) {
          // Block unverified email users — sign them out immediately.
          // Google OAuth users are always verified; email/password users
          // must pass either our custom verification flow OR Supabase's
          // native email_confirmed_at (set when they click the
          // confirmation link Supabase auto-sends on signUp).
          // See login() for the longer rationale.
          // Exception: allow sessions on /reset-password so users can complete password reset.
          const isGoogleUser = session.user.app_metadata?.provider === "google" || session.user.app_metadata?.providers?.includes("google");
          const customVerified = session.user.user_metadata?.custom_email_verified === true;
          const supabaseConfirmedRestore = !!session.user.email_confirmed_at;
          const isOnResetPage = window.location.pathname === "/reset-password";
          if (!isGoogleUser && !customVerified && !supabaseConfirmedRestore && !isOnResetPage) {
            console.warn("[auth] unverified email session found — signing out");
            setUser(null);
            await client.auth.signOut().catch(() => {});
            clearTimeout(safetyTimer);
            setLoading(false);
            return;
          }
          // Enforce client-side "Stay signed in" TTL — if the session
          // has aged past 24h (unchecked) or 30d (checked), force re-auth.
          if (isSessionExpiredByPreference()) {
            console.info("[auth] session expired by Stay-signed-in TTL — signing out");
            setUser(null);
            clearSessionStart();
            await client.auth.signOut().catch(() => {});
            clearTimeout(safetyTimer);
            setLoading(false);
            return;
          }
          // Capture Google provider token if present (after OAuth redirect)
          if (session.provider_token) {
            try { sessionStorage.setItem("hirestepx_google_token", session.provider_token); } catch { /* expected: sessionStorage may be unavailable */ }
          }
          // ── Fast render for returning users ──────────────────────────────────
          // On slow Indian mobile connections getProfile consistently hits the 5s
          // timeout, so every hard-refresh shows a full-page spinner for 5 seconds.
          // If we already have a cached subscription tier from a previous visit,
          // skip the wait: render the dashboard immediately from JWT + cache, then
          // let the getProfile call below silently update with any changed data
          // (name, role, tier) when it resolves. This makes the dashboard appear
          // instantly for returning users regardless of network speed.
          const cachedTierFastRender = getCachedTier(session.user.id);
          if (cachedTierFastRender) {
            const metaFast = session.user.user_metadata || {};
            setUser({
              id: session.user.id,
              name: metaFast.name || metaFast.full_name || "",
              email: session.user.email || "",
              // Seed targetRole and practiceTimestamps from cache so the sidebar
              // and Plan Status widget show correct data immediately — prevents
              // visible content changes when the full profile loads in background.
              targetRole: cachedTierFastRender.targetRole || "",
              resumeFileName: null,
              hasCompletedOnboarding: metaFast.has_completed_onboarding || getLocalOnboardingDone(session.user.id) || false,
              emailVerified: metaFast.custom_email_verified === true || !!session.user.email_confirmed_at,
              subscriptionTier: cachedTierFastRender.tier,
              subscriptionEnd: cachedTierFastRender.subscriptionEnd,
              practiceTimestamps: cachedTierFastRender.practiceTimestamps || [],
            });
            clearTimeout(safetyTimer);
            setLoading(false);
            // Unlock TOKEN_REFRESHED/SIGNED_IN handling immediately — the
            // dashboard is live, so event-driven profile updates should proceed.
            initialSessionRestoredRef.current = true;
            didFastRender = true;
          }
          try {
            // Timeout on profile fetch. Without this, any extension-
            // wrapped fetch (Loom / Jam / Hotjar) that silently hangs
            // pushes the whole auth init past the safety timeout —
            // user sees `[auth] safety timeout: forcing loading=false`
            // and the app boots with user=null even though their session
            // is valid. The catch below builds a basic user from JWT
            // user_metadata so they're not logged out; profile data
            // hydrates on next route nav.
            //
            // The cap is connection-aware to mirror the safety timer
            // (10s normal / 15s slow): on slow Indian mobile networks a
            // cold getProfile routinely needs >5s, so we allow 8s there
            // — enough to land the first attempt (avoiding the
            // minimal-user flash + background retry) while staying well
            // under the 15s slow-connection safety net.
            const profileTimeoutMs = isSlowConnection() ? 8000 : 5000;
            const profile = await Promise.race([
              getProfile(session.user.id),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`getProfile timeout (${profileTimeoutMs}ms)`)), profileTimeoutMs),
              ),
            ]);
            if (profile) {
              const loadedUser = profileToUser(profile, session);
              setUser(loadedUser);
              cacheTier(session.user.id, loadedUser.subscriptionTier, loadedUser.subscriptionEnd, loadedUser.practiceTimestamps, loadedUser.targetRole);
              // ─── Single-device enforcement (restore path) ───
              // decideDeviceAction encodes the keep/adopt/evict rule; see
              // deviceSession.ts for the full rationale. Two safeguards make a
              // FALSE eviction (the self-eviction bug) impossible:
              //   1. The grace window is read from localStorage (isWithinDeviceGrace),
              //      so it survives the (auth)→(app) route-group provider remount
              //      that an in-memory ref could not.
              //   2. A would-be eviction is re-confirmed against AUTHORITATIVE server
              //      metadata via getUser() before we sign out — the session JWT here
              //      can be a stale snapshot from before our own login rotated the token.
              const localToken = getStoredDeviceToken();
              const serverToken = session.user.user_metadata?.active_device_token as string | undefined;
              const action = decideDeviceAction({ localToken, serverToken, withinGrace: isWithinDeviceGrace() });
              if (action === "adopt" && serverToken) {
                // First login on this origin (or cleared localStorage): adopt the
                // server token so the next check compares like-for-like.
                storeDeviceToken(serverToken);
              } else if (action === "evict") {
                const confirmed = await resolveDeviceWithServer(client, localToken);
                if (confirmed.action === "evict") {
                  console.warn("[auth] single-device: another device has taken over — signing out");
                  logAuditEvent("single_device_enforcement", { userId: session.user.id });
                  setUser(null);
                  await client.auth.signOut().catch(() => {});
                  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* expected */ }
                  clearDeviceGrace();
                  clearTimeout(safetyTimer);
                  setLoading(false);
                  router.replace("/login?reason=device_evicted");
                  return;
                }
                // Authoritative server disagreed with the stale JWT — keep the
                // session, and adopt the fresh token if we had none locally.
                if (confirmed.action === "adopt" && confirmed.serverToken) {
                  storeDeviceToken(confirmed.serverToken);
                }
              }
            } else {
              // No profile found — create one rather than signing out
              await ensureProfile(session);
            }
          } catch (profileErr) {
            console.error("[auth] getProfile threw:", profileErr);
            if (!didFastRender) {
              // No fast render (first visit with no cached tier): set a minimal
              // user from the JWT so the session stays alive. Seed subscriptionTier
              // from localStorage cache if available — covers the second visit when
              // the cache was written by a previous retryProfileInBackground success.
              const meta = session.user.user_metadata || {};
              const cachedTierData = getCachedTier(session.user.id);
              setUser({
                id: session.user.id,
                name: meta.name || meta.full_name || "",
                email: session.user.email || "",
                targetRole: "",
                resumeFileName: null,
                hasCompletedOnboarding: meta.has_completed_onboarding || getLocalOnboardingDone(session.user.id) || false,
                emailVerified: meta.custom_email_verified === true || !!session.user.email_confirmed_at,
                // Default to "free" so tierKnown is always true when user is set —
                // prevents the "Loading plan…" stuck state that blocks the CTA buttons.
                // retryProfileInBackground below will update to the real tier within seconds.
                subscriptionTier: cachedTierData?.tier ?? "free",
                ...(cachedTierData ? { subscriptionEnd: cachedTierData.subscriptionEnd, practiceTimestamps: cachedTierData.practiceTimestamps || [] } : {}),
              });
            }
            // Always retry — ensures full profile data (name, role, tier) eventually
            // loads even when the initial attempt times out.
            retryProfileInBackground(session);
          }
        } else {
          setUser(null);
        }
        clearTimeout(safetyTimer);
        setLoading(false);

        // Background refresh-token validation (deferred). Skip when the fast render
        // path already ran — retryProfileInBackground covers any auth errors, and
        // this extra refreshSession would fire TOKEN_REFRESHED ~10s after page load,
        // triggering a redundant getProfile → setUser cycle that looks like a second
        // "page refresh" to the user. Supabase fires TOKEN_REFRESHED automatically
        // when the JWT actually expires (~1 hour), so no coverage gap.
        // Skip on /auth/callback — signInWithIdToken is still holding the lock there.
        if (!didFastRender && session && !window.location.pathname.startsWith("/auth/callback")) {
          // Wait for onAuthStateChange listener to be fully registered and any pending
          // auth operations (e.g. token refresh) to complete before we touch the lock
          setTimeout(() => {
            // Never poke the refresh token mid-interview. The access token
            // (JWT) is valid for ~1h and an interview is ~25min, so it stays
            // usable for the whole session without a refresh. A proactive
            // refresh that hit a transient invalid-refresh-token (a multi-
            // tab / reload rotation race) would sign the user out and 401
            // the end-of-interview /api/sessions/save — losing the scored
            // report. checkExpiry (which respects the same flag) handles any
            // genuine expiry once the interview ends.
            if (_interviewRefcount > 0) {
              console.warn("[auth] skipping background refresh — interview in progress");
              return;
            }
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
          // Email verification guard — applies to both SIGNED_IN and TOKEN_REFRESHED.
          const isGoogleProvider = session.user.app_metadata?.provider === "google" || session.user.app_metadata?.providers?.includes("google");
          const customVerifiedEvent = session.user.user_metadata?.custom_email_verified === true;
          const supabaseConfirmedEvent = !!session.user.email_confirmed_at;
          if (!isGoogleProvider && !customVerifiedEvent && !supabaseConfirmedEvent && !isOnResetPage) {
            console.warn("[auth] onAuthStateChange: unverified email — signing out");
            setUser(null);
            await client.auth.signOut().catch(() => {});
            setLoading(false);
            return;
          }
          // Persist Google provider token for Calendar API access (both events).
          if (session.provider_token) {
            try { sessionStorage.setItem("hirestepx_google_token", session.provider_token); } catch { /* expected: sessionStorage may be unavailable */ }
          }

          // ── TOKEN_REFRESHED: skip getProfile ──────────────────────────────────
          // TOKEN_REFRESHED fires shortly after every SIGNED_IN AND again every ~1 hour
          // as Supabase silently rotates the JWT. Calling getProfile on each rotation
          // causes multiple DB round-trips in "a few seconds" right after login, and
          // redundant fetches while the user is actively browsing.
          //
          // The user's tier is already loaded by the SIGNED_IN path below (or the
          // initial restore path). Tier changes are handled by:
          //   • payment: onPaymentSuccess callback updates state directly.
          //   • expiry: profileToUser() downgrades locally when subscription_end < now.
          //   • re-login: SIGNED_IN path below re-fetches the full profile.
          //
          // So TOKEN_REFRESHED just keeps the existing user state alive; no DB call needed.
          if (event === "TOKEN_REFRESHED") {
            setLoading(false);
            return;
          }

          // ── SIGNED_IN: full profile fetch (real login / re-login) ─────────────
          // Single-device enforcement: mint a device token on a genuine new login
          // that didn't already rotate one (OAuth/email-verify callbacks land here,
          // not via login()). Skip session restores/refreshes (which also fire
          // SIGNED_IN but keep the existing token), and skip while login()'s own
          // rotation is mid-flight (grace open) so the two writers never race.
          if (!getStoredDeviceToken() && !isWithinDeviceGrace()) {
            const newDeviceToken = generateDeviceToken();
            storeDeviceToken(newDeviceToken);
            // Open the durable grace window so the downstream/remounted check
            // doesn't evict on local=newToken vs a stale JWT serverToken.
            markDeviceGrace(DEVICE_GRACE_MS);
            client.auth.updateUser({ data: { active_device_token: newDeviceToken } }).catch(err => console.warn("[auth] updateUser(device_token) failed:", err?.message));
          }
          // Close the referral loop: apply any code captured from a signup link.
          // Fire-and-forget; the server is idempotent for re-applies.
          if (session.access_token) {
            void applyPendingReferral(session.access_token);
          }
          try {
            // Same connection-aware timeout guard as the restore path
            // above — see there for rationale.
            const profileTimeoutMs = isSlowConnection() ? 8000 : 5000;
            const profile = await Promise.race([
              getProfile(session.user.id),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`getProfile timeout (${profileTimeoutMs}ms)`)), profileTimeoutMs),
              ),
            ]);
            if (profile) {
              const refreshedUser = profileToUser(profile, session);
              setUser(refreshedUser);
              cacheTier(session.user.id, refreshedUser.subscriptionTier, refreshedUser.subscriptionEnd, refreshedUser.practiceTimestamps, refreshedUser.targetRole);
              // Identify Google OAuth users in PostHog — email/password users are
              // identified in login() and signup(); OAuth users only land here.
              if (isGoogleProvider) {
                identifyClient(session.user.id, { email: session.user.email, signup_method: "google" });
              }
            } else {
              await ensureProfile(session);
            }
          } catch {
            // Profile fetch hung or failed on SIGNED_IN.
            // Priority order:
            //   1. Preserve current user if subscriptionTier is already set — avoids the
            //      "Loading plan…" flash while retryProfileInBackground catches up.
            //   2. If subscriptionTier is missing, seed it from the localStorage tier cache.
            //   3. Default to "free" when nothing is cached — tierKnown must never be false
            //      for a set user, otherwise the plan widget CTA is permanently blocked
            //      until retryProfileInBackground resolves.
            const meta = session.user.user_metadata || {};
            const cachedTierForRefresh = getCachedTier(session.user.id);
            setUser(current => {
              if (current?.subscriptionTier !== undefined) return current;
              return {
                id: session.user.id,
                name: meta.name || meta.full_name || "",
                email: session.user.email || "",
                targetRole: cachedTierForRefresh?.targetRole || "",
                resumeFileName: null,
                hasCompletedOnboarding: meta.has_completed_onboarding || getLocalOnboardingDone(session.user.id) || false,
                emailVerified: meta.custom_email_verified === true || !!session.user.email_confirmed_at,
                subscriptionTier: cachedTierForRefresh?.tier ?? "free",
                ...(cachedTierForRefresh ? {
                  subscriptionEnd: cachedTierForRefresh.subscriptionEnd,
                  practiceTimestamps: cachedTierForRefresh.practiceTimestamps || [],
                } : {}),
              };
            });
            // Best-effort row creation in the background.
            ensureProfile(session).catch(() => { /* expected on hang */ });
            // Retry with exponential backoff so a slow connection on login
            // eventually hydrates the full profile (name, role, tier).
            retryProfileInBackground(session);
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

    // Password policy enforcement.
    //
    // This catches every signup that flows through our app (whether
    // from the form, the autofill path, or a programmatic in-tab
    // call). It does NOT catch a curl that hits Supabase directly with
    // the project URL + anon key — that's a Supabase project-level
    // concern. To close that surface, also configure password policy
    // in the Supabase Auth settings (Dashboard > Authentication >
    // Settings > Auth > Password requirements). Both layers should
    // agree: ≥8 chars, ≥1 uppercase, ≥1 digit, ≥1 symbol, ≤128 chars.
    //
    // Server-handlers/_disposable-emails.ts enforces the same password
    // rules via validatePasswordServer() for any future endpoint that
    // accepts a password — keep the rules in sync if you tighten one.
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
        body: JSON.stringify({ action: "check", email: email.toLowerCase().trim(), intent: "signup" }),
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
        // OWASP-aligned UX even when Supabase returns an explicit
        // "already registered" error (instead of the fake-success
        // path we handle below). Fire the "you already have an
        // account" email and return success — UI then shows the
        // same "Check your email" state regardless of whether the
        // account is new, existing-verified, or existing-pending-
        // verification. User never reads "couldn't complete signup".
        const lower = (error.message || "").toLowerCase();
        const isAlreadyRegistered =
          lower.includes("already registered") ||
          lower.includes("already exists") ||
          lower.includes("user already");
        if (isAlreadyRegistered) {
          fetch("/api/send-welcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "signup-attempted-existing",
              email: email.toLowerCase().trim(),
              name,
            }),
          }).catch(() => {});
          track("signup_attempted_existing");
          return { success: true };
        }
        return { success: false, error: error.message };
      }

      // Detect existing-email signups across Supabase's response shapes:
      //
      //   1. OWASP enumeration protection ON (default): data.user is
      //      returned with `identities: []` — empty array. We fall
      //      through to the existing-account email.
      //   2. Newer Supabase configs / "Confirm email" enabled but
      //      enumeration protection lax: data.user is returned with the
      //      REAL user record (populated identities). For an already-
      //      VERIFIED email, email_confirmed_at is a non-null timestamp.
      //      For an existing-but-UNVERIFIED email, identities are
      //      populated AND email_confirmed_at is null — indistinguishable
      //      from a fresh signup based on those fields alone. The tell
      //      is data.user.created_at: a fresh signup has it within a few
      //      seconds of "now"; an existing user's is older.
      //   3. Enumeration protection OFF entirely: Supabase returns an
      //      explicit "already registered" error — handled in the
      //      `if (error)` block above.
      //
      // Hitting any path funnels into the same "Check your email" UX so
      // legit users never read "couldn't complete signup", and we never
      // double-fire a verification email at someone whose account already
      // exists (verified or not).
      const userObj = data?.user as
        | (typeof data.user & {
            email_confirmed_at?: string | null;
            created_at?: string | null;
          })
        | undefined;
      const createdAtMs = userObj?.created_at
        ? new Date(userObj.created_at).getTime()
        : NaN;
      const looksOlderThanFreshSignup =
        Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 5_000;

      // Confirm-email startup probe (#33 from the audit).
      //
      // If Supabase's "Confirm email" project setting is OFF, every
      // new signup comes back with email_confirmed_at IMMEDIATELY
      // set — bypassing our verification flow entirely. Without this
      // detection we'd misclassify the new user as "existing" (they
      // hit the email_confirmed_at branch below) and silently route
      // them through the "you already have an account" mail.
      //
      // The reliable distinguisher: created_at is fresh (<5s) AND
      // identities is populated AND email_confirmed_at is set. That
      // can only happen if Supabase auto-confirmed.
      //
      // When detected:
      //   • Log CRITICAL so monitoring catches the misconfig
      //   • Treat the user as a successfully-signed-up new user (the
      //     verification email is moot — they're already confirmed)
      //   • Do NOT route through the existing-account email path
      const isFreshSignup =
        Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= 5_000;
      const looksAutoConfirmed =
        isFreshSignup &&
        !!userObj?.email_confirmed_at &&
        !!userObj?.identities &&
        userObj.identities.length > 0;
      if (looksAutoConfirmed) {
        console.error(
          "[CRITICAL] Supabase auto-confirm appears enabled — new signup " +
          "arrived with email_confirmed_at already set. Verification flow " +
          "is bypassed. Toggle 'Confirm email' ON in Supabase Auth settings.",
        );
        track("supabase_autoconfirm_detected");
      }

      const isExistingEmail =
        !!userObj &&
        !looksAutoConfirmed &&
        (!userObj.identities ||
          userObj.identities.length === 0 ||
          !!userObj.email_confirmed_at ||
          looksOlderThanFreshSignup);
      if (isExistingEmail) {
        // Fire-and-forget — non-blocking. Server routes to the
        // "existing-account" template via the action flag.
        fetch("/api/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "signup-attempted-existing",
            email: email.toLowerCase().trim(),
            name,
          }),
        }).catch(() => {});
        track("signup_attempted_existing");
        // Return success to client — the UI shows the same "Check your
        // email" screen, the user gets either a verification email (new
        // account) or a "you already have an account, sign in here"
        // email (existing account). Either way, attacker can't tell.
        return { success: true };
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

      // Sign out so user must verify email before using the app
      await client.auth.signOut();
      setUser(null);

      track("signup_completed", { method: "email" });
      if (userId) {
        identifyClient(userId, { email, name, signup_method: "email" });
        captureClientEvent("user_signed_up", { method: "email" });
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
    // Constant-time response — Supabase fails fast (~50ms) for unknown
    // emails and slow (~200ms with bcrypt) for known emails with wrong
    // passwords. Pad the response to a fixed minimum so an attacker
    // can't enumerate valid accounts via timing alone.
    const LOGIN_TIMING_FLOOR_MS = 600;
    const t0 = Date.now();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    const elapsed = Date.now() - t0;
    if (elapsed < LOGIN_TIMING_FLOOR_MS) {
      await new Promise((r) =>
        setTimeout(r, LOGIN_TIMING_FLOOR_MS - elapsed),
      );
    }
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
      } catch {
        // H-7: fail report threw (network error / blocked request). The server
        // counter didn't increment. Apply client-side lockout immediately when
        // at the threshold so a blocked fail-report can't enable unlimited attempts.
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          setLockout();
          logAuditEvent("login_locked", { email, attempts });
          track("login_locked", { attempts });
          return { success: false, error: "Too many failed attempts. Please try again in 5 minutes." };
        }
      }

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

    /* Email-verification gate.
       User reported: signed up → received verification email → clicked
       link → tried to log in → "Your email isn't verified yet."
       Root cause: the gate only accepted user_metadata.custom_email_verified
       (set by /api/verify-email when our HMAC-token email is clicked).
       But Supabase's own auth flow ALSO sends a confirmation email
       when "Confirm email" is enabled in the project settings — and
       when a user clicks THAT link, only Supabase's native
       email_confirmed_at gets set; our custom_email_verified flag is
       never touched. The gate then blocked a legitimately-verified
       user.
       Fix: accept either signal as proof of verification. If only
       email_confirmed_at is present (user clicked Supabase's link),
       opportunistically backfill custom_email_verified=true so future
       logins are fast and any code reading the custom flag still
       works. */
    const isGoogle = data?.user?.app_metadata?.provider === "google" || data?.user?.app_metadata?.providers?.includes("google");
    const customVerifiedLogin = data?.user?.user_metadata?.custom_email_verified === true;
    const supabaseConfirmed = !!data?.user?.email_confirmed_at;
    const isVerified = isGoogle || customVerifiedLogin || supabaseConfirmed;
    if (data?.user && !isVerified) {
      // Sign out immediately — user should not have a session
      await client.auth.signOut();
      setUser(null);
      return { success: false, error: "Email not confirmed" };
    }
    // Opportunistic backfill: if Supabase's native flow verified the
    // email but our custom flag is missing, write it now. Fire-and-
    // forget — failure is non-fatal; the gate above already accepted
    // them on the email_confirmed_at signal.
    if (data?.user && supabaseConfirmed && !customVerifiedLogin && !isGoogle) {
      client.auth.updateUser({ data: { custom_email_verified: true } })
        .catch((err) => console.warn("[auth] backfill custom_email_verified failed:", err?.message));
    }

    // Successful login — clear lockout counter (client + server)
    clearLoginLockout();

    // ─── Single-device enforcement — token rotation (BEFORE the optimistic setUser) ───
    // setUser() below flips isLoggedIn, and the Login screen's effect immediately
    // router.replace()s into the (app) route group — which UNMOUNTS this (auth)
    // provider and MOUNTS a fresh (app) provider whose restore-path device check
    // runs at once. The new token and the grace window must therefore be persisted
    // FIRST: both live in localStorage (storeDeviceToken / markDeviceGrace), which
    // the remounted provider reads. The server write + refreshSession happen just
    // below and bring the JWT into agreement. (This ordering is the core fix for
    // the post-login self-eviction.)
    const existingServerToken = data?.user?.user_metadata?.active_device_token;
    const deviceToken = generateDeviceToken();
    storeDeviceToken(deviceToken);
    markDeviceGrace(DEVICE_GRACE_MS);

    // Optimistically set the user NOW so isLoggedIn flips in this tab and
    // the Login screen's redirect effect fires immediately. Previously
    // login() relied entirely on the async onAuthStateChange(SIGNED_IN)
    // handler to set the user — but that handler runs a up-to-5s getProfile
    // and is subject to the initial-session dedup guard, so on a fresh login
    // page it could be dropped/delayed. Result: the session was created
    // (a manual refresh landed on the dashboard) but the tab never
    // navigated. We build the user from the JWT here (same shape as the
    // getProfile-timeout fallback paths); the SIGNED_IN/TOKEN_REFRESHED
    // handlers then enrich it with full profile data when they resolve.
    if (data?.user) {
      const meta = data.user.user_metadata || {};
      const cached = getCachedTier(data.user.id);
      setUser({
        id: data.user.id,
        name: meta.name || meta.full_name || "",
        email: data.user.email || email,
        targetRole: cached?.targetRole || "",
        resumeFileName: null,
        hasCompletedOnboarding:
          meta.has_completed_onboarding || getLocalOnboardingDone(data.user.id) || false,
        emailVerified: true, // already passed the verification gate above
        signedInVia: "email",
        // Always set subscriptionTier so tierKnown is true immediately after login —
        // prevents "Loading plan…" blocking the plan widget before SIGNED_IN/getProfile lands.
        subscriptionTier: cached?.tier ?? "free",
        ...(cached
          ? {
              subscriptionEnd: cached.subscriptionEnd,
              practiceTimestamps: cached.practiceTimestamps || [],
            }
          : {}),
      });
    }

    // Persist the rotated token to the server so any OTHER device holding the
    // old token is kicked on its next restore / 60s poll. We AWAIT updateUser so
    // the rest of the flow knows the server really has the new token (previously
    // fire-and-forget, which made the other-device kick-out unreliable).
    // Build / update recent_devices history (max 5 entries, newest first).
    // This is purely audit data for the Settings → Recent activity list;
    // single-device enforcement still uses active_device_token alone.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "";
    const prevDevices = (data?.user?.user_metadata?.recent_devices as Array<{ id: string; ua?: string; at?: number }> | undefined) || [];
    const filtered = prevDevices.filter((d) => d?.id && d.id !== deviceToken);
    const recentDevices = [
      { id: deviceToken, ua, at: Date.now() },
      ...filtered,
    ].slice(0, 5);
    try {
      await client.auth.updateUser({
        data: { active_device_token: deviceToken, recent_devices: recentDevices },
      });
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
    // Audit P0 #6: clear server-side `active_device_token` BEFORE
    // signOut so a stolen JWT from this device can't pass the
    // single-device check after we walk away. Race-conditioned with
    // signOut on purpose — if updateUser fails or times out, we
    // still proceed to signOut. Best-effort defense in depth on top
    // of the JWT revocation that signOut performs.
    if (supabaseConfigured) {
      try {
        const client = await getSupabase();
        await Promise.race([
          client.auth.updateUser({ data: { active_device_token: null } }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch { /* expected: token may already be invalid */ }
    }
    // Clear stored session tokens BEFORE signOut to prevent the routing guard
    // from re-restoring the session via hasStoredSession() retry logic
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) localStorage.removeItem(key);
      }
    } catch { /* expected */ }
    try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* expected */ }
    clearDeviceGrace();
    if (supabaseConfigured) { const client = await getSupabase(); await client.auth.signOut().catch(() => {}); }
    clearSessionStart();
    track("logout");
    clearLastRoute();
    broadcastLogout();
    /* User-reported "Logout got stuck": Nav.tsx, DashboardLayout, and
       DashboardSettings all call logout() without an await/redirect.
       Without navigation, the dashboard tree stays mounted with user=null
       and components that previously assumed a user (DashboardContext,
       OutcomePromptBanner fetch, saveRetryQueue) flap — surfacing as
       React error #418 + a stale "/api/user-outcome" 401/405 in the
       console. Force a hard navigation to / so the app remounts clean.
       Hard nav (not router.push) because we need every cached client-side
       module state cleared too. */
    if (typeof window !== "undefined") {
      try { window.location.assign("/"); } catch { /* SSR / sandbox */ }
    }
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
    if (updates.resumeVersionId !== undefined) payload.resume_version_id = updates.resumeVersionId || null;
    if (updates.preferredSessionLength !== undefined) payload.preferred_session_length = updates.preferredSessionLength;
    if (updates.interviewTypes !== undefined) payload.interview_types = updates.interviewTypes;
    if (updates.practiceTimestamps !== undefined) payload.practice_timestamps = updates.practiceTimestamps;
    if (updates.cancelAtPeriodEnd !== undefined) payload.cancel_at_period_end = updates.cancelAtPeriodEnd;
    if (updates.hasCompletedOnboarding !== undefined) payload.has_completed_onboarding = updates.hasCompletedOnboarding;
    if (updates.isDiscoverableToEmployers !== undefined) payload.is_discoverable_to_employers = updates.isDiscoverableToEmployers;

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

  // Save-retry queue: when the user is signed in, install the auto-drain
  // hooks that retry failed cloud-saves (transcripts that didn't make it
  // to Supabase due to flaky networks, fetch wrappers, etc.). The queue
  // persists in IndexedDB and survives across tabs / sessions, so a
  // session that "saved locally — will sync when online" will actually
  // sync on the next online event or 5-minute poll.
  useEffect(() => {
    if (!user?.id) return;
    let cleanup: (() => void) | null = null;
    void Promise.all([
      import("./saveRetryQueue"),
      import("./interviewAPI"),
    ]).then(([{ installAutoDrain }, { saveSessionResult }]) => {
      cleanup = installAutoDrain((payload, uid) =>
        saveSessionResult(payload, uid).then((r) => ({ cloudOk: r.cloudOk })),
      );
    }).catch(() => { /* IDB / module load unavailable — skip */ });
    return () => { cleanup?.(); };
  }, [user?.id]);

  // Inactivity timeout — auto-logout after configurable period of no user activity
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
    if (!user?.id || !supabaseConfigured) return;
    const SESSION_WARN_MS = 5 * 60 * 1000; // Warn 5 min before expiry

    const checkExpiry = async () => {
      try {
        const client = await getSupabase();
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;

        // ─── Single-device enforcement (periodic check) ───
        // Runs every 60s. If another device logged in since we last synced, THIS
        // tab's local token no longer matches the server's → we've been displaced.
        // Same two safeguards as the restore path: honour the durable grace window
        // (a login that just happened in another route group), and confirm against
        // authoritative server metadata via getUser() before the destructive
        // sign-out, so a stale cached JWT can never kick a legitimate session.
        const localDeviceToken = getStoredDeviceToken();
        const serverDeviceToken = session.user.user_metadata?.active_device_token as string | undefined;
        const periodicAction = decideDeviceAction({
          localToken: localDeviceToken,
          serverToken: serverDeviceToken,
          withinGrace: isWithinDeviceGrace(),
        });
        if (periodicAction === "adopt" && serverDeviceToken) {
          storeDeviceToken(serverDeviceToken);
        } else if (periodicAction === "evict") {
          // Defer the destructive signout if an interview is in progress —
          // mirrors the JWT-expiry branch below (_interviewRefcount guard). A
          // mid-negotiation eviction here would skip handleEnd, so no scored
          // report is generated, and the already-debited session credit is lost.
          // The device stays displaced; the next 60s tick evicts cleanly once
          // the interview ends. Real-time turns saved before this point survive.
          if (_interviewRefcount > 0) {
            console.warn("[auth] Displaced by another device during interview — deferring signout until session ends.");
            return;
          }
          const confirmed = await resolveDeviceWithServer(client, localDeviceToken);
          if (confirmed.action === "evict") {
            logAuditEvent("single_device_kicked", { userId: userRef.current?.id });
            setUser(null);
            await client.auth.signOut().catch(() => {});
            broadcastLogout();
            try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* expected */ }
            clearDeviceGrace();
            router.replace("/login?reason=device_evicted");
            return;
          }
          if (confirmed.action === "adopt" && confirmed.serverToken) {
            storeDeviceToken(confirmed.serverToken);
          }
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
          // Defer the destructive signout if an interview is in progress.
          // The 25-minute session's save-session POST would race a 401
          // and the user would lose the transcript to localStorage only.
          // We retry the refresh in 60s; if the interview finishes first,
          // the next tick signs them out cleanly.
          if (_interviewRefcount > 0) {
            console.warn("[auth] Session expired during interview — deferring signout until session ends.");
            setSessionExpiryWarning("Session needs to refresh after this interview ends.");
            return;
          }
          logAuditEvent("session_expired", { userId: userRef.current?.id });
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
  // Dep is user?.id, not the full user object. The full user object changes reference
  // on every setUser() call (fast-render → profile load → TOKEN_REFRESHED = 3+ calls
  // on page load), which would restart this effect each time and stack multiple 10s
  // timers — causing spurious getSession() calls and redundant refreshSession() calls
  // that can delay the plan widget from settling. userRef provides the current user.id
  // inside the effect without adding it as a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, broadcastLogout, broadcastSessionRefreshed]);

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    // Email enumeration defense: server returns 200 regardless of
    // whether the address is registered, so we don't surface a "no
    // account" branch here. The UI shows the same "Check your email"
    // confirmation either way. Probing /forgot-password to discover
    // accounts is a common reconnaissance step before credential
    // stuffing — closing the enumeration channel kills the recon.
    try {
      const res = await fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), action: "reset" }),
      });
      if (res.status === 429) return { success: false, error: "Too many reset requests. Please try again later." };
      // 4xx other than rate-limit shouldn't happen post-enumeration
      // fix; treat as transient failure rather than leaking specifics.
      if (!res.ok) return { success: false, error: "We couldn't send the reset email right now. Try again in a moment, or contact hello@hirestepx.com" };
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
          fontFamily: "'Satoshi', system-ui, sans-serif", fontSize: 13, color: "#E5A590",
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
          fontFamily: "'Satoshi', system-ui, sans-serif", fontSize: 13, color: "#C9A96E",
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
      const pendingNext = consumePendingNextTarget();
      router.replace(pendingNext || "/onboarding");
    }
  }, [isLoggedIn, loading, user, router, pathname]);

  if (loading || (!isLoggedIn && hasStoredSession())) return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: "100vh", background: tokens.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: tokens.copperWash, border: `1px solid ${tokens.copperMid}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, border: `2px solid ${tokens.copperBorder}`, borderTopColor: tokens.copper, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
      <span style={{ fontFamily: "'Satoshi', system-ui, sans-serif", fontSize: 13, color: tokens.inkSoft }}>Loading...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!isLoggedIn) return null;
  if (user && !user.hasCompletedOnboarding && !getLocalOnboardingDone(user.id) && !["/onboarding", "/interview", "/onboarding/complete"].includes(pathname) && !pathname.startsWith("/session/")) return null;

  return <>{children}</>;
}

/* Route guard for non-candidate surfaces (e.g. the employer console) — same
   login redirect as RequireAuth, but deliberately skips the emailVerified /
   hasCompletedOnboarding bounce, which is specific to the candidate
   onboarding funnel and doesn't apply here. */
export function RequireAuthOnly({ children }: { children: ReactNode }) {
  const { isLoggedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const retryCount = useRef(0);

  useEffect(() => {
    if (isLoggedIn) saveLastRoute(pathname);
  }, [isLoggedIn, pathname]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      if (hasStoredSession() && retryCount.current < 3) {
        const delay = 500 * Math.pow(2, retryCount.current);
        retryCount.current++;
        setTimeout(() => getSupabase().then(c => c.auth.getSession()), delay);
        return;
      }
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoggedIn, loading, router, pathname]);

  if (loading || (!isLoggedIn && hasStoredSession())) return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: "100vh", background: tokens.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: tokens.copperWash, border: `1px solid ${tokens.copperMid}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, border: `2px solid ${tokens.copperBorder}`, borderTopColor: tokens.copper, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
      <span style={{ fontFamily: "'Satoshi', system-ui, sans-serif", fontSize: 13, color: tokens.inkSoft }}>Loading...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!isLoggedIn) return null;

  return <>{children}</>;
}

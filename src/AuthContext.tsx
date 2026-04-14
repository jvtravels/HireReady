import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  signup: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
        if (new Date(profile.subscription_end) < new Date()) return "free";
      }
      return tier;
    })(),
    subscriptionStart: profile.subscription_start || undefined,
    subscriptionEnd: profile.subscription_end || undefined,
    cancelAtPeriodEnd: profile.cancel_at_period_end || false,
    referralCode: profile.referral_code || undefined,
    emailVerified: !!session.user.email_confirmed_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Always show loading when Supabase is configured — server validates session
  const [loading, setLoading] = useState(supabaseConfigured);

  // Clean up legacy localStorage cache from previous versions
  useEffect(() => {
    try { localStorage.removeItem("hirestepx_auth"); } catch { /* expected: localStorage may be unavailable */ }
  }, []);

  // "Remember me" — clear session on tab/browser close if ephemeral
  useEffect(() => {
    const handleUnload = () => {
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
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
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
        emailVerified: !!session.user.email_confirmed_at,
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
          // Capture Google provider token if present (after OAuth redirect)
          if (session.provider_token) {
            try { sessionStorage.setItem("hirestepx_google_token", session.provider_token); } catch { /* expected: sessionStorage may be unavailable */ }
          }
          try {
            const profile = await getProfile(session.user.id);
            if (profile) {
              setUser(profileToUser(profile, session));
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

      // Listen for auth state changes
      const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
        if (event === "INITIAL_SESSION") return;
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
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

  const signup = useCallback(async (email: string, name: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) {
      // localStorage fallback
      const newUser: User = { id: Date.now().toString(36), name, email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false, emailVerified: false };
      setUser(newUser);
      return { success: true };
    }
    const client = await getSupabase();
    const metadata: Record<string, string> = { name };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: metadata, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) return { success: false, error: error.message };

    // Send verification email via Resend API (fire-and-forget, don't block signup)
    const userId = data?.user?.id;
    try {
      fetch("/api/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, userId }),
      }).catch(() => { /* verification email is best-effort */ });
    } catch { /* verification email is best-effort */ }

    return { success: true };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) {
      const newUser: User = { id: Date.now().toString(36), name: email.split("@")[0], email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false, emailVerified: false };
      setUser(newUser);
      return { success: true };
    }
    const client = await getSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  const loginWithGoogle = useCallback(async (returnTo?: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) return { success: false, error: "Google login requires Supabase configuration" };
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
  }, []);

  const logout = useCallback(async () => {
    if (supabaseConfigured) { const client = await getSupabase(); await client.auth.signOut(); }
    setUser(null);
    clearLastRoute();
  }, []);

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

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) return { success: false, error: "Password reset requires Supabase configuration" };
    const client = await getSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, loading, login, signup, loginWithGoogle, logout, updateUser, resetPassword }}>
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
  const navigate = useNavigate();
  const location = useLocation();
  const retryCount = useRef(0);

  // Track the last authenticated route so users return where they left off
  useEffect(() => {
    if (isLoggedIn) {
      saveLastRoute(location.pathname);
    }
  }, [isLoggedIn, location.pathname]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      // If there's a stored session token, Supabase may still be restoring it.
      // Wait and retry before redirecting — don't log the user out prematurely.
      if (hasStoredSession() && retryCount.current < 3) {
        retryCount.current++;
        // Trigger a re-check by getting the session again
        getSupabase().then(c => c.auth.getSession());
        return;
      }
      navigate("/login", { replace: true, state: { from: location.pathname } });
    } else if (user && !user.hasCompletedOnboarding && !["/onboarding", "/interview", "/onboarding/complete"].includes(location.pathname) && !location.pathname.startsWith("/session/")) {
      navigate("/onboarding", { replace: true });
    }
  }, [isLoggedIn, loading, user, navigate, location.pathname]);

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
  if (user && !user.hasCompletedOnboarding && !["/onboarding", "/interview", "/onboarding/complete"].includes(location.pathname) && !location.pathname.startsWith("/session/")) return null;

  return <>{children}</>;
}

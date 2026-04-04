import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, supabaseConfigured, getProfile, upsertProfile, type Profile } from "./supabase";
import type { Session } from "@supabase/supabase-js";
import type { ParsedResume } from "./resumeParser";

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
  preferredSessionLength?: 10 | 15 | 25;
  interviewDate?: string;
  interviewFocus?: string[];
  sessionLength?: string;
  feedbackStyle?: string;
  interviewTypes?: string[];
  practiceTimestamps?: string[];
  resumeText?: string;
  resumeData?: ParsedResume;
  avatarUrl?: string;
  subscriptionTier?: "free" | "starter" | "pro" | "team";
  subscriptionStart?: string;
  subscriptionEnd?: string;
}

interface AuthContextType {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, name: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function profileToUser(profile: Profile, session: Session): User {
  return {
    id: profile.id,
    name: profile.name || session.user.user_metadata?.name || session.user.user_metadata?.full_name || "",
    email: profile.email || session.user.email || "",
    targetRole: profile.target_role || "",
    resumeFileName: profile.resume_file_name || null,
    hasCompletedOnboarding: !!(profile.target_role),
    targetCompany: profile.target_company || undefined,
    industry: profile.industry || undefined,
    learningStyle: (profile.learning_style as "direct" | "encouraging") || "direct",
    preferredSessionLength: (profile.preferred_session_length as 10 | 15 | 25) || undefined,
    interviewTypes: profile.interview_types || undefined,
    interviewDate: profile.interview_date || undefined,
    practiceTimestamps: profile.practice_timestamps || [],
    resumeText: profile.resume_text || undefined,
    resumeData: (profile.resume_data as unknown as ParsedResume) || undefined,
    avatarUrl: profile.avatar_url || undefined,
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
  };
}

/* ─── localStorage fallback (when Supabase not configured) ─── */
const AUTH_KEY = "hireready_auth";
function loadLocalUser(): User | null {
  try { const raw = localStorage.getItem(AUTH_KEY); if (raw) return JSON.parse(raw); } catch {} return null;
}
function saveLocalUser(user: User | null) {
  try { if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user)); else localStorage.removeItem(AUTH_KEY); } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(supabaseConfigured ? null : loadLocalUser);
  const [loading, setLoading] = useState(supabaseConfigured);

  // Listen for auth state changes (Supabase mode)
  useEffect(() => {
    if (!supabaseConfigured) return;

    // Helper: build a new user from session metadata and seed the profiles table
    async function ensureProfile(session: Session) {
      const meta = session.user.user_metadata || {};
      const newProfile: Partial<Profile> & { id: string } = {
        id: session.user.id,
        email: session.user.email || "",
        name: meta.name || meta.full_name || "",
        avatar_url: meta.avatar_url || meta.picture || "",
      };
      console.log("[auth] ensureProfile: creating profile for", session.user.id, session.user.email);
      const { error } = await upsertProfile(newProfile);
      if (error) {
        console.error("[auth] ensureProfile failed, trying insert:", error.message);
        // Fallback: try plain insert in case upsert has RLS issues
        const { error: insertErr } = await supabase
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
        avatarUrl: newProfile.avatar_url || undefined,
      };
      setUser(newUser);
    }

    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        console.log("[auth] session found for:", session.user.id, session.user.email);
        try {
          const profile = await getProfile(session.user.id);
          if (profile) {
            console.log("[auth] existing profile loaded");
            setUser(profileToUser(profile, session));
          } else {
            console.log("[auth] no profile found, creating...");
            await ensureProfile(session);
          }
        } catch (err) {
          console.error("[auth] getProfile threw:", err);
          await ensureProfile(session);
        }
      }
      setLoading(false);
    }).catch((err) => {
      console.error("[auth] getSession failed:", err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        await new Promise(r => setTimeout(r, 500));
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
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signup = useCallback(async (email: string, name: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) {
      // localStorage fallback
      const newUser: User = { id: Date.now().toString(36), name, email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false };
      setUser(newUser);
      saveLocalUser(newUser);
      return { success: true };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) {
      const existing = loadLocalUser();
      if (existing && existing.email === email) {
        setUser(existing);
      } else {
        const newUser: User = { id: Date.now().toString(36), name: email.split("@")[0], email, targetRole: "", resumeFileName: null, hasCompletedOnboarding: false };
        setUser(newUser);
        saveLocalUser(newUser);
      }
      return { success: true };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) return { success: false, error: "Google login requires Supabase configuration" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    saveLocalUser(null);
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    let currentId: string | null = null;
    setUser(prev => {
      if (!prev) return prev;
      currentId = prev.id;
      const next = { ...prev, ...updates };
      if (!supabaseConfigured) saveLocalUser(next);
      return next;
    });

    if (!supabaseConfigured) { console.log("[updateUser] skipped: supabase not configured"); return; }

    // Persist to Supabase — use ID captured from state setter to avoid stale closure
    if (!currentId) { console.warn("[updateUser] skipped: no user ID"); return; }

    const profileUpdates: Partial<Profile> & { id: string } = { id: currentId };
    if (updates.name !== undefined) profileUpdates.name = updates.name;
    if (updates.targetRole !== undefined) profileUpdates.target_role = updates.targetRole;
    if (updates.targetCompany !== undefined) profileUpdates.target_company = updates.targetCompany;
    if (updates.industry !== undefined) profileUpdates.industry = updates.industry;
    if (updates.interviewDate !== undefined) profileUpdates.interview_date = updates.interviewDate;
    if (updates.learningStyle !== undefined) profileUpdates.learning_style = updates.learningStyle;
    if (updates.resumeFileName !== undefined) profileUpdates.resume_file_name = updates.resumeFileName || "";
    if (updates.resumeText !== undefined) profileUpdates.resume_text = updates.resumeText || "";
    if (updates.resumeData !== undefined) profileUpdates.resume_data = (updates.resumeData as unknown as Record<string, unknown>) || null;
    if (updates.preferredSessionLength !== undefined) profileUpdates.preferred_session_length = updates.preferredSessionLength;
    if (updates.interviewTypes !== undefined) profileUpdates.interview_types = updates.interviewTypes;
    if (updates.practiceTimestamps !== undefined) profileUpdates.practice_timestamps = updates.practiceTimestamps;
    if (updates.avatarUrl !== undefined) profileUpdates.avatar_url = updates.avatarUrl;

    console.log("[updateUser] upserting profile:", currentId, Object.keys(profileUpdates));
    await upsertProfile(profileUpdates);
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseConfigured) return { success: false, error: "Password reset requires Supabase configuration" };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    } else if (user && !user.hasCompletedOnboarding && location.pathname !== "/onboarding") {
      navigate("/onboarding", { replace: true });
    }
  }, [isLoggedIn, loading, user, navigate, location.pathname]);

  if (loading) return null;
  if (!isLoggedIn) return null;
  if (user && !user.hasCompletedOnboarding && location.pathname !== "/onboarding") return null;

  return <>{children}</>;
}

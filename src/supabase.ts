import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Create client only if configured; otherwise create a dummy that won't crash
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

/* ─── Auth Token Helper ─── */

export async function getAuthToken(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/* ─── Database Types ─── */

export interface Profile {
  id: string;
  name: string;
  email: string;
  target_role: string;
  target_company: string;
  industry: string;
  interview_date: string;
  experience_level: string;
  learning_style: string;
  preferred_session_length: number;
  interview_types: string[];
  resume_file_name: string;
  resume_text: string;
  resume_data: Record<string, unknown> | null;
  practice_timestamps: string[];
  avatar_url: string;
  subscription_tier: "free" | "starter" | "pro" | "team";
  subscription_start: string | null;
  subscription_end: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  date: string;
  type: string;
  difficulty: string;
  focus: string;
  duration: number;
  score: number;
  questions: number;
  transcript: { speaker: string; text: string; time: string }[];
  ai_feedback: string;
  skill_scores: Record<string, number> | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  company: string;
  date: string;
  time: string;
  type: string;
  notes: string;
  created_at: string;
}

/* ─── Profile helpers ─── */

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[supabase] getProfile error:", error.message, error.code, "for user:", userId);
  }
  return data;
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }) {
  const { id, ...updates } = profile;
  // Use UPDATE for existing rows — upsert can be silently blocked by RLS
  const result = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id);
  if (result.error) {
    console.warn("[supabase] update failed, trying upsert:", result.error.message);
    // Fallback to upsert (for new rows)
    const upsertResult = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
    if (upsertResult.error) {
      console.error("[supabase] upsert also failed:", upsertResult.error.message, upsertResult.error.code);
    }
    return upsertResult;
  }
  return result;
}

/* ─── Session helpers ─── */

export async function saveSession(session: Omit<SessionRecord, "created_at">) {
  return supabase.from("sessions").insert(session);
}

export async function getUserSessions(userId: string): Promise<SessionRecord[]> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getSessionById(sessionId: string, userId: string): Promise<SessionRecord | null> {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/* ─── Feedback helpers ─── */

export interface FeedbackRecord {
  id: string;
  user_id: string;
  session_id: string;
  rating: "helpful" | "too_harsh" | "too_generous" | "inaccurate";
  comment: string;
  session_score: number;
  session_type: string;
  created_at: string;
}

export async function saveFeedback(feedback: Omit<FeedbackRecord, "created_at">) {
  if (!supabaseConfigured) return { error: null };
  return supabase.from("feedback").upsert(feedback, { onConflict: "id" });
}

export async function getSessionFeedback(sessionId: string, userId: string): Promise<FeedbackRecord | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase
    .from("feedback")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/* ─── Calendar helpers ─── */

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  return data || [];
}

export async function saveCalendarEvent(event: Omit<CalendarEvent, "created_at">) {
  return supabase.from("calendar_events").insert(event);
}

export async function deleteCalendarEvent(id: string, userId: string) {
  return supabase.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
}

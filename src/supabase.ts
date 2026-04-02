import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Create client only if configured; otherwise create a dummy that won't crash
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

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
  resume_file_name: string;
  resume_text: string;
  practice_timestamps: string[];
  avatar_url: string;
  subscription_tier: "free" | "pro" | "team";
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
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }) {
  return supabase.from("profiles").upsert(profile, { onConflict: "id" });
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
    .single();
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

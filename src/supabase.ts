import type { SupabaseClient } from "@supabase/supabase-js";
import { safeUUID } from "./utils";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Lazy-initialize the Supabase client so the SDK (~191KB) doesn't block
// the initial page load. The client is created on first access.
let _client: SupabaseClient | null = null;
let _clientPromise: Promise<SupabaseClient> | null = null;

async function initClient(): Promise<SupabaseClient> {
  if (_client) return _client;
  if (!_clientPromise) {
    _clientPromise = import("@supabase/supabase-js").then(({ createClient }) => {
      _client = supabaseConfigured
        ? createClient(supabaseUrl, supabaseAnonKey)
        : createClient("https://placeholder.supabase.co", "placeholder-key");
      return _client;
    });
  }
  return _clientPromise;
}

/** Get the Supabase client (initializes on first call) */
export async function getSupabase(): Promise<SupabaseClient> {
  return initClient();
}

// Eagerly start loading Supabase when AuthProvider mounts (called from AuthContext)
export function preloadSupabase() {
  initClient();
}

// Synchronous access for code that runs after init (backwards compat)
export function getSupabaseSync(): SupabaseClient {
  if (!_client) throw new Error("Supabase not initialized — call getSupabase() first");
  return _client;
}

/* ─── Auth Token Helper ─── */

export async function getAuthToken(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const client = await getSupabase();
  const { data: { session } } = await client.auth.getSession();
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
  cancel_at_period_end: boolean;
  subscription_paused: boolean;
  has_completed_onboarding: boolean;
  razorpay_payment_id: string | null;
  razorpay_subscription_id: string | null;
  referral_code: string | null;
  referred_by: string | null;
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
  job_description?: string | null;
  jd_analysis?: Record<string, unknown> | null;
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
  google_event_id?: string;
  created_at: string;
}

/* ─── Profile helpers ─── */

export async function getProfile(userId: string): Promise<Profile | null> {
  const client = await getSupabase();
  const { data, error } = await client
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
  const client = await getSupabase();
  const { id, ...updates } = profile;
  const result = await client
    .from("profiles")
    .update(updates)
    .eq("id", id);
  if (result.error) {
    // If the error is about a missing column, strip it and retry
    const missingCol = result.error.message.match(/Could not find the '(\w+)' column/)?.[1];
    if (missingCol && missingCol in updates) {
      console.warn(`[supabase] column '${missingCol}' missing, retrying without it`);
      const { [missingCol]: _removed, ...safeUpdates } = updates as Record<string, unknown>;
      if (Object.keys(safeUpdates).length > 0) {
        const retryResult = await client.from("profiles").update(safeUpdates).eq("id", id);
        if (retryResult.error) {
          const upsertResult = await client.from("profiles").upsert({ id, ...safeUpdates } as Record<string, unknown>, { onConflict: "id" });
          if (upsertResult.error) {
            console.error("[supabase] upsert also failed:", upsertResult.error.message, upsertResult.error.code);
          }
          return upsertResult;
        }
        return retryResult;
      }
      return { data: null, error: null }; // Nothing left to update
    }
    console.warn("[supabase] update failed, trying upsert:", result.error.message);
    const upsertResult = await client.from("profiles").upsert(profile, { onConflict: "id" });
    if (upsertResult.error) {
      console.error("[supabase] upsert also failed:", upsertResult.error.message, upsertResult.error.code);
    }
    return upsertResult;
  }
  return result;
}

/* ─── Session helpers ─── */

export async function saveSession(session: Omit<SessionRecord, "created_at">) {
  const client = await getSupabase();
  const result = await client.from("sessions").insert(session);
  if (result.error) throw new Error(result.error.message);
  return result;
}

/** Decrement session_credits by 1 if user has credits > 0 and is on free tier past the free limit */
export async function decrementSessionCredit(userId: string): Promise<boolean> {
  const client = await getSupabase();
  // Fetch current profile
  const { data: profile } = await client.from("profiles").select("session_credits, subscription_tier, subscription_end").eq("id", userId).maybeSingle();
  if (!profile) return false;
  // Only decrement for free-tier users with credits
  let tier = profile.subscription_tier || "free";
  if (tier !== "free" && profile.subscription_end && new Date(profile.subscription_end) < new Date()) tier = "free";
  if (tier !== "free") return false; // paid users don't use credits
  const credits = profile.session_credits || 0;
  if (credits <= 0) return false;
  // Decrement by 1
  const { error } = await client.from("profiles").update({ session_credits: credits - 1 }).eq("id", userId);
  if (error) { console.warn("[supabase] credit decrement failed:", error.message); return false; }
  return true;
}

export async function getUserSessions(userId: string): Promise<SessionRecord[]> {
  const client = await getSupabase();
  const { data } = await client
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getSessionById(sessionId: string, userId: string): Promise<SessionRecord | null> {
  const client = await getSupabase();
  const { data } = await client
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
  const client = await getSupabase();
  return client.from("feedback").upsert(feedback, { onConflict: "id" });
}

export async function getSessionFeedback(sessionId: string, userId: string): Promise<FeedbackRecord | null> {
  if (!supabaseConfigured) return null;
  const client = await getSupabase();
  const { data } = await client
    .from("feedback")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/* ─── Payment history helpers ─── */

export interface PaymentRecord {
  id: string;
  user_id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  plan: string;
  tier: string;
  amount: number;
  currency: string;
  status: string;
  subscription_start: string;
  subscription_end: string;
  created_at: string;
}

export async function getPaymentHistory(userId: string): Promise<PaymentRecord[]> {
  if (!supabaseConfigured) return [];
  const client = await getSupabase();
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("[supabase] getPaymentHistory error:", error.message);
    return [];
  }
  return (data || []) as PaymentRecord[];
}

/* ─── Calendar helpers ─── */

export async function getCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const client = await getSupabase();
  const { data } = await client
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  return data || [];
}

export async function saveCalendarEvent(event: Omit<CalendarEvent, "created_at">) {
  const client = await getSupabase();
  const result = await client.from("calendar_events").insert(event);

  // Push to Google Calendar if connected (best-effort, non-blocking)
  const googleToken = getGoogleProviderToken();
  if (googleToken && event.title && event.date) {
    pushEventToGoogleCalendar(googleToken, event).catch(() => {});
  }

  return result;
}

/** Push a HireStepX event to Google Calendar (two-way sync) */
async function pushEventToGoogleCalendar(
  token: string,
  event: { title: string; date: string; time?: string; notes?: string; company?: string },
): Promise<void> {
  const startDateTime = event.time
    ? `${event.date}T${event.time}:00`
    : `${event.date}T09:00:00`;
  const endDate = new Date(startDateTime);
  endDate.setHours(endDate.getHours() + 1);

  const calEvent = {
    summary: event.title + (event.company ? ` — ${event.company}` : ""),
    description: (event.notes || "") + "\n\nCreated by HireStepX",
    start: { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endDate.toISOString().replace("Z", ""), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(calEvent),
  });

  if (res.status === 401 || res.status === 403) {
    clearGoogleProviderToken();
  }
  if (!res.ok) {
    console.warn("[calendar] Failed to push event to Google Calendar:", res.status);
  }
}

export async function deleteCalendarEvent(id: string, userId: string) {
  const client = await getSupabase();
  return client.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
}

/* ─── Google Calendar Sync ─── */

export function getGoogleProviderToken(): string | null {
  try { return localStorage.getItem("hirestepx_google_token"); } catch { return null; }
}

export function clearGoogleProviderToken() {
  try { localStorage.removeItem("hirestepx_google_token"); } catch { /* expected: localStorage may be unavailable */ }
}

function extractCompany(summary: string): string {
  const withMatch = summary.match(/(?:interview|call|chat|screen)\s+(?:with|at)\s+(.+)/i);
  if (withMatch) return withMatch[1].trim();
  const prefixMatch = summary.match(/^(.+?)\s+(?:interview|call|chat|screen)/i);
  if (prefixMatch) return prefixMatch[1].trim();
  return "";
}

function detectInterviewType(summary: string, description: string): string {
  const text = `${summary} ${description}`.toLowerCase();
  if (text.includes("technical") || text.includes("coding")) return "Technical";
  if (text.includes("behavioral") || text.includes("culture")) return "Behavioral";
  if (text.includes("system design")) return "System Design";
  if (text.includes("case study")) return "Case Study";
  if (text.includes("phone screen")) return "Phone Screen";
  if (text.includes("final")) return "Final Round";
  return "Behavioral";
}

export async function fetchGoogleCalendarEvents(token: string): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const maxDate = new Date(Date.now() + 90 * 86400000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(maxDate)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=50`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearGoogleProviderToken();
      throw new Error("Calendar access not granted — please sign in with Google again");
    }
    throw new Error(`Google Calendar API error: ${res.status}`);
  }

  const data = await res.json();
  type GoogleCalendarItem = { id?: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string } };
  const items: GoogleCalendarItem[] = data.items || [];
  const interviewKeywords = /interview|round|screen|onsite|recruiter|hiring|placement|assessment|walkthrough/i;
  const filtered = items.filter(item => {
    const text = `${item.summary || ""} ${item.description || ""}`;
    return interviewKeywords.test(text);
  });

  return filtered.map(item => ({
    id: "",
    user_id: "",
    title: item.summary || "Interview",
    company: extractCompany(item.summary || ""),
    date: (item.start?.dateTime || item.start?.date || "").split("T")[0],
    time: item.start?.dateTime
      ? new Date(item.start.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "09:00",
    type: detectInterviewType(item.summary || "", item.description || ""),
    notes: item.description || "",
    google_event_id: item.id,
    created_at: "",
  }));
}

export async function syncGoogleEvents(userId: string): Promise<{ synced: number; error?: string }> {
  const token = getGoogleProviderToken();
  if (!token) return { synced: 0, error: "No Google token — please sign in with Google" };

  const googleEvents = await fetchGoogleCalendarEvents(token);
  if (googleEvents.length === 0) return { synced: 0 };

  const client = await getSupabase();

  const { data: existing } = await client
    .from("calendar_events")
    .select("google_event_id")
    .eq("user_id", userId)
    .not("google_event_id", "is", null);

  const existingIds = new Set((existing || []).map((e: { google_event_id: string | null }) => e.google_event_id));

  const newEvents = googleEvents
    .filter(e => e.google_event_id && !existingIds.has(e.google_event_id))
    .map(e => ({
      id: safeUUID(),
      user_id: userId,
      title: e.title,
      company: e.company,
      date: e.date,
      time: e.time,
      type: e.type,
      notes: e.notes,
      google_event_id: e.google_event_id,
    }));

  if (newEvents.length === 0) return { synced: 0 };

  const { error } = await client.from("calendar_events").insert(newEvents);
  if (error) return { synced: 0, error: error.message };

  return { synced: newEvents.length };
}

import { font } from "./tokens";

/* ─── Interview Events (Calendar Integration) ─── */
export interface InterviewEvent {
  id: string;
  title: string;
  company: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  notes: string;
  status: "upcoming" | "completed" | "cancelled";
  reminders: boolean;
}

export const EVENTS_KEY = "hirloop_events";

export function loadEvents(): InterviewEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveEvents(events: InterviewEvent[]) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch {}
}

export function generateEventId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function daysUntilEvent(date: string, time: string): number {
  const eventDate = new Date(`${date}T${time}`);
  return Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatEventDate(date: string): string {
  return new Date(date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatEventTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/* Generate .ics file content */
export function generateICS(event: InterviewEvent): string {
  const start = new Date(`${event.date}T${event.time}`);
  const end = new Date(start.getTime() + event.duration * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HireStepX//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${event.title} — ${event.company}`,
    `DESCRIPTION:Interview Type: ${event.type}\\n${event.notes ? "Notes: " + event.notes.replace(/\n/g, "\\n") : ""}`,
    `LOCATION:${event.location}`,
    `STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Interview in 30 minutes: ${event.title}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Interview tomorrow: ${event.title} at ${event.company}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/* Generate Google Calendar URL */
export function generateGoogleCalendarURL(event: InterviewEvent): string {
  const start = new Date(`${event.date}T${event.time}`);
  const end = new Date(start.getTime() + event.duration * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${event.title} — ${event.company}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Interview Type: ${event.type}\n${event.notes || ""}`,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export const interviewTypeOptions = ["Phone Screen", "Technical", "Behavioral", "System Design", "Culture Fit", "Final Round", "Other"];

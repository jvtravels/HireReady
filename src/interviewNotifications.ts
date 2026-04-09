/* ─── Interview Push Notifications ─── */
/* Schedules browser Notification API reminders for upcoming calendar events. */
/* No server push needed — runs client-side via setTimeout. */

export type CalendarEventLike = {
  id: string;
  title: string;
  company: string;
  date: string;
  time: string;
  type: string;
};

const STORAGE_KEY = "hirestepx_notif_pref";
const SCHEDULED_KEY = "hirestepx_notif_scheduled";
const REMINDER_MINUTES = 30;

/* ─── Permission ─── */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotifPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/* ─── User preference (opt-in toggle) ─── */

export function getNotifPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setNotifPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {}
  if (!enabled) {
    clearScheduledNotifs();
  }
}

/* ─── Scheduling ─── */

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getScheduledIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SCHEDULED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markScheduled(id: string): void {
  try {
    const ids = getScheduledIds();
    ids.add(id);
    sessionStorage.setItem(SCHEDULED_KEY, JSON.stringify([...ids]));
  } catch {}
}

function clearScheduledNotifs(): void {
  activeTimers.forEach((timer) => clearTimeout(timer));
  activeTimers.clear();
  try { sessionStorage.removeItem(SCHEDULED_KEY); } catch {}
}

/** Show a browser notification */
function showNotification(title: string, body: string, tag: string): void {
  if (Notification.permission !== "granted") return;

  // Use service worker notification if available (persists after tab close)
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: "/calendar" },
      });
    }).catch(() => {
      // Fallback to window Notification
      new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
    });
  } else {
    new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
  }
}

/**
 * Schedule notifications for upcoming calendar events.
 * Call this whenever calendar events load or update.
 */
export function scheduleEventNotifications(events: CalendarEventLike[]): void {
  if (!notificationsSupported() || !getNotifPreference()) return;
  if (Notification.permission !== "granted") return;

  const now = Date.now();
  const scheduled = getScheduledIds();

  for (const event of events) {
    if (scheduled.has(event.id) || activeTimers.has(event.id)) continue;

    // Parse event datetime
    const dateStr = event.time
      ? `${event.date}T${event.time}:00`
      : `${event.date}T09:00:00`;
    const eventTime = new Date(dateStr).getTime();
    if (isNaN(eventTime)) continue;

    const reminderTime = eventTime - REMINDER_MINUTES * 60_000;
    const delay = reminderTime - now;

    // Skip past events or events too far in the future (>24h)
    if (delay < 0 || delay > 24 * 60 * 60_000) continue;

    const timer = setTimeout(() => {
      const company = event.company ? ` at ${event.company}` : "";
      showNotification(
        `Interview in ${REMINDER_MINUTES} minutes`,
        `${event.title}${company} — ${event.type}`,
        `interview-${event.id}`,
      );
      activeTimers.delete(event.id);
    }, delay);

    activeTimers.set(event.id, timer);
    markScheduled(event.id);
  }
}

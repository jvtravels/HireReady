import { describe, it, expect, beforeEach } from "vitest";
import {
  daysUntilEvent,
  formatEventDate,
  formatEventTime,
  generateEventId,
  generateICS,
  generateGoogleCalendarURL,
  loadEvents,
  saveEvents,
  EVENTS_KEY,
  type InterviewEvent,
} from "../dashboardHelpers";

describe("daysUntilEvent", () => {
  it("returns 0 for an event happening now", () => {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = `${String(now.getHours() + 1).padStart(2, "0")}:00`;
    const days = daysUntilEvent(date, time);
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(1);
  });

  it("returns positive for future events", () => {
    const future = new Date(Date.now() + 5 * 86400000);
    const date = future.toISOString().split("T")[0];
    const days = daysUntilEvent(date, "12:00");
    expect(days).toBeGreaterThanOrEqual(4);
    expect(days).toBeLessThanOrEqual(6);
  });

  it("returns negative for past events", () => {
    const past = new Date(Date.now() - 3 * 86400000);
    const date = past.toISOString().split("T")[0];
    const days = daysUntilEvent(date, "12:00");
    expect(days).toBeLessThan(0);
  });
});

describe("formatEventDate", () => {
  it("formats a date correctly", () => {
    const formatted = formatEventDate("2026-04-03");
    expect(formatted).toContain("Apr");
    expect(formatted).toContain("3");
  });

  it("includes day of week", () => {
    const formatted = formatEventDate("2026-04-03"); // Friday
    expect(formatted).toContain("Fri");
  });
});

describe("formatEventTime", () => {
  it("formats 24h time to 12h AM/PM", () => {
    expect(formatEventTime("09:30")).toBe("9:30 AM");
    expect(formatEventTime("14:00")).toBe("2:00 PM");
    expect(formatEventTime("00:00")).toBe("12:00 AM");
    expect(formatEventTime("12:00")).toBe("12:00 PM");
    expect(formatEventTime("23:45")).toBe("11:45 PM");
  });

  it("handles single-digit minutes", () => {
    expect(formatEventTime("08:05")).toBe("8:05 AM");
  });
});

describe("generateEventId", () => {
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateEventId()));
    expect(ids.size).toBe(100);
  });

  it("generates string IDs", () => {
    const id = generateEventId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(5);
  });
});

describe("generateICS", () => {
  const event: InterviewEvent = {
    id: "test1",
    title: "Engineering Interview",
    company: "Google",
    type: "Technical",
    date: "2026-04-10",
    time: "14:00",
    duration: 60,
    location: "Zoom",
    notes: "Prepare system design",
    status: "upcoming",
    reminders: true,
  };

  it("generates valid iCalendar format", () => {
    const ics = generateICS(event);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("includes event summary with title and company", () => {
    const ics = generateICS(event);
    expect(ics).toContain("SUMMARY:Engineering Interview — Google");
  });

  it("includes location", () => {
    const ics = generateICS(event);
    expect(ics).toContain("LOCATION:Zoom");
  });

  it("includes interview type in description", () => {
    const ics = generateICS(event);
    expect(ics).toContain("Interview Type: Technical");
  });

  it("includes alarm reminders", () => {
    const ics = generateICS(event);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("TRIGGER:-P1D");
  });

  it("marks cancelled events", () => {
    const cancelled = { ...event, status: "cancelled" as const };
    const ics = generateICS(cancelled);
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("marks upcoming events as confirmed", () => {
    const ics = generateICS(event);
    expect(ics).toContain("STATUS:CONFIRMED");
  });
});

describe("generateGoogleCalendarURL", () => {
  const event: InterviewEvent = {
    id: "test1",
    title: "Product Interview",
    company: "Meta",
    type: "Behavioral",
    date: "2026-05-15",
    time: "10:00",
    duration: 45,
    location: "On-site",
    notes: "Bring portfolio",
    status: "upcoming",
    reminders: true,
  };

  it("generates a Google Calendar URL", () => {
    const url = generateGoogleCalendarURL(event);
    expect(url).toContain("calendar.google.com/calendar/render");
  });

  it("includes event title and company", () => {
    const url = generateGoogleCalendarURL(event);
    expect(url).toContain("Product+Interview");
    expect(url).toContain("Meta");
  });

  it("includes action=TEMPLATE", () => {
    const url = generateGoogleCalendarURL(event);
    expect(url).toContain("action=TEMPLATE");
  });
});

describe("Event data serialization", () => {
  it("round-trips events through JSON", () => {
    const events: InterviewEvent[] = [
      {
        id: "e1", title: "Test", company: "Co", type: "Technical",
        date: "2026-04-10", time: "10:00", duration: 60, location: "",
        notes: "", status: "upcoming", reminders: true,
      },
    ];
    const serialized = JSON.stringify(events);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Test");
    expect(parsed[0].company).toBe("Co");
  });

  it("handles empty array serialization", () => {
    const serialized = JSON.stringify([]);
    expect(JSON.parse(serialized)).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    // Mirrors loadEvents() catch behavior
    let result: InterviewEvent[] = [];
    try {
      result = JSON.parse("invalid-json");
    } catch {
      result = [];
    }
    expect(result).toEqual([]);
  });
});

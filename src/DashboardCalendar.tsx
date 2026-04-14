import { useState, useEffect, useMemo } from "react";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { getCalendarEvents, saveCalendarEvent, deleteCalendarEvent } from "./supabase";
import {
  type InterviewEvent, loadEvents, saveEvents, generateEventId,
  daysUntilEvent, formatEventDate, formatEventTime,
  generateICS, generateGoogleCalendarURL, interviewTypeOptions,
} from "./dashboardHelpers";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton, ProGate } from "./dashboardComponents";

/* ─── Mini Month Grid ─── */
function MonthGrid({ events, onDateClick }: { events: InterviewEvent[]; onDateClick: (date: string) => void }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const eventsByDate = useMemo(() => {
    const map = new Map<string, InterviewEvent[]>();
    events.forEach(ev => {
      const existing = map.get(ev.date) || [];
      existing.push(ev);
      map.set(ev.date, existing);
    });
    return map;
  }, [events]);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={prevMonth} aria-label="Previous month" style={{ background: "none", border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: c.stone, fontSize: 14 }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{monthLabel}</span>
        <button onClick={nextMonth} aria-label="Next month" style={{ background: "none", border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: c.stone, fontSize: 14 }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, padding: "4px 0", opacity: 0.6 }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsByDate.get(dateStr) || [];
          const hasEvent = dayEvents.length > 0;
          const isToday = dateStr === todayStr;
          const isPast = new Date(dateStr) < new Date(todayStr);
          return (
            <button key={dateStr} onClick={() => hasEvent && onDateClick(dateStr)} title={hasEvent ? `${dayEvents.length} interview${dayEvents.length > 1 ? "s" : ""}: ${dayEvents.map(e => e.title).join(", ")}` : undefined}
              style={{
                fontFamily: font.mono, fontSize: 12, fontWeight: isToday ? 700 : 400,
                color: isToday ? c.obsidian : hasEvent ? c.gilt : isPast ? c.stone : c.chalk,
                background: isToday ? c.gilt : hasEvent ? "rgba(212,179,127,0.08)" : "transparent",
                border: hasEvent && !isToday ? `1px solid rgba(212,179,127,0.2)` : "1px solid transparent",
                borderRadius: 8, padding: "6px 0", cursor: hasEvent ? "pointer" : "default",
                position: "relative", opacity: isPast && !hasEvent ? 0.4 : 1,
                transition: "all 0.15s ease",
              }}>
              {day}
              {hasEvent && !isToday && (
                <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span key={idx} style={{ width: 4, height: 4, borderRadius: "50%", background: c.gilt }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  useDocTitle("Calendar");
  const { handleStartSession: onStartSession, dataLoading, isFree, isStarter, setShowUpgradeModal, showToast, syncGoogleCalendar: _syncGoogleCalendar, googleSyncStatus: _googleSyncStatus, hasGoogleToken: _hasGoogleToken } = useDashboard();
  const { user, loginWithGoogle: _loginWithGoogle } = useAuth();
  const [events, setEvents] = useState<InterviewEvent[]>(loadEvents);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportTooltip, setExportTooltip] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formType, setFormType] = useState("Behavioral");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("10:00");
  const [formDuration, setFormDuration] = useState(60);
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formReminders, setFormReminders] = useState(true);
  const [formError, setFormError] = useState("");

  // Load from Supabase on mount and merge with localStorage
  // Must be before conditional returns to respect rules of hooks
  useEffect(() => {
    if (!user?.id) return;
    getCalendarEvents(user.id).then(dbEvents => {
      if (dbEvents.length === 0) return;
      const mapped = dbEvents.map(e => ({
        id: e.id, title: e.title, company: e.company,
        date: e.date, time: e.time, type: e.type,
        duration: 60, location: "", notes: e.notes,
        status: "upcoming" as const, reminders: true,
      }));
      setEvents(prev => {
        const dbIds = new Set(mapped.map(e => e.id));
        const localOnly = prev.filter(e => !dbIds.has(e.id));
        const merged = [...mapped, ...localOnly];
        saveEvents(merged);
        return merged;
      });
    }).catch(() => {});
  }, [user?.id]);

  const updateEvents = (next: InterviewEvent[]) => {
    setEvents(next);
    saveEvents(next);
  };

  if (dataLoading) return <DataLoadingSkeleton />;
  if (isFree || isStarter) return <ProGate feature="Interview Calendar" onUpgrade={() => setShowUpgradeModal(true)} />;

  const resetForm = () => {
    setFormTitle("");
    setFormCompany(user?.targetCompany || "");
    setFormType("Behavioral");
    setFormDate("");
    setFormTime("10:00");
    setFormDuration(60);
    setFormLocation("");
    setFormNotes("");
    setFormReminders(true);
    setEditingId(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormCompany(user?.targetCompany || "");
    setShowForm(true);
  };

  const openEditForm = (ev: InterviewEvent) => {
    setFormTitle(ev.title);
    setFormCompany(ev.company);
    setFormType(ev.type);
    setFormDate(ev.date);
    setFormTime(ev.time);
    setFormDuration(ev.duration);
    setFormLocation(ev.location);
    setFormNotes(ev.notes);
    setFormReminders(ev.reminders);
    setEditingId(ev.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formTitle || !formDate || !formTime) {
      setFormError(!formTitle ? "Event title is required." : !formDate ? "Date is required." : "Time is required.");
      return;
    }
    setFormError("");
    const ev: InterviewEvent = {
      id: editingId || generateEventId(),
      title: formTitle,
      company: formCompany,
      type: formType,
      date: formDate,
      time: formTime,
      duration: formDuration,
      location: formLocation,
      notes: formNotes,
      status: "upcoming",
      reminders: formReminders,
    };
    if (editingId) {
      updateEvents(events.map(e => e.id === editingId ? ev : e));
    } else {
      updateEvents([...events, ev]);
    }
    // Persist to Supabase
    if (user?.id) {
      saveCalendarEvent({
        id: ev.id, user_id: user.id, title: ev.title, company: ev.company,
        date: ev.date, time: ev.time, type: ev.type, notes: ev.notes,
      }).catch(() => { showToast("Saved locally — cloud sync failed"); });
    }
    setShowForm(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    updateEvents(events.filter(e => e.id !== id));
    if (user?.id) deleteCalendarEvent(id, user.id).catch(() => { showToast("Deleted locally — cloud sync failed"); });
  };

  const handleCancel = (id: string) => {
    updateEvents(events.map(e => e.id === id ? { ...e, status: "cancelled" as const } : e));
    if (user?.id) deleteCalendarEvent(id, user.id).catch(() => { showToast("Cancelled locally — cloud sync failed"); });
  };

  const handleExportICS = (ev: InterviewEvent) => {
    const ics = generateICS(ev);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.company.replace(/\s/g, "_")}_${ev.type.replace(/\s/g, "_")}_${ev.date}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setExportTooltip(ev.id);
    setTimeout(() => setExportTooltip(null), 2000);
  };

  const upcoming = events
    .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

  const past = events
    .filter(e => e.status === "completed" || (e.status === "upcoming" && daysUntilEvent(e.date, e.time) < 0))
    .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

  const cancelled = events.filter(e => e.status === "cancelled");

  const inputStyle = {
    width: "100%", padding: "10px 14px", fontFamily: font.ui, fontSize: 13,
    color: c.ivory, background: c.obsidian, border: `1px solid ${c.border}`,
    borderRadius: 8, outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Interview Calendar</h2>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>
            Track upcoming interviews and export to your calendar
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={openNewForm} style={{
            fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px",
            borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Interview
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "28px 32px", paddingBottom: 36, marginBottom: 24, animation: "slideDown 0.2s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h3 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory }}>{editingId ? "Edit Interview" : "Add New Interview"}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="cal-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label htmlFor="cal-title" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Interview Title *</label>
              <input id="cal-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Final Round Interview" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
            <div>
              <label htmlFor="cal-company" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Company *</label>
              <input id="cal-company" value={formCompany} onChange={(e) => setFormCompany(e.target.value)} placeholder="e.g. Google" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
          </div>

          <div className="cal-form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label htmlFor="cal-date" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Date *</label>
              <input id="cal-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label htmlFor="cal-time" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Time *</label>
              <input id="cal-time" type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div>
              <label htmlFor="cal-duration" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Duration</label>
              <select id="cal-duration" value={formDuration} onChange={(e) => setFormDuration(Number(e.target.value))} style={{ ...inputStyle, colorScheme: "dark" }}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          <div className="cal-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label htmlFor="cal-type" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Interview Type</label>
              <div id="cal-type" role="group" aria-label="Interview Type" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {interviewTypeOptions.map(t => (
                  <button key={t} onClick={() => setFormType(t)} style={{
                    fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "5px 12px",
                    borderRadius: 100, cursor: "pointer",
                    background: formType === t ? "rgba(212,179,127,0.1)" : "transparent",
                    border: `1px solid ${formType === t ? c.gilt : c.border}`,
                    color: formType === t ? c.gilt : c.stone,
                    transition: "all 0.2s ease",
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="cal-location" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Location / Link</label>
              <input id="cal-location" value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="Zoom link, Google Meet, or address" style={inputStyle}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cal-notes" style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, display: "block", marginBottom: 6 }}>Notes</label>
            <textarea id="cal-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Interviewer name, prep topics, things to remember..." rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt} onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <div role="switch" aria-checked={formReminders} tabIndex={0} onClick={() => setFormReminders(!formReminders)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFormReminders(!formReminders); } }} style={{
                width: 36, height: 20, borderRadius: 10, padding: 2,
                background: formReminders ? c.sage : c.border,
                transition: "background 0.2s", cursor: "pointer",
              }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.ivory, transform: formReminders ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Enable reminders (30 min & 1 day before)</span>
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowForm(false); resetForm(); }} style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone,
                background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8,
                padding: "10px 20px", cursor: "pointer",
              }}>Cancel</button>
              {formError && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>{formError}</span>}
              <button onClick={handleSave} disabled={!formTitle || !formDate || !formTime} style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 500,
                background: formTitle && formDate && formTime ? c.gilt : c.border,
                color: formTitle && formDate && formTime ? c.obsidian : c.stone,
                border: "none", borderRadius: 8, padding: "10px 24px", cursor: formTitle && formDate && formTime ? "pointer" : "not-allowed",
              }}>{editingId ? "Save Changes" : "Add Interview"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Month Grid */}
      <MonthGrid events={events} onDateClick={(date) => {
        const el = document.getElementById(`cal-event-${date}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }} />

      {/* Upcoming Interviews */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Upcoming ({upcoming.length})
        </h3>

        {upcoming.length === 0 ? (
          <div style={{ background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14, border: `1px solid ${c.border}`, padding: "40px 28px", textAlign: "center" }}>
            <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12, opacity: 0.4 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 8 }}>No upcoming interviews</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, opacity: 0.7, marginBottom: 16 }}>Add your interview schedule to get countdown reminders and prep suggestions.</p>
            <button onClick={openNewForm} style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.gilt,
              background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`,
              borderRadius: 10, padding: "8px 20px", cursor: "pointer",
            }}>Add Your First Interview</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {upcoming.map(ev => {
              const days = daysUntilEvent(ev.date, ev.time);
              const urgent = days <= 3;
              const isToday = days === 0;
              return (
                <div key={ev.id} id={`cal-event-${ev.date}`} style={{
                  background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)", backdropFilter: "blur(16px)", borderRadius: 14,
                  border: `1px solid ${urgent ? "rgba(196,112,90,0.2)" : c.border}`,
                  borderLeft: `4px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`,
                  padding: "20px 24px", transition: "border-color 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = urgent ? "rgba(196,112,90,0.35)" : c.borderHover}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = urgent ? "rgba(196,112,90,0.2)" : c.border}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <h4 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{ev.title}</h4>
                        <span style={{
                          fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 10px",
                          borderRadius: 100,
                          background: isToday ? "rgba(196,112,90,0.12)" : urgent ? "rgba(212,179,127,0.1)" : "rgba(122,158,126,0.08)",
                          color: isToday ? c.ember : urgent ? c.gilt : c.sage,
                          border: `1px solid ${isToday ? "rgba(196,112,90,0.2)" : urgent ? "rgba(212,179,127,0.15)" : "rgba(122,158,126,0.15)"}`,
                        }}>
                          {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days} days`}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 2v4M8 2v4M2 10h20"/></svg>
                          {formatEventDate(ev.date)}
                        </span>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {formatEventTime(ev.time)} · {ev.duration} min
                        </span>
                        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {ev.company}
                        </span>
                        <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "rgba(212,179,127,0.06)", color: c.gilt, border: `1px solid rgba(212,179,127,0.1)` }}>
                          {ev.type}
                        </span>
                      </div>
                      {ev.location && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          {ev.location}
                        </p>
                      )}
                      {ev.notes && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4, fontStyle: "italic", wordBreak: "break-word", overflow: "hidden" }}>{ev.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
                    <button onClick={() => onStartSession()} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.obsidian,
                      background: c.gilt, border: "none", borderRadius: 10, padding: "7px 16px",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/></svg>
                      Practice {ev.type}
                    </button>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => handleExportICS(ev)} style={{
                        fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
                        background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, borderRadius: 10,
                        padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Export .ics
                      </button>
                      {exportTooltip === ev.id && (
                        <div style={{ position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)", background: c.sage, color: c.obsidian, fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>Downloaded!</div>
                      )}
                    </div>
                    <a href={generateGoogleCalendarURL(ev)} target="_blank" rel="noopener noreferrer" style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
                      background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, borderRadius: 10,
                      padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                      textDecoration: "none",
                    }}>
                      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Google Calendar
                    </a>
                    <button onClick={() => openEditForm(ev)} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                      background: "transparent", border: `1px solid ${c.border}`, borderRadius: 10,
                      padding: "7px 14px", cursor: "pointer",
                    }}>Edit</button>
                    <button onClick={() => handleCancel(ev.id)} style={{
                      fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.ember,
                      background: "transparent", border: `1px solid rgba(196,112,90,0.15)`, borderRadius: 10,
                      padding: "7px 14px", cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Interviews */}
      {past.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.stone, marginBottom: 12 }}>Past ({past.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map(ev => (
              <div key={ev.id} style={{ background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: "14px 20px", opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk }}>{ev.title}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: 12 }}>{ev.company} · {formatEventDate(ev.date)} · {ev.type}</span>
                </div>
                <button onClick={() => handleDelete(ev.id)} style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <div>
          <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.stone, marginBottom: 12, opacity: 0.6 }}>Cancelled ({cancelled.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cancelled.map(ev => (
              <div key={ev.id} style={{ background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: "14px 20px", opacity: 0.4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, textDecoration: "line-through" }}>{ev.title}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: 12 }}>{ev.company} · {formatEventDate(ev.date)}</span>
                </div>
                <button onClick={() => handleDelete(ev.id)} style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "none", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { scoreLabelColor } from "./dashboardTypes";
import type { DashboardSession } from "./dashboardTypes";

interface Command {
  id: string;
  label: string;
  section: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string;
  meta?: string;
  metaColor?: string;
}

export default function CommandPalette({ onStartSession, onExport, sessions = [] }: { onStartSession: () => void; onExport: () => void; sessions?: DashboardSession[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const sessionIcon = <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>;

  const commands: Command[] = useMemo(() => {
    const base: Command[] = [
      { id: "new-session", label: "New Session", section: "Actions", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>, action: onStartSession, keywords: "start practice interview" },
      { id: "export", label: "Share Progress", section: "Actions", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, action: onExport, keywords: "share copy clipboard" },
      { id: "nav-dashboard", label: "Go to Dashboard", section: "Navigation", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>, action: () => nav("/dashboard"), keywords: "home overview" },
      { id: "nav-sessions", label: "Go to Sessions", section: "Navigation", icon: sessionIcon, action: () => nav("/sessions"), keywords: "history list" },
      { id: "nav-calendar", label: "Go to Calendar", section: "Navigation", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, action: () => nav("/calendar"), keywords: "schedule interviews dates" },
      { id: "nav-analytics", label: "Go to Analytics", section: "Navigation", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, action: () => nav("/analytics"), keywords: "stats performance trends chart" },
      { id: "nav-resume", label: "Go to Resume", section: "Navigation", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>, action: () => nav("/resume"), keywords: "cv upload profile" },
      { id: "nav-settings", label: "Go to Settings", section: "Navigation", icon: <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, action: () => nav("/settings"), keywords: "preferences account profile" },
    ];

    // Add recent sessions as searchable items
    const sessionCmds: Command[] = sessions.slice(0, 10).map(s => ({
      id: `session-${s.id}`,
      label: `${s.type} — ${s.dateLabel}`,
      section: "Sessions",
      icon: sessionIcon,
      action: () => nav(`/session/${s.id}`),
      keywords: `${s.topStrength} ${s.topWeakness} ${s.role} ${s.score}`,
      meta: `${s.score}`,
      metaColor: scoreLabelColor(s.score),
    }));

    return [...base, ...sessionCmds];
  }, [nav, onStartSession, onExport, sessions]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      (cmd.keywords || "").toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close palette on window resize to avoid position issues
  useEffect(() => {
    if (!open) return;
    const handleResize = () => setOpen(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  const run = (cmd: Command) => {
    setOpen(false);
    cmd.action();
  };

  const handleInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && filtered[selected]) { run(filtered[selected]); }
  };

  if (!open) return null;

  const sections = [...new Set(filtered.map(c => c.section))];

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismissal */}
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dialog needs keyboard trap for accessibility */}
      <div role="dialog" aria-modal="true" aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const container = e.currentTarget;
          const focusable = container.querySelectorAll<HTMLElement>("input, button, [tabindex]");
          if (focusable.length === 0) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
        style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480, background: c.graphite, border: `1px solid ${c.borderHover}`,
        borderRadius: 14, boxShadow: "0 16px 64px rgba(0,0,0,0.5)", zIndex: 201,
        overflow: "hidden", animation: "dashPageEnter 0.15s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${c.border}` }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleInputKey}
            placeholder="Search commands, pages, sessions..."
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontFamily: font.ui, fontSize: 15, color: c.ivory }}
          />
          <kbd style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 6px" }}>esc</kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 && (
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, textAlign: "center", padding: "24px 0" }}>No results found</p>
          )}
          {sections.map(section => {
            const items = filtered.filter(c => c.section === section);
            const globalIdx = filtered.indexOf(items[0]);
            return (
              <div key={section}>
                <div style={{ padding: "8px 18px 4px", fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{section}</div>
                {items.map((cmd, i) => {
                  const idx = globalIdx + i;
                  return (
                    <button key={cmd.id} onClick={() => run(cmd)} onMouseEnter={() => setSelected(idx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px",
                        fontFamily: font.ui, fontSize: 14, color: selected === idx ? c.ivory : c.chalk,
                        background: selected === idx ? "rgba(212,179,127,0.08)" : "transparent",
                        border: "none", cursor: "pointer", transition: "background 0.1s", textAlign: "left",
                      }}>
                      <span style={{ opacity: 0.5 }}>{cmd.icon}</span>
                      <span style={{ flex: 1 }}>{cmd.label}</span>
                      {cmd.meta && (
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: cmd.metaColor || c.stone }}>{cmd.meta}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${c.border}`, display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
            <kbd style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd> navigate
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
            <kbd style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, borderRadius: 3, padding: "1px 4px" }}>↵</kbd> select
          </span>
        </div>
      </div>
    </>
  );
}

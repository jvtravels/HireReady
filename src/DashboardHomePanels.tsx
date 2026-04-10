import React, { useState, useEffect } from "react";
import { c, font, sp, radius } from "./tokens";
import { scoreLabel, scoreLabelColor } from "./dashboardTypes";
import { daysUntilEvent, formatEventDate, formatEventTime } from "./dashboardHelpers";
import { SectionErrorBoundary } from "./ErrorBoundary";
import { ScoreTrendChart, SkillRadar } from "./DashboardCharts";

/* ═══════════════════════════════════════════════
   Extracted presentational components from DashboardHome.tsx
   ═══════════════════════════════════════════════ */

/* ─── Shared card style (re-exported) ─── */
export const card = {
  background: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
  position: "relative" as const,
} as const;

/* ─── Section heading (serif) ─── */
export const sectionTitle = (text: string, size = 18, tag: "h2" | "h3" = "h3") => {
  const Tag = tag;
  return <Tag style={{ fontFamily: font.display, fontSize: size, fontWeight: 400, color: c.ivory, letterSpacing: "0.01em", margin: 0 }}>{text}</Tag>;
};

/* ─── Badge icon SVGs ─── */
export const badgeIcons: Record<string, (color: string) => React.ReactNode> = {
  target: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  layers: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  award: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  star: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  flame: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  compass: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
  gem: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="22" x2="8" y2="9"/><line x1="12" y1="22" x2="16" y2="9"/><line x1="6" y1="3" x2="8" y2="9"/><line x1="18" y1="3" x2="16" y2="9"/></svg>,
  crown: (color) => <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z"/><path d="M3 20h18"/></svg>,
};

/* ─── Relative time formatter ─── */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Animated counter for stats ─── */
export function CountUp({ value, suffix = "" }: { value: string; suffix?: string }) {
  const num = parseInt(value, 10);
  const [display, setDisplay] = useState(0);
  const isNum = !isNaN(num) && num > 0;
  useEffect(() => {
    if (!isNum) return;
    let start = 0;
    const duration = 600;
    const step = Math.ceil(num / (duration / 16));
    const id = setInterval(() => {
      start = Math.min(start + step, num);
      setDisplay(start);
      if (start >= num) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [num, isNum]);
  if (!isNum) return <>{value}</>;
  return <>{display}{suffix}</>;
}

/* ─── Draft Banner ─── */

export interface DraftBannerProps {
  type: string;
  savedAt: number;
  onResume: () => void;
  onDismiss: () => void;
}

export function DraftBanner({ type, savedAt, onResume, onDismiss }: DraftBannerProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: radius.md, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.15)`, marginBottom: sp.xl, flexWrap: "wrap" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,179,127,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 2 }}>You have an unfinished interview</span>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{type.charAt(0).toUpperCase() + type.slice(1)} · saved {relativeTime(new Date(savedAt).toISOString())}</span>
      </div>
      <button onClick={onResume}
        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer", whiteSpace: "nowrap", transition: "filter 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}>
        Resume
      </button>
      <button onClick={onDismiss} aria-label="Dismiss draft" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4 }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

/* ─── Notifications List ─── */

export interface Notification {
  id: string;
  type: string;
  text: string;
  action?: string;
  dismissible?: boolean;
}

export interface NotificationsProps {
  notifications: Notification[];
  onAction: (action: string) => void;
  onDismiss: (id: string) => void;
}

export function NotificationsList({ notifications, onAction, onDismiss }: NotificationsProps) {
  if (notifications.length === 0) return null;
  return (
    <div role="region" aria-label="Notifications" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: sp.xl }}>
      {notifications.map((notif) => (
        <div key={notif.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md, background: notif.type === "streak" ? "rgba(196,112,90,0.04)" : "rgba(122,158,126,0.04)", borderLeft: `3px solid ${notif.type === "streak" ? c.ember : c.sage}`, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", transition: "background 0.2s ease" }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={notif.type === "streak" ? c.ember : c.sage} strokeWidth="2" strokeLinecap="round">
            {notif.type === "streak" ? <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
          </svg>
          <span style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, flex: 1, lineHeight: 1.5 }}>{notif.text}</span>
          {notif.action && (
            <button onClick={() => onAction(notif.action!)} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.2)`, borderRadius: 10, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(122,158,126,0.08)"; }}
            >{notif.action}</button>
          )}
          {notif.dismissible && (
            <button onClick={() => onDismiss(notif.id)} aria-label="Dismiss" style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4, flexShrink: 0 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Practice Reminder ─── */

export function PracticeReminderBanner({ text, onStart }: { text: string; onStart: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderRadius: radius.md, background: "rgba(212,179,127,0.03)", borderLeft: `3px solid ${c.gilt}`, marginBottom: sp.xl }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, flex: 1, lineHeight: 1.5 }}>{text}</span>
      <button onClick={onStart} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 10, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; }}
      >Practice Now</button>
    </div>
  );
}

/* ─── Daily Challenge Banner ─── */

export interface DailyChallenge {
  label: string;
  description: string;
  type: string;
  focus?: string;
  difficulty: string;
  completed: boolean;
}

export function DailyChallengeBanner({ challenge, onNavigate }: { challenge: DailyChallenge; onNavigate: (path: string) => void }) {
  const path = `/session/new?type=${challenge.type}${challenge.focus ? `&focus=${challenge.focus}` : ""}`;
  return (
    <div role="button" tabIndex={0} aria-label={`Daily Challenge: ${challenge.label}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(path); } }}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: radius.md, background: "rgba(212,179,127,0.03)", border: "1px solid rgba(212,179,127,0.08)", marginBottom: sp.xl, cursor: "pointer", transition: "all 0.2s ease" }}
      onClick={() => onNavigate(path)}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.06)"; e.currentTarget.style.borderColor = "rgba(212,179,127,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.03)"; e.currentTarget.style.borderColor = "rgba(212,179,127,0.08)"; }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
      <div style={{ flex: 1 }}>
        <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Daily Challenge: {challenge.label}</span>
        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginLeft: 8 }}>{challenge.description}</span>
      </div>
      <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: radius.pill, background: challenge.difficulty === "hard" ? "rgba(196,112,90,0.08)" : "rgba(212,179,127,0.08)", color: challenge.difficulty === "hard" ? c.ember : c.gilt, textTransform: "uppercase" as const, flexShrink: 0 }}>{challenge.difficulty}</span>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  );
}

/* ─── Stats Grid ─── */

export interface StatItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub: string;
  subColor: string;
  tip: string;
}

export function StatsGrid({ stats, isMobile }: { stats: StatItem[]; isMobile: boolean }) {
  return (
    <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: sp.lg, marginBottom: sp["3xl"] }}>
      {stats.map((stat, i) => (
        <div key={i} title={stat.tip} style={{ ...card, padding: "24px", cursor: "default" }} className="gradient-border-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{stat.label}</span>
            <div style={{ opacity: 0.7 }}>{stat.icon}</div>
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 30, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 4, letterSpacing: "-0.03em" }}>
            <CountUp value={stat.value.replace(/[^0-9]/g, "")} suffix={stat.value.replace(/[0-9]/g, "")} />
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: stat.subColor, fontWeight: stat.subColor !== c.stone ? 600 : 400 }}>{stat.sub}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Upcoming Interviews ─── */

export interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  company: string;
  type: string;
  status: string;
}

export function UpcomingInterviews({ events, isMobile, onNavigate }: { events: CalendarEvent[]; isMobile: boolean; onNavigate: (path: string) => void }) {
  const upcomingEvents = events
    .filter(e => e.status === "upcoming" && daysUntilEvent(e.date, e.time) >= 0)
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
    .slice(0, 3);
  if (upcomingEvents.length === 0) return null;
  return (
    <div style={{ ...card, padding: "24px 28px", marginBottom: sp["3xl"] }} className="gradient-border-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        {sectionTitle("Upcoming Interviews", 18)}
        <button onClick={() => onNavigate("/calendar")} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>View all</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(upcomingEvents.length, 3)}, 1fr)`, gap: 12 }}>
        {upcomingEvents.map(ev => {
          const days = daysUntilEvent(ev.date, ev.time);
          const urgent = days <= 3;
          const isToday = days === 0;
          return (
            <div key={ev.id} role="button" tabIndex={0} aria-label={`${ev.company} interview — ${isToday ? "Today" : `${days} days away`}`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("/calendar"); } }}
              style={{ padding: "16px 20px", borderRadius: radius.md, background: c.obsidian, borderLeft: `3px solid ${isToday ? c.ember : urgent ? c.gilt : c.sage}`, cursor: "pointer", transition: "background 0.2s ease" }} onClick={() => onNavigate("/calendar")}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(245,242,237,0.02)"}
              onMouseLeave={(e) => e.currentTarget.style.background = c.obsidian}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>{ev.company}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: radius.pill, background: isToday ? "rgba(196,112,90,0.1)" : urgent ? "rgba(212,179,127,0.08)" : "rgba(122,158,126,0.06)", color: isToday ? c.ember : urgent ? c.gilt : c.sage }}>
                  {isToday ? "TODAY" : days === 1 ? "TOMORROW" : `${days}d`}
                </span>
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>{ev.type} · {formatEventDate(ev.date)} · {formatEventTime(ev.time)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Achievements Section ─── */

export interface Badge {
  id: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: number;
}

export function AchievementsSection({ badges, isMobile }: { badges: Badge[]; isMobile: boolean }) {
  if (badges.length === 0) return null;
  return (
    <SectionErrorBoundary label="achievements">
      <div style={{ ...card, padding: "24px 28px" }} className="gradient-border-card">
        {sectionTitle("Achievements")}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${Math.min(badges.length, 4)}, 1fr)`, gap: 12, marginTop: 16 }}>
          {badges.map((badge) => (
            <div key={badge.id} className={badge.earned ? "badge-earned" : ""} style={{ padding: "16px", borderRadius: radius.md, background: badge.earned ? "rgba(212,179,127,0.03)" : c.obsidian, textAlign: "center", opacity: badge.earned ? 1 : 0.45, transition: "all 0.3s ease", position: "relative", overflow: "hidden" }}
              onMouseEnter={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.7"; if (badge.earned) e.currentTarget.style.boxShadow = "0 0 20px rgba(212,179,127,0.12)"; }}
              onMouseLeave={(e) => { if (!badge.earned) e.currentTarget.style.opacity = "0.45"; e.currentTarget.style.boxShadow = "none"; }}>
              {badge.earned && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 30%, rgba(212,179,127,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />}
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", position: "relative" }}>{(badgeIcons[badge.icon] || badgeIcons.star)(badge.earned ? c.gilt : c.stone)}</div>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: badge.earned ? c.ivory : c.stone, marginBottom: 2 }}>{badge.label}</p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4, marginBottom: badge.earned ? 0 : 8 }}>{badge.description}</p>
              {!badge.earned && (
                <div style={{ height: 3, background: "rgba(245,242,237,0.06)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, badge.progress)}%`, background: c.gilt, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </SectionErrorBoundary>
  );
}

/* ─── Charts Row (Score Trend + Skill Radar) ─── */

export interface ChartsRowProps {
  scoreTrend: { date: string; score: number }[];
  skills: { name: string; score: number; prev: number; color: string }[];
  isMobile: boolean;
  onStartSession: () => void;
  onNavigate: (path: string) => void;
}

export function ChartsRow({ scoreTrend, skills, isMobile, onStartSession, onNavigate }: ChartsRowProps) {
  return (
    <SectionErrorBoundary label="charts">
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: sp["2xl"], marginBottom: sp["2xl"] }}>
        {/* Score Trend */}
        <div style={{ ...card, padding: "28px 32px" }} className="gradient-border-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              {sectionTitle("Score Trend")}
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 4 }}>{scoreTrend.length > 0 ? "Hover for details" : "Complete sessions to see your progress"}</p>
            </div>
          </div>
          {scoreTrend.length >= 2 ? (
            <>
              <ScoreTrendChart data={scoreTrend} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 24px" }}>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>{scoreTrend[0].date}</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>{scoreTrend[scoreTrend.length - 1].date}</span>
              </div>
            </>
          ) : (
            <div style={{ position: "relative", padding: "12px 0" }}>
              <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ opacity: 0.15 }}>
                <polyline points="0,100 60,85 120,90 180,70 240,55 300,40 360,35 400,20" fill="none" stroke={c.gilt} strokeWidth="2"/>
                <polygon points="0,120 0,100 60,85 120,90 180,70 240,55 300,40 360,35 400,20 400,120" fill="url(#sampleGrad)" opacity="0.3"/>
                <defs><linearGradient id="sampleGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.gilt}/><stop offset="100%" stopColor="transparent"/></linearGradient></defs>
              </svg>
              <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,19,0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: radius.md }}>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, marginBottom: 12 }}>Complete your first session to see your trend</p>
                <button onClick={onStartSession} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm, padding: "8px 20px", cursor: "pointer", transition: "all 0.2s ease" }}>Start a Session</button>
              </div>
            </div>
          )}
        </div>

        {/* Skill Radar */}
        <div style={{ ...card, padding: "28px" }} className="gradient-border-card">
          {sectionTitle("Skill Breakdown")}
          {skills.length > 0 ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.gilt, borderRadius: 1 }} /><span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Current</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 2, background: c.stone, borderRadius: 1, opacity: 0.5 }} /><span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>First session</span></div>
              </div>
              <SkillRadar skills={skills} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {skills.map((sk) => (
                  <div key={sk.name} role="button" tabIndex={0} aria-label={`Practice ${sk.name} — score ${sk.score}`}
                    onClick={() => onNavigate(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(`/session/new?type=behavioral&focus=${sk.name.toLowerCase().replace(/\s+/g, "-")}`); } }}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 8px", margin: "-6px -8px", borderRadius: radius.sm, transition: "background 0.15s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, flex: 1 }}>{sk.name}</span>
                    <div style={{ width: 60, height: 3, background: "rgba(245,242,237,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${sk.score}%`, background: sk.color, borderRadius: 2, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} /></div>
                    <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory, width: 24, textAlign: "right" }}>{sk.score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage, width: 30, textAlign: "right" }}>+{sk.score - sk.prev}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ position: "relative", padding: "16px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: 0.15, padding: "0 4px" }}>
                {["Communication", "Leadership", "Problem Solving", "Teamwork", "Adaptability"].map((skill, i) => (
                  <div key={skill} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, width: 100 }}>{skill}</span>
                    <div style={{ flex: 1, height: 3, background: "rgba(245,242,237,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${75 - i * 8}%`, background: c.gilt, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.ivory, width: 22, textAlign: "right" }}>{75 - i * 8}</span>
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,19,0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: radius.md }}>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5, textAlign: "center", maxWidth: 220, marginBottom: 10 }}>Complete a session to unlock your skill breakdown</p>
                <button onClick={onStartSession} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.obsidian, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, border: "none", borderRadius: radius.sm, padding: "7px 16px", cursor: "pointer" }}>Get Started</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionErrorBoundary>
  );
}

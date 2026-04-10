import React from "react";
import { c, font, shadow, gradient } from "./tokens";

/* ═══════════════════════════════════════════════
   Extracted presentational components from SessionDetail.tsx
   ═══════════════════════════════════════════════ */

/* ─── Helpers (re-exported for parent) ─── */

export function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 70) return c.gilt;
  return c.ember;
}

export function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  return "Developing";
}

function scoreTip(score: number) {
  if (score >= 85) return "Strong: Interview-ready performance";
  if (score >= 70) return "Good: Solid foundation, minor areas to refine";
  return "Developing: Key areas need practice before interviews";
}

export function normalizeType(type: string): string {
  const map: Record<string, string> = {
    behavioral: "Behavioral", strategic: "Strategic",
    "technical-leadership": "Technical Leadership", "case-study": "Case Study",
    technical: "Technical", case: "Case Study",
    "campus-placement": "Campus Placement", "hr-round": "HR Round",
    management: "Management", "government-psu": "Government & PSU",
    teaching: "Teaching",
  };
  return map[type] || type;
}

function ratingBadge(rating: string | undefined): { label: string; color: string; bg: string } {
  switch (rating) {
    case "strong": return { label: "Strong", color: c.sage, bg: "rgba(122,158,126,0.1)" };
    case "good": return { label: "Good", color: c.gilt, bg: "rgba(212,179,127,0.1)" };
    case "partial": return { label: "Partial", color: "#E89B5A", bg: "rgba(232,155,90,0.1)" };
    case "weak": return { label: "Weak", color: c.ember, bg: "rgba(196,112,90,0.1)" };
    default: return { label: "Reviewed", color: c.stone, bg: "rgba(142,137,131,0.1)" };
  }
}

/* ─── Reusable Section Card ─── */

export function Section({ children, className, animIndex = 0 }: { children: React.ReactNode; className?: string; animIndex?: number }) {
  return (
    <div className={`sd-anim ${className || ""}`} style={{
      background: c.graphite,
      borderRadius: 16,
      border: `1px solid ${c.border}`,
      padding: "28px 32px",
      marginBottom: 16,
      animationDelay: `${0.1 + animIndex * 0.06}s`,
    }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, icon, action }: { children: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {icon}
        {children}
      </h3>
      {action}
    </div>
  );
}

/* ─── Loading Skeleton ─── */

export function LoadingSkeleton() {
  const Bone = ({ w, h, r, mb }: { w: string; h: number; r?: number; mb?: number }) => (
    <div style={{ width: w, height: h, borderRadius: r ?? 8, background: `linear-gradient(90deg, ${c.graphite} 25%, rgba(255,255,255,0.04) 50%, ${c.graphite} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite", marginBottom: mb ?? 0 }} />
  );
  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, fontFamily: font.ui }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 300, background: gradient.meshBg, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <Bone w="60px" h={14} mb={16} />
            <Bone w="320px" h={28} mb={10} />
            <Bone w="200px" h={14} />
          </div>
          <div style={{ textAlign: "center" }}>
            <Bone w="72px" h={72} r={36} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <Bone w="80px" h={32} />
          <Bone w="100px" h={32} />
        </div>
        <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 16 }}>
          <Bone w="200px" h={18} mb={20} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[0,1,2,3].map(i => <Bone key={i} w="100%" h={120} r={12} />)}
          </div>
        </div>
        <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px", marginBottom: 16 }}>
          <Bone w="180px" h={18} mb={20} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Bone w="100%" h={260} r={14} />
            <Bone w="100%" h={260} r={14} />
          </div>
        </div>
        <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 32px" }}>
          <Bone w="160px" h={18} mb={20} />
          <Bone w="100%" h={140} r={14} mb={16} />
          <Bone w="100%" h={140} r={14} />
        </div>
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

/* ─── Not Found State ─── */

export function SessionNotFound({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: font.ui }}>
      <p style={{ fontSize: 18, color: c.ivory, marginBottom: 8 }}>Session not found</p>
      <p style={{ fontSize: 13, color: c.stone, marginBottom: 24 }}>This session may have been deleted or the link is invalid.</p>
      <button onClick={onNavigate} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        Back to Dashboard
      </button>
    </div>
  );
}

/* ─── Header ─── */

export interface SessionHeaderProps {
  type: string;
  dateLabel: string;
  score: number;
  userName?: string;
  targetCompany?: string;
  onBack: () => void;
}

export function SessionHeader({ type, dateLabel, score, userName, targetCompany, onBack }: SessionHeaderProps) {
  return (
    <div className="sd-anim" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, animationDelay: "0s" }}>
      <div>
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.stone,
          background: "none", border: "none", cursor: "pointer", outline: "none", marginBottom: 16, padding: 0,
        }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <h1 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
          Analysis Report & Answer Key
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: c.chalk }}>{type}</span>
          <span style={{ fontSize: 13, color: c.stone }}>·</span>
          {targetCompany && <><span style={{ fontSize: 13, color: c.chalk }}>{targetCompany}</span><span style={{ fontSize: 13, color: c.stone }}>·</span></>}
          {userName && <><span style={{ fontSize: 13, color: c.chalk }}>{userName}</span><span style={{ fontSize: 13, color: c.stone }}>·</span></>}
          <span style={{ fontSize: 13, color: c.stone }}>{dateLabel}</span>
        </div>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.stone, display: "block", marginBottom: 8 }}>Overall Score</span>
        <div role="img" aria-label={`Score ${score} out of 100 — ${scoreLabel(score)}`} style={{
          width: 72, height: 72, borderRadius: "50%",
          border: `3px solid ${scoreLabelColor(score)}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 24px ${scoreLabelColor(score)}20`,
        }}>
          <span aria-hidden="true" style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{score}</span>
          <span aria-hidden="true" style={{ fontSize: 9, color: scoreLabelColor(score), fontWeight: 600 }}>/100</span>
        </div>
        <span title={scoreTip(score)} style={{ fontSize: 11, fontWeight: 600, color: scoreLabelColor(score), marginTop: 6, display: "block", cursor: "help" }}>
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

/* ─── Action Bar (copy/download) ─── */

export interface ActionBarProps {
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

export function ActionBar({ copied, onCopy, onDownload }: ActionBarProps) {
  return (
    <div className="sd-anim" style={{ display: "flex", gap: 8, marginBottom: 24, animationDelay: "0.05s" }}>
      <button onClick={onCopy} aria-label="Copy report" style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        background: copied ? "rgba(122,158,126,0.08)" : "transparent",
        border: `1px solid ${copied ? "rgba(122,158,126,0.3)" : c.border}`,
        color: copied ? c.sage : c.stone, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
      }}>
        {copied ? <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
        {copied ? "Copied!" : "Copy"}
      </button>
      <button onClick={onDownload} aria-label="Download report" style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        background: "transparent", border: `1px solid ${c.border}`, color: c.stone,
        cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
      }}>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
    </div>
  );
}

/* ─── Speech Metrics Section ─── */

export interface SpeechMetrics {
  fillerCount: number;
  fillerPerMin: number;
  pace: number;
  silenceRatio: number;
  energy: number;
  wordCount: number;
  fillerBreakdown: { word: string; count: number }[];
}

export interface SpeechMetricsSectionProps {
  metrics: SpeechMetrics;
  showFillerBreakdown: boolean;
  onToggleFillerBreakdown: () => void;
}

export function SpeechMetricsSection({ metrics, showFillerBreakdown, onToggleFillerBreakdown }: SpeechMetricsSectionProps) {
  return (
    <Section animIndex={0}>
      <SectionTitle icon={
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
      }>Core Objective Metrics</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {/* Filler Words */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Filler Words</span>
              <span style={{ fontSize: 10, color: c.stone }}>Per Minute</span>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: metrics.fillerPerMin <= 3 ? c.sage : metrics.fillerPerMin <= 6 ? c.gilt : c.ember }}>
              {metrics.fillerPerMin}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: c.stone }}>Total detected:</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: metrics.fillerCount > 0 ? c.ember : c.sage, background: metrics.fillerCount > 0 ? "rgba(196,112,90,0.1)" : "rgba(122,158,126,0.1)", padding: "1px 6px", borderRadius: 4 }}>{metrics.fillerCount}</span>
          </div>
          {metrics.fillerBreakdown.length > 0 && (
            <div>
              <button onClick={onToggleFillerBreakdown} style={{
                fontSize: 10, color: c.stone, background: "rgba(255,255,255,0.03)", border: `1px solid ${c.border}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, width: "100%", justifyContent: "space-between",
              }}>
                <span>View breakdown</span>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ transform: showFillerBreakdown ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {showFillerBreakdown && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {metrics.fillerBreakdown.map(({ word, count }) => (
                    <div key={word} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                      <span style={{ color: c.stone, fontStyle: "italic" }}>"{word}"</span>
                      <span style={{ fontFamily: font.mono, color: c.chalk, fontWeight: 600 }}>{count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: c.stone }}>Target: 0-3/min</div>
        </div>

        {/* Silence Ratio */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Silence Ratio</span>
              <span style={{ fontSize: 10, color: c.stone }}>Speaking Continuity</span>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: metrics.silenceRatio <= 30 ? c.sage : metrics.silenceRatio <= 50 ? c.gilt : c.ember }}>
              {metrics.silenceRatio}<span style={{ fontSize: 14 }}>%</span>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Lowest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.max(0, metrics.silenceRatio - 12)}</span></div>
            <div style={{ textAlign: "right" }}><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Highest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.min(100, metrics.silenceRatio + 18)}</span></div>
          </div>
          <div style={{ fontSize: 10, color: c.stone }}>Target: 0-20%</div>
        </div>

        {/* Energy */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Energy</span>
              <span style={{ fontSize: 10, color: c.stone }}>Voice Dynamics</span>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: metrics.energy >= 70 ? c.sage : metrics.energy >= 50 ? c.gilt : c.ember }}>
              {metrics.energy}<span style={{ fontSize: 14, color: c.stone }}>/100</span>
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Lowest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.max(0, metrics.energy - 20)}</span></div>
            <div style={{ textAlign: "right" }}><span style={{ fontSize: 9, color: c.stone, display: "block" }}>Highest</span><span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>{Math.min(100, metrics.energy + 10)}</span></div>
          </div>
          <div style={{ fontSize: 10, color: c.stone }}>Target: 60-100</div>
        </div>

        {/* Pace */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: c.obsidian, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: c.chalk, display: "block" }}>Pace</span>
              <span style={{ fontSize: 10, color: c.stone }}>Speaking Speed</span>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: metrics.pace >= 130 && metrics.pace <= 180 ? c.sage : c.gilt }}>
              {metrics.pace}<span style={{ fontSize: 12, color: c.stone }}> wpm</span>
            </span>
          </div>
          <div style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: `1px solid ${c.border}`, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: c.chalk }}>
              {metrics.pace < 130 ? "Slightly slow. Try to speak faster." : metrics.pace > 180 ? "Fast. Try to slow down." : "Good pace. Natural and clear."}
            </span>
          </div>
          <div style={{ fontSize: 10, color: c.stone }}>Target: 130-180 wpm</div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Response Analysis (per-question) ─── */

export interface IdealAnswer {
  question: string;
  ideal: string;
  candidateSummary: string;
  rating?: string;
  workedWell?: string;
  toImprove?: string;
}

export function ResponseAnalysis({ items }: { items: IdealAnswer[] }) {
  return (
    <Section animIndex={2}>
      <SectionTitle icon={
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
      }>Response Analysis</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {items.map((item, i) => {
          const badge = ratingBadge(item.rating);
          return (
            <div key={i} style={{ borderRadius: 14, border: `1px solid ${c.border}`, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", background: "rgba(212,179,127,0.03)", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.gilt }}>Q{i + 1}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 4 }}>Interview Question</span>
                  <p style={{ fontSize: 14, fontWeight: 500, color: c.ivory, lineHeight: 1.5, margin: 0 }}>{item.question}</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0 }}>
                <div style={{ padding: "16px 20px", borderRight: `1px solid ${c.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ember }}>Your Answer</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: 4 }}>{badge.label}</span>
                  </div>
                  <div style={{ borderLeft: `2px solid ${c.ember}40`, paddingLeft: 14 }}>
                    <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{item.candidateSummary}</p>
                  </div>
                  {(item.toImprove || item.workedWell) && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {item.toImprove && <div style={{ fontSize: 11, color: c.ember, lineHeight: 1.5 }}><strong>Incomplete:</strong> {item.toImprove}</div>}
                      {item.workedWell && <div style={{ fontSize: 11, color: c.sage, lineHeight: 1.5 }}><strong>Worked well:</strong> {item.workedWell}</div>}
                    </div>
                  )}
                </div>
                <div style={{ padding: "16px 20px", background: "rgba(122,158,126,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.sage }}>Restructured Answer</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: c.sage, background: "rgba(122,158,126,0.1)", padding: "2px 8px", borderRadius: 4 }}>STAR Format</span>
                  </div>
                  <div style={{ borderLeft: `2px solid ${c.sage}40`, paddingLeft: 14 }}>
                    <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{item.ideal}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ─── AI Coach Summary ─── */

export interface AICoachSummaryProps {
  feedback: string;
  strengths?: string[];
  improvements?: string[];
  nextSteps?: string[];
}

export function AICoachSummary({ feedback, strengths: propStrengths, improvements: propImprovements, nextSteps }: AICoachSummaryProps) {
  const strengths: string[] = propStrengths ? [...propStrengths] : [];
  const improvements: string[] = propImprovements ? [...propImprovements] : [];
  const tips: string[] = [];

  if (strengths.length === 0 && improvements.length === 0) {
    const sentences = feedback.split(/(?<=[.!])\s+/).filter(Boolean);
    for (const s of sentences) {
      const lower = s.toLowerCase();
      if (lower.includes("strong") || lower.includes("excellent") || lower.includes("well") || lower.includes("good") || lower.includes("clear") || lower.includes("solid")) {
        strengths.push(s.trim());
      } else if (lower.includes("improve") || lower.includes("work on") || lower.includes("could") || lower.includes("try") || lower.includes("consider") || lower.includes("recommend")) {
        improvements.push(s.trim());
      } else {
        tips.push(s.trim());
      }
    }
  }

  return (
    <Section className="session-detail-card" animIndex={3}>
      <SectionTitle icon={
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4"/></svg>
      }>AI Coach Summary</SectionTitle>
      {strengths.length === 0 && improvements.length === 0 ? (
        <p style={{ fontSize: 14, color: c.chalk, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{feedback}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {strengths.length > 0 && (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.1)`, borderLeft: `3px solid ${c.sage}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.sage, display: "block", marginBottom: 8 }}>Strengths</span>
              {strengths.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                  <span style={{ color: c.sage, fontSize: 12, marginTop: 1 }}>{"✓"}</span>
                  <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {improvements.length > 0 && (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(196,112,90,0.04)", border: `1px solid rgba(196,112,90,0.1)`, borderLeft: `3px solid ${c.ember}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ember, display: "block", marginBottom: 8 }}>Areas to Improve</span>
              {improvements.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                  <span style={{ color: c.ember, fontSize: 12, marginTop: 1 }}>{"→"}</span>
                  <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {nextSteps && nextSteps.length > 0 && (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, borderLeft: `3px solid ${c.gilt}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 8 }}>Next Steps</span>
              {nextSteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: i > 0 ? 6 : 0 }}>
                  <span style={{ fontFamily: font.mono, color: c.gilt, fontSize: 11, marginTop: 1 }}>{i + 1}.</span>
                  <p style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: 0 }}>{s}</p>
                </div>
              ))}
            </div>
          )}
          {tips.length > 0 && (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, borderLeft: `3px solid ${c.gilt}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.gilt, display: "block", marginBottom: 8 }}>Tips</span>
              {tips.map((s, i) => <p key={i} style={{ fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: i > 0 ? "4px 0 0" : 0 }}>{s}</p>)}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

/* ─── Transcript Section ─── */

export interface TranscriptSectionProps {
  transcript: { speaker: string; text: string; time?: string }[];
  showTranscript: boolean;
  onToggle: () => void;
}

export function TranscriptSection({ transcript, showTranscript, onToggle }: TranscriptSectionProps) {
  return (
    <Section animIndex={4}>
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        role="button" aria-expanded={showTranscript} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Full Transcript
          <span style={{ fontSize: 11, color: c.stone, fontWeight: 400 }}>({transcript.length} messages)</span>
        </h3>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"
          style={{ transform: showTranscript ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {showTranscript && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
          {transcript.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 12, flexDirection: msg.speaker === "user" ? "row-reverse" : "row" }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                background: msg.speaker === "ai" ? "rgba(212,179,127,0.08)" : "rgba(122,158,126,0.08)",
                border: `1px solid ${msg.speaker === "ai" ? "rgba(212,179,127,0.15)" : "rgba(122,158,126,0.15)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {msg.speaker === "ai"
                  ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="3"/></svg>
                  : <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              </div>
              <div style={{ maxWidth: "75%", minWidth: 0 }}>
                <div style={{
                  padding: "10px 14px", borderRadius: 12, fontSize: 13, color: c.chalk, lineHeight: 1.6,
                  background: msg.speaker === "ai" ? c.obsidian : "rgba(122,158,126,0.03)",
                  border: `1px solid ${msg.speaker === "ai" ? c.border : "rgba(122,158,126,0.08)"}`,
                  borderTopLeftRadius: msg.speaker === "ai" ? 4 : 12,
                  borderTopRightRadius: msg.speaker === "user" ? 4 : 12,
                }}>
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ─── Feedback on AI Evaluation ─── */

export interface FeedbackSectionProps {
  feedbackRating: "helpful" | "too_harsh" | "too_generous" | "inaccurate" | null;
  feedbackComment: string;
  feedbackSaved: boolean;
  showFeedbackForm: boolean;
  onSubmitFeedback: (rating: "helpful" | "too_harsh" | "too_generous" | "inaccurate") => void;
  onCommentChange: (v: string) => void;
  onSubmitComment: () => void;
}

export function FeedbackSection({ feedbackRating, feedbackComment, feedbackSaved, showFeedbackForm, onSubmitFeedback, onCommentChange, onSubmitComment }: FeedbackSectionProps) {
  return (
    <div className="sd-anim" style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "18px 28px", marginBottom: 16, animationDelay: "0.4s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.stone }}>
          {feedbackSaved ? "Thanks for your feedback!" : "Was this evaluation helpful?"}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["helpful", "too_harsh", "too_generous", "inaccurate"] as const).map((rating) => {
            const labels: Record<string, string> = { helpful: "Helpful", too_harsh: "Too harsh", too_generous: "Too generous", inaccurate: "Inaccurate" };
            const icons: Record<string, string> = { helpful: "\uD83D\uDC4D", too_harsh: "\uD83D\uDCCF", too_generous: "\uD83C\uDF89", inaccurate: "\uD83D\uDEA9" };
            const isSelected = feedbackRating === rating;
            return (
              <button key={rating} onClick={() => onSubmitFeedback(rating)} aria-pressed={isSelected}
                style={{
                  fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "6px 12px",
                  borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  border: `1px solid ${isSelected ? "rgba(212,179,127,0.3)" : c.border}`,
                  background: isSelected ? "rgba(212,179,127,0.08)" : "transparent",
                  color: isSelected ? c.gilt : c.stone,
                }}>
                <span>{icons[rating]}</span>{labels[rating]}
              </button>
            );
          })}
        </div>
      </div>
      {showFeedbackForm && feedbackRating && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input type="text" value={feedbackComment} onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Any details? (optional)" maxLength={500}
            style={{ flex: 1, fontFamily: font.ui, fontSize: 12, color: c.chalk, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", outline: "none" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = c.border; }}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmitComment(); }}
          />
          <button onClick={onSubmitComment} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer" }}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── What's Next Section ─── */

export interface WhatsNextProps {
  session: { type: string; score: number };
  skillEntries: { name: string; score: number }[];
  isFreeUser: boolean;
  onNavigate: (path: string) => void;
}

export function WhatsNext({ session, skillEntries, isFreeUser, onNavigate }: WhatsNextProps) {
  const weakest = skillEntries.length > 0 ? [...skillEntries].sort((a, b) => a.score - b.score)[0] : null;
  const typeRotation = ["behavioral", "case-study", "technical", "strategic", "campus-placement", "hr-round", "management", "government-psu", "teaching"];
  const currentIdx = typeRotation.indexOf(session.type);
  const nextType = typeRotation[(currentIdx + 1) % typeRotation.length] || "behavioral";
  const nextDifficulty = session.score >= 85 ? "intense" : session.score < 70 ? "warmup" : "standard";

  return (
    <div className="sd-anim" style={{ background: `linear-gradient(135deg, rgba(212,179,127,0.05) 0%, ${c.graphite} 100%)`, borderRadius: 16, border: `1px solid rgba(212,179,127,0.1)`, padding: "28px 32px", marginBottom: 16, animationDelay: "0.5s" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>What's Next?</h3>
      {weakest && (
        <p style={{ fontSize: 13, color: c.stone, lineHeight: 1.5, marginBottom: 16 }}>
          Your <strong style={{ color: c.chalk }}>{weakest.name}</strong> scored {weakest.score} — focus a session on this to improve fastest.
        </p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {weakest && (
          <button onClick={() => onNavigate(`/session/new?type=${session.type}&focus=${weakest.name.toLowerCase().replace(/\s+/g, "-")}`)}
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: shadow.sm }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
            Practice {weakest.name}
          </button>
        )}
        <button onClick={() => onNavigate(`/session/new?type=${nextType}&difficulty=${nextDifficulty}`)}
          style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.chalk, cursor: "pointer" }}>
          Try {normalizeType(nextType)}
        </button>
        <button onClick={() => onNavigate("/dashboard")}
          style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 22px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, cursor: "pointer" }}>
          Back to Dashboard
        </button>
      </div>
      {isFreeUser && (
        <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 10, background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 12, color: c.stone }}>Unlock unlimited sessions & detailed analytics</span>
          <button onClick={() => { window.location.href = "/#pricing"; }}
            style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "6px 16px", borderRadius: 6, border: `1px solid rgba(212,179,127,0.2)`, background: "transparent", color: c.gilt, cursor: "pointer", whiteSpace: "nowrap" }}>
            Upgrade
          </button>
        </div>
      )}
    </div>
  );
}

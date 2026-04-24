"use client";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { c, font } from "./tokens";
import type { DashboardSession } from "./dashboardTypes";
import {
  evaluateSessionWithAI,
  saveStoryToNotebook,
  fetchRecentSessionScores,
  type SessionReport,
  type SessionReportBand,
  type SessionReportPerQuestion,
  type SessionReportWinFix,
  type SessionReportRedFlag,
  type SessionReportCrossSessionInsight,
  type SessionReportStoryReuse,
  type SessionReportBlindSpot,
  type SessionReportReadiness,
  type SessionTrendPoint,
} from "./dashboardData";
import { getCohortAverage, type RoleFamily } from "./roleBenchmarks";
import { detectBias, countBias, BIAS_LABELS, type BiasPatternKind } from "./biasDetector";
import { useAuth } from "./AuthContext";

/* ─── MVP Results Report view ───────────────────────────────────────
 * Sections (in order):
 *  1. Hero         — score + band + verdict + meta
 *  2. Core Metrics — fillers/min, silence %, pace wpm, energy
 *  3. Skills       — role-weighted 5-axis bar chart
 *  4. Per-question — expandable cards with STAR + restructured answer
 *  5. Next Steps   — "Try weakest Q again" primary CTA
 *
 * Behaviour: auto-generates report on first view via /api/evaluate-session,
 * caches result in session.report_json (server-side) for re-open.
 */

const BAND_META: Record<SessionReportBand, { label: string; color: string; bg: string }> = {
  strongHire:   { label: "Strong Hire",    color: c.sage,  bg: "rgba(122,158,126,0.10)" },
  hire:         { label: "Hire",           color: c.sage,  bg: "rgba(122,158,126,0.06)" },
  leanHire:     { label: "Lean Hire",      color: c.gilt,  bg: "rgba(212,179,127,0.08)" },
  noHire:       { label: "No Hire",        color: c.ember, bg: "rgba(196,112,90,0.06)" },
  strongNoHire: { label: "Strong No Hire", color: c.ember, bg: "rgba(196,112,90,0.10)" },
};

const DIFFICULTY_META: Record<SessionReportPerQuestion["difficulty"], { label: string; color: string; bg: string }> = {
  warmup:   { label: "Warmup",   color: c.sage,  bg: "rgba(122,158,126,0.08)" },
  standard: { label: "Standard", color: c.stone, bg: "rgba(158,158,158,0.08)" },
  hard:     { label: "Hard",     color: c.ember, bg: "rgba(196,112,90,0.08)" },
};

const VERDICT_META: Record<SessionReportPerQuestion["verdict"], { label: string; color: string; bg: string }> = {
  strong:   { label: "Strong",   color: c.sage,  bg: "rgba(122,158,126,0.10)" },
  complete: { label: "Complete", color: c.sage,  bg: "rgba(122,158,126,0.06)" },
  partial:  { label: "Partial",  color: c.gilt,  bg: "rgba(212,179,127,0.08)" },
  weak:     { label: "Weak",     color: c.ember, bg: "rgba(196,112,90,0.06)" },
  skipped:  { label: "Skipped",  color: c.stone, bg: "rgba(158,158,158,0.06)" },
};

const RED_FLAG_TYPE_LABELS: Record<SessionReportRedFlag["type"], string> = {
  blame:           "Blame language",
  missing_result:  "Missing result",
  we_without_i:    "We without I",
  scope_drift:     "Scope drift",
  contradiction:   "Contradiction",
  vague:           "Too vague",
};
const SEVERITY_RANK: Record<SessionReportRedFlag["severity"], number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_COLOR: Record<SessionReportRedFlag["severity"], string> = { high: c.ember, medium: c.gilt, low: c.stone };

/** Classify a raw role string into our 5 role-families. */
function roleToFamily(role: string | undefined): RoleFamily {
  if (!role) return "behavioral";
  const r = role.toLowerCase();
  if (/engineer|developer|swe|sre|devops/.test(r)) return "swe";
  if (/product manager|\bpm\b/.test(r)) return "pm";
  if (/engineering manager|\bem\b|director|vp/.test(r)) return "em";
  if (/data|analyst|scientist|ml\b|ai\b/.test(r)) return "data";
  return "behavioral";
}

/**
 * Reshape the session transcript into the evaluator API's turn schema.
 * The persisted shape uses `speaker: "user" | "ai"` (written by useInterviewEngine
 * and interviewAPI). System/unknown speakers are excluded rather than silently
 * bucketed into "interviewer" — they're usually prompt scaffolding, not real turns.
 */
const KNOWN_CANDIDATE_SPEAKERS = new Set(["user", "candidate"]);
const KNOWN_INTERVIEWER_SPEAKERS = new Set(["ai", "interviewer", "assistant"]);

function toTurns(transcript: DashboardSession["transcript"]): Array<{ role: "interviewer" | "candidate"; text: string }> {
  if (!Array.isArray(transcript)) return [];
  const turns: Array<{ role: "interviewer" | "candidate"; text: string }> = [];
  for (const t of transcript) {
    const text = (t?.text ?? "").trim();
    if (!text) continue;
    const speaker = String(t?.speaker ?? "").toLowerCase();
    if (KNOWN_CANDIDATE_SPEAKERS.has(speaker)) {
      turns.push({ role: "candidate", text });
    } else if (KNOWN_INTERVIEWER_SPEAKERS.has(speaker)) {
      turns.push({ role: "interviewer", text });
    }
    // Unknown speakers (system, notes, etc.) are dropped intentionally.
  }
  return turns;
}

/** Metric tile — single core-metric card. */
function MetricTile({ label, value, unit, target, good }: {
  label: string; value: number | string; unit?: string; target: string; good: "green" | "amber" | "red";
}) {
  const dotColor = good === "green" ? c.sage : good === "amber" ? c.gilt : c.ember;
  return (
    <div style={{
      background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <span
          title={`${good === "green" ? "On target" : good === "amber" ? "Slightly off" : "Needs work"}`}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 14, height: 14, borderRadius: "50%", background: dotColor,
            color: c.obsidian, fontFamily: font.mono, fontSize: 10, fontWeight: 700,
          }}
          aria-label={`${good} status — ${good === "green" ? "On target" : good === "amber" ? "Slightly off" : "Needs work"}`}
        >
          {good === "green" ? "✓" : good === "amber" ? "!" : "✕"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{unit}</span>}
      </div>
      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Target: {target}</span>
    </div>
  );
}

/* ─── Inline answer highlighting ────────────────────────────────────
 * We highlight three categories inside the candidate's raw answer so the
 * coaching feels evidence-linked without requiring the LLM to return span
 * offsets (which it hallucinates unreliably):
 *   - filler:       um, uh, like, you know, so, actually, basically, literally
 *   - hedge:        I think, I guess, maybe, kind of, sort of, probably,
 *                   perhaps, might, could be
 *   - quant:        numbers, %, $, x multipliers — signals of quantified impact
 * All detection is pure regex, client-side, deterministic.
 */

type HighlightKind = "filler" | "hedge" | "quant";

interface HighlightSpan { start: number; end: number; kind: HighlightKind }

// Order matters: regex is applied in order and later spans that overlap
// earlier ones are dropped (first-match-wins).
const HIGHLIGHT_PATTERNS: Array<{ kind: HighlightKind; re: RegExp }> = [
  // Quantified claims — match first so "I cut latency 40%" doesn't lose the "%" to another pattern.
  { kind: "quant", re: /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|×)\b|\$\s*\d+(?:[.,]\d+)?\s*(?:k|m|bn|b|million|billion|thousand)?\b|\b\d+(?:[.,]\d+)?\s*(?:k|m|bn|b|million|billion|thousand|users?|customers?|req\/s|rps|qps|hrs?|hours?|days?|weeks?|months?|years?|people|employees?|teams?)\b|\b\d{3,}\b/gi },
  // Fillers
  { kind: "filler", re: /\b(?:um+|uh+|erm+|hmm+|like|you know|so|actually|basically|literally)\b/gi },
  // Hedges
  { kind: "hedge", re: /\b(?:i (?:think|guess|feel|believe|assume|suppose)|maybe|kind of|sort of|kinda|sorta|probably|perhaps|might|could be|i'm not sure|not really sure|i guess)\b/gi },
];

function computeHighlights(text: string): HighlightSpan[] {
  if (!text) return [];
  const spans: HighlightSpan[] = [];
  for (const { kind, re } of HIGHLIGHT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      // Skip if it overlaps an earlier (higher-priority) span.
      if (spans.some((s) => !(end <= s.start || start >= s.end))) continue;
      spans.push({ start, end, kind });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

const HIGHLIGHT_STYLES: Record<HighlightKind, { bg: string; color: string; title: string }> = {
  filler:  { bg: "rgba(212,179,127,0.20)", color: c.gilt,  title: "Filler word" },
  hedge:   { bg: "rgba(158,158,158,0.18)", color: c.stone, title: "Hedging language" },
  quant:   { bg: "rgba(122,158,126,0.20)", color: c.sage,  title: "Quantified claim" },
};

/**
 * Render a string with colored mark spans for fillers/hedges/quantified claims.
 * Uses React text nodes + <mark> so no dangerouslySetInnerHTML and no XSS risk.
 */
function HighlightedText({ text }: { text: string }) {
  const spans = useMemo(() => computeHighlights(text), [text]);
  if (spans.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) nodes.push(text.slice(cursor, s.start));
    const style = HIGHLIGHT_STYLES[s.kind];
    nodes.push(
      <mark
        key={`h-${i}`}
        title={style.title}
        style={{
          background: style.bg, color: style.color, borderRadius: 3,
          padding: "0 3px", fontWeight: 500,
        }}
      >{text.slice(s.start, s.end)}</mark>
    );
    cursor = s.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

/** Count-only summary for the small legend shown under each highlighted answer. */
function summarizeHighlights(text: string): Record<HighlightKind, number> {
  const counts: Record<HighlightKind, number> = { filler: 0, hedge: 0, quant: 0 };
  for (const s of computeHighlights(text)) counts[s.kind]++;
  return counts;
}

/** Small inline legend — only shows categories that actually occurred in the answer. */
function HighlightLegend({ counts }: { counts: Record<HighlightKind, number> }) {
  const allItems: Array<{ kind: HighlightKind; label: string; n: number }> = [
    { kind: "quant",  label: "quantified", n: counts.quant },
    { kind: "hedge",  label: "hedges",     n: counts.hedge },
    { kind: "filler", label: "fillers",    n: counts.filler },
  ];
  const items = allItems.filter((i) => i.n > 0);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {items.map(({ kind, label, n }) => {
        const style = HIGHLIGHT_STYLES[kind];
        return (
          <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font.ui, fontSize: 10, color: c.stone }}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: 2,
              background: style.bg, border: `1px solid ${style.color}`,
            }} aria-hidden="true" />
            {n} {label}
          </span>
        );
      })}
    </div>
  );
}

/** Compact list of wins or fixes with a colored side-rail — used in the hero. */
function WinFixList({ items, label, tone }: {
  items: SessionReportWinFix[]; label: string; tone: "win" | "fix";
}) {
  const accent = tone === "win" ? c.sage : c.gilt;
  const bg = tone === "win" ? "rgba(122,158,126,0.05)" : "rgba(212,179,127,0.05)";
  const border = tone === "win" ? "rgba(122,158,126,0.18)" : "rgba(212,179,127,0.18)";
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 10,
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <span style={{
        fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: accent,
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>{label}</span>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{
              width: 4, alignSelf: "stretch", borderRadius: 2, background: accent, flexShrink: 0, marginTop: 3, marginBottom: 3,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.5, margin: 0 }}>
                {item.text}
                {item.questionIdx >= 0 && (
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, marginLeft: 6 }}>
                    Q{item.questionIdx + 1}
                  </span>
                )}
              </p>
              {item.quote && (
                <p style={{ fontFamily: font.ui, fontSize: 11, fontStyle: "italic", color: c.stone, lineHeight: 1.5, margin: "3px 0 0" }}>
                  “{item.quote.length > 120 ? item.quote.slice(0, 120) + "…" : item.quote}”
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bandForFiller(v: number) { return v <= 3 ? "green" : v <= 6 ? "amber" : "red"; }
function bandForSilence(v: number) { return v <= 20 ? "green" : v <= 30 ? "amber" : "red"; }
function bandForPace(v: number) { return v >= 140 && v <= 180 ? "green" : (v >= 125 && v < 140) || (v > 180 && v <= 200) ? "amber" : "red"; }
function bandForEnergy(v: number) { return v >= 60 ? "green" : v >= 40 ? "amber" : "red"; }

/** Skill bar — user score + cohort average overlay (static priors from roleBenchmarks). */
function SkillBar({ name, score, cohortAvg }: { name: string; score: number; cohortAvg: number | null }) {
  const pct = Math.max(0, Math.min(100, score));
  const barColor = pct >= 70 ? c.sage : pct >= 50 ? c.gilt : c.ember;
  const delta = cohortAvg != null ? pct - cohortAvg : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory }}>{name}</span>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
          {delta != null && (
            <span
              style={{
                fontFamily: font.mono, fontSize: 10, fontWeight: 600,
                color: delta >= 0 ? c.sage : c.ember,
              }}
              title={`Cohort average: ${cohortAvg}`}
            >
              {delta >= 0 ? "+" : ""}{delta} vs avg
            </span>
          )}
          <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: barColor }}>{pct}</span>
        </div>
      </div>
      <div style={{ position: "relative", height: 6, background: "rgba(245,242,237,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 600ms ease" }} />
        {cohortAvg != null && (
          <span
            aria-label={`cohort average marker at ${cohortAvg}`}
            style={{
              position: "absolute", top: -2, bottom: -2,
              left: `${cohortAvg}%`, width: 1.5,
              background: "rgba(245,242,237,0.45)",
              borderRadius: 1,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Per-question card — collapsed shows verdict + score, expanded shows full coaching. */
function QuestionCard({ q, index, sessionId }: { q: SessionReportPerQuestion; index: number; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveCoachedState, setSaveCoachedState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const verdictMeta = VERDICT_META[q.verdict] || VERDICT_META.partial;
  const starChips: Array<"S" | "T" | "A" | "R"> = ["S", "T", "A", "R"];

  const onSave = async () => {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    track("report_action_clicked", { action: "save_story", sessionId, questionIdx: index });
    try {
      // Derive a short title from the first clause of the question, e.g. "Tell me about a time…"
      const title = (q.question || "Story")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      await saveStoryToNotebook({
        sessionId,
        questionIdx: index,
        title,
        question: q.question || "",
        answerText: q.answerText || "",
        star: null, // MVP: raw answer only; STAR extraction V2
        tags: [],
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 4000);
    } catch (err) {
      console.warn("[QuestionCard] save failed:", err instanceof Error ? err.message : err);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 4000);
    }
  };

  // Save the coached / top-performer variant as a separate notebook entry so
  // users can build a library of model answers they're aspiring to. Prefers
  // the restructured STAR (grounded in their own words) over the synthesised
  // top-performer example — the restructured version is more actionable
  // because it preserves the candidate's context.
  const coachedText = q.restructured?.text || q.topPerformerAnswer?.text || "";
  const coachedSource = q.restructured?.text ? "coached" : "top-performer";
  const onSaveCoached = async () => {
    if (saveCoachedState === "saving" || saveCoachedState === "saved") return;
    if (!coachedText) return;
    setSaveCoachedState("saving");
    track("report_action_clicked", { action: "save_coached_story", sessionId, questionIdx: index, source: coachedSource });
    try {
      const baseTitle = (q.question || "Story").replace(/\s+/g, " ").trim().slice(0, 70);
      await saveStoryToNotebook({
        sessionId,
        // Offset the question index so the coached and raw versions don't
        // collide on any (session_id, question_idx) uniqueness assumption
        // downstream. 10000 is safely outside any real question count.
        questionIdx: 10000 + index,
        title: `Coached · ${baseTitle}`,
        question: q.question || "",
        answerText: coachedText,
        star: null,
        tags: ["coached", coachedSource],
      });
      setSaveCoachedState("saved");
      setTimeout(() => setSaveCoachedState("idle"), 4000);
    } catch (err) {
      console.warn("[QuestionCard] save-coached failed:", err instanceof Error ? err.message : err);
      setSaveCoachedState("error");
      setTimeout(() => setSaveCoachedState("idle"), 4000);
    }
  };

  return (
    <div style={{
      background: c.graphite, borderRadius: 12,
      // Verdict-tinted left accent + matching border. Lets users scan by color
      // which questions were weak before expanding any card.
      borderLeft: `3px solid ${verdictMeta.color}`,
      borderTop: `1px solid ${c.border}`,
      borderRight: `1px solid ${c.border}`,
      borderBottom: `1px solid ${c.border}`,
      overflow: "hidden", transition: "border-color 200ms",
    }}>
      <button
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) track("report_question_expanded", { sessionId, questionIdx: index, verdict: q.verdict });
            return next;
          });
        }}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left", color: c.ivory,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.stone, flexShrink: 0 }}>Q{index + 1}</span>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {q.question || "(no question)"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {q.difficulty && (
            <span
              title={q.frequencyNote || `Difficulty: ${DIFFICULTY_META[q.difficulty].label}`}
              style={{
                fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                color: DIFFICULTY_META[q.difficulty].color, background: DIFFICULTY_META[q.difficulty].bg,
                padding: "3px 7px", borderRadius: 3,
              }}
            >{DIFFICULTY_META[q.difficulty].label}</span>
          )}
          {typeof q.frequencyPct === "number" && q.frequencyPct > 0 && (
            <span
              title={q.frequencyNote || `Asked in ~${q.frequencyPct}% of relevant loops`}
              style={{
                fontFamily: font.mono, fontSize: 10, fontWeight: 600,
                color: c.stone, background: "rgba(245,242,237,0.04)",
                padding: "2px 6px", borderRadius: 3, border: `1px solid ${c.border}`,
              }}
            >{q.frequencyPct}%</span>
          )}
          <span style={{
            fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
            color: verdictMeta.color, background: verdictMeta.bg, padding: "3px 8px", borderRadius: 4,
          }}>{verdictMeta.label}</span>
          <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.ivory }}>{q.score}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Full question */}
          {q.question && (
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Question</span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.6, margin: "6px 0 0" }}>{q.question}</p>
              {q.frequencyNote && (
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "4px 0 0", fontStyle: "italic" }}>
                  {q.frequencyNote}
                  {typeof q.frequencyPct === "number" && q.frequencyPct > 0 && ` · asked in ~${q.frequencyPct}% of relevant loops`}
                </p>
              )}
            </div>
          )}

          {/* Candidate's answer with inline evidence highlights */}
          {q.answerText && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your Answer</span>
                <HighlightLegend counts={summarizeHighlights(q.answerText)} />
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.75, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                <HighlightedText text={q.answerText} />
              </p>
            </div>
          )}

          {/* STAR chips */}
          {q.verdict !== "skipped" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>STAR</span>
              {starChips.map((k) => {
                const present = q.starPresence?.[k];
                return (
                  <span
                    key={k}
                    title={k === "S" ? "Situation" : k === "T" ? "Task" : k === "A" ? "Action" : "Result"}
                    style={{
                      width: 24, height: 24, borderRadius: 4,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontFamily: font.mono, fontSize: 11, fontWeight: 700,
                      color: present ? c.obsidian : c.stone,
                      background: present ? c.gilt : "transparent",
                      border: present ? `1px solid ${c.gilt}` : `1px solid ${c.border}`,
                    }}
                  >{k}</span>
                );
              })}
            </div>
          )}

          {/* Coached Version + Top Performer — side by side on desktop, stacked on mobile */}
          <div style={{
            display: "grid",
            gridTemplateColumns: (q.restructured?.text && q.topPerformerAnswer?.text) ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr",
            gap: 10,
          }}>
          {/* Restructured STAR answer — grounded in the candidate's words */}
          {q.restructured && q.restructured.text && (
            <div style={{
              background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.14)`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: c.gilt, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Coached Version
                </span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>
                  built from your own words
                </span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.65, margin: 0 }}>{q.restructured.text}</p>
            </div>
          )}

          {/* Top-performer example — synthesized excellence, distinct from restructured */}
          {q.topPerformerAnswer && q.topPerformerAnswer.text && (
            <div style={{
              background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.18)`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: c.sage, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  How a 90/100 candidate would answer
                </span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, fontStyle: "italic" }}>
                  generated example — details are illustrative
                </span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.65, margin: 0 }}>{q.topPerformerAnswer.text}</p>
              {Array.isArray(q.topPerformerAnswer.whatMakesItStrong) && q.topPerformerAnswer.whatMakesItStrong.length > 0 && (
                <ul style={{
                  margin: "10px 0 0", padding: "10px 0 0 0",
                  borderTop: `1px solid rgba(122,158,126,0.12)`,
                  listStyle: "none", display: "flex", flexDirection: "column", gap: 5,
                }}>
                  {q.topPerformerAnswer.whatMakesItStrong.map((reason, i) => (
                    <li key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <span aria-hidden="true" style={{ color: c.sage, fontSize: 11, flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.5 }}>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          </div>

          {/* Length verdict — flags too-brief / too-long answers */}
          {q.lengthVerdict && q.verdict !== "skipped" && <LengthVerdictBadge lv={q.lengthVerdict} />}

          {/* Likely follow-up — adaptive-thinking training */}
          {q.likelyFollowUp && q.verdict !== "skipped" && <LikelyFollowUp fu={q.likelyFollowUp} />}

          {/* Explanation */}
          {q.explanation && (
            <p style={{ fontFamily: font.ui, fontSize: 12, fontStyle: "italic", color: c.stone, lineHeight: 1.6, margin: 0 }}>
              {q.explanation}
            </p>
          )}

          {/* Per-question actions — Save Your Answer + Save Coached Version. The
              coached button only appears when the AI produced a restructured or
              top-performer answer; otherwise there's nothing worth saving. */}
          {q.verdict !== "skipped" && q.answerText && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 2, flexWrap: "wrap" }}>
              {coachedText && (
                <button
                  onClick={onSaveCoached}
                  disabled={saveCoachedState === "saving" || saveCoachedState === "saved"}
                  aria-live="polite"
                  title="Save the model answer to your Story Notebook for later review"
                  style={{
                    fontFamily: font.ui, fontSize: 12, fontWeight: 500,
                    color: saveCoachedState === "saved" ? c.sage : saveCoachedState === "error" ? c.ember : c.gilt,
                    background: "rgba(212,179,127,0.04)",
                    border: `1px solid ${saveCoachedState === "saved" ? "rgba(122,158,126,0.35)" : saveCoachedState === "error" ? "rgba(196,112,90,0.35)" : "rgba(212,179,127,0.25)"}`,
                    borderRadius: 8, padding: "6px 12px",
                    cursor: (saveCoachedState === "saving" || saveCoachedState === "saved") ? "default" : "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    transition: "all 150ms",
                  }}
                >
                  {saveCoachedState === "saving" && (
                    <div style={{ width: 10, height: 10, border: `1.5px solid rgba(212,179,127,0.3)`, borderTopColor: c.gilt, borderRadius: "50%", animation: "reportspin 0.8s linear infinite" }} />
                  )}
                  {saveCoachedState === "saved" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                  {saveCoachedState === "error" && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
                  )}
                  {!["saving", "saved", "error"].includes(saveCoachedState) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  )}
                  {saveCoachedState === "saving" ? "Saving…" : saveCoachedState === "saved" ? "Coached answer saved" : saveCoachedState === "error" ? "Save failed" : "Save coached version"}
                </button>
              )}
              <button
                onClick={onSave}
                disabled={saveState === "saving" || saveState === "saved"}
                aria-live="polite"
                style={{
                  fontFamily: font.ui, fontSize: 12, fontWeight: 500,
                  color: saveState === "saved" ? c.sage : saveState === "error" ? c.ember : c.chalk,
                  background: "transparent",
                  border: `1px solid ${saveState === "saved" ? "rgba(122,158,126,0.35)" : saveState === "error" ? "rgba(196,112,90,0.35)" : "rgba(245,242,237,0.15)"}`,
                  borderRadius: 8, padding: "6px 12px",
                  cursor: (saveState === "saving" || saveState === "saved") ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  transition: "all 150ms",
                }}
              >
                {saveState === "saving" && (
                  <div style={{ width: 10, height: 10, border: `1.5px solid rgba(245,242,237,0.3)`, borderTopColor: c.chalk, borderRadius: "50%", animation: "reportspin 0.8s linear infinite" }} />
                )}
                {saveState === "saved" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                )}
                {saveState === "error" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
                )}
                {!["saving", "saved", "error"].includes(saveState) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                )}
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to Notebook" : saveState === "error" ? "Save failed" : "Save to Notebook"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main View ─── */

export const SessionReportView = memo(function SessionReportView({
  session,
  onBack,
}: {
  session: DashboardSession;
  onBack: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  // Bumping this value re-runs the evaluate effect — used by the retry button.
  const [reloadTick, setReloadTick] = useState(0);
  const [trend, setTrend] = useState<SessionTrendPoint[]>([]);
  const [trustAnswer, setTrustAnswer] = useState<"yes" | "no" | null>(null);
  const [usefulAnswer, setUsefulAnswer] = useState<"yes" | "no" | null>(null);

  const roleFamily: RoleFamily = useMemo(() => roleToFamily(session.role), [session.role]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const t0 = Date.now();

    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const meta = {
          role: session.role,
          roleFamily,
          targetCompany: user?.targetCompany || null,
          difficulty: (session.difficulty as "warmup" | "standard" | "hard") || "standard",
          duration: parseDurationSec(session.duration),
        };
        const res = await evaluateSessionWithAI(
          { sessionId: session.id, transcript: toTurns(session.transcript), meta },
          ac.signal,
        );
        if (!cancelled && res) {
          setReport(res);
          track("report_llm_completed", {
            sessionId: session.id,
            latencyMs: Date.now() - t0,
            score: res.overallScore,
            band: res.band,
            model: res.model,
          });
        }
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Failed to generate report";
        setErrorMsg(msg);
        track("report_llm_failed", {
          sessionId: session.id,
          latencyMs: Date.now() - t0,
          error: msg.slice(0, 120),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; ac.abort(); };
  }, [session.id, reloadTick, user?.targetCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire once per successful report view, for funnel analytics.
  useEffect(() => {
    if (report) track("report_viewed", { sessionId: session.id, score: report.overallScore, band: report.band });
  }, [report, session.id]);

  const bandMeta = report ? BAND_META[report.band] : null;
  const weakestQuestion = useMemo(() => {
    if (!report?.perQuestion?.length) return null;
    return [...report.perQuestion].sort((a, b) => a.score - b.score)[0];
  }, [report]);
  const weakestSkill = useMemo(() => {
    if (!report?.skills?.length) return null;
    return [...report.skills].sort((a, b) => a.score - b.score)[0];
  }, [report]);

  const onTryAgain = useCallback(() => {
    const focus = weakestQuestion?.question
      ? encodeURIComponent(weakestQuestion.question.slice(0, 80))
      : "";
    track("report_action_clicked", { action: "try_again", sessionId: session.id });
    router.push(`/session/new?type=${encodeURIComponent(session.type)}${focus ? `&focus=${focus}` : ""}`);
  }, [weakestQuestion, session.id, session.type, router]);

  const onDrillSkill = useCallback(() => {
    if (!weakestSkill) return;
    const slug = weakestSkill.name.toLowerCase().replace(/\s+/g, "-");
    track("report_action_clicked", { action: "drill_skill", sessionId: session.id, skill: weakestSkill.name });
    router.push(`/session/new?type=behavioral&focus=${encodeURIComponent(slug)}`);
  }, [weakestSkill, session.id, router]);

  const onRetry = useCallback(() => {
    track("report_retry_requested", { sessionId: session.id });
    setReport(null);
    setErrorMsg("");
    setReloadTick((t) => t + 1);
  }, [session.id]);

  // Fetch the user's recent session scores for the hero sparkline (fire-and-forget).
  useEffect(() => {
    let cancelled = false;
    fetchRecentSessionScores(10)
      .then((points) => { if (!cancelled) setTrend(points); })
      .catch(() => { /* sparkline is optional — silent fail */ });
    return () => { cancelled = true; };
  }, [session.id]);

  const onDownloadPdf = useCallback(() => {
    track("report_pdf_downloaded", { sessionId: session.id });
    // CSS @media print hides controls and reflows cards; window.print() lets the
    // user pick "Save as PDF" from the browser dialog — zero dependencies.
    if (typeof window !== "undefined") window.print();
  }, [session.id]);

  const onPollAnswer = useCallback((kind: "trust" | "usefulness", value: "yes" | "no") => {
    if (kind === "trust") {
      setTrustAnswer(value);
      track("report_trust_poll_submitted", { sessionId: session.id, fair: value === "yes" });
    } else {
      setUsefulAnswer(value);
      track("report_usefulness_poll_submitted", { sessionId: session.id, useful: value === "yes" });
    }
  }, [session.id]);

  return (
    <div className="sr-shell" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px" }}>
      {/* Global CSS for the new 3-column layout + responsive collapse + focus rings. */}
      <style>{`
        /* 3-column grid: sidebar + main + right rail. Collapses at 1080px. */
        .sr-grid { display: grid; grid-template-columns: 180px minmax(0, 1fr) 280px; gap: 24px; align-items: start; }
        .sr-sidebar, .sr-rail { position: sticky; top: 20px; align-self: start; }
        .sr-main { min-width: 0; }
        .sr-main > * { margin-bottom: 20px; }
        .sr-main > *:last-child { margin-bottom: 0; }

        @media (max-width: 1080px) {
          .sr-grid { grid-template-columns: 1fr; }
          .sr-sidebar, .sr-rail { position: static; }
          .sr-sidebar { order: 1; }
          .sr-main { order: 2; }
          .sr-rail { order: 3; }
        }

        /* Section headings — bolder with gilt rule underneath. */
        .sr-section-h {
          font-family: var(--font-ui, inherit);
          font-size: 18px; font-weight: 700;
          letter-spacing: -0.01em;
          margin: 0 0 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(212,179,127,0.15);
        }

        /* Focus rings — keyboard accessibility. */
        .sr-shell button:focus-visible,
        .sr-shell [role="button"]:focus-visible,
        .sr-shell [aria-expanded]:focus-visible {
          outline: 2px solid ${c.gilt};
          outline-offset: 2px;
          border-radius: 6px;
        }

        /* Sidebar nav item. */
        .sr-nav-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 6px;
          font-family: inherit; font-size: 12px; font-weight: 500;
          color: ${c.stone};
          background: transparent; border: none; cursor: pointer; text-align: left;
          width: 100%;
          transition: background 120ms, color 120ms;
        }
        .sr-nav-item:hover { background: rgba(245,242,237,0.04); color: ${c.chalk}; }
        .sr-nav-item.active { background: rgba(212,179,127,0.08); color: ${c.gilt}; }

        /* Mobile: hide sidebar nav — main column owns everything. */
        @media (max-width: 1080px) {
          .sr-sidebar-panel { display: none; }
        }

        /* Touch target minimum on mobile. */
        @media (max-width: 640px) {
          .sr-shell button { min-height: 40px; }
        }

        /* Desktop: right rail owns core-metrics; hide the in-main strip.
           Mobile (rail stacks below): show the in-main strip so metrics
           appear near the top instead of below 10 other sections. */
        @media (min-width: 1081px) {
          .sr-metrics-strip { display: none !important; }
        }
      `}</style>

      {/* Back button */}
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13,
        color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px",
      }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </button>

      {/* Loading */}
      {loading && !report && (
        <div role="status" aria-live="polite" style={{
          background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
          padding: "48px 32px", textAlign: "center",
        }}>
          <div style={{
            width: 40, height: 40, border: `3px solid rgba(212,179,127,0.18)`, borderTopColor: c.gilt,
            borderRadius: "50%", margin: "0 auto 16px", animation: "reportspin 0.9s linear infinite",
          }} />
          <style>{`@keyframes reportspin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontFamily: font.display, fontSize: 20, color: c.ivory, margin: "0 0 6px" }}>Grading your interview…</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: 0 }}>
            Analyzing your answers, delivery, and structure. ~10 seconds.
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && errorMsg && !report && (
        <div role="alert" style={{
          background: c.graphite, borderRadius: 14, border: `1px solid rgba(196,112,90,0.25)`,
          padding: "28px 32px", textAlign: "center",
        }}>
          <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory, margin: "0 0 6px" }}>Couldn't build your report</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: "0 0 16px" }}>{errorMsg}</p>
          <button
            onClick={onRetry}
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              background: c.gilt, border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer",
            }}
          >Retry</button>
        </div>
      )}

      {/* Report content — 3-column grid on desktop, stacked on mobile */}
      {report && bandMeta && (
        <div className="sr-grid">
          {/* ── Left sidebar: jump nav + export controls ── */}
          <aside className="sr-sidebar sr-sidebar-panel" aria-label="Section navigation">
            <ReportSidebar onDownloadPdf={onDownloadPdf} />
          </aside>

          {/* ── Main column: hero + scrollable sections ── */}
          <div className="sr-main">
          {/* 1. Hero */}
          <div id="sr-hero" style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "28px 32px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <span style={{
                    display: "inline-block", fontFamily: font.ui, fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: bandMeta.color, background: bandMeta.bg, padding: "4px 10px", borderRadius: 4,
                  }}>{bandMeta.label}</span>
                  {report.calibration && report.calibration.companyLabel !== "Generic" && (
                    <span
                      title={report.calibration.note}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontFamily: font.ui, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                        color: c.gilt, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.2)",
                        padding: "3px 9px", borderRadius: 4,
                      }}
                    >
                      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      Calibrated · {report.calibration.companyLabel}
                    </span>
                  )}
                </div>
                <h1 style={{ fontFamily: font.display, fontSize: 30, fontWeight: 400, color: c.ivory, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                  Your interview report
                </h1>
                {report.verdict && (
                  <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.6, margin: "0 0 12px", maxWidth: 540 }}>
                    {report.verdict}
                  </p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: font.ui, fontSize: 11, color: c.stone }}>
                  <span>{session.type}</span>
                  <span>·</span>
                  <span>{session.role}</span>
                  <span>·</span>
                  <span>{session.dateLabel}</span>
                  <span>·</span>
                  <span>{session.duration}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  fontFamily: font.mono, fontSize: 56, fontWeight: 700, color: c.ivory, lineHeight: 1,
                }}>{report.overallScore}</div>
                <div style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
                  / 100
                  {typeof report.scoreConfidence === "number" && report.scoreConfidence < 1 && (() => {
                    // Confidence → ±band. 0.95 → ±2, 0.80 → ±6, 0.55 → ±12.
                    const band = Math.round((1 - report.scoreConfidence) * 25);
                    if (band <= 1) return null;
                    return (
                      <span
                        title={`Score confidence: ${Math.round(report.scoreConfidence * 100)}%`}
                        style={{ marginLeft: 6, color: c.stone, fontFamily: font.mono }}
                      >· ±{band}</span>
                    );
                  })()}
                </div>
                {trend.length >= 2 && <Sparkline points={trend} currentId={session.id} />}
                <button
                  onClick={onDownloadPdf}
                  className="sr-print-hide"
                  aria-label="Download report as PDF"
                  style={{
                    fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone,
                    background: "transparent", border: `1px solid ${c.border}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 4,
                    marginTop: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = c.chalk; e.currentTarget.style.borderColor = "rgba(245,242,237,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = c.border; }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  PDF
                </button>
              </div>
            </div>

            {/* Top wins + fixes — two columns on desktop, stack on mobile */}
            {(report.wins?.length > 0 || report.fixes?.length > 0) && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14, marginTop: 20,
              }}>
                {report.wins?.length > 0 && (
                  <WinFixList
                    items={report.wins}
                    label="What worked"
                    tone="win"
                  />
                )}
                {report.fixes?.length > 0 && (
                  <WinFixList
                    items={report.fixes}
                    label="What to fix"
                    tone="fix"
                  />
                )}
              </div>
            )}
          </div>

          {/* Coach's note — longitudinal insights from prior sessions.
              Turns the report into a coach (not a scorecard) for returning users. */}
          {report.crossSessionInsights && report.crossSessionInsights.length > 0 && (
            <div id="sr-coachnote">
              <CoachNoteSection insights={report.crossSessionInsights} priorCount={report.priorSessionCount} />
            </div>
          )}

          {/* Red-flag detector — rejection-grade signals shown above the fold */}
          {report.redFlags && report.redFlags.length > 0 && (
            <div id="sr-redflags">
              <RedFlagsSection flags={report.redFlags} />
            </div>
          )}

          {/* 2. Core Metrics Strip (mobile only — right rail owns this on desktop) */}
          <div id="sr-metrics" className="sr-metrics-strip" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}>
            <MetricTile label="Filler Words" value={report.coreMetrics.fillerPerMin} unit="/ min" target="0–3" good={bandForFiller(report.coreMetrics.fillerPerMin)} />
            <MetricTile label="Silence Ratio" value={report.coreMetrics.silenceRatio} unit="%" target="0–20%" good={bandForSilence(report.coreMetrics.silenceRatio)} />
            <MetricTile label="Pace" value={report.coreMetrics.paceWpm} unit="wpm" target="140–180" good={bandForPace(report.coreMetrics.paceWpm)} />
            <MetricTile label="Energy" value={report.coreMetrics.energy} unit="/ 100" target="60–100" good={bandForEnergy(report.coreMetrics.energy)} />
          </div>

          {/* 3. Skills Breakdown */}
          {report.skills && report.skills.length > 0 && (
            <div id="sr-skills" style={{
              background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
              padding: "22px 28px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <h2 className="sr-section-h" style={{ color: c.ivory, border: "none", padding: 0, margin: 0, fontFamily: font.ui, fontSize: 18, fontWeight: 700 }}>
                  Skills Breakdown
                </h2>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 1.5, height: 10, background: "rgba(245,242,237,0.45)" }} />
                  cohort avg
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {report.skills.map((s) => (
                  <SkillBar key={s.name} name={s.name} score={s.score} cohortAvg={getCohortAverage(roleFamily, s.name)} />
                ))}
              </div>
            </div>
          )}

          {/* Advanced delivery panel — hedging density, lexical diversity, latency, self-correction */}
          {report.advancedDelivery && (
            <div id="sr-advanced">
              <AdvancedDeliveryPanel ad={report.advancedDelivery} />
            </div>
          )}

          {/* Interviewer thought bubble — LLM-inferred cognitive state over time */}
          {report.thoughtBubble && report.thoughtBubble.length > 0 && (
            <div id="sr-thought">
              <ThoughtBubbleTimeline segments={report.thoughtBubble} totalMs={parseDurationSec(session.duration) * 1000} />
            </div>
          )}

          {/* Hidden-bias / perception-optimizer — detected from candidate's own answers */}
          {report.perQuestion && report.perQuestion.length > 0 && (
            <div id="sr-bias">
              <BiasPanel
                answers={report.perQuestion.map((q) => q.answerText || "")}
                nonNativeEnglish={detectNonNativeEnglish()}
              />
            </div>
          )}

          {/* Story reuse — flags when one story was stretched across multiple competencies */}
          {report.storyReuseFindings && report.storyReuseFindings.length > 0 && (
            <div id="sr-reuse">
              <StoryReuseSection findings={report.storyReuseFindings} />
            </div>
          )}

          {/* 4. Per-question deep-dive */}
          {report.perQuestion && report.perQuestion.length > 0 && (
            <div id="sr-questions">
              <h2 className="sr-section-h" style={{ fontFamily: font.ui, color: c.ivory }}>
                Per-question Review
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.perQuestion.map((q, i) => <QuestionCard key={i} q={q} index={i} sessionId={session.id} />)}
              </div>
            </div>
          )}

          {/* Blind spots — competencies NOT assessed in this session but common in real loops */}
          {report.blindSpots && report.blindSpots.length > 0 && (
            <div id="sr-blindspots">
              <BlindSpotsSection blindSpots={report.blindSpots} />
            </div>
          )}

          {/* Readiness forecast — estimated effort to reach target band */}
          {report.readiness && (
            <div id="sr-readiness">
              <ReadinessSection readiness={report.readiness} priorSessionCount={report.priorSessionCount} />
            </div>
          )}

          {/* 5. Next Steps */}
          <div id="sr-next" style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "22px 28px", textAlign: "center",
          }}>
            <h2 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, margin: "0 0 6px" }}>
              Ready to improve?
            </h2>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: "0 0 16px" }}>
              {weakestQuestion
                ? "Queue up your weakest question as a solo drill, or run a focused pack on your weakest skill."
                : "Start another session to keep building."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={onTryAgain}
                style={{
                  fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.obsidian,
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  border: "none", borderRadius: 10, padding: "12px 24px", cursor: "pointer",
                  boxShadow: "0 8px 24px rgba(212,179,127,0.18)",
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                {weakestQuestion ? "Try weakest question again" : "Start a new session"}
              </button>
              {weakestSkill && (
                <button
                  onClick={onDrillSkill}
                  style={{
                    fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.chalk,
                    background: "transparent", border: `1px solid rgba(245,242,237,0.18)`,
                    borderRadius: 10, padding: "12px 24px", cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.35)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.18)"; }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v6m0 8v6m-10-10h6m8 0h6"/></svg>
                  Drill {weakestSkill.name}
                </button>
              )}
            </div>
          </div>

          {/* Trust + usefulness polls — diagnostic signal for tuning the rubric */}
          <div className="sr-print-hide" style={{
            padding: "18px 24px",
            background: "rgba(245,242,237,0.02)", border: `1px solid ${c.border}`,
            borderRadius: 12, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between",
          }}>
            <PollRow label="Do these scores feel fair?" answer={trustAnswer} onAnswer={(v) => onPollAnswer("trust", v)} />
            <PollRow label="Did this help you know what to improve?" answer={usefulAnswer} onAnswer={(v) => onPollAnswer("usefulness", v)} />
          </div>
          </div>
          {/* ── Right rail: sticky quick-stats + primary CTAs ── */}
          <aside className="sr-rail" aria-label="Quick stats and actions">
            <ReportRightRail
              report={report}
              weakestQuestion={weakestQuestion}
              weakestSkill={weakestSkill}
              onTryAgain={onTryAgain}
              onDrillSkill={onDrillSkill}
            />
          </aside>
        </div>
      )}

      {/* Print-only styles: hide controls, make layout printable */}
      <style>{`
        @media print {
          body { background: white; }
          .sr-print-hide { display: none !important; }
          button { cursor: default !important; }
          mark { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
});

/**
 * Heuristic: if the browser's primary language isn't English, assume the user
 * is a non-native English speaker. Soft signal — the detector applies a
 * stricter threshold for over-hedging in that mode. User opt-out setting
 * would override this in the future.
 */
function detectNonNativeEnglish(): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    const lang = (navigator.language || "").toLowerCase();
    return lang.length > 0 && !lang.startsWith("en");
  } catch { return false; }
}

const BAND_LABEL_SHORT: Record<"strongHire" | "hire" | "leanHire", string> = {
  strongHire: "Strong Hire",
  hire: "Hire",
  leanHire: "Lean Hire",
};

const CONFIDENCE_META: Record<"low" | "medium" | "high", { color: string; label: string }> = {
  low:    { color: c.stone, label: "Low confidence"    },
  medium: { color: c.gilt,  label: "Medium confidence" },
  high:   { color: c.sage,  label: "High confidence"   },
};

/** Blind-spot map — competencies never assessed but common at the target role. */
function BlindSpotsSection({ blindSpots }: { blindSpots: SessionReportBlindSpot[] }) {
  return (
    <div style={{
      background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
      padding: "20px 24px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>
          Blind spots
        </h2>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
          · competencies you weren&apos;t asked about
        </span>
      </div>
      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 12px", lineHeight: 1.5 }}>
        Don&apos;t overfit to the questions you saw. Real loops test these patterns — prep a story for each.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {blindSpots.map((bs, i) => (
          <div key={i} style={{
            background: "rgba(245,242,237,0.03)", border: `1px solid ${c.border}`,
            borderRadius: 10, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>
                {bs.competency}
              </span>
              {typeof bs.frequencyPct === "number" && bs.frequencyPct > 0 && (
                <span
                  title={`Asked in ~${bs.frequencyPct}% of relevant loops`}
                  style={{
                    fontFamily: font.mono, fontSize: 10, fontWeight: 600,
                    color: c.stone, background: "rgba(245,242,237,0.04)",
                    padding: "2px 6px", borderRadius: 3, border: `1px solid ${c.border}`,
                    flexShrink: 0,
                  }}
                >{bs.frequencyPct}%</span>
              )}
            </div>
            {bs.note && (
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5, margin: 0 }}>
                {bs.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Readiness forecast — estimated practice to reach target band. */
function ReadinessSection({ readiness, priorSessionCount }: {
  readiness: SessionReportReadiness;
  priorSessionCount: number;
}) {
  const confMeta = CONFIDENCE_META[readiness.confidence];
  const targetLabel = BAND_LABEL_SHORT[readiness.targetBand];
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(122,158,126,0.06), rgba(122,158,126,0.02))`,
      border: `1px solid rgba(122,158,126,0.22)`,
      borderRadius: 14, padding: "20px 24px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(122,158,126,0.14)", border: "1px solid rgba(122,158,126,0.28)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>
            Estimated path to {targetLabel}
          </h2>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "2px 0 0" }}>
            Based on {priorSessionCount > 0 ? `${priorSessionCount} prior session${priorSessionCount === 1 ? "" : "s"}` : "this session only"} and structured-interview improvement curves
          </p>
        </div>
        <span
          title={confMeta.label}
          style={{
            fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: confMeta.color, background: `${confMeta.color}14`, border: `1px solid ${confMeta.color}33`,
            padding: "3px 8px", borderRadius: 3, flexShrink: 0,
          }}
        >{confMeta.label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 10 }}>
        <div style={{
          background: "rgba(245,242,237,0.02)", borderRadius: 10, padding: "12px 14px",
          border: `1px solid ${c.border}`,
        }}>
          <div style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Focused hours</div>
          <div style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: c.ivory, lineHeight: 1.1, marginTop: 4 }}>
            {readiness.estimatedHours}
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, fontWeight: 400, marginLeft: 4 }}>hrs</span>
          </div>
        </div>
        <div style={{
          background: "rgba(245,242,237,0.02)", borderRadius: 10, padding: "12px 14px",
          border: `1px solid ${c.border}`,
        }}>
          <div style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mock sessions</div>
          <div style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: c.ivory, lineHeight: 1.1, marginTop: 4 }}>
            {readiness.estimatedSessions}
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, fontWeight: 400, marginLeft: 4 }}>runs</span>
          </div>
        </div>
      </div>

      {readiness.rationale && (
        <p style={{ fontFamily: font.ui, fontSize: 12, fontStyle: "italic", color: c.chalk, lineHeight: 1.55, margin: 0 }}>
          {readiness.rationale}
        </p>
      )}
    </div>
  );
}

/* ─── Layout chrome: sidebar nav + right rail ───────────────────── */

const NAV_ITEMS = [
  { id: "sr-hero",        label: "Overview" },
  { id: "sr-coachnote",   label: "Coach's note" },
  { id: "sr-redflags",    label: "Red flags" },
  { id: "sr-metrics",     label: "Delivery" },
  { id: "sr-skills",      label: "Skills" },
  { id: "sr-advanced",    label: "Advanced" },
  { id: "sr-thought",     label: "Thought bubble" },
  { id: "sr-bias",        label: "Perception" },
  { id: "sr-reuse",       label: "Story reuse" },
  { id: "sr-questions",   label: "Per-question" },
  { id: "sr-blindspots",  label: "Blind spots" },
  { id: "sr-readiness",   label: "Readiness" },
  { id: "sr-next",        label: "Next steps" },
];

/** Sidebar: jump-nav + export. Scrolls to anchors, highlights active section. */
function ReportSidebar({ onDownloadPdf }: { onDownloadPdf: () => void }) {
  const [active, setActive] = useState<string>("sr-hero");

  useEffect(() => {
    const ids = NAV_ITEMS.map((n) => n.id);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.1) {
            setActive(e.target.id);
            break;
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0.1, 0.3] },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{
      background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 12,
      padding: "14px 10px",
    }}>
      <div style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.stone, padding: "0 8px 8px" }}>
        Report
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const el = typeof document !== "undefined" ? document.getElementById(item.id) : null;
          // Only render nav items whose section actually mounted.
          if (!el) return null;
          return (
            <button
              key={item.id}
              className={`sr-nav-item${active === item.id ? " active" : ""}`}
              onClick={() => jump(item.id)}
            >{item.label}</button>
          );
        })}
      </nav>
      <div style={{ borderTop: `1px solid ${c.border}`, margin: "12px 0 10px" }} />
      <button
        onClick={onDownloadPdf}
        className="sr-nav-item sr-print-hide"
        style={{ color: c.chalk }}
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PDF
      </button>
    </div>
  );
}

/** Right rail: always-visible core metrics + readiness summary + primary CTAs. */
function ReportRightRail({
  report, weakestQuestion, weakestSkill, onTryAgain, onDrillSkill,
}: {
  report: SessionReport;
  weakestQuestion: SessionReportPerQuestion | null;
  weakestSkill: { name: string; score: number } | null;
  onTryAgain: () => void;
  onDrillSkill: () => void;
}) {
  const metrics = report.coreMetrics;
  const rail: Array<{ label: string; value: string | number; sub: string; good: "green" | "amber" | "red" }> = [
    { label: "Fillers / min", value: metrics.fillerPerMin, sub: "target 0–3", good: bandForFiller(metrics.fillerPerMin) },
    { label: "Silence",       value: `${metrics.silenceRatio}%`, sub: "target ≤20%", good: bandForSilence(metrics.silenceRatio) },
    { label: "Pace",          value: `${metrics.paceWpm} wpm`, sub: "target 140–180", good: bandForPace(metrics.paceWpm) },
    { label: "Energy",        value: `${metrics.energy} / 100`, sub: "target ≥60", good: bandForEnergy(metrics.energy) },
  ];

  return (
    <div className="sr-print-hide" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Quick stats */}
      <div style={{ background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.stone, marginBottom: 12 }}>
          Quick stats
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rail.map((m) => {
            const dot = m.good === "green" ? c.sage : m.good === "amber" ? c.gilt : c.ember;
            return (
              <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span aria-label={`${m.good} status`} style={{
                    display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: dot, flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{m.label}</span>
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.ivory, whiteSpace: "nowrap" }}>{m.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Readiness (short form) */}
      {report.readiness && (
        <div style={{
          background: `linear-gradient(135deg, rgba(122,158,126,0.08), rgba(122,158,126,0.02))`,
          border: `1px solid rgba(122,158,126,0.22)`, borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.sage, marginBottom: 8 }}>
            Readiness
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.ivory, lineHeight: 1.1 }}>
            {report.readiness.estimatedHours}
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>hrs</span>
          </div>
          <div style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4 }}>
            to {BAND_LABEL_SHORT[report.readiness.targetBand]} · {report.readiness.estimatedSessions} sessions
          </div>
        </div>
      )}

      {/* Primary CTAs — always reachable on desktop. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {weakestQuestion && (
          <button
            onClick={onTryAgain}
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
              background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
              border: "none", borderRadius: 10, padding: "12px 16px", cursor: "pointer",
              boxShadow: "0 6px 18px rgba(212,179,127,0.18)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
            Try weakest question
          </button>
        )}
        {weakestSkill && (
          <button
            onClick={onDrillSkill}
            style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk,
              background: "transparent", border: `1px solid rgba(245,242,237,0.18)`,
              borderRadius: 10, padding: "10px 16px", cursor: "pointer",
            }}
          >
            Drill {weakestSkill.name}
          </button>
        )}
      </div>
    </div>
  );
}

/** Length verdict badge — inline pill rendered after the answer block. */
function LengthVerdictBadge({ lv }: { lv: NonNullable<SessionReportPerQuestion["lengthVerdict"]> }) {
  const meta = {
    "too-brief": { label: "Too brief",  color: c.ember, bg: "rgba(196,112,90,0.06)" },
    "right":     { label: "Right length", color: c.sage, bg: "rgba(122,158,126,0.06)" },
    "too-long":  { label: "Too long",   color: c.ember, bg: "rgba(196,112,90,0.06)" },
  }[lv.verdict];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "8px 12px", background: meta.bg, border: `1px solid ${meta.color}33`, borderRadius: 8,
    }}>
      <span style={{
        fontFamily: font.ui, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
        color: meta.color,
      }}>{meta.label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.chalk }}>
        {lv.wordCount} words
      </span>
      {lv.targetRange && (
        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
          · target {lv.targetRange}
        </span>
      )}
      {lv.note && (
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1, minWidth: 200 }}>
          {lv.note}
        </span>
      )}
    </div>
  );
}

/** Likely follow-up question — trains adaptive thinking. */
function LikelyFollowUp({ fu }: { fu: NonNullable<SessionReportPerQuestion["likelyFollowUp"]> }) {
  return (
    <div style={{
      background: "rgba(126,141,152,0.05)", border: `1px solid rgba(126,141,152,0.2)`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.slate} strokeWidth="2">
          <path d="M9 5l7 7-7 7" />
        </svg>
        <span style={{
          fontFamily: font.ui, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: c.slate,
        }}>They&apos;d likely ask next</span>
      </div>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.55, margin: 0 }}>
        &ldquo;{fu.question}&rdquo;
      </p>
      {fu.why && (
        <p style={{ fontFamily: font.ui, fontSize: 11, fontStyle: "italic", color: c.stone, lineHeight: 1.5, margin: "6px 0 0" }}>
          {fu.why}
        </p>
      )}
    </div>
  );
}

/** Story-reuse callout section — flags when one story stretches across competencies. */
function StoryReuseSection({ findings }: { findings: SessionReportStoryReuse[] }) {
  return (
    <div style={{
      background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.22)`,
      borderRadius: 14, padding: "18px 24px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <h2 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>
          Story reuse detected
        </h2>
      </div>
      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 12px", lineHeight: 1.5 }}>
        Interviewers flag candidates who stretch one project across many competencies. Rotate more of your portfolio in.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {findings.map((f, i) => (
          <li key={i} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "10px 12px", background: "rgba(212,179,127,0.05)",
            border: `1px solid rgba(212,179,127,0.14)`, borderRadius: 8,
          }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>
                  {f.storyLabel}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
                  used in {f.questionIndices.map((i) => `Q${i + 1}`).join(", ")}
                </span>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.55, margin: "3px 0 0" }}>
                {f.concern}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const INSIGHT_META: Record<SessionReportCrossSessionInsight["kind"], { label: string; color: string; bg: string; icon: string }> = {
  improvement: { label: "Improved",   color: c.sage,  bg: "rgba(122,158,126,0.08)", icon: "↑" },
  regression:  { label: "Regressed",  color: c.ember, bg: "rgba(196,112,90,0.08)",  icon: "↓" },
  persistent:  { label: "Persistent", color: c.gilt,  bg: "rgba(212,179,127,0.08)", icon: "!" },
};

/**
 * Coach's note — longitudinal insights synthesized from the user's last 3
 * reports. Empty on first session; fills with improvement/regression/persistent
 * callouts once history exists. This is the feature that makes the report
 * feel like a coach rather than a scorecard.
 */
function CoachNoteSection({ insights, priorCount }: { insights: SessionReportCrossSessionInsight[]; priorCount: number }) {
  // Sort: persistent first (highest-priority for behavior change), then regression, then improvement.
  const sorted = [...insights].sort((a, b) => {
    const order = { persistent: 0, regression: 1, improvement: 2 };
    return order[a.kind] - order[b.kind];
  });
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(212,179,127,0.05), rgba(212,179,127,0.02))`,
      border: `1px solid rgba(212,179,127,0.22)`,
      borderRadius: 14, padding: "20px 24px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(212,179,127,0.12)", border: "1px solid rgba(212,179,127,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.8">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>
            Coach&apos;s note
          </h2>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "2px 0 0" }}>
            Based on your last {priorCount} session{priorCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((ins, i) => {
          const meta = INSIGHT_META[ins.kind];
          const deltaStr = typeof ins.delta === "number"
            ? `${ins.delta > 0 ? "+" : ""}${ins.delta}`
            : null;
          return (
            <li key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              background: meta.bg, border: `1px solid ${meta.color}22`,
              borderRadius: 8, padding: "10px 12px",
            }}>
              <span aria-hidden="true" style={{
                width: 22, height: 22, borderRadius: "50%",
                background: meta.color, color: c.obsidian,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontFamily: font.mono, fontSize: 12, fontWeight: 700,
                flexShrink: 0,
              }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: meta.color,
                  }}>{meta.label}</span>
                  {ins.metric && (
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
                      {ins.metric}
                    </span>
                  )}
                  {deltaStr && (
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: meta.color }}>
                      {deltaStr}
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.55, margin: "3px 0 0" }}>
                  {ins.text}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sparkline — recent session scores, left→right. Anchors the current score socially. */
function Sparkline({ points, currentId }: { points: SessionTrendPoint[]; currentId: string }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const pad = 2;
  const min = Math.min(...points.map((p) => p.score));
  const max = Math.max(...points.map((p) => p.score));
  const range = Math.max(max - min, 1);
  const xFor = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const yFor = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.score).toFixed(1)}`).join(" ");
  const currentIdx = points.findIndex((p) => p.id === currentId);
  const highlightIdx = currentIdx >= 0 ? currentIdx : points.length - 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={W} height={H} aria-label={`Score trend over last ${points.length} sessions`} role="img">
        <path d={d} fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        <circle cx={xFor(highlightIdx)} cy={yFor(points[highlightIdx].score)} r={3} fill={c.gilt} />
      </svg>
      <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>
        last {points.length} sessions
      </span>
    </div>
  );
}

/** Red-flag detector section — bar-raiser-grade signals above the fold. */
function RedFlagsSection({ flags }: { flags: SessionReportRedFlag[] }) {
  const sorted = [...flags].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return (
    <div style={{
      background: "rgba(196,112,90,0.08)",
      border: `1px solid rgba(196,112,90,0.28)`,
      borderLeft: `4px solid ${c.ember}`,
      borderRadius: 14, padding: "18px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2">
          <path d="M4 4v16M4 4l14 4-4 5 4 5-14 2" />
        </svg>
        <h2 className="sr-section-h" style={{ color: c.ember, border: "none", padding: 0, margin: 0, fontFamily: font.ui, fontSize: 18, fontWeight: 700 }}>
          Red flags to address
        </h2>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: "auto" }}>
          {flags.length} issue{flags.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map((f, i) => {
          const color = SEVERITY_COLOR[f.severity];
          return (
            <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span aria-label={`severity: ${f.severity}`} style={{
                width: 6, alignSelf: "stretch", borderRadius: 3, background: color, flexShrink: 0,
                marginTop: 4, marginBottom: 4,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>
                    {f.title || RED_FLAG_TYPE_LABELS[f.type]}
                  </span>
                  <span style={{
                    fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color, padding: "1px 6px", borderRadius: 3, border: `1px solid ${color}33`,
                  }}>{f.severity}</span>
                  {f.questionIdx >= 0 && (
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>Q{f.questionIdx + 1}</span>
                  )}
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.55, margin: "4px 0 0" }}>
                  {f.explanation}
                </p>
                {f.quote && (
                  <p style={{ fontFamily: font.ui, fontSize: 11, fontStyle: "italic", color: c.stone, lineHeight: 1.5, margin: "3px 0 0" }}>
                    “{f.quote.length > 140 ? f.quote.slice(0, 140) + "…" : f.quote}”
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Single poll row — yes/no choice, collapses to a thank-you after answer. */
function PollRow({ label, answer, onAnswer }: {
  label: string; answer: "yes" | "no" | null; onAnswer: (v: "yes" | "no") => void;
}) {
  const answered = answer !== null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontFamily: font.ui, fontSize: 12, color: answered ? c.stone : c.chalk }}>
        {label}
      </span>
      {answered ? (
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          thanks
        </span>
      ) : (
        <div style={{ display: "inline-flex", gap: 6 }}>
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onAnswer(v)}
              style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 500,
                color: c.chalk, background: "transparent",
                border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 10px",
                cursor: "pointer", transition: "all 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.35)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
            >
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Advanced delivery panel — hedging / diversity / ownership / latency / self-correction. */
function AdvancedDeliveryPanel({ ad }: { ad: NonNullable<SessionReport["advancedDelivery"]> }) {
  const tiles = [
    {
      label: "Hedging / min",
      value: ad.hedgingPerMin.toString(),
      target: "≤ 2",
      good: ad.hedgingPerMin <= 2 ? "green" : ad.hedgingPerMin <= 4 ? "amber" : "red",
      hint: "“I think…”, “maybe…”. Hedges reduce perceived authority.",
    },
    {
      label: "Lexical diversity",
      value: ad.lexicalDiversity.toFixed(2),
      target: "0.40+",
      good: ad.lexicalDiversity >= 0.40 ? "green" : ad.lexicalDiversity >= 0.30 ? "amber" : "red",
      hint: "Ratio of unique words. Higher reads as more competent.",
    },
    {
      label: "First-person (I:we)",
      value: `${Math.round(ad.firstPersonRatio * 100)}%`,
      target: "40–70%",
      good: ad.firstPersonRatio >= 0.4 && ad.firstPersonRatio <= 0.7 ? "green" : ad.firstPersonRatio >= 0.3 ? "amber" : "red",
      hint: "Too much “we” hides your contribution; too much “I” reads as a lone wolf.",
    },
    {
      label: "Response latency",
      value: ad.medianLatencyMs > 0 ? `${(ad.medianLatencyMs / 1000).toFixed(1)}s` : "—",
      target: "1–3s",
      good: ad.medianLatencyMs === 0 ? "amber"
        : ad.medianLatencyMs >= 1000 && ad.medianLatencyMs <= 3000 ? "green"
        : ad.medianLatencyMs <= 6000 ? "amber" : "red",
      hint: "Median gap between question end and your first word.",
    },
    {
      label: "Self-corrections / min",
      value: ad.selfCorrectionRate.toString(),
      target: "≤ 1",
      good: ad.selfCorrectionRate <= 1 ? "green" : ad.selfCorrectionRate <= 2 ? "amber" : "red",
      hint: "“Let me rephrase…”, “actually…” — cognitive-load signal.",
    },
  ];
  return (
    <div style={{
      background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
      padding: "22px 28px", marginBottom: 20,
    }}>
      <h2 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, margin: "0 0 4px" }}>
        Advanced delivery
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 16px" }}>
        Signals competitors don't surface. Tune these and your charisma jumps.
      </p>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10,
      }}>
        {tiles.map((t) => {
          const dotColor = t.good === "green" ? c.sage : t.good === "amber" ? c.gilt : c.ember;
          return (
            <div key={t.label} title={t.hint} style={{
              background: "rgba(245,242,237,0.02)", border: `1px solid ${c.border}`, borderRadius: 10,
              padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.label}</span>
                <span
                  title={t.good === "green" ? "On target" : t.good === "amber" ? "Slightly off" : "Needs work"}
                  aria-label={`${t.good} status`}
                  style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: dotColor }}
                />
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>{t.value}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Target: {t.target}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const THOUGHT_STATE_META: Record<SessionReport["thoughtBubble"][number]["state"], { label: string; color: string }> = {
  tracking:         { label: "Tracking",           color: c.sage },
  impressed:        { label: "Impressed",          color: c.sage },
  probingForScope:  { label: "Probing for scope",  color: c.gilt },
  readyToMoveOn:    { label: "Ready to move on",   color: c.gilt },
  losingThread:     { label: "Losing thread",      color: c.ember },
  concerned:        { label: "Concerned",          color: c.ember },
};

/** Interviewer thought-bubble timeline — horizontal colored ribbon + per-segment notes. */
function ThoughtBubbleTimeline({ segments, totalMs }: { segments: SessionReport["thoughtBubble"]; totalMs: number }) {
  // Normalize segments: if endMs values are all 0 (no real timestamps), lay
  // them out in equal slices.
  const hasReal = segments.some((s) => (s.endMs || 0) > 0);
  const maxMs = hasReal
    ? Math.max(totalMs, ...segments.map((s) => s.endMs || 0))
    : segments.length;
  const norm = segments.map((s, i) => ({
    ...s,
    _start: hasReal ? s.startMs : i,
    _end:   hasReal ? Math.max(s.endMs, s.startMs + 1) : i + 1,
  }));
  const fmt = (ms: number) => hasReal ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : "";

  return (
    <div style={{
      background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
      padding: "22px 28px", marginBottom: 20,
    }}>
      <h2 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, margin: "0 0 4px" }}>
        What the interviewer was likely thinking
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 14px" }}>
        Inferred cognitive state segment-by-segment — use this to read between the lines.
      </p>

      {/* Ribbon */}
      <div role="img" aria-label="Interviewer thought timeline" style={{
        display: "flex", height: 14, borderRadius: 4, overflow: "hidden", background: c.obsidian, marginBottom: 14,
      }}>
        {norm.map((s, i) => {
          const meta = THOUGHT_STATE_META[s.state] || THOUGHT_STATE_META.tracking;
          const width = ((s._end - s._start) / maxMs) * 100;
          return (
            <div
              key={i}
              title={`${meta.label}${hasReal ? ` · ${fmt(s.startMs)}–${fmt(s.endMs)}` : ""}`}
              style={{ width: `${width}%`, background: meta.color, opacity: 0.82 }}
            />
          );
        })}
      </div>

      {/* Per-segment notes */}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {norm.map((s, i) => {
          const meta = THOUGHT_STATE_META[s.state] || THOUGHT_STATE_META.tracking;
          return (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{
                fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33`,
                padding: "2px 6px", borderRadius: 3, flexShrink: 0, minWidth: 90, textAlign: "center",
              }}>{meta.label}</span>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5, margin: 0 }}>
                {s.note}
                {hasReal && (
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, marginLeft: 6 }}>
                    · {fmt(s.startMs)}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Hidden-bias / perception-optimizer panel. Client-side regex; no LLM. */
function BiasPanel({ answers, nonNativeEnglish, disabled }: {
  answers: string[];
  nonNativeEnglish?: boolean;
  disabled?: boolean;
}) {
  const biasOpts = useMemo(() => ({ nonNativeEnglish, disabled }), [nonNativeEnglish, disabled]);
  const counts = useMemo(() => countBias(answers, biasOpts), [answers, biasOpts]);
  const total = counts.selfDiminutive + counts.overApology + counts.overHedging + counts.uptalk;
  if (disabled || total === 0) return null; // Clean — no need to raise the topic.

  // Collect up to 3 example hits for the collapsible examples list.
  const examples: Array<{ kind: BiasPatternKind; text: string; suggestion: string }> = [];
  for (const a of answers) {
    for (const h of detectBias(a, biasOpts)) {
      if (examples.length < 3) examples.push({ kind: h.kind, text: h.text, suggestion: h.suggestion });
    }
    if (examples.length >= 3) break;
  }

  return (
    <div style={{
      background: "rgba(212,179,127,0.03)", border: `1px solid rgba(212,179,127,0.18)`,
      borderRadius: 14, padding: "18px 24px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>
          Perception optimizer
        </h2>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
          · {total} pattern{total === 1 ? "" : "s"} detected
        </span>
      </div>
      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 12px", lineHeight: 1.5 }}>
        Language patterns research shows can quietly disadvantage you in interviews. Fixing these is low-effort, high-payoff.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: examples.length > 0 ? 12 : 0 }}>
        {(Object.entries(counts) as Array<[BiasPatternKind, number]>)
          .filter(([, n]) => n > 0)
          .map(([kind, n]) => (
            <span key={kind} style={{
              fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
              background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`,
              borderRadius: 6, padding: "4px 10px",
            }}>
              {BIAS_LABELS[kind]} · {n}
            </span>
          ))}
      </div>
      {examples.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {examples.map((ex, i) => (
            <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, color: c.gilt, fontFamily: font.mono, fontSize: 11 }}>→</span>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.5, margin: 0 }}>
                <span style={{ fontStyle: "italic", color: c.stone }}>“{ex.text}”</span>{" · "}
                <span>{ex.suggestion}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "32 min" / "1m 12s" / "12:34" → seconds. Defensive defaults. */
function parseDurationSec(s: string | undefined): number {
  if (!s) return 600;
  const str = String(s).trim();
  const colonMatch = str.match(/^(\d+):(\d+)$/);
  if (colonMatch) return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  const minMatch = str.match(/(\d+)\s*m/i);
  const secMatch = str.match(/(\d+)\s*s/i);
  let total = 0;
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);
  if (total > 0) return total;
  const plain = parseInt(str, 10);
  return Number.isFinite(plain) && plain > 0 ? plain : 600;
}

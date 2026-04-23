"use client";
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { c, font } from "./tokens";
import type { DashboardSession } from "./dashboardTypes";
import {
  evaluateSessionWithAI,
  saveStoryToNotebook,
  type SessionReport,
  type SessionReportBand,
  type SessionReportPerQuestion,
  type SessionReportWinFix,
} from "./dashboardData";
import { getCohortAverage, type RoleFamily } from "./roleBenchmarks";

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

const VERDICT_META: Record<SessionReportPerQuestion["verdict"], { label: string; color: string; bg: string }> = {
  strong:   { label: "Strong",   color: c.sage,  bg: "rgba(122,158,126,0.10)" },
  complete: { label: "Complete", color: c.sage,  bg: "rgba(122,158,126,0.06)" },
  partial:  { label: "Partial",  color: c.gilt,  bg: "rgba(212,179,127,0.08)" },
  weak:     { label: "Weak",     color: c.ember, bg: "rgba(196,112,90,0.06)" },
  skipped:  { label: "Skipped",  color: c.stone, bg: "rgba(158,158,158,0.06)" },
};

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

/** Reshape the session transcript into the evaluator API's turn schema. */
function toTurns(transcript: DashboardSession["transcript"]): Array<{ role: "interviewer" | "candidate"; text: string }> {
  return (transcript || [])
    .filter((t) => t.text && t.text.trim().length > 0)
    .map((t) => ({
      role: t.speaker === "user" || t.speaker === "candidate" ? "candidate" : "interviewer",
      text: t.text.trim(),
    }));
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
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: dotColor }} aria-label={`${good} status`} />
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

  return (
    <div style={{
      background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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

          {/* Restructured STAR answer with citation markers */}
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

          {/* Explanation */}
          {q.explanation && (
            <p style={{ fontFamily: font.ui, fontSize: 12, fontStyle: "italic", color: c.stone, lineHeight: 1.6, margin: 0 }}>
              {q.explanation}
            </p>
          )}

          {/* Per-question actions — MVP ships Save-to-Notebook; Try-again is covered by the global CTA. */}
          {q.verdict !== "skipped" && q.answerText && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 2 }}>
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
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  // Bumping this value re-runs the evaluate effect — used by the retry button.
  const [reloadTick, setReloadTick] = useState(0);

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
  }, [session.id, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      {/* Back button */}
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 8, fontFamily: font.ui, fontSize: 13,
        color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "0 0 20px",
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

      {/* Report content */}
      {report && bandMeta && (
        <>
          {/* 1. Hero */}
          <div style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "28px 32px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <span style={{
                  display: "inline-block", fontFamily: font.ui, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: bandMeta.color, background: bandMeta.bg, padding: "4px 10px", borderRadius: 4, marginBottom: 10,
                }}>{bandMeta.label}</span>
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
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontFamily: font.mono, fontSize: 56, fontWeight: 700, color: c.ivory, lineHeight: 1,
                }}>{report.overallScore}</div>
                <div style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4 }}>/ 100</div>
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

          {/* 2. Core Metrics Strip */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12, marginBottom: 20,
          }}>
            <MetricTile label="Filler Words" value={report.coreMetrics.fillerPerMin} unit="/ min" target="0–3" good={bandForFiller(report.coreMetrics.fillerPerMin)} />
            <MetricTile label="Silence Ratio" value={report.coreMetrics.silenceRatio} unit="%" target="0–20%" good={bandForSilence(report.coreMetrics.silenceRatio)} />
            <MetricTile label="Pace" value={report.coreMetrics.paceWpm} unit="wpm" target="140–180" good={bandForPace(report.coreMetrics.paceWpm)} />
            <MetricTile label="Energy" value={report.coreMetrics.energy} unit="/ 100" target="60–100" good={bandForEnergy(report.coreMetrics.energy)} />
          </div>

          {/* 3. Skills Breakdown */}
          {report.skills && report.skills.length > 0 && (
            <div style={{
              background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
              padding: "22px 28px", marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <h2 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, margin: 0 }}>
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

          {/* 4. Per-question deep-dive */}
          {report.perQuestion && report.perQuestion.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, margin: "0 0 12px", padding: "0 4px" }}>
                Per-question Review
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {report.perQuestion.map((q, i) => <QuestionCard key={i} q={q} index={i} sessionId={session.id} />)}
              </div>
            </div>
          )}

          {/* 5. Next Steps */}
          <div style={{
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
        </>
      )}
    </div>
  );
});

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

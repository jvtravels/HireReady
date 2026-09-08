import React, { useState, useEffect, useRef, useMemo } from "react";
import { e, ef } from "./interviewTokens";
import { stripProsodyMarkup } from "./_prosody";

/* Bridge aliases removed — call sites use e/ef directly. */

declare global {
  interface Navigator {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; addEventListener?: (event: string, cb: () => void) => void; removeEventListener?: (event: string, cb: () => void) => void };
  }
}

/* ─── Real Mic-Level Waveform Visualizer ─── */
export const WaveformVisualizer = React.memo(function WaveformVisualizer({ active, color, barCount = 16, stream }: { active: boolean; color: string; barCount?: number; stream?: MediaStream | null }) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0.1));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !stream) { setBars(Array(barCount).fill(0.1)); return; }
    let cancelled = false;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const update = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(dataArray);
      const newBars: number[] = [];
      const step = Math.floor(dataArray.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const idx = Math.min(i * step, dataArray.length - 1);
        newBars.push(0.08 + (dataArray[idx] / 255) * 0.92);
      }
      setBars(newBars);
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);

    return () => {
      cancelled = true;
      source.disconnect();
      ctx.close().catch(() => {});
      analyserRef.current = null;
      ctxRef.current = null;
    };
  }, [active, stream, barCount]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 40 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, height: `${h * 100}%`, background: color,
          opacity: active ? 0.8 : 0.15,
          transition: active ? "height 0.06s ease" : "height 0.5s ease, opacity 0.5s ease",
        }} />
      ))}
    </div>
  );
});

/* ─── Interviewer Names (deterministic per session) ─── */
/* Defaults pinned at index 0 of each pool so they're the most prominent
 * pick and the no-seed fallback. "Prita Menon" → female default;
 * "Rahul Verma" → male default. The gender→voice mapping lives in
 * server-handlers/sarvam-tts.ts (Sarvam bulbul:v3 voice roster). */
export const DEFAULT_FEMALE_INTERVIEWER = "Prita Menon";
export const DEFAULT_MALE_INTERVIEWER = "Rahul Verma";

export const INTERVIEWER_NAMES = [
  DEFAULT_FEMALE_INTERVIEWER, DEFAULT_MALE_INTERVIEWER,
  // Original pool
  "Arjun Mehta", "Priya Sharma", "Rohan Kapoor", "Ananya Patel", "Vikram Desai",
  "Kavya Nair", "Siddharth Joshi", "Neha Gupta", "Aditya Rao", "Deepika Iyer",
  "Karthik Nair", "Aisha Rahman", "Rajesh Iyer", "Meera Reddy", "Tanvi Kulkarni",
  // Extended pool — gender-balanced, regionally diverse Indian recruiter names
  "Suresh Babu", "Lakshmi Venkat", "Nikhil Bose", "Shreya Pillai", "Amit Saxena",
  "Divya Krishnamurthy", "Gaurav Tiwari", "Pooja Bhatt", "Manish Choudhary", "Riya Singhania",
  "Vivek Pandey", "Swati Dubey", "Harish Shetty", "Nandita Ghosh", "Kunal Malhotra",
  "Aparna Rajan", "Sandeep Garg", "Ishita Chatterjee", "Rakesh Nambiar", "Sonal Joshi",
  "Dhruv Mathur", "Kriti Aggarwal", "Prasad Kulkarni", "Vandana Hegde", "Ajay Thakur",
];

export function getInterviewerName(seed: string, userId?: string, company?: string): string {
  // Empty / missing seed → fall back to the canonical female default so
  // a fresh load (before session context is wired) still has a coherent
  // name and the Sarvam female voice plays.
  if (!seed) return DEFAULT_FEMALE_INTERVIEWER;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const absHash = Math.abs(hash);

  // localStorage deduplication: ensure no two different companies get the same
  // recruiter name for the same user in this browser session.
  if (typeof localStorage !== "undefined" && userId && company) {
    const usedKey = `hirestepx_recruiter_${userId}_used_names`;
    let usedMap: Record<string, string> = {};
    try {
      usedMap = JSON.parse(localStorage.getItem(usedKey) ?? "{}") as Record<string, string>;
    } catch {
      usedMap = {};
    }
    // Names already assigned to OTHER companies (not this one) are excluded.
    const excludedNames = new Set(
      Object.entries(usedMap)
        .filter(([compKey]) => compKey !== company)
        .map(([, name]) => name)
    );
    const pool = INTERVIEWER_NAMES.filter((n) => !excludedNames.has(n));
    // Fallback to full pool if all names are somehow exhausted.
    const chosen =
      pool.length > 0
        ? pool[absHash % pool.length]
        : INTERVIEWER_NAMES[absHash % INTERVIEWER_NAMES.length];
    usedMap[company] = chosen;
    try {
      localStorage.setItem(usedKey, JSON.stringify(usedMap));
    } catch {
      // localStorage full or unavailable — silently ignore.
    }
    return chosen;
  }

  return INTERVIEWER_NAMES[absHash % INTERVIEWER_NAMES.length];
}

/* ─── Interviewer reroll (user-initiated voice change) ───
 * getInterviewerName's hash is otherwise fully deterministic per
 * (type, focus, company, userId), so a user who dislikes the assigned
 * voice has no way to get a different one. This per-user counter is
 * mixed into the seed (see useInterviewEngine.ts) to let them roll to
 * a new name/gender/voice on demand, persisted so it sticks across
 * reloads until they roll again. */
const REROLL_KEY_PREFIX = "hirestepx_interviewer_reroll_";

export function getInterviewerRerollCount(userId?: string): number {
  if (typeof localStorage === "undefined" || !userId) return 0;
  const raw = localStorage.getItem(`${REROLL_KEY_PREFIX}${userId}`);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function bumpInterviewerReroll(userId?: string): number {
  if (typeof localStorage === "undefined" || !userId) return 0;
  const next = getInterviewerRerollCount(userId) + 1;
  try {
    localStorage.setItem(`${REROLL_KEY_PREFIX}${userId}`, String(next));
  } catch {
    // localStorage full or unavailable — silently ignore.
  }
  return next;
}

// Prita is added explicitly; first name lookup keeps gender routing
// honest end-to-end (display name → gender → TTS voice).
const FEMALE_FIRST_NAMES = new Set([
  "Prita", "Priya", "Ananya", "Kavya", "Neha", "Deepika", "Aisha", "Meera", "Tanvi",
  // Extended pool female first names
  "Lakshmi", "Shreya", "Divya", "Pooja", "Riya", "Swati", "Nandita", "Aparna", "Ishita", "Sonal", "Kriti", "Vandana",
]);
/** Determine gender from interviewer name */
export function getInterviewerGender(name: string): "male" | "female" {
  const firstName = name.split(" ")[0];
  return FEMALE_FIRST_NAMES.has(firstName) ? "female" : "male";
}

/** Persona traits for salary-neg conversations. Each name maps to a
 *  small, distinct trait set so back-to-back sessions feel like
 *  meeting different hiring managers. Fed into the follow-up prompt
 *  as a one-line flavor cue. Deterministic by name. */
const PERSONA_TRAITS: Record<string, string> = {
  "Prita Menon":       "Composed, attentive. Pauses to acknowledge before redirecting. Asks clarifying questions before pushing back.",
  "Rahul Verma":       "Friendly but firm. Frames the offer plainly, gives you space to react, then probes one beat at a time.",
  "Arjun Mehta":       "Pragmatic, numbers-first. Likes to settle quickly. Slightly impatient with vague answers.",
  "Priya Sharma":      "Warm, listener. Asks 'how are you feeling about this?' before pushing on numbers.",
  "Rohan Kapoor":      "Direct, no-nonsense. Gives you the headline and waits. Doesn't sugarcoat constraints.",
  "Ananya Patel":      "Collaborative, frames trade-offs as joint problem-solving. 'Let's figure this out together.'",
  "Vikram Desai":      "Old-school IT services manager. Long pauses, careful with budget, references 'the band'.",
  "Kavya Nair":        "Senior, calm, inscrutable. Doesn't reveal where she can stretch until she has to.",
  "Siddharth Joshi":   "Startup founder energy. Fast, candid, willing to bend on equity but tight on cash.",
  "Neha Gupta":        "HR partner — process-heavy. References policy, vesting schedules, joining-bonus formulas.",
  "Aditya Rao":        "Engineering manager. Talks shop fluently, will get distracted into role-tech if you let him.",
  "Deepika Iyer":      "MNC GCC veteran. Polished, slightly bureaucratic. 'Let me check with comp committee.'",
  "Karthik Nair":      "Mid-tier services manager. Friendly, slightly underconfident on stretch authority.",
  "Aisha Rahman":      "Product company recruiter. Sharp on market data, brings up Levels.fyi unprompted.",
  "Rajesh Iyer":       "Veteran agency owner. Personal, persuasive, sells the work over the package.",
  "Meera Reddy":       "Design-studio principal. Warm, relational, frames pay against creative growth.",
  "Tanvi Kulkarni":    "First-time hiring manager. Earnest, slightly nervous, occasionally over-explains.",
};

export function getPersonaTrait(name: string): string {
  return PERSONA_TRAITS[name] || "Professional, neutral. Direct without being abrupt.";
}

/* ─── Panel Interview Members ─── */
export interface PanelMember {
  name: string;
  title: string;          // "Hiring Manager", "Technical Lead", "HR Partner"
  gender: "male" | "female";
  color: string;          // accent color for UI distinction
}

/** Deterministically pick 3 panelists (Hiring Manager, Technical Lead, HR Partner)
 *  with gender-matched names. Same seed → same panel every time. */
// Index-0 entries are the pinned defaults — Rahul / Prita are the
// canonical Indian-English personas the user sees first. The hash
// picker still uses the full pool, so the rest add variety.
const MALE_NAMES = [DEFAULT_MALE_INTERVIEWER, "Arjun Mehta", "Rohan Kapoor", "Vikram Desai", "Siddharth Joshi", "Aditya Rao", "Karthik Nair", "Rajesh Iyer"];
const FEMALE_NAMES = [DEFAULT_FEMALE_INTERVIEWER, "Priya Sharma", "Ananya Patel", "Kavya Nair", "Neha Gupta", "Deepika Iyer", "Meera Reddy", "Aisha Rahman"];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function getPanelMembers(seed: string): PanelMember[] {
  const h = hashString(seed);
  // Roles with assigned accent colors — editorial palette so the panel
  // avatars cohere with the cream/copper/indigo design system. Each role
  // gets a distinct tint while staying on-brand:
  //   Hiring Manager → copper (editorial accent — the "lead" voice)
  //   Technical Lead → indigo (interactive — the "challenger" voice)
  //   HR Partner     → success (warm green — the "supportive" voice)
  const roles: { title: string; color: string }[] = [
    { title: "Hiring Manager", color: "#B45309" },   // copper
    { title: "Technical Lead", color: "#312E81" },   // indigo
    { title: "HR Partner",     color: "#15803D" },   // success green
  ];
  // Distribute genders: use hash bits to decide. At least 1 male, 1 female.
  // Bit 0 → role[0] gender, bit 1 → role[1] gender, but clamp so we get mix
  const genderBits = h % 6; // 6 combos with at least 1M and 1F
  const genderPatterns: ("male" | "female")[][] = [
    ["male", "female", "female"],
    ["female", "male", "female"],
    ["female", "female", "male"],
    ["male", "male", "female"],
    ["male", "female", "male"],
    ["female", "male", "male"],
  ];
  const genders = genderPatterns[genderBits];

  const usedMale = new Set<number>();
  const usedFemale = new Set<number>();

  return roles.map((role, i) => {
    const gender = genders[i];
    const pool = gender === "male" ? MALE_NAMES : FEMALE_NAMES;
    const used = gender === "male" ? usedMale : usedFemale;
    // Pick a name from the pool using hash + index, avoiding duplicates
    let idx = (h + i * 7 + i) % pool.length;
    while (used.has(idx)) idx = (idx + 1) % pool.length;
    used.add(idx);
    return { name: pool[idx], title: role.title, gender, color: role.color };
  });
}

/* ─── Network Indicator ─── */
export const NetworkIndicator = React.memo(function NetworkIndicator() {
  const [quality, setQuality] = useState<"excellent" | "good" | "poor">("excellent");
  useEffect(() => {
    const check = () => {
      const conn = navigator.connection;
      if (conn) {
        const dl = conn.downlink ?? 10;
        const rtt = conn.rtt ?? 0;
        if (dl >= 5 && rtt < 100) setQuality("excellent");
        else if (dl >= 1 && rtt < 300) setQuality("good");
        else setQuality("poor");
      } else {
        setQuality(navigator.onLine ? "excellent" : "poor");
      }
    };
    check();
    const conn = navigator.connection;
    conn?.addEventListener?.("change", check);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    const id = setInterval(check, 10_000);
    return () => {
      conn?.removeEventListener?.("change", check);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      clearInterval(id);
    };
  }, []);
  const colors = { excellent: e.success, good: e.copper, poor: e.error };
  const labels = { excellent: "Excellent", good: "Good", poor: "Poor" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100, background: "rgba(20,17,10,0.10)", border: `1px solid ${colors[quality]}30` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors[quality], boxShadow: `0 0 6px ${colors[quality]}60` }} />
      <span style={{ fontFamily: ef.sans, fontSize: 10, fontWeight: 500, color: colors[quality] }}>{labels[quality]}</span>
    </div>
  );
});

/* ─── Dot Grid Visualizer (AI speaking) ─── */
const DOT_GRID_SIZE = 7;
const DOT_COUNT = DOT_GRID_SIZE * DOT_GRID_SIZE;
export const DotGridVisualizer = React.memo(function DotGridVisualizer({ active, thinking }: { active: boolean; thinking?: boolean }) {
  const [dots, setDots] = useState<number[]>(Array(DOT_COUNT).fill(0.15));
  // Pre-compute distance-from-center to avoid recalculating every frame
  const distRef = useRef<number[]>([]);
  if (distRef.current.length === 0) {
    distRef.current = Array.from({ length: DOT_COUNT }, (_, i) => {
      const row = Math.floor(i / DOT_GRID_SIZE);
      const col = i % DOT_GRID_SIZE;
      return Math.sqrt((row - 3) ** 2 + (col - 3) ** 2);
    });
  }

  useEffect(() => {
    if (!active && !thinking) { setDots(Array(DOT_COUNT).fill(0.15)); return; }
    const dist = distRef.current;
    const interval = active ? 80 : 200;
    // Reuse a single buffer instead of allocating new arrays each tick
    const buffer = new Array(DOT_COUNT);
    const id = setInterval(() => {
      const now = Date.now();
      for (let i = 0; i < DOT_COUNT; i++) {
        const d = dist[i];
        if (thinking && !active) {
          const breath = Math.sin(now / 800 + d * 0.4) * 0.3 + 0.5;
          buffer[i] = 0.1 + breath * 0.3 * (1 - d / 6);
        } else {
          const wave = Math.sin(now / 300 + d * 0.8) * 0.5 + 0.5;
          buffer[i] = 0.15 + wave * 0.85 * (1 - d / 5) + Math.random() * 0.15;
        }
      }
      setDots(buffer.slice()); // slice() to trigger React render with new reference
    }, interval);
    return () => clearInterval(id);
  }, [active, thinking]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${DOT_GRID_SIZE}, 1fr)`, gap: 5, width: 100, height: 100 }}>
      {dots.map((scale, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: e.copper,
          opacity: active ? Math.min(0.9, scale) : thinking ? Math.min(0.4, scale + 0.05) : 0.1,
          transform: `scale(${active ? 0.5 + scale * 0.5 : thinking ? 0.5 + scale * 0.3 : 0.6})`,
          transition: active ? "all 0.1s ease" : "all 0.3s ease",
        }} />
      ))}
    </div>
  );
});

/* ─── Question Progress Bar ─── */
export const QuestionProgressBar = React.memo(function QuestionProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: ef.sans, fontSize: 12, fontWeight: 600, color: e.coal }}>
          Question {current} of {total}
        </span>
        <span style={{ fontFamily: ef.mono, fontSize: 11, color: e.inkSoft }}>
          {Math.round((current / total) * 100)}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: 2, height: 4,
            background: i < current ? e.copper : i === current ? "rgba(180,83,9,0.40)" : "rgba(20,17,10,0.13)",
            transition: "all 0.4s ease",
          }} />
        ))}
      </div>
    </div>
  );
});

/* ─── Live Captions (synced to TTS voice playback) ─── */
export const LiveCaptions = React.memo(function LiveCaptions({ text, isTyping, speakingDuration, actualDuration, speechEnded, variant = "card" }: {
  text: string; isTyping: boolean; speakingDuration?: number;
  /** Real TTS audio duration in ms — reported by TTS provider after audio loads */
  actualDuration?: number;
  /** Set to true when TTS voice finishes — triggers fast-complete of remaining text */
  speechEnded?: boolean;
  /** "card" stamps its own serif/22px (legacy panel layout). "inherit"
      defers to the parent — used inside CanvasPlainHeading where the
      h1's clamp() font controls typography. Mismatched type between
      typewriter and final heading is what caused the visible "jerk"
      when speaking → listening swapped the renderer. */
  variant?: "card" | "inherit";
}) {
  // Strip prosody markup ([pause], _emphasis_, etc.) before rendering.
  // The parent passes raw aiText so TTS can still process the markup;
  // the visible layer must always be clean. Without this, "[pause]"
  // tokens leak onto the screen.
  const cleanText = useMemo(() => stripProsodyMarkup(text || ""), [text]);

  const [displayText, setDisplayText] = useState("");
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setDisplayText("");
    setCharIndex(0);
  }, [cleanText]);

  // When speech ends, instantly show all remaining text. Rising-edge
  // detection prevents a stale speechEnded=true from a prior turn from
  // flushing a freshly-arrived next-question text immediately — the
  // bug where the question appeared in full and only THEN started
  // typing was caused by speechEnded persisting across turns.
  const wasSpeechEndedRef = useRef(false);
  // On every cleanText change, reset the rising-edge tracker so the
  // next true-transition counts as a new edge for the new question.
  useEffect(() => {
    wasSpeechEndedRef.current = false;
  }, [cleanText]);
  useEffect(() => {
    const isRisingEdge = !!speechEnded && !wasSpeechEndedRef.current;
    wasSpeechEndedRef.current = !!speechEnded;
    if (!isRisingEdge) return;
    if (charIndex >= cleanText.length) return;
    setDisplayText(cleanText);
    setCharIndex(cleanText.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechEnded, cleanText]);

  useEffect(() => {
    if (!isTyping || charIndex >= cleanText.length || speechEnded) return;
    // Use actualDuration from TTS if available, else fall back to speakingDuration estimate
    const duration = actualDuration || speakingDuration || Math.max(2500, (cleanText.split(/\s+/).length / 175) * 60 * 1000);
    // Calculate per-char delay to finish typing in sync with voice
    // Leave a small buffer (200ms) so typing finishes just before voice ends
    const remainingChars = cleanText.length - charIndex;
    const elapsedRatio = charIndex / cleanText.length;
    const remainingDuration = duration * (1 - elapsedRatio) - 200;
    const msPerChar = Math.max(12, remainingDuration / remainingChars);
    const delay = Math.max(12, Math.min(70, msPerChar + (Math.random() * 4 - 2)));
    const timer = setTimeout(() => {
      setDisplayText(cleanText.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [charIndex, cleanText, isTyping, speakingDuration, actualDuration, speechEnded]);

  if (!isTyping && !displayText) return null;

  /* The typing animation streams text char-by-char. We INTENTIONALLY mark
     this region aria-hidden so screen readers don't replay every keystroke
     update — the parent QuestionCard is already aria-live="polite"
     aria-atomic="true" which announces the full question once per phase
     transition. The visible animation is purely sighted-user candy. */
  return (
    <div style={{ width: "100%" }} aria-hidden="true">
      <p style={
        variant === "inherit"
          ? {
              // Inherit parent's font/size/spacing/color so we don't fight
              // the surrounding heading. Only structural styles stay local.
              font: "inherit", color: "inherit",
              lineHeight: "inherit", letterSpacing: "inherit",
              margin: 0, textWrap: "balance",
            }
          : {
              fontFamily: ef.serif, fontSize: 22, color: e.coal,
              lineHeight: 1.35, margin: 0, minHeight: 30,
              letterSpacing: "-0.01em", textWrap: "balance",
            }
      }>
        {displayText}
        {isTyping && charIndex < cleanText.length && (
          <span style={{ display: "inline-block", width: 2, height: 20, background: e.copper, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
        )}
      </p>
    </div>
  );
});

/* ─── Timer ─── */
export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ─── Control Button ─── */
export const ControlButton = React.memo(function ControlButton({ icon, label, active, danger, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="iv-ctrl-btn"
      style={{
        width: 48, height: 48, borderRadius: "50%",
        background: danger ? e.copperSoft : active ? e.indigo100 : e.white,
        border: `1px solid ${danger ? "rgba(180,83,9,0.30)" : active ? e.indigoRing : e.line}`,
        color: danger ? e.copper : active ? e.indigo : e.inkSoft,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s ease", outline: "none",
        boxShadow: "0 1px 0 rgba(20,17,10,.04), 0 1px 2px rgba(20,17,10,.04)",
      }}
      onFocus={(ev) => ev.currentTarget.style.boxShadow = `0 0 0 4px ${danger ? "rgba(180,83,9,0.20)" : e.indigoRing}`}
      onBlur={(ev) => ev.currentTarget.style.boxShadow = "0 1px 0 rgba(20,17,10,.04), 0 1px 2px rgba(20,17,10,.04)"}
      onMouseEnter={(ev) => {
        ev.currentTarget.style.background = danger ? "rgba(180,83,9,0.18)" : active ? e.indigo100 : e.creamSoft;
        ev.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.background = danger ? e.copperSoft : active ? e.indigo100 : e.white;
        ev.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
});

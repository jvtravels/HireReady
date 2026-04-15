import React, { useState, useEffect, useRef } from "react";
import { c, font } from "./tokens";

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
export const INTERVIEWER_NAMES = [
  "Arjun Mehta", "Priya Sharma", "Rohan Kapoor", "Ananya Patel", "Vikram Desai",
  "Kavya Nair", "Siddharth Joshi", "Neha Gupta", "Aditya Rao", "Deepika Iyer",
  "Karthik Nair", "Aisha Rahman", "Rajesh Iyer", "Meera Reddy", "Tanvi Kulkarni",
];
export function getInterviewerName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return INTERVIEWER_NAMES[Math.abs(hash) % INTERVIEWER_NAMES.length];
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
const MALE_NAMES = ["Arjun Mehta", "Rohan Kapoor", "Vikram Desai", "Siddharth Joshi", "Aditya Rao", "Karthik Nair", "Rajesh Iyer"];
const FEMALE_NAMES = ["Priya Sharma", "Ananya Patel", "Kavya Nair", "Neha Gupta", "Deepika Iyer", "Meera Reddy", "Aisha Rahman"];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function getPanelMembers(seed: string): PanelMember[] {
  const h = hashString(seed);
  // Roles with assigned accent colors
  const roles: { title: string; color: string }[] = [
    { title: "Hiring Manager", color: "#D4B37F" },   // gilt
    { title: "Technical Lead", color: "#7A9E7E" },    // sage
    { title: "HR Partner", color: "#A8B4C4" },        // soft blue-gray
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
  const colors = { excellent: c.sage, good: c.gilt, poor: c.ember };
  const labels = { excellent: "Excellent", good: "Good", poor: "Poor" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100, background: "rgba(245,242,237,0.04)", border: `1px solid ${colors[quality]}30` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors[quality], boxShadow: `0 0 6px ${colors[quality]}60` }} />
      <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: colors[quality] }}>{labels[quality]}</span>
    </div>
  );
});

/* ─── Dot Grid Visualizer (AI speaking) ─── */
const DOT_GRID_SIZE = 7;
const DOT_COUNT = DOT_GRID_SIZE * DOT_GRID_SIZE;
export const DotGridVisualizer = React.memo(function DotGridVisualizer({ active, thinking }: { active: boolean; thinking?: boolean }) {
  const [dots, setDots] = useState<number[]>(Array(DOT_COUNT).fill(0.15));

  useEffect(() => {
    if (!active && !thinking) { setDots(Array(DOT_COUNT).fill(0.15)); return; }
    const interval = active ? 80 : 200;
    const id = setInterval(() => {
      setDots(prev => prev.map((_, i) => {
        const row = Math.floor(i / DOT_GRID_SIZE);
        const col = i % DOT_GRID_SIZE;
        const distFromCenter = Math.sqrt((row - 3) ** 2 + (col - 3) ** 2);
        if (thinking && !active) {
          const breath = Math.sin(Date.now() / 800 + distFromCenter * 0.4) * 0.3 + 0.5;
          return 0.1 + breath * 0.3 * (1 - distFromCenter / 6);
        }
        const wave = Math.sin(Date.now() / 300 + distFromCenter * 0.8) * 0.5 + 0.5;
        return 0.15 + wave * 0.85 * (1 - distFromCenter / 5) + Math.random() * 0.15;
      }));
    }, interval);
    return () => clearInterval(id);
  }, [active, thinking]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${DOT_GRID_SIZE}, 1fr)`, gap: 5, width: 100, height: 100 }}>
      {dots.map((scale, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: c.gilt,
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
        <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>
          Question {current} of {total}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone }}>
          {Math.round((current / total) * 100)}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: 2, height: 4,
            background: i < current ? c.gilt : i === current ? "rgba(212,179,127,0.4)" : "rgba(245,242,237,0.08)",
            transition: "all 0.4s ease",
          }} />
        ))}
      </div>
    </div>
  );
});

/* ─── Live Captions (synced to ~150 wpm speaking rate) ─── */
export const LiveCaptions = React.memo(function LiveCaptions({ text, isTyping, speakingDuration }: { text: string; isTyping: boolean; speakingDuration?: number }) {
  const [displayText, setDisplayText] = useState("");
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    setDisplayText("");
    setCharIndex(0);
  }, [text]);

  useEffect(() => {
    if (!isTyping || charIndex >= text.length) return;
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = speakingDuration || Math.max(2500, (wordCount / 175) * 60 * 1000);
    const msPerChar = estimatedDuration / text.length;
    const delay = Math.max(12, Math.min(70, msPerChar + (Math.random() * 4 - 2)));
    const timer = setTimeout(() => {
      setDisplayText(text.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [charIndex, text, isTyping, speakingDuration]);

  if (!isTyping && !displayText) return null;

  return (
    <div style={{ width: "100%" }} aria-live="polite" aria-label="AI interviewer speaking">
      <p style={{
        fontFamily: font.ui, fontSize: 14, color: c.chalk,
        lineHeight: 1.75, margin: 0, minHeight: 22,
      }}>
        {displayText}
        {isTyping && charIndex < text.length && (
          <span style={{ display: "inline-block", width: 2, height: 15, background: c.gilt, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink 0.8s ease-in-out infinite" }} />
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
      style={{
        width: 48, height: 48, borderRadius: "50%",
        background: danger ? c.ember : active ? "rgba(245,242,237,0.08)" : "rgba(245,242,237,0.04)",
        border: `1px solid ${danger ? "rgba(196,112,90,0.3)" : active ? "rgba(245,242,237,0.15)" : c.border}`,
        color: danger ? c.ivory : active ? c.ivory : c.stone,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s ease", outline: "none",
      }}
      onFocus={(e) => e.currentTarget.style.boxShadow = `0 0 0 2px ${danger ? c.ember : c.gilt}40`}
      onBlur={(e) => e.currentTarget.style.boxShadow = "none"}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "#d4614a" : "rgba(245,242,237,0.1)";
        e.currentTarget.style.transform = "scale(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = danger ? c.ember : active ? "rgba(245,242,237,0.08)" : "rgba(245,242,237,0.04)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
});

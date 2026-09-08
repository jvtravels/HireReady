"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import { captureClientEvent } from "./posthogClient";

/* Editorial brand surface — same tokens as auth, onboarding, and the
   interview surface. Discipline rule:
   Indigo is interactive · Copper is editorial · Never mix. */
import { tokens as T, fonts as F } from "./auth/_tokens";
import { COMPANY_SUGGESTIONS as COMPANY_SUGGESTIONS_FULL, ROLE_SUGGESTIONS } from "./onboardingData";
import { profileFromRole, inferRoleFamily, inferSeniority, type InterviewFocus } from "./roleInterviewMatrix";
import { detectRoleCompanyFit } from "./_role-company-fit";
import { getCompanyTier } from "../data/company-tiers";
import { matchRoleKey } from "../data/salaries";
import { Wordmark } from "./auth/_fields";
import { AUTH_STYLES } from "./auth/_styles";

import { useAuth } from "./AuthContext";
import { getCreditBalance } from "./supabase";
import { getAudioContextCtor } from "./_browser-api-guards";
import { useToast } from "./Toast";
import { unlockAudio, prefetchTTS, VOICE_OUTPUT_DISABLED } from "./tts";
import { UpgradeModal } from "./dashboardComponents";
import { FREE_SESSION_LIMIT, STARTER_WEEKLY_LIMIT, PRO_MONTHLY_LIMIT } from "./dashboardData";
import { GAP_CTA_MAP } from "./nextMove";

/**
 * Reverse-lookup: drill key → coaching CTA copy.
 *
 * GAP_CTA_MAP is keyed by gap CODE (e.g. "floor_collapse") but the
 * URL carries the drill KEY (e.g. "comp_floor") so the dashboard CTA
 * URLs stay user-stable across gap-code refactors. Building the
 * reverse map at module load gives O(1) lookup at render time and
 * means a stale URL with an unknown drill key fails closed (no
 * banner) rather than crashing.
 */
const DRILL_TO_CTA: Record<string, { label: string; headline: string }> = Object.values(GAP_CTA_MAP).reduce(
  (acc, cta) => {
    /* Campus-placement entries omit drill — they go to the setup page
     * rather than a micro-drill session; skip them here. */
    if (cta.drill) acc[cta.drill] = { label: cta.label, headline: cta.headline };
    return acc;
  },
  {} as Record<string, { label: string; headline: string }>,
);

/* ─── Suggestions ───
   ROLE_SUGGESTIONS is the canonical exhaustive list from onboardingData
   (~600 entries: tech, design, writing, finance, healthcare, govt, etc.).
   Single source of truth — never re-define a local subset here. The
   AutocompleteInput handles search/filtering on the full list cheaply. */

// Camera readiness signal states. "pass" = good. "warn-*" = mediocre
// but acceptable to start. "fail-*" = explicitly bad. "checking" = not
// yet sampled. Each signal carries its own reason in the suffix so the
// UI can show concrete copy ("Move closer" vs "Add more light").
type CameraSignalState =
  | "checking"
  | "pass"
  | "warn-low"
  | "warn-offcenter"
  | "warn-motion"
  | "fail-dark"
  | "fail-bright"
  | "fail-offcenter"
  | "fail-motion";

// Single source of truth — the extensive ~510-entry list lives in
// onboardingData (COMPANY_SUGGESTIONS_FULL).
//
// User-added companies (typed during salary-negotiation setup when the
// company isn't in the canonical list) get appended via localStorage,
// so a candidate's "Razorpay X" stays visible in their next session
// without polluting the global list. Stored as JSON array of strings
// at hsx_user_companies; capped at 50 entries (FIFO) for sanity.
const USER_COMPANIES_KEY = "hsx_user_companies";
const USER_COMPANIES_CAP = 50;

function loadUserCompanies(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USER_COMPANIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

function saveUserCompany(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (!trimmed) return;
  // Skip if already in the canonical list — no need to remember it.
  const lower = trimmed.toLowerCase();
  if (COMPANY_SUGGESTIONS_FULL.some((c) => c.toLowerCase() === lower)) return;
  try {
    const existing = loadUserCompanies();
    if (existing.some((c) => c.toLowerCase() === lower)) return;
    const next = [...existing, trimmed].slice(-USER_COMPANIES_CAP);
    window.localStorage.setItem(USER_COMPANIES_KEY, JSON.stringify(next));
  } catch {
    /* localStorage may be unavailable / quota exceeded — silent */
  }
}

function sampleDiverse(arr: string[], count: number): string[] {
  if (arr.length <= count) return arr;
  const step = Math.floor(arr.length / count);
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(arr[i * step]);
  return result;
}

/* ─── Autocomplete Input ─── */
function AutocompleteInput({
  id, value, onChange, placeholder, suggestions, label, required, error,
}: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string;
  suggestions: string[]; label?: string; required?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Browse-mode sample (shown only when the input is empty). Reactive to the
  // suggestions list so a newly-added user company can surface, and stable
  // across renders because sampleDiverse is deterministic (evenly-spaced).
  const diverseSample = useMemo(() => sampleDiverse(suggestions, 8), [suggestions]);

  useEffect(() => { return () => { setFocused(false); }; }, []);

  /* Filtering rules (I-1, 2026-07-10, live staging) — the INPUT is the single
     query source, like any well-behaved combobox:
     - empty input → diverseSample (browse mode / discovery).
     - non-empty input → substring match on what was typed, capped at 8.
     A prior version flipped to `diverseSample` whenever the typed text EXACTLY
     matched a suggestion — so finishing a real company name ("Flipkart", which
     IS in the list) swapped the dropdown to 8 unrelated companies (Google,
     Mahindra Aerospace, …), reading as broken. That exact-match browse branch
     existed only to avoid the dropdown collapsing to empty when the sole match
     was self-filtered out; keeping the exact match IN the results (no self-echo
     exclusion) solves the collapse without ever showing an off-query list. */
  const v = value.toLowerCase();
  const filtered = focused
    ? value.length === 0
      ? diverseSample
      : suggestions.filter(s => s.toLowerCase().includes(v)).slice(0, 8)
    : [];

  useEffect(() => {
    if (filtered.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 8;
      let left = rect.left;
      let width = rect.width;
      if (width > vw - pad * 2) width = vw - pad * 2;
      if (left < pad) left = pad;
      if (left + width > vw - pad) left = vw - pad - width;
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const top = spaceBelow < 120 ? Math.max(pad, rect.top - 224) : rect.bottom + 4;
      setDropdownPos({ top, left, width });
    }
  }, [filtered.length, focused, value]);

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: T.inkSoft, display: "block", marginBottom: 8 }}>
          {label} {required && <span style={{ color: T.error }}>*</span>}
        </label>
      )}
      <input
        ref={inputRef} id={id} type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setSelectedIdx(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setFocused(false); inputRef.current?.blur(); return; }
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); onChange(filtered[selectedIdx]); setFocused(false); }
        }}
        placeholder={placeholder} autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 10,
          background: T.white, border: `1.5px solid ${error ? T.error : focused ? T.indigo : T.line}`,
          color: T.coal, fontFamily: F.sans, fontSize: 16,
          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
        }}
      />
      {error && <p id={`${id}-error`} role="alert" style={{ fontFamily: F.sans, fontSize: 11, color: T.error, marginTop: 4 }}>{error}</p>}
      {filtered.length > 0 && dropdownPos && createPortal(
        <div role="listbox" style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          background: T.white, border: `1px solid ${T.line}`, borderRadius: 10,
          boxShadow: "0 2px 4px rgba(20,17,10,.06), 0 32px 64px -16px rgba(20,17,10,.24)", maxHeight: 260, overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button key={s} role="option" aria-selected={i === selectedIdx} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none", textAlign: "left",
                fontFamily: F.sans, fontSize: 13, cursor: "pointer",
                background: i === selectedIdx ? "rgba(49,46,129,0.08)" : "transparent",
                color: i === selectedIdx ? T.coal : T.inkSoft,
              }}>
              {s}
            </button>
          ))}
          {/* Keyboard hint — invites power users to navigate without
              the mouse. Sticky bottom so it stays visible during scroll. */}
          <div style={{
            position: "sticky", bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", background: T.creamSoft, borderTop: `1px solid ${T.line}`,
            fontFamily: F.mono, fontSize: 10, color: T.inkFaint, letterSpacing: 0.4,
          }}>
            <span>↑↓ navigate</span>
            <span>↵ select · esc to close</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}


/* ─── Intro text for TTS pre-fetch ─── */
const introByType: Record<string, string> = {
  behavioral: "Hi! Welcome to your behavioral mock interview. I'm your AI interviewer today. We'll focus on leadership, decision-making, and conflict resolution. This will take about 15 minutes. Feel free to take your time. Ready?",
  strategic: "Welcome to your strategic interview session. Today we'll explore your vision-setting ability, roadmap thinking, and business alignment. Let's dive in — are you ready?",
  technical: "Welcome to your technical leadership interview. We'll focus on architecture decisions, system design at scale, and tech strategy. Ready to begin?",
  "case-study": "Welcome to your case study interview. I'll present you with business scenarios that test your analytical thinking and problem-solving frameworks. Let's start.",
  "salary-negotiation": "Welcome to your salary negotiation practice session. I'll play the role of a hiring manager extending you an offer. We'll practice negotiating compensation, benefits, and terms. This is a safe space to build your confidence. Ready to negotiate?",
  "panel": "Welcome to your panel interview. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. We'll each ask you questions from our perspective. Let's begin — tell us briefly about yourself.",
  "campus-placement": "Welcome to your campus placement interview practice. We'll cover the typical questions asked during on-campus recruitment — aptitude, HR, and role-specific questions. Let's get you placement-ready!",
  "hr-round": "Welcome to your HR round practice. We'll focus on culture fit, motivation, salary expectations, and behavioral questions that HR teams typically ask. Ready?",
  "management": "Welcome to your management interview. We'll explore your people leadership, project management, and stakeholder communication skills. Let's begin.",
  "government-psu": "Welcome to your government and public sector interview practice. These interviews test your awareness of public administration, ethics, current affairs, and your motivation for public service. Let's begin — are you ready?",
};

/* Focus type → interview type mapping */
const focusToType: Record<string, string> = {
  "Behavioral": "behavioral",
  "Strategic": "strategic",
  "Technical Leadership": "technical",
  "Case Study": "case-study",
  "Salary Negotiation": "salary-negotiation",
  "Panel Interview": "panel",
  "Campus Placement": "campus-placement",
  "HR Round": "hr-round",
  "Management": "management",
  "Government / PSU": "government-psu",
};

/* MVP launch (2026-06): these focuses are shown in the picker but render as
   "Coming soon" — visible so users see the roadmap and get interested, but
   not yet selectable. The other five (Behavioral, Case Study, Campus
   Placement, HR Round, Salary Negotiation) are live. To ship one of these,
   remove it from this set — no other change needed. */
const COMING_SOON_FOCUSES = new Set<InterviewFocus>([
  "Strategic",
  "Technical Leadership",
  "Case Study",
  "Management",
  "Panel Interview",
  "Government / PSU",
]);

function getRecommendedFocus(role?: string, experienceLevel?: string): string {
  // Profile-level "fresher" setting wins over role-name heuristics so a user
  // who calls themselves "Software Engineer" but is a fresh graduate still
  // lands on the campus-placement flow by default.
  if (experienceLevel === "fresher") return "Campus Placement";
  if (!role) return "Behavioral";
  const r = role.toLowerCase();
  if (/engineer|developer|sde|swe|programmer|coder/i.test(r)) return "Technical Leadership";
  if (/product\s*manager|pm\b/i.test(r)) return "Strategic";
  if (/analyst|data/i.test(r)) return "Technical Leadership";
  if (/intern|fresher|graduate|campus|entry/i.test(r)) return "Campus Placement";
  if (/consult/i.test(r)) return "Case Study";
  if (/manager|director|vp|head of|cto|ceo/i.test(r)) return "Management";
  return "Behavioral";
}

/* ─── MicMeter ──────────────────────────────────────────────────────────
   3-bar live audio meter rendered inside the mic permission card once
   the stream is granted. Bars rise as the analyser sees more energy,
   and turn green once a voice threshold has been crossed. */
function MicMeter({ level, active }: { level: number; active: boolean }) {
  // Three thresholds spread across 0-100 so the bars fill in sequence,
  // not in lockstep — feels like a real meter.
  const heights = [
    Math.max(20, Math.min(100, level * 1.6)),
    Math.max(15, Math.min(100, level * 1.1)),
    Math.max(10, Math.min(100, level * 0.7)),
  ];
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, height: 16 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 16,
            background: active && level > 6 ? T.success : T.inkFaint,
            borderRadius: 2,
            // scaleY + transform-origin instead of `height` so we
            // don't reflow on every frame of the mic-level animation.
            // Composited transform stays on the GPU.
            transform: `scaleY(${(active ? h : 20) / 100})`,
            transformOrigin: "bottom",
            transition: "transform 80ms linear, background 200ms ease",
          }}
        />
      ))}
    </span>
  );
}

/* ─── PermissionCard ────────────────────────────────────────────────────
   A two-state tile: idle / requesting / granted / denied (+ skipped for
   camera). The idle state shows a primary "Allow …" button. Granted
   collapses to a success row. Denied shows a help line + retry. Same
   visual language as the focus chips so it feels native to the form. */
function PermissionCard({
  kind, label, sublabel, sublabelTone, status, onRequest, onSkip, onDisable,
  level, voiceDetected, denyReason, isIOS, cameraStream, cameraSignals,
}: {
  kind: "mic" | "camera";
  label: string;
  sublabel: string;
  sublabelTone: "copper" | "muted";
  status: "idle" | "requesting" | "granted" | "denied" | "skipped";
  onRequest: () => void;
  onSkip?: () => void;
  /** Turn-off link shown on granted camera so users can opt out post-grant. */
  onDisable?: () => void;
  /** Live mic level 0-100 — only used when kind === "mic" && status === "granted". */
  level?: number;
  /** Whether the analyser has detected speech yet — flips the prompt copy. */
  voiceDetected?: boolean;
  /** Distinguishes user-denied vs missing hardware vs in-use-by-other-app. */
  denyReason?: "blocked" | "no-device" | "in-use" | null;
  /** When true and status === "denied" with reason "blocked", show the
   *  iOS Safari recovery path (different from desktop). */
  isIOS?: boolean;
  /** Live MediaStream — when present and kind === "camera" + status ===
   *  "granted", we render a small mirrored video preview in the icon
   *  slot so the user can verify framing/lighting before launching. */
  cameraStream?: MediaStream | null;
  /** Brightness-heuristic confirmation that the user is in frame and lit.
   *  Used to flip "Looking good" → "You look great". */
  faceLooksGood?: boolean;
  /** Per-signal readiness states from the multi-metric camera sampler.
   *  Drives the concrete sub-status copy (replaces the previous fake-
   *  feeling "Centered, well-lit, in focus" claim). */
  cameraSignals?: {
    lighting: CameraSignalState;
    framing: CameraSignalState;
    sharpness: CameraSignalState;
  };
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    setVideoReady(false);
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);
  const isGranted = status === "granted";
  const isDenied = status === "denied";
  const isSkipped = status === "skipped";
  const icon = kind === "mic" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );

  // Skipped renders dimmer + greyer so it's visually distinct from idle.
  const denyCopy = (() => {
    if (!isDenied) return null;
    if (denyReason === "no-device") {
      return kind === "mic"
        ? "No microphone detected. Connect one and retry."
        : "No camera detected — you can still proceed without one.";
    }
    if (denyReason === "in-use") {
      return kind === "mic"
        ? "Microphone is in use by another app. Close it and retry."
        : "Camera is in use by another app. Close it and retry.";
    }
    if (kind === "mic") {
      return isIOS
        ? "Blocked. Tap aA in the address bar → Website Settings → Microphone → Allow, then retry."
        : "Blocked. Open browser settings → allow microphone, then retry.";
    }
    return "Blocked — you can still proceed without camera.";
  })();

  return (
    <div
      className="hsx-permission-card"
      style={{
        padding: 14,
        borderRadius: 12,
        /* Same gradient grammar as the selected focus chip:
             linear-gradient(180deg, <tint-100>, white)
           Keeps the success/error tint at the same subtlety as the
           indigo100 used for selection — no raw rgbas. */
        background: isGranted
          ? `linear-gradient(180deg, ${T.success100}, ${T.white})`
          : isDenied
            ? `linear-gradient(180deg, ${T.error100}, ${T.white})`
            : T.white,
        border: `1px solid ${isGranted ? T.success : isDenied ? T.error : T.line}`,
        boxShadow: "0 1px 0 rgba(20,17,10,.03), 0 1px 2px rgba(20,17,10,.04), 0 12px 32px -16px rgba(20,17,10,.10)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "all 220ms cubic-bezier(.2,.7,.2,1)",
        opacity: isSkipped ? 0.7 : 1,
      }}
    >
      {kind === "camera" ? (
        /* Camera always reserves the 4:3 preview slot (64×48 desktop,
           56×42 mobile) regardless of state — when no stream is attached,
           an icon sits centered inside. This prevents CLS when the
           permission flips idle → granted. The preview tile and the
           icon-only tile share dimensions; only the inner content swaps. */
        <span
          aria-label={isGranted && cameraStream ? "Live camera preview" : undefined}
          aria-hidden={!(isGranted && cameraStream)}
          className="hsx-permission-cam-preview"
          style={{
            width: 64,
            height: 48,
            borderRadius: 6,
            overflow: "hidden",
            background: isGranted
              ? T.success100
              : isDenied
                ? T.error100
                : isSkipped
                  ? T.creamSoft
                  : T.indigo100,
            color: isGranted ? T.success : isDenied ? T.error : isSkipped ? T.inkFaint : T.coal,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: isGranted && cameraStream ? `1px solid ${T.success}` : "none",
            transition: "background 220ms ease, border-color 220ms ease",
          }}
        >
          {isGranted && cameraStream ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onLoadedData={() => setVideoReady(true)}
              style={{
                width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)",
                opacity: videoReady ? 1 : 0,
                transition: "opacity 250ms ease",
              }}
            />
          ) : icon}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            /* Icon-tile background uses the same -100 tint family as the
               card surface for visual coherence. Skipped uses creamSoft —
               no raw coal-rgba. */
            background: isGranted
              ? T.success100
              : isDenied
                ? T.error100
                : isSkipped
                  ? T.creamSoft
                  : T.indigo100,
            color: isGranted ? T.success : isDenied ? T.error : isSkipped ? T.inkFaint : T.coal,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: T.coal, display: "flex", alignItems: "center", gap: 8 }}>
          <span>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: sublabelTone === "copper" ? T.copper : T.inkFaint }}>· {sublabel}</span>
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: isDenied ? T.error : T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>
          {status === "idle" && (kind === "mic" ? "Used to capture your answers." : "Practice eye contact and presence.")}
          {status === "requesting" && "Waiting for your permission…"}
          {isGranted && kind === "camera" && cameraSignals && (() => {
            // Concrete per-signal sub-statuses. Replaces the static
            // "Centered, well-lit, in focus" claim that users called
            // fake. Each chip carries its own pass/warn/fail color
            // and the failing state spells out what to do.
            const map = {
              lighting: {
                checking: { label: "Lighting · checking…", tone: T.inkSoft },
                pass: { label: "Lighting ✓", tone: T.success },
                "warn-low": { label: "Lighting · a touch dim", tone: T.copper },
                "warn-offcenter": { label: "Lighting ✓", tone: T.success },
                "warn-motion": { label: "Lighting ✓", tone: T.success },
                "fail-dark": { label: "Add more light", tone: T.error },
                "fail-bright": { label: "Too bright — diffuse the light", tone: T.error },
                "fail-offcenter": { label: "Lighting ✓", tone: T.success },
                "fail-motion": { label: "Lighting ✓", tone: T.success },
              },
              framing: {
                checking: { label: "Framing · checking…", tone: T.inkSoft },
                pass: { label: "Centered ✓", tone: T.success },
                "warn-low": { label: "Centered ✓", tone: T.success },
                "warn-offcenter": { label: "Center yourself a bit", tone: T.copper },
                "warn-motion": { label: "Centered ✓", tone: T.success },
                "fail-dark": { label: "Centered ✓", tone: T.success },
                "fail-bright": { label: "Centered ✓", tone: T.success },
                "fail-offcenter": { label: "Move into frame", tone: T.error },
                "fail-motion": { label: "Centered ✓", tone: T.success },
              },
              sharpness: {
                checking: { label: "Sharpness · checking…", tone: T.inkSoft },
                pass: { label: "Sharp ✓", tone: T.success },
                "warn-low": { label: "Sharp ✓", tone: T.success },
                "warn-offcenter": { label: "Sharp ✓", tone: T.success },
                "warn-motion": { label: "Hold a bit steadier", tone: T.copper },
                "fail-dark": { label: "Sharp ✓", tone: T.success },
                "fail-bright": { label: "Sharp ✓", tone: T.success },
                "fail-offcenter": { label: "Sharp ✓", tone: T.success },
                "fail-motion": { label: "Hold still — too much motion", tone: T.error },
              },
            } as const;
            const items = [
              { key: "lighting" as const, ...(map.lighting as Record<CameraSignalState, { label: string; tone: string }>)[cameraSignals.lighting] },
              { key: "framing" as const, ...(map.framing as Record<CameraSignalState, { label: string; tone: string }>)[cameraSignals.framing] },
              { key: "sharpness" as const, ...(map.sharpness as Record<CameraSignalState, { label: string; tone: string }>)[cameraSignals.sharpness] },
            ];
            return (
              <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 10px", lineHeight: 1.4 }}>
                {items.map((it, i) => (
                  <span key={it.key} style={{ color: it.tone, transition: "color 240ms ease" }}>
                    {it.label}{i < items.length - 1 ? " ·" : ""}
                  </span>
                ))}
              </span>
            );
          })()}
          {isGranted && kind === "mic" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <MicMeter level={level ?? 0} active />
              <span style={{ color: voiceDetected ? T.success : T.inkSoft }}>
                {voiceDetected ? "Sounds great" : "Say \"hello\" to test"}
              </span>
            </span>
          )}
          {isDenied && denyCopy}
          {isSkipped && "Skipped for this session."}
        </div>
      </div>
      <div className="hsx-permission-actions" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {status === "idle" && (
          <button
            type="button"
            onClick={onRequest}
            style={{
              fontFamily: F.sans, fontSize: 12, fontWeight: 500,
              padding: "8px 14px", borderRadius: 8,
              background: T.indigo, color: T.cream, border: "1px solid transparent",
              cursor: "pointer", transition: "all 160ms ease",
              boxShadow: "0 1px 2px rgba(20,17,10,.08)",
            }}
          >
            Allow
          </button>
        )}
        {status === "requesting" && (
          <span style={{ width: 16, height: 16, border: `2px solid ${T.indigoRing}`, borderTopColor: T.indigo, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        )}
        {isGranted && (
          <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: T.success, color: T.cream, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
        )}
        {isGranted && kind === "camera" && onDisable && (
          <button
            type="button"
            onClick={onDisable}
            aria-label="Turn camera off for this session"
            style={{
              fontFamily: F.sans, fontSize: 12, fontWeight: 500,
              padding: "6px 10px", borderRadius: 6,
              background: "transparent", color: T.inkSoft, border: 0,
              cursor: "pointer",
            }}
          >
            Turn off
          </button>
        )}
        {isDenied && (
          <button
            type="button"
            onClick={onRequest}
            style={{
              fontFamily: F.sans, fontSize: 12, fontWeight: 500,
              padding: "8px 14px", borderRadius: 8,
              background: T.white, color: T.coal, border: `1px solid ${T.lineStrong}`,
              cursor: "pointer", transition: "all 160ms ease",
            }}
          >
            Retry
          </button>
        )}
        {kind === "camera" && status === "idle" && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              fontFamily: F.sans, fontSize: 12, fontWeight: 500,
              padding: "8px 12px", borderRadius: 8,
              background: "transparent", color: T.inkSoft, border: "0",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        )}
        {isSkipped && onRequest && (
          <button
            type="button"
            onClick={onRequest}
            style={{
              fontFamily: F.sans, fontSize: 12, fontWeight: 500,
              padding: "8px 14px", borderRadius: 8,
              background: T.white, color: T.coal, border: `1px solid ${T.lineStrong}`,
              cursor: "pointer",
            }}
          >
            Enable
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SESSION SETUP — single-page flow (matches the SetupEmpty canvas)
   Target role + Company + Interview focus + Permissions → Start practice.
   ═══════════════════════════════════════════════ */

export default function SessionSetup() {
  const router = useRouter();
  const { user, updateUser: authUpdateUser } = useAuth();
  const searchParams = useSearchParams();
  /* `type` is the canonical param; `focus` is the alias the dashboard
     "Your next move" engine emits (nextMove.ts). For gap CTAs that means
     `?focus=hr-round`, which maps to the HR Round type below. Skill-name
     focuses (e.g. ?focus=Communication) don't match a type and harmlessly
     fall through to the role-recommended focus.
     When both params are present (e.g. Re-run emits ?type=behavioral&focus=campus-placement),
     prefer `focus` when it's a specific slug — it's more precise than the generic `type`. */
  const _focusParam = searchParams.get("focus");
  const _typeParam = searchParams.get("type");
  const preselectedFocus = (_focusParam && _focusParam !== "general") ? _focusParam : (_typeParam || _focusParam);
  /* Bounce-back from useInterviewEngine when /interview was hit with a
     hard role × company mismatch. We prefill role + company from the
     URL so the candidate sees what got rejected, and surface the warn
     reason via toast on mount (see effect below). */
  const prefillRole = searchParams.get("role") || "";
  const prefillCompany = searchParams.get("company") || "";
  const warnFlag = searchParams.get("warn");
  /* Drill mode (v1) — when the dashboard "Your next move" CTA fires
     from a known gap (see nextMove.GAP_CTA_MAP), the user lands here
     with `?drill=<key>` (e.g. ?drill=comp_floor). We:
       (a) surface a banner so the user knows the practice context was
           recognized — without this the CTA promise is invisible,
       (b) forward `&drill=` to /interview so useInterviewEngine can
           later route it into the LLM prompt as a focused directive.
     Unknown drill keys are ignored silently (forward-compat with
     future additions to GAP_CTA_MAP). */
  const drillKey = searchParams.get("drill") || "";
  const drillCta = drillKey ? DRILL_TO_CTA[drillKey] || null : null;

  // When the user arrives via ?focus=campus-placement but has a non-student
  // Settings role (e.g. "Senior Product Designer"), seeding that role would
  // contaminate the entire campus session. In that case, start blank and let
  // the user type their actual campus role — only explicit ?role= wins.
  const [targetRole, setTargetRole] = useState(() => {
    if (prefillRole) return prefillRole;
    if (preselectedFocus === "campus-placement") {
      const profileRole = user?.targetRole || "";
      const isStudentLike =
        inferRoleFamily(profileRole) === "student" ||
        inferSeniority(profileRole) === "fresher";
      if (!isStudentLike) return "";
    }
    return user?.targetRole || "";
  });
  const [roleTouched, setRoleTouched] = useState(false);
  const [companyTouched, setCompanyTouched] = useState(false);
  // User-added companies persisted in localStorage. Re-read on mount so
  // companies typed in prior sessions show up in this session's dropdown.
  const [userCompanies] = useState<string[]>(() => loadUserCompanies());
  // Merged list seeded into AutocompleteInput suggestions. User entries
  // appear at the END so canonical brands win the type-ahead by default.
  const COMPANY_SUGGESTIONS = useMemo(
    () => [...COMPANY_SUGGESTIONS_FULL, ...userCompanies],
    [userCompanies],
  );

  /* ─── Role → focus filter ───
     Classify the typed role into (family, seniority) and use that to
     compute the focuses real interviews for this role would include.
     See `roleInterviewMatrix.ts` for the matrix logic.

     Fallback rules:
       • Empty role → no filter (show all 10) so first-time users
         aren't penalized for not having typed yet.
       • Unclassified role (family === "other") → no filter, since
         our regex missed; better to overshow than misroute.
       • Otherwise → use the matrix.

     `relevantFocusSet` exposes a fast lookup we use both to filter
     the option list and to auto-clear a stale focus selection when
     the user changes their role. */
  const roleProfile = useMemo(() => profileFromRole(targetRole), [targetRole]);
  const relevantFocusSet = useMemo<Set<InterviewFocus> | null>(() => {
    const trimmed = targetRole.trim();
    if (!trimmed) return null;
    if (roleProfile.family === "other") return null;
    return new Set(roleProfile.focuses);
  }, [targetRole, roleProfile]);
  const [targetCompany, setTargetCompany] = useState(() => {
    if (prefillCompany) return prefillCompany;
    if (user?.targetCompany) return user.targetCompany;
    // Fallback variant carries job history — pull the latest employer if
    // the stored resume is the regex-parsed shape. AI variant has no
    // equivalent field (headline instead), so skip.
    const rd = user?.resumeData;
    if (rd && rd._type === "fallback") return rd.experience?.[0]?.company || "";
    return "";
  });
  const recommendedFocus = getRecommendedFocus(user?.targetRole, user?.experienceLevel);
  const [interviewFocus, setInterviewFocus] = useState<string[]>(() => {
    if (preselectedFocus) {
      const match = Object.entries(focusToType).find(([, v]) => v === preselectedFocus);
      if (match) return [match[0]];
    }
    return [getRecommendedFocus(user?.targetRole, user?.experienceLevel)];
  });

  /* Auto-correct the focus selection when the user changes their role
     so the chip set and the selected chip stay coherent. If the
     currently-picked focus is no longer relevant for the new role,
     swap to a sensible default (the role's recommended focus if it's
     in the new relevant set, else the first available). Empty/unknown
     role → no filter → no auto-correct.

     Exception: when the focus was explicitly preselected via URL param
     (e.g. a dashboard deep-link ?focus=campus-placement), never
     auto-correct it away — the URL is an explicit user intent signal that
     outranks the role-matrix heuristic. The user can still change the
     chip manually. roleTouched tracks this: the effect only fires once
     the user has actually changed the role field after arrival. */
  useEffect(() => {
    if (!relevantFocusSet) return;
    // Don't auto-correct a URL-preselected focus on the initial render
    // before the user has changed the role field themselves.
    if (preselectedFocus && !roleTouched) return;
    const current = interviewFocus[0];
    // A "Coming soon" focus is never a valid selection — fall through and
    // pick a live one even if it's in the relevant set (handles persisted
    // drafts that point at a focus we've since locked behind the MVP gate).
    if (
      current &&
      !COMING_SOON_FOCUSES.has(current as InterviewFocus) &&
      relevantFocusSet.has(current as InterviewFocus)
    ) return;
    const recommended = getRecommendedFocus(targetRole, user?.experienceLevel);
    const fallback =
      !COMING_SOON_FOCUSES.has(recommended as InterviewFocus) &&
      relevantFocusSet.has(recommended as InterviewFocus)
        ? recommended
        : roleProfile.focuses.find((f) => !COMING_SOON_FOCUSES.has(f)) || "Behavioral";
    setInterviewFocus([fallback]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantFocusSet]);
  /* Session length is no longer a knob — but we vary it by focus so the
     candidate sees an honest expectation. Numbers are calibrated to the
     actual question arcs the engine generates per type:
       - HR / behavioral: 5-6 short turns × ~2 min each
       - Salary-negotiation: 5-6 conversational rounds, each 1.5-2 min
       - Strategic / management: longer reflective answers
       - Case study / technical leadership: structured deep-dives
       - Panel: 3 interviewers, each gets a turn → longest
     The engine still computes step-count from the script — these
     minutes only drive the time-pill copy + the `&length=` URL param
     (analytics + mini-mode threshold at "10m"). */
  const FOCUS_MINUTES: Record<string, number> = {
    "Behavioral": 15,
    "Strategic": 20,
    "Technical Leadership": 20,
    "Case Study": 25,
    "Salary Negotiation": 12,
    "Panel Interview": 25,
    "Campus Placement": 15,
    "HR Round": 10,
    "Management": 18,
    "Government / PSU": 18,
  };
  const sessionMinutes = FOCUS_MINUTES[interviewFocus[0]] ?? 15;
  const SESSION_LENGTH = `${sessionMinutes}m`;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isFreeUser = !user?.subscriptionTier || user.subscriptionTier === "free";
  const isStarterUser = user?.subscriptionTier === "starter";
  const isProUser = user?.subscriptionTier === "pro";
  const freeSessionCount = user?.practiceTimestamps?.length ?? 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Starter is a "Sprint Pack": 5 sessions counted from subscription_start
  // over a 30-day window, NOT a calendar week — mirror the server gate in
  // _shared.ts checkSessionLimit (and DashboardContext). Anchoring on the
  // calendar week wrongly counted pre-purchase free sessions from the same
  // week, showing a freshly bought pack as already exhausted.
  const STARTER_PACK_CLAMP_MS = 8 * 24 * 60 * 60 * 1000; // 8d clamp — just over 7d pack
  const STARTER_PACK_7_MS = 7 * 24 * 60 * 60 * 1000;
  const starterSubStartMs = user?.subscriptionStart ? new Date(user.subscriptionStart).getTime() : NaN;
  const starterSubEndMs = user?.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : NaN;
  // Prefer subscription_start; else derive from subscription_end (pack = 7d);
  // else rolling 7-day lookback. Never the calendar week (see DashboardContext).
  const starterDerivedStartMs = Number.isFinite(starterSubStartMs)
    ? starterSubStartMs
    : Number.isFinite(starterSubEndMs)
      ? starterSubEndMs - STARTER_PACK_7_MS
      : Date.now() - STARTER_PACK_7_MS;
  const packStartMs = Math.max(starterDerivedStartMs, Date.now() - STARTER_PACK_CLAMP_MS);
  const practiceTimestamps = user?.practiceTimestamps ?? [];
  const sessionsThisWeek = practiceTimestamps.filter((t: string) => { try { return new Date(t).getTime() >= packStartMs; } catch { return false; } }).length;
  const sessionsThisMonth = practiceTimestamps.filter((t: string) => { try { return new Date(t).getTime() >= monthStart.getTime(); } catch { return false; } }).length;
  const starterRemaining = Math.max(0, STARTER_WEEKLY_LIMIT - sessionsThisWeek);
  const proRemaining = Math.max(0, PRO_MONTHLY_LIMIT - sessionsThisMonth);
  // Purchased session credits — fetched on mount so users who bought ₹9
  // top-ups aren't falsely blocked by the plan-exhausted check below.
  // SessionSetup lives outside the DashboardProvider scope and can't use
  // useDashboardSubscription, so it reads the balance independently.
  // null = still fetching (prevents false upgrade-modal flash on mount).
  // On fetch FAILURE we leave it as null (fail-open): the server-side gate in
  // checkSessionLimit will still enforce the real limit. Dropping to 0 here
  // would hard-block users who have real credits whenever the endpoint has a
  // transient error. With retries, we try twice before giving up.
  // Seed from sessionStorage written by DashboardContext — this bridges the
  // route-group gap (DashboardProvider lives under app/(app)/(dashboard)/layout.tsx;
  // /session/new is under app/(app)/session/ and has no DashboardProvider).
  // When the user navigates here from the dashboard the cache already holds the
  // balance the server confirmed, so the gate is correct on the FIRST render with
  // no network wait. The useEffect below still re-validates; on mismatch it wins.
  const [creditBalance, setCreditBalance] = useState<number | null>(() => {
    if (typeof window === "undefined" || !user?.id) return null;
    try {
      const raw = sessionStorage.getItem(`hsx_credit_${user.id}`);
      if (raw !== null) {
        const v = parseInt(raw, 10);
        return isNaN(v) ? null : v;
      }
    } catch { /* sessionStorage unavailable */ }
    return null;
  });
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchBalance = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const b = await getCreditBalance(user.id);
          if (!cancelled) {
            setCreditBalance(b);
            // Keep the cache in sync with what the server actually says.
            try { sessionStorage.setItem(`hsx_credit_${user.id}`, String(b)); } catch { /* ok */ }
            return;
          }
        } catch { /* transient */ }
        if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
      // All attempts failed — leave the sessionStorage-seeded value (or null if
      // there was none). Either way the server enforces the real limit on start.
    };
    void fetchBalance();
    return () => { cancelled = true; };
  }, [user?.id]);

  // A user past their plan limit is NOT blocked if they hold purchased credits —
  // the server will consume one when the session actually starts. Mirror the
  // same guard used in DashboardContext.atSessionLimit.
  // creditBalance===null means fetch still in-flight: don't block yet (prevents
  // upgrade modal from flashing open on every mount before the fetch resolves).
  const atSessionLimit = creditBalance !== null && (
    (isFreeUser && freeSessionCount >= FREE_SESSION_LIMIT && creditBalance === 0)
    || (isStarterUser && sessionsThisWeek >= STARTER_WEEKLY_LIMIT && creditBalance === 0)
    || (isProUser && sessionsThisMonth >= PRO_MONTHLY_LIMIT && creditBalance === 0)
  );
  // True when this session will consume a purchased credit (plan quota exhausted
  // but credits are available). Shown as an informational note near the CTA so
  // the user knows a credit will be spent before they click Start.
  const usingCredit = creditBalance !== null && creditBalance > 0 && (
    (isFreeUser && freeSessionCount >= FREE_SESSION_LIMIT)
    || (isStarterUser && sessionsThisWeek >= STARTER_WEEKLY_LIMIT)
    || (isProUser && sessionsThisMonth >= PRO_MONTHLY_LIMIT)
  );
  const { toast } = useToast();

  /* Warn-flag bounce-back toast: useInterviewEngine sends users back
     here with ?warn=role-company-mismatch when the role/company combo
     would coach against a synthetic band. Surface that reason once. */
  useEffect(() => {
    if (warnFlag !== "role-company-mismatch") return;
    if (!prefillRole || !prefillCompany) return;
    const tier = getCompanyTier(prefillCompany);
    const fit = detectRoleCompanyFit(matchRoleKey(prefillRole), tier, prefillCompany);
    if (fit.fit === "hard_mismatch") {
      toast(`We couldn't start that interview. ${fit.reason}`, "error");
    }
    // Mount-only — URL params are stable for this navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect free users who've exhausted sessions to the upgrade modal
  useEffect(() => {
    if (atSessionLimit) setShowUpgradeModal(true);
  }, [atSessionLimit]);

  // Notify user if their subscription just expired and auto-downgraded
  useEffect(() => {
    try {
      const expired = sessionStorage.getItem("hirestepx_sub_expired");
      if (expired) {
        sessionStorage.removeItem("hirestepx_sub_expired");
        toast(`Your ${expired} plan has expired. You're now on the free tier.`, "info");
      }
    } catch { /* noop */ }
  }, [toast]);

  // Launch
  const [starting, setStarting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  const [launching, setLaunching] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  /* ── Permissions ───────────────────────────────────────────────────────
     Mic is compulsory (voice-first interview); camera is optional and the
     user can skip it. We request permissions on this screen so the
     interview surface itself can launch with everything granted — no
     mid-interview permission prompt that breaks the flow. */
  type PermStatus = "idle" | "requesting" | "granted" | "denied";
  type DenyReason = "blocked" | "no-device" | "in-use";
  const [micStatus, setMicStatus] = useState<PermStatus>("idle");
  const [cameraStatus, setCameraStatus] = useState<PermStatus | "skipped">("idle");
  // Stream is mirrored into state so the PermissionCard can render a live
  // <video> preview. Ref alone wouldn't trigger a re-render in the child.
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  // "You look great" — flips on once we've seen ~4 stable frames with
  // a non-trivial brightness average. Heuristic, not real face-detection,
  // but works on every browser without an extra dependency.
  const [faceLooksGood, setFaceLooksGood] = useState(false);
  // Per-signal camera readiness state. Drives the concrete sub-status
  // copy ("Lighting · ✓", "Framing · move closer") that replaced the
  // single binary "Centered, well-lit, in focus" claim — users called
  // that out as feeling fake. Each signal is "pass" / a "warn-*" or
  // "fail-*" variant carrying the specific reason.
  const [cameraSignals, setCameraSignals] = useState<{
    lighting: CameraSignalState;
    framing: CameraSignalState;
    sharpness: CameraSignalState;
  }>({ lighting: "checking", framing: "checking", sharpness: "checking" });
  const faceSamplerRef = useRef<{ stop: () => void } | null>(null);
  const [micDenyReason, setMicDenyReason] = useState<DenyReason | null>(null);
  const [cameraDenyReason, setCameraDenyReason] = useState<DenyReason | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceDetected, setVoiceDetected] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // iOS detection — Safari/iOS has a different "go to settings" path that
  // most users won't intuit, so we render iOS-specific recovery copy.
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const startLevelMeter = (stream: MediaStream) => {
    try {
      const Ctx = getAudioContextCtor();
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let peak = 0;
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        if (level > peak) peak = level;
        setMicLevel(level);
        if (peak > 18) setVoiceDetected(true);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch { /* analyser optional */ }
  };

  const stopLevelMeter = () => {
    if (animFrameRef.current != null) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const reasonFromError = (err: unknown): DenyReason => {
    const name = (err as { name?: string })?.name;
    if (name === "NotFoundError" || name === "OverconstrainedError") return "no-device";
    if (name === "NotReadableError" || name === "TrackStartError") return "in-use";
    return "blocked";
  };

  /* Tab-scoped opt-in flags. Survive a refresh, drop on tab close.
     We need these because navigator.permissions.query for
     "camera" / "microphone" returns "prompt" (not "granted") on Safari,
     Firefox, and many Chromium builds even when the OS grant is cached.
     Without a hint, refresh = camera mysteriously turns off.

     Tri-state — true = user opted in, false = user explicitly opted out
     (skipped or turned off), null = no decision yet. The "false" state
     is what makes the difference: the browser's permissions.query
     still says "granted" after a Turn off, so without this distinction
     a refresh would happily re-acquire the stream against the user's
     last action. */
  const OPTIN_MIC = "hsx_setup_mic_optin";
  const OPTIN_CAM = "hsx_setup_camera_optin";
  const readOptIn = (k: string): boolean | null => {
    try {
      const v = sessionStorage.getItem(k);
      return v === "1" ? true : v === "0" ? false : null;
    } catch { return null; }
  };
  const writeOptIn = (k: string, on: boolean) => {
    try { sessionStorage.setItem(k, on ? "1" : "0"); } catch { /* private mode */ }
  };

  const requestMic = async () => {
    setMicStatus("requesting");
    setMicDenyReason(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicStatus("granted");
      startLevelMeter(stream);
      writeOptIn(OPTIN_MIC, true);
      track("permission_granted", { kind: "mic" });
    } catch (e) {
      writeOptIn(OPTIN_MIC, false);
      const reason = reasonFromError(e);
      setMicDenyReason(reason);
      setMicStatus("denied");
      track("permission_denied", { kind: "mic", reason });
    }
  };

  const requestCamera = async () => {
    setCameraStatus("requesting");
    setCameraDenyReason(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraStatus("granted");
      writeOptIn(OPTIN_CAM, true);
      track("permission_granted", { kind: "camera" });
    } catch (e) {
      writeOptIn(OPTIN_CAM, false);
      const reason = reasonFromError(e);
      setCameraDenyReason(reason);
      setCameraStatus("denied");
      track("permission_denied", { kind: "camera", reason });
    }
  };

  const skipCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStatus("skipped");
    writeOptIn(OPTIN_CAM, false);
    track("permission_skipped", { kind: "camera" });
  };

  // Allow a granted camera to be turned off — gives the user the same
  // pre-call control they'd expect from Zoom/Meet.
  const disableCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStatus("skipped");
    writeOptIn(OPTIN_CAM, false);
  };

  /* Probe existing permission grants + tab-scoped opt-in on mount so a
     refresh doesn't toss the user back to "idle".

     Decision matrix:
       opt-in === true   → re-acquire (user opted in earlier this tab)
       opt-in === false  → DO NOT auto-restore (user explicitly turned
                            it off / skipped — overrides browser cache)
       opt-in === null   → consult permissions.query; if browser says
                            "granted" we treat it as opt-in.

     Without the explicit-false handling, "Turn off" on the camera card
     followed by a refresh would helpfully re-enable the camera, which
     ignores the user's most recent action. */
  useEffect(() => {
    let mounted = true;
    const probe = async () => {
      const micPref = readOptIn(OPTIN_MIC);
      const camPref = readOptIn(OPTIN_CAM);
      let micGranted = micPref === true;
      let camGranted = camPref === true;
      const perms = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
      if (perms?.query) {
        if (micPref !== false) {
          try {
            const mic = await perms.query({ name: "microphone" as PermissionName });
            if (mic.state === "granted") micGranted = true;
          } catch { /* unsupported */ }
        }
        if (camPref !== false) {
          try {
            const cam = await perms.query({ name: "camera" as PermissionName });
            if (cam.state === "granted") camGranted = true;
          } catch { /* unsupported */ }
        }
      }
      if (mounted && micGranted) void requestMic();
      if (mounted && camGranted) void requestCamera();
      // Reflect explicit-skipped camera in UI so the user sees their
      // choice persisted instead of an idle "Allow" card.
      if (mounted && camPref === false && !camGranted) setCameraStatus("skipped");
    };
    void probe();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Multi-metric camera readiness sampler. The previous version was a
     single brightness-average check that flipped a binary "looks good"
     flag, which users called out as feeling fake. This version samples
     a 32×32 thumbnail every 500ms and computes three independent
     signals so we can show concrete sub-states ("Lighting · ✓",
     "Framing · move closer", "Sharpness · hold still") instead of one
     yes/no flag.
       • lighting     — mean luma. Too low → "add light". Pegged → "too bright".
       • framing      — center-vs-corners luma delta. Center region should
                        be brighter (subject in frame) than corners. Negative
                        → "you're in the corner / move to center".
       • sharpness    — frame-to-frame stability (no Laplacian needed for
                        the cheap version). High delta = motion blur.
     Each signal has its own short-history smoothing so a single flicker
     doesn't trip the readout. faceLooksGood remains the all-three-pass
     gate, kept for API compatibility with downstream consumers. */
  useEffect(() => {
    if (!cameraStream) {
      setFaceLooksGood(false);
      setCameraSignals({ lighting: "checking", framing: "checking", sharpness: "checking" });
      faceSamplerRef.current?.stop();
      faceSamplerRef.current = null;
      return;
    }
    let cancelled = false;
    const video = document.createElement("video");
    video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => undefined);
    const SIDE = 32;
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let prevPixels: Uint8ClampedArray | null = null;
    const tick = () => {
      if (cancelled) return;
      try {
        ctx.drawImage(video, 0, 0, SIDE, SIDE);
        const px = ctx.getImageData(0, 0, SIDE, SIDE).data;
        // Mean luma over whole frame
        let totalLuma = 0;
        for (let i = 0; i < px.length; i += 4) {
          totalLuma += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        }
        const meanLuma = totalLuma / (px.length / 4);
        // Center vs corners: 16x16 center region vs four 8x8 corners
        const lumaAt = (x: number, y: number) => {
          const i = (y * SIDE + x) * 4;
          return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        };
        let centerSum = 0, cornerSum = 0;
        const cStart = Math.floor(SIDE / 4); // 8
        const cEnd = SIDE - cStart; // 24
        for (let y = cStart; y < cEnd; y++) for (let x = cStart; x < cEnd; x++) centerSum += lumaAt(x, y);
        const centerMean = centerSum / ((cEnd - cStart) * (cEnd - cStart));
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            cornerSum += lumaAt(x, y) + lumaAt(SIDE - 1 - x, y) + lumaAt(x, SIDE - 1 - y) + lumaAt(SIDE - 1 - x, SIDE - 1 - y);
          }
        }
        const cornerMean = cornerSum / (8 * 8 * 4);
        const centerCornerDelta = centerMean - cornerMean;
        // Frame-to-frame difference (motion / blur proxy)
        let frameDiff = 0;
        if (prevPixels) {
          let s = 0;
          for (let i = 0; i < px.length; i += 4) s += Math.abs(px[i] - prevPixels[i]);
          frameDiff = s / (px.length / 4);
        }
        prevPixels = new Uint8ClampedArray(px);
        // Classify each signal. Thresholds tuned for typical webcam preview.
        const lighting: CameraSignalState =
          meanLuma < 35 ? "fail-dark"
          : meanLuma > 230 ? "fail-bright"
          : meanLuma < 60 ? "warn-low"
          : "pass";
        const framing: CameraSignalState =
          centerCornerDelta < -10 ? "fail-offcenter"
          : centerCornerDelta < 0 ? "warn-offcenter"
          : "pass";
        const sharpness: CameraSignalState =
          frameDiff > 25 ? "fail-motion"
          : frameDiff > 12 ? "warn-motion"
          : "pass";
        if (!cancelled) {
          setCameraSignals({ lighting, framing, sharpness });
          setFaceLooksGood(lighting === "pass" && framing === "pass" && sharpness === "pass");
        }
      } catch { /* video not yet ready */ }
    };
    const id = window.setInterval(tick, 500);
    faceSamplerRef.current = {
      stop: () => {
        cancelled = true;
        clearInterval(id);
        try { video.pause(); } catch { /* noop */ }
        video.srcObject = null;
      },
    };
    return () => faceSamplerRef.current?.stop();
  }, [cameraStream]);

  // Stop preview streams + level meter on unmount.
  useEffect(() => {
    return () => {
      stopLevelMeter();
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  /* React to OS-level permission revoke. If the user goes to browser
     settings while this page is open and revokes mic/camera, the stream
     ends silently — without this listener the UI lies. We listen on the
     PermissionStatus object and flip status back to "denied" + clear
     the opt-in. Tracks via revoked-mid-session for analytics. */
  useEffect(() => {
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus> } }).permissions;
    if (!perms?.query) return;
    let micStatusObj: PermissionStatus | null = null;
    let camStatusObj: PermissionStatus | null = null;
    const onMicChange = () => {
      if (micStatusObj && micStatusObj.state !== "granted" && micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        stopLevelMeter();
        setMicStatus("denied");
        setMicDenyReason("blocked");
        writeOptIn(OPTIN_MIC, false);
        track("permission_revoked", { kind: "mic" });
      }
    };
    const onCamChange = () => {
      if (camStatusObj && camStatusObj.state !== "granted" && cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
        setCameraStream(null);
        setCameraStatus("denied");
        setCameraDenyReason("blocked");
        writeOptIn(OPTIN_CAM, false);
        track("permission_revoked", { kind: "camera" });
      }
    };
    perms.query({ name: "microphone" as PermissionName }).then((s) => {
      micStatusObj = s;
      s.addEventListener?.("change", onMicChange);
    }).catch(() => undefined);
    perms.query({ name: "camera" as PermissionName }).then((s) => {
      camStatusObj = s;
      s.addEventListener?.("change", onCamChange);
    }).catch(() => undefined);
    return () => {
      micStatusObj?.removeEventListener?.("change", onMicChange);
      camStatusObj?.removeEventListener?.("change", onCamChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salary-negotiation interviews need a specific company anchor — the
  // LLM grounds the offer band, equity policy, and negotiation style on
  // company tier. An unspecified target makes the negotiation generic
  // and the offer numbers calibration-less. So company is *required*
  // for that focus only; for other focuses it stays optional.
  const isNegotiationFocus = interviewFocus[0] === "Salary Negotiation";
  const companyRequired = isNegotiationFocus;
  const companyMissing = companyRequired && !targetCompany.trim();

  /* Role × company sector-fit check (salary-neg only). Hard mismatches
     like "Pilot @ Razorpay" or "Investment Banker @ Flipkart" are
     blocked here at setup so the candidate isn't coached against a
     bogus band downstream. Soft mismatches and universal-role/co
     combos pass through. */
  const roleCompanyFit = useMemo(() => {
    if (!isNegotiationFocus) return null;
    const role = targetRole.trim();
    const company = targetCompany.trim();
    if (!role || !company) return null;
    const tier = getCompanyTier(company);
    const roleKey = matchRoleKey(role);
    return detectRoleCompanyFit(roleKey, tier, company);
  }, [isNegotiationFocus, targetRole, targetCompany]);
  const hardRoleCompanyMismatch = roleCompanyFit?.fit === "hard_mismatch";

  /* S40-B8 (2026-07-23) — derive market mode client-side using the same
   * inferCompanyMode → marketMode mapping that negotiate-turn.ts uses at
   * session init, so we can disclose the simulation context before the
   * session starts. Mirrors: GCC/MNC → neutral, BFSI/IT_SERVICES → soft,
   * STARTUP → hot, PRODUCT_INDIA → neutral (B5 2026-07-23). */
  const simulatedMarketMode = useMemo<"soft" | "neutral" | "hot" | null>(() => {
    if (!isNegotiationFocus || !targetCompany.trim()) return null;
    const c = targetCompany;
    /* GCC — expanded (S53-B3/S52-WL-B2, 2026-07-24): mirrors _market-mode.ts GCC_RE.
     * Walmart Labs, Adobe, Cisco etc. were missing, causing them to hit the "soft" default. */
    if (/(gcc|global\s+capability|captive|walmart|target\s+corp|lowe'?s|tesco|american\s+express|\bamex\b|optum|unitedhealth|wells\s+fargo|jpmorgan|jp\s+morgan|jpmc|goldman|morgan\s+stanley|deutsche|hsbc|bank\s+of\s+america|bofa|barclays|standard\s+chartered|nomura|ubs|credit\s+suisse|citibank|citi\b|nvidia|\bintel\b|qualcomm|adobe|cisco|vmware|\bdell\b|\bhp\b|\bhpe\b|shell\b|mastercard|\bvisa\b|paypal|expedia|uber\b|linkedin)/i.test(c)) return "neutral";
    if (/(bank|insurance|nbfc|mutual\s+fund|hdfc|icici|kotak|axis|sbi|bajaj\s+finserv|lic|life\s+insurance)/i.test(c)) return "soft";
    if (/(zomato|swiggy|zepto|meesho|razorpay|cred\b|groww|slice\b|navi\b|jupiter\b|niyo|jar\b|fi\s+money|smallcase|zetwerk|moglix|ofbusiness|spinny|cars24|droom|ola\b|rapido|dunzo|blinkit)/i.test(c)) return "hot";
    if (/(google|microsoft|amazon|meta\b|apple|netflix|salesforce|oracle|sap\b|ibm)/i.test(c)) return "neutral";
    /* B5 (2026-07-23) — Indian product companies: neutral, not soft.
     * Must precede the IT_SERVICES fallback (return "soft" below). */
    if (/(freshworks|zoho\b|chargebee|postman\b|browserstack|hasura\b|clevertap|eka\b|druva\b|icertis|uniphore|kissflow|sprinklr|capillary(\s+tech(?:nologies)?)?|salto\b|mindtickle|whatfix|saastr\b|razorpayx\b|perfios|darwinbox)/i.test(c)) return "neutral";
    /* CONSULTING (S53-B3, 2026-07-24): MBB + Big-4 + strategy houses = neutral,
     * not soft. Structured comp bands independent of IT-services pricing compression. */
    if (/(mckinsey|bcg|boston\s+consulting|\bbain\b|deloitte|\bey\b|ernst\s+(?:&|and)\s+young|\bkpmg\b|\bpwc\b|pricewaterhouse|kearney|oliver\s+wyman|\bzs\b|zs\s+associates|roland\s+berger|alvarez|grant\s+thornton|accenture)/i.test(c)) return "neutral";
    return "soft";
  }, [isNegotiationFocus, targetCompany]);

  /* S54-B10 (2026-07-24) — disclose when the entered company doesn't match any
   * named-company pattern in inferCompanyMode and falls to the IT_SERVICES
   * default. Mirrors the regex guards in _market-mode.ts so the two stay in
   * sync; IT_SERVICES is the only untuned bucket. */
  /* S51-B3 (2026-07-24): extended to all focus types — not just negotiation.
   * When `isNegotiationFocus` was the only gate, HR/behavioral sessions with
   * unrecognised companies showed no warning at setup; users only discovered
   * the "not in our tuned profile set" note in the report. The regexes below
   * mirror the sector lists in `_hr-round-overlays.ts` and `_market-mode.ts`. */
  const isUntunedCompany = useMemo<boolean>(() => {
    if (!targetCompany.trim()) return false;
    const c = targetCompany.trim();
    if (/(gcc|global\s+capability|captive|walmart|target\s+corp|lowe'?s|tesco|american\s+express|\bamex\b|optum|unitedhealth|wells\s+fargo|jpmorgan|jp\s+morgan|jpmc|goldman|morgan\s+stanley|deutsche|hsbc|bank\s+of\s+america|bofa|barclays|standard\s+chartered|nomura|ubs|credit\s+suisse|citibank|citi\b|nvidia|\bintel\b|qualcomm|adobe|cisco|vmware|\bdell\b|\bhp\b|\bhpe\b|shell\b|mastercard|\bvisa\b|paypal|expedia|uber\b|linkedin)/i.test(c)) return false;
    if (/(bank|insurance|nbfc|mutual\s+fund|hdfc|icici|kotak|axis|sbi|bajaj\s+finserv|lic|life\s+insurance)/i.test(c)) return false;
    if (/(zomato|swiggy|zepto|meesho|razorpay|cred\b|groww|slice\b|navi\b|jupiter\b|niyo|jar\b|fi\s+money|smallcase|zetwerk|moglix|ofbusiness|spinny|cars24|droom|ola\b|rapido|dunzo|blinkit)/i.test(c)) return false;
    if (/(google|microsoft|amazon|meta\b|apple|netflix|salesforce|oracle|sap\b|ibm)/i.test(c)) return false;
    if (/(freshworks|zoho\b|chargebee|postman\b|browserstack|hasura\b|clevertap|eka\b|druva\b|icertis|uniphore|kissflow|sprinklr|capillary|salto\b|mindtickle|whatfix|saastr\b|razorpayx\b|perfios|darwinbox)/i.test(c)) return false;
    if (/(mckinsey|bcg|boston\s+consulting|\bbain\b|deloitte|\bey\b|ernst\s+(?:&|and)\s+young|\bkpmg\b|\bpwc\b|pricewaterhouse|kearney|oliver\s+wyman|\bzs\b|zs\s+associates|roland\s+berger|alvarez|grant\s+thornton|accenture)/i.test(c)) return false;
    if (/(tcs|tata\s+consultancy|infosys|wipro|hcl\b|tech\s+mahindra|cognizant|mphasis|hexaware|ltimindtree|coforge|persistent)/i.test(c)) return false;
    return true;
  }, [targetCompany]);

  const formComplete =
    !!targetRole.trim() &&
    interviewFocus.length > 0 &&
    !companyMissing &&
    !hardRoleCompanyMismatch;

  /* Mic is only a hard requirement when the AI actually speaks. With the
     TTS kill-switch on (VOICE_OUTPUT_DISABLED), the interview is text-first
     and fully answerable by typing — the engine's `?nomic=1` path drives a
     complete typed session. Requiring mic permission in that state locks
     mic-denied / locked-down-device users out of a text-only product for no
     reason. Gate the requirement on the same flag that puts the composer in
     text mode, so the two never drift apart. */
  const micRequired = !VOICE_OUTPUT_DISABLED;
  const canProceed = formComplete && (micStatus === "granted" || !micRequired);

  // Launch interview
  const handleStart = () => {
    // If negotiation focus and company is missing, surface the error
    // and bail. The button is already disabled via canProceed but
    // keyboard shortcuts (⌘+Enter) bypass the disabled state.
    if (companyMissing) {
      setCompanyTouched(true);
      toast("Pick a company before starting a salary-negotiation interview.", "error");
      return;
    }
    if (hardRoleCompanyMismatch) {
      toast(
        roleCompanyFit?.reason ?? "This role doesn't appear to match the selected company. Pick a different combination.",
        "error",
      );
      return;
    }
    if (!canProceed) return;
    if (!navigator.onLine) {
      toast("You're offline. Please check your internet connection before starting.", "error");
      return;
    }
    setStarting(true);
    unlockAudio();
    // Persist user-typed company so it shows up in the dropdown next
    // session. No-op when the company is already in the canonical list
    // or when targetCompany is empty (non-negotiation focus).
    if (targetCompany.trim()) saveUserCompany(targetCompany);
    const focusType = focusToType[interviewFocus[0]] || "behavioral";
    track("session_start", { type: focusType, role: targetRole, sessionLength: SESSION_LENGTH });
    // PostHog event: per-focus selection signal for the analytics dashboard.
    // The `focus` property is the canonical internal id (behavioral,
    // strategic, technical, …) so it groups cleanly in PostHog Insights.
    // Pair with `interview_session_started` / `interview_session_completed`
    // for funnel + drop-off-by-focus analysis.
    captureClientEvent("interview_focus_selected", {
      focus: focusType,
      focus_label: interviewFocus[0] || null,
      role: targetRole || null,
      company: targetCompany || null,
      session_minutes: sessionMinutes,
      difficulty: "standard",
    });
    const introText = introByType[focusType] || introByType.behavioral;
    prefetchTTS(introText);
    setLaunching(true);
    // Pre-roll budget: ~2.0s total — three 600ms beats (3-2-1) plus a
    // brief "Let's go!" frame. The previous 250ms-per-beat felt too
    // rushed (users could barely register one number before the next
    // appeared); 600ms matches what real-world countdown timers use
    // (sports timers, broadcast intros). Still well within Chrome's
    // ~5s gesture-activation window for the AudioContext unlock that
    // happens at the end of the chain.
    setCountdown(3);
    setTimeout(() => setCountdown(2), 600);
    setTimeout(() => setCountdown(1), 1200);
    setTimeout(() => {
      setCountdown(0);
      // One more unlock attempt right before navigation — if the gesture
      // is still warm this primes the new page's audio path before mount.
      unlockAudio();
      // Release the preview streams — the interview surface re-acquires
      // them. The browser keeps the permission grant so this is instant.
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      const cameraParam = cameraStatus === "granted" ? "&camera=1" : "";
      // Forward drill key when present + recognized. Unknown keys are
      // dropped so /interview doesn't receive an unrecognized directive.
      const drillParam = drillCta ? `&drill=${encodeURIComponent(drillKey)}` : "";
      /* Some focuses need both a `type=` and `focus=` param on the interview URL:
         - HR Round: type=hr-round, focus=hr-round (pipeline keyed on "hr-round")
         - Campus Placement: type=behavioral, focus=campus-placement
           (stored as behavioral in DB; focus distinguishes it from behavioral)
         Every other type: type=<focusType>, no separate focus param. */
      let interviewTypeParam = focusType;
      let focusParam = "";
      if (focusType === "hr-round") {
        focusParam = "&focus=hr-round";
      } else if (focusType === "campus-placement") {
        interviewTypeParam = "behavioral";
        focusParam = "&focus=campus-placement";
      }
      /* Starting without a granted mic (allowed when voice output is off) —
         hand the engine its text-only hatch so it doesn't try to acquire a
         mic the user never gave and doesn't render a dead "Listening" state. */
      const micParam = micStatus === "granted" ? "" : "&nomic=1";
      router.push(`/interview?type=${interviewTypeParam}${focusParam}&difficulty=standard&new=1${targetCompany ? `&company=${encodeURIComponent(targetCompany)}` : ""}&role=${encodeURIComponent(targetRole)}&length=${SESSION_LENGTH}${cameraParam}${drillParam}${micParam}`);
    }, 1900);
  };

  // Power-user shortcut: ⌘/Ctrl+Enter from anywhere on the page launches.
  // If the form is complete but mic is missing, the shortcut prompts for
  // mic instead of starting. Listed in the title-attr help text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (canProceed && !starting && isOnline) handleStart();
      else if (micRequired && formComplete && micStatus !== "granted" && micStatus !== "requesting") void requestMic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canProceed, starting, isOnline, formComplete, micStatus]);

  return (
    <div style={{ minHeight: "100vh", background: T.cream, display: "flex", flexDirection: "column", color: T.coal, fontFamily: F.sans }}>
      {/* Skip-to-content link — visually hidden until keyboard focus.
          Standard a11y pattern; keyboard users tab past the topbar
          straight to the form. */}
      <a
        href="#hsx-setup-form"
        className="hsx-skip-link"
        style={{
          position: "absolute", left: 12, top: 12, zIndex: 100,
          padding: "8px 14px", borderRadius: 8,
          background: T.indigo, color: T.cream,
          fontFamily: F.sans, fontSize: 13, fontWeight: 500,
          textDecoration: "none",
          transform: "translateY(-200%)",
          transition: "transform 160ms ease",
        }}
        onFocus={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        onBlur={(e) => { e.currentTarget.style.transform = "translateY(-200%)"; }}
      >
        Skip to setup form
      </a>
      <style>{AUTH_STYLES}</style>
      <style>{`
        /* Canonical fadeUp / spin / pulse live in src/index.css.
           Setup-local keyframes (launchIn, launchPulse, countdown*,
           hsxAccent*, hsxShimmer) stay here — they're not reused. */
        @keyframes launchIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes launchPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.85; } }
        @keyframes countdownPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes countdownFade { 0% { opacity: 1; transform: scale(1); } 80% { opacity: 1; } 100% { opacity: 0.6; transform: scale(0.95); } }
        @keyframes hsxAccentIn { 0% { opacity: 0; transform: translateY(6px); } 60% { opacity: 1; } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes hsxBadgePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(49,46,129,0.35); } 50% { box-shadow: 0 0 0 6px rgba(49,46,129,0); } }
        @keyframes hsxShimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        /* Skeleton placeholder for elements that load async (identity
           chip while useAuth resolves). Reserves space + telegraphs
           "loading" without flashing or shifting. */
        .hsx-shimmer {
          background-image: linear-gradient(90deg, ${T.creamSoft} 0%, ${T.line} 40%, ${T.creamSoft} 80%);
          background-size: 200px 100%;
          background-repeat: no-repeat;
          animation: hsxShimmer 1.4s ease-in-out infinite;
        }
        .ob-card { background: ${T.white}; border: 1px solid ${T.line}; }
        /* Uses canonical 'pulse' from index.css (1.6s ease-in-out). */
        .ob-mic-pulse { animation: pulse 1.6s ease-in-out infinite; }

        /* ─── Editorial accent entrance ─────────────────────────────────
           Hero "ready" italic-copper word slides in 100ms after the
           rest of the headline so the eye lands on it. Small, tasteful. */
        .hsx-setup-hero-h1 em { animation: hsxAccentIn 600ms 120ms cubic-bezier(.2,.7,.2,1) both; }
        /* "For you" recommendation badge — single soft pulse on first
           render so a returning user's eye finds the suggestion. */
        .hsx-recommend-badge { animation: hsxBadgePulse 1.6s ease-out 1; }

        /* ─── Completed-zone dim ─────────────────────────────────────────
           Once the user has met the form requirements (role + focus + mic
           granted), Focus and Permissions sections fade to 88% opacity
           so the CTA visually owns the page. Hovering or focusing inside
           a section restores full opacity — users can still change
           selections without fighting the dim. */
        .hsx-completed-zone { transition: opacity 320ms ease; }
        .hsx-completed-zone:hover, .hsx-completed-zone:focus-within { opacity: 1 !important; }

        /* ─── Focus rings (a11y) ─────────────────────────────────────────
           Default browser :focus-visible is inconsistent across browsers
           on a card-heavy form. Custom indigo halo on every interactive
           surface. Matches the existing AutocompleteInput focus state. */
        .ob-focus-card:focus-visible,
        .hsx-setup-cta:focus-visible,
        .hsx-permission-card button:focus-visible,
        .hsx-link-indigo:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px ${T.indigoRing}, 0 1px 2px rgba(20,17,10,.04);
        }

        /* ─── prefers-reduced-motion ─────────────────────────────────────
           Disable transforms / scale / pulse / countdown animations.
           Fades remain (they're informational, not motion-sensitive). */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 100ms !important;
            scroll-behavior: auto !important;
          }
          .ob-mic-pulse { animation: none !important; }
          .hsx-recommend-badge { animation: none !important; }
        }
        .ob-s2-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .ob-s2-focus-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .ob-permissions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ob-s2-session-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

        /* ─── Responsive layout ─────────────────────────────────────────
           Three breakpoints: tablet (≤1024), small (≤600), tiny (≤500). */
        .hsx-setup-topbar { padding: 32px 48px; }
        .hsx-setup-content { padding: clamp(24px, 4vh, 64px) 32px 80px; }
        .hsx-setup-hero-h1 { white-space: nowrap; }
        .hsx-setup-identity-name { display: inline; }

        /* Small desktop (≤1280px, e.g. 13" laptops at 1280×800) — compress
           the hero + spacing aggressively so the form + CTA fit without scroll. */
        @media (max-width: 1280px) {
          .hsx-setup-topbar { padding: 12px 32px !important; }
          .hsx-setup-content { padding: 12px 32px 32px !important; }
          .hsx-setup-hero-h1 { font-size: clamp(1.5rem, 3vw, 2rem) !important; line-height: 1.1 !important; }
          .hsx-setup-hero { margin-bottom: 14px !important; }
          .hsx-setup-hero-sub { margin-top: 6px !important; font-size: 13px !important; line-height: 1.45 !important; }
          .hsx-setup-hero-pillrow { margin-top: 8px !important; gap: 4px !important; }
          .hsx-setup-hero-pillrow p { font-size: 12px !important; }
          .hsx-setup-time-pill { font-size: 11px !important; padding: 4px 10px !important; }
          .hsx-setup-form-sections { gap: 16px !important; }
          .hsx-setup-cta-zone { margin-top: 16px !important; padding-top: 12px !important; gap: 8px !important; }
          .hsx-setup-cta { padding: 14px 28px !important; font-size: 14px !important; }
          .ob-focus-card { padding: 10px !important; }
        }
        @media (max-width: 1024px) {
          .ob-s2-focus-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 760px) {
          /* The hero clamp settles to its floor here and the nowrap
             starts overflowing. Let it wrap. */
          .hsx-setup-hero-h1 { white-space: normal !important; text-wrap: balance; }
        }
        @media (max-width: 600px) {
          .hsx-setup-topbar { padding: 16px 20px !important; }
          .hsx-setup-content { padding: 20px 20px 64px !important; }
          .ob-s2-role-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr 1fr !important; }
          .ob-s2-session-grid { grid-template-columns: 1fr !important; }
          .ob-permissions-grid { grid-template-columns: 1fr !important; }
          /* Keep the icon+copy+action row inline on mobile — wrapping made
             the granted card ~2× taller than it needed to be. Compact the
             padding + icon tile so everything still fits in 320-360px. */
          .hsx-permission-card { padding: 12px !important; gap: 10px !important; }
          .hsx-permission-card > span:first-child { width: 32px !important; height: 32px !important; }
          /* Camera preview is a wider rectangle — keep its aspect on mobile
             instead of being collapsed to the 32-square icon-tile size. */
          .hsx-permission-cam-preview { width: 56px !important; height: 42px !important; }
          .hsx-permission-actions { padding-top: 0 !important; }
          /* Focus chip labels ("Technical Leadership") need slightly less
             padding to fit comfortably in the 2-col mobile grid. */
          .ob-focus-card { padding: 12px !important; }
          .ob-focus-card span:nth-child(2) { font-size: 12px !important; }
          /* On phones a centered short CTA looks lonely — let it span the
             form again so the tap target is generous. */
          /* On phones the CTA is full-width AND the zone above it gets a
             1px hairline + extra padding so it reads as the commit zone.
             min-height 48 ensures Apple HIG touch target floor. */
          .hsx-setup-cta { width: 100% !important; min-width: 0 !important; padding: 16px 24px !important; font-size: 15px !important; min-height: 48px !important; }
          .hsx-setup-cta-zone { border-top: 1px solid #EBE5D2; padding-top: 28px !important; margin-top: 32px !important; }
          /* Time pill bumps to 13/regular for legibility on phones. */
          .hsx-setup-time-pill { font-size: 13px !important; padding: 6px 14px !important; }
        }
        @media (max-width: 500px) {
          /* Drop the name to keep the right cluster from overflowing —
             avatar + Skip remain. The full name still appears via title
             attr on the avatar block. */
          .hsx-setup-identity-name { display: none !important; }
        }
        @media (max-width: 420px) {
          /* Tiny-phone refinements (≤iPhone SE-class viewports) — squeeze
             padding + grids further so cards don't overflow. */
          .hsx-setup-topbar { padding: 12px 14px !important; gap: 8px !important; }
          .hsx-setup-content { padding: 16px 14px 56px !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr !important; }
          .hsx-permission-card { padding: 10px !important; gap: 8px !important; }
          .hsx-setup-cta { font-size: 14px !important; padding: 14px 18px !important; }
        }
      `}</style>

      {/* ─── Top Bar — same 3-col grid + tokens used by auth + onboarding. ─── */}
      {/* Full-width topbar — wordmark sits at the left viewport gutter,
          identity chip at the right, matching the canvas storyboard
          (tempo/designs/canvases/interview/SessionSetup.tsx). The earlier
          1080px-capped inner wrapper was making the logo + name look
          bunched toward the centre on wide displays. */}
      <div className="hsx-setup-topbar" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, borderBottom: `1px solid ${T.line}`, background: T.cream }}>
        <div role="button" tabIndex={0} onClick={() => router.push("/dashboard")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push("/dashboard"); } }} style={{ justifySelf: "start", cursor: "pointer" }} title="Back to dashboard">
          <Wordmark />
        </div>
        <div style={{ justifySelf: "center" }} />
        {/* Identity chip — always reserves a fixed-height slot so the
            topbar doesn't reflow when useAuth resolves (zero CLS).
            Renders a shimmer placeholder while user is null. */}
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 14, minHeight: 30 }}>
          {(() => {
            const trimmed = (user?.name || "").trim();
            if (!trimmed) {
              // Shimmer placeholder — same dimensions as the loaded chip.
              return (
                <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="hsx-shimmer" style={{ width: 30, height: 30, borderRadius: 999, background: T.creamSoft }} />
                  <span className="hsx-shimmer hsx-setup-identity-name" style={{ width: 96, height: 14, borderRadius: 4, background: T.creamSoft }} />
                </div>
              );
            }
            const initials = trimmed.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
            return (
              <div title={trimmed} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F.sans, fontSize: 14, fontWeight: 500, color: T.coal }}>
                <span aria-hidden style={{ width: 30, height: 30, borderRadius: 999, background: T.indigo100, color: T.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: F.serif, fontSize: 13, fontWeight: 400, flexShrink: 0 }}>
                  {initials || (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </span>
                <span className="hsx-setup-identity-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "min(160px, 28vw)" }}>{trimmed}</span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="hsx-setup-content" style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto" }}>
        <div id="hsx-setup-form" style={{ width: "100%", maxWidth: "min(1080px, calc(100vw - 32px))", animation: "fadeUp 0.3s ease" }}>

          <div>
              {/* Drill mode banner — shown when the user arrived from a
                  dashboard gap CTA (e.g. ?drill=comp_floor). Tells the
                  user the practice context was recognized so the CTA
                  promise feels honest, even though /interview doesn't
                  yet reshape the LLM prompt (follow-up — see commit
                  message). */}
              {drillCta && (
                <div
                  data-testid="session-setup-drill-banner"
                  className="fade-up-1"
                  style={{
                    marginBottom: 20,
                    padding: "14px 18px",
                    borderRadius: 10,
                    background: T.copper100,
                    border: `1px solid ${T.copper}`,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.copper} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.copper, marginBottom: 4 }}>
                      Drilling from your last HR round
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 14, color: T.coal, lineHeight: 1.45 }}>
                      {drillCta.headline}
                    </div>
                  </div>
                </div>
              )}
              {/* Hero — centered, matches the canvas SetupEmpty storyboard. */}
              <div style={{ marginBottom: 32, textAlign: "center" }} className="fade-up-1 hsx-setup-hero">
                <h1 className="hsx-setup-hero-h1" style={{ fontFamily: F.serif, fontSize: "clamp(1.75rem, 5.6vw, 4rem)", fontWeight: 400, color: T.coal, letterSpacing: "-0.02em", lineHeight: 1.05, margin: 0 }}>
                  Let&apos;s get you{" "}
                  <em style={{ fontStyle: "italic", fontWeight: 400, color: T.copper }}>ready</em>
                </h1>
                <p className="hsx-setup-hero-sub" style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.55, color: T.inkSoft, marginTop: 14, marginBottom: 0, textWrap: "balance" }}>
                  Tell us a few things and we&apos;ll personalize the experience for you.
                </p>
                {/* Time pill + value-reframe — answers "how long?" and ties
                    the time investment to outcome in one breath. */}
                <div className="hsx-setup-hero-pillrow" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 14 }}>
                  <div className="hsx-setup-time-pill" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: T.copper100, color: T.copper, fontFamily: F.sans, fontSize: 12, fontWeight: 500 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    ~{sessionMinutes} minutes
                  </div>
                </div>
              </div>

              <div className="hsx-setup-form-sections" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {/* ── Role & Company — canvas-style: clean field rows, no card chrome ── */}
                <div className="fade-up-1">
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: T.coal }}>
                      <span>About the role</span>
                      <span style={{ color: T.copper, fontSize: 12 }}>*</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                      We tailor questions to the role and company you're targeting.
                    </div>
                  </div>
                  <div className="ob-s2-role-grid">
                    <div>
                      <AutocompleteInput id="setup-role" value={targetRole} onChange={(v) => { setTargetRole(v); setRoleTouched(true); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required error={roleTouched && !targetRole.trim() ? "Required to personalize your questions" : undefined} />
                    </div>
                    <div>
                      <AutocompleteInput
                        id="setup-company"
                        value={targetCompany}
                        onChange={(v) => { setTargetCompany(v); setCompanyTouched(true); }}
                        suggestions={COMPANY_SUGGESTIONS}
                        placeholder={isNegotiationFocus ? "Required for salary negotiation — e.g. Razorpay, Google" : "e.g. Flipkart, Razorpay, TCS..."}
                        label={isNegotiationFocus ? "Company" : "Company (optional)"}
                        required={companyRequired}
                        error={
                          companyTouched && companyMissing
                            ? "Required — we calibrate the offer band to this company"
                            : hardRoleCompanyMismatch
                              ? `${targetRole.trim()} doesn't typically exist at ${targetCompany.trim()} — pick a different role or company.`
                              : undefined
                        }
                      />
                      {/* Soft-mismatch advisory — doesn't block but warns */}
                      {roleCompanyFit?.fit === "soft_mismatch" && !companyMissing && (
                        <div style={{ marginTop: 8, fontFamily: F.sans, fontSize: 12, color: T.inkSoft, lineHeight: 1.4 }}>
                          ⓘ {roleCompanyFit.reason}
                        </div>
                      )}
                      {/* S40-B8: market-mode disclosure before session starts */}
                      {simulatedMarketMode && !companyMissing && !hardRoleCompanyMismatch && (
                        <div style={{ marginTop: 8, fontFamily: F.sans, fontSize: 12, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 5, color: T.inkSoft }}>
                          <span style={{ flexShrink: 0, marginTop: 1 }}>ⓘ</span>
                          <span>
                            {simulatedMarketMode === "soft"
                              ? <><strong style={{ color: T.coal, fontWeight: 600 }}>Soft market simulation</strong> — recruiter will concede ~30% less than baseline. Cash gains here are harder-won than the % suggests.</>
                              : simulatedMarketMode === "hot"
                                ? <><strong style={{ color: T.coal, fontWeight: 600 }}>Competitive market simulation</strong> — recruiter has more flex to stretch. Push confidently on your ask.</>
                                : <><strong style={{ color: T.coal, fontWeight: 600 }}>Neutral market simulation</strong> — standard recruiter concession behaviour.</>
                            }
                          </span>
                        </div>
                      )}
                      {/* S54-B10: untuned-company disclosure */}
                      {isUntunedCompany && !companyMissing && !hardRoleCompanyMismatch && (
                        <div style={{ marginTop: 8, fontFamily: F.sans, fontSize: 12, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 5, color: T.inkSoft }}>
                          <span style={{ flexShrink: 0, marginTop: 1 }}>ⓘ</span>
                          <span>
                            <strong style={{ color: T.coal, fontWeight: 600 }}>Generic company simulation</strong>{" — "}{targetCompany.trim()}{isNegotiationFocus ? " isn't in our recruiter database yet. The session will use default IT-services negotiation behaviour rather than company-specific data." : " isn't in our calibrated profile set yet. Scoring will use the default senior-bar rubric rather than company-specific calibration."}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Interview Focus — canvas-style: clean label, 5-col grid ── */}
                <div className="fade-up-2 hsx-completed-zone" style={{ opacity: canProceed ? 0.88 : 1 }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: T.coal }}>
                      <span>Interview focus</span>
                      <span style={{ color: T.copper, fontSize: 12 }}>*</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                      {relevantFocusSet && targetRole.trim()
                        ? `Showing the focuses real interviews for "${targetRole.trim()}" actually use.${recommendedFocus && recommendedFocus !== "Behavioral" && !COMING_SOON_FOCUSES.has(recommendedFocus as InterviewFocus) && relevantFocusSet.has(recommendedFocus as InterviewFocus) ? " Recommended pick highlighted." : ""}`
                        : recommendedFocus && recommendedFocus !== "Behavioral" && !COMING_SOON_FOCUSES.has(recommendedFocus as InterviewFocus) && targetRole.trim()
                          ? "Choose one area to focus on. The recommended pick for your role is highlighted."
                          : targetRole.trim()
                            ? "Choose one area to focus on."
                            : "Enter a role to see relevant focuses."}
                    </div>
                  </div>
                  <div
                    className="ob-s2-focus-grid"
                    role="radiogroup"
                    aria-label="Interview focus"
                    /* tabIndex={-1} so the radiogroup is programmatically
                       focusable (satisfies jsx-a11y/interactive-supports-focus)
                       without inserting it into the tab order — focus actually
                       lives on the inner radio buttons via the roving-tabindex
                       pattern the onKeyDown below maintains. */
                    tabIndex={-1}
                    onKeyDown={(e) => {
                      // Roving tabindex: arrow keys move selection between
                      // chips, Home/End jump to first/last. Standard ARIA
                      // radiogroup interaction model.
                      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(e.key)) return;
                      e.preventDefault();
                      const focusables = (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>("button[role=radio]");
                      const arr = Array.from(focusables);
                      if (arr.length === 0) return;
                      const currentIdx = arr.findIndex((b) => b.getAttribute("aria-checked") === "true");
                      let nextIdx = currentIdx === -1 ? 0 : currentIdx;
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (currentIdx + 1) % arr.length;
                      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (currentIdx - 1 + arr.length) % arr.length;
                      else if (e.key === "Home") nextIdx = 0;
                      else if (e.key === "End") nextIdx = arr.length - 1;
                      arr[nextIdx]?.click();
                      arr[nextIdx]?.focus();
                    }}
                  >
                    {(() => {
                      const allOpts = [
                        { value: "Behavioral", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, desc: "Tell stories about how you handled past situations" },
                        { value: "Strategic", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, desc: "Show how you set vision and align teams" },
                        { value: "Technical Leadership", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, desc: "Walk through architecture and tech tradeoffs" },
                        { value: "Case Study", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, desc: "Solve real business problems out loud" },
                        { value: "Campus Placement", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg>, desc: "Talk projects, goals, and teamwork — fresher style" },
                        { value: "HR Round", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, desc: "Culture fit, motivation, salary expectations" },
                        { value: "Management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, desc: "How you lead, hire, and handle change" },
                        { value: "Panel Interview", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, desc: "Field three angles at once — manager, peer, HR" },
                        { value: "Salary Negotiation", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, desc: "Negotiate offer, benefits, and counter-offers" },
                        { value: "Government / PSU", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>, desc: "Ethics, current affairs, public-service motivation" },
                      ];
                      /* Role-aware filtering: when the user has typed a
                         classifiable role, hide focuses that real interview
                         loops for that role wouldn't include (e.g. don't
                         show "Technical Leadership" to a Customer Success
                         rep, don't show "Campus Placement" to a Senior
                         Engineering Manager). When the role is empty or
                         unclassified, show all 10 — see relevantFocusSet
                         derivation above. */
                      const filtered = relevantFocusSet
                        ? allOpts.filter((o) => relevantFocusSet.has(o.value as InterviewFocus))
                        : allOpts;
                      return filtered.map(opt => {
                        /* MVP gate: "Coming soon" focuses stay visible (so
                           users see the roadmap) but aren't selectable. They
                           drop role=radio so the roving-tabindex arrow nav
                           skips them, and `disabled` blocks clicks. */
                        const comingSoon = COMING_SOON_FOCUSES.has(opt.value as InterviewFocus);
                        const sel = !comingSoon && interviewFocus[0] === opt.value;
                        const isRecommended = !comingSoon && opt.value === recommendedFocus && recommendedFocus !== "Behavioral";
                        return (
                          <button key={opt.value} className="ob-focus-card"
                            onClick={comingSoon ? undefined : () => setInterviewFocus([opt.value])}
                            type="button"
                            disabled={comingSoon}
                            {...(comingSoon
                              ? { "aria-disabled": true as const }
                              : { role: "radio", "aria-checked": sel })}
                            /* Roving tabindex: only the selected (or first
                               if none selected) chip is in the tab order;
                               arrow keys move between siblings. Coming-soon
                               cards are never in the tab order. */
                            tabIndex={comingSoon ? -1 : sel ? 0 : -1}
                            title={comingSoon ? "Coming soon — not available yet" : undefined}
                            style={{
                              padding: 14, borderRadius: 12, cursor: comingSoon ? "not-allowed" : "pointer", transition: "all 0.22s cubic-bezier(.2,.7,.2,1)", textAlign: "left",
                              background: comingSoon ? T.cream : sel ? `linear-gradient(180deg, ${T.indigo100}, ${T.white})` : T.white,
                              border: `1px ${comingSoon ? "dashed" : "solid"} ${sel ? T.indigo : T.line}`,
                              boxShadow: comingSoon ? "none" : sel ? `0 0 0 3px ${T.indigoRing}` : "0 1px 0 rgba(20,17,10,.03), 0 1px 2px rgba(20,17,10,.04), 0 12px 32px -16px rgba(20,17,10,.10)",
                              opacity: comingSoon ? 0.65 : 1,
                              display: "flex", alignItems: "center", gap: 10, color: T.coal,
                              position: "relative", fontFamily: F.sans,
                            }}>
                            {isRecommended && (
                              <span className="hsx-recommend-badge" style={{ position: "absolute", top: -8, right: 10, fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: T.cream, background: T.indigo, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>For you</span>
                            )}
                            {comingSoon && (
                              <span style={{ position: "absolute", top: -8, right: 10, fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: T.inkSoft, background: T.white, border: `1px solid ${T.line}`, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Coming soon</span>
                            )}
                            <span style={{ width: 32, height: 32, borderRadius: 6, background: comingSoon ? T.line : T.indigo100, color: T.coal, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {opt.icon}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 500, color: T.coal, flex: 1, lineHeight: 1.2 }}>{opt.value}</span>
                            {comingSoon ? (
                              <span aria-hidden style={{ width: 18, height: 18, color: T.inkSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              </span>
                            ) : (
                              <span aria-hidden style={{ width: 18, height: 18, borderRadius: 999, border: `1.5px solid ${sel ? T.indigo : T.line}`, background: sel ? T.indigo : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.white} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                              </span>
                            )}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* ── Permissions — mic compulsory, camera optional ── */}
                <div className="fade-up-3 hsx-completed-zone" style={{ opacity: canProceed ? 0.88 : 1 }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 500, color: T.coal }}>Permissions</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                      Used live for this session only — audio and video are never recorded. Only your session transcript is saved, so you can review your report.
                    </div>
                  </div>
                  <div className="ob-permissions-grid">
                    <PermissionCard
                      kind="mic"
                      label="Microphone"
                      sublabel={micRequired ? "Required" : "Optional"}
                      sublabelTone={micRequired ? "copper" : "muted"}
                      status={micStatus}
                      onRequest={requestMic}
                      level={micLevel}
                      voiceDetected={voiceDetected}
                      denyReason={micDenyReason}
                      isIOS={isIOS}
                    />
                    <PermissionCard
                      kind="camera"
                      label="Camera"
                      sublabel="Optional"
                      sublabelTone="muted"
                      status={cameraStatus}
                      onRequest={requestCamera}
                      onSkip={skipCamera}
                      onDisable={disableCamera}
                      denyReason={cameraDenyReason}
                      isIOS={isIOS}
                      cameraStream={cameraStream}
                      faceLooksGood={faceLooksGood}
                      cameraSignals={cameraSignals}
                    />
                  </div>
                </div>

              </div>
            </div>


          {/* ─── Resume coaching brief — shown when AI resume exists.
                A 2-line card surfacing interviewStrengths / interviewGaps
                so the candidate knows what to lean on and watch for before
                the first question fires. Data already exists on the profile;
                zero extra network calls. */}
          {(() => {
            const rd = user?.resumeData as Record<string, unknown> | undefined;
            const ap = rd?.aiProfile as { interviewStrengths?: string[]; interviewGaps?: string[] } | undefined;
            const strengths = Array.isArray(ap?.interviewStrengths) ? ap.interviewStrengths.slice(0, 2) : [];
            const gaps = Array.isArray(ap?.interviewGaps) ? ap.interviewGaps.slice(0, 2) : [];
            if (strengths.length === 0 && gaps.length === 0) return null;
            return (
              <div
                style={{
                  background: T.warning100,
                  border: `1px solid rgba(180,83,9,0.18)`,
                  borderLeft: `3px solid ${T.copper}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                  marginTop: 28,
                  maxWidth: 560,
                  width: "100%",
                  margin: "28px auto 0",
                }}
              >
                <p style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: T.copper, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Your resume coaching brief
                </p>
                <div style={{ display: "grid", gridTemplateColumns: strengths.length > 0 && gaps.length > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
                  {strengths.length > 0 && (
                    <div>
                      <p style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.success, margin: "0 0 4px" }}>✓ Lean on these</p>
                      <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                        {strengths.map((s, i) => (
                          <li key={i} style={{ fontFamily: F.sans, fontSize: 12, color: T.coal, lineHeight: 1.5, marginBottom: 2 }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {gaps.length > 0 && (
                    <div>
                      <p style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.copper, margin: "0 0 4px" }}>⚡ Prepare for these</p>
                      <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                        {gaps.map((g, i) => (
                          <li key={i} style={{ fontFamily: F.sans, fontSize: 12, color: T.coal, lineHeight: 1.5, marginBottom: 2 }}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ─── Single canvas-style "Start practice" CTA + trust line.
                The CTA stays clickable when only the mic is missing — it
                triggers the prompt instead of failing silently. */}
          {/* Session quota scarcity signal — shown when sessions are running low on any paid plan,
              or ≤2 remaining for free tier. Each tier has its own threshold and copy. */}
          {(() => {
            const freeLeft = FREE_SESSION_LIMIT - freeSessionCount;
            const showFree = isFreeUser && freeLeft <= 2;
            const showStarter = isStarterUser && starterRemaining <= 2;
            const showPro = isProUser && proRemaining <= 5;
            if (!showFree && !showStarter && !showPro) return null;
            const isUrgent = (isFreeUser && freeLeft <= 1) || (isStarterUser && starterRemaining === 0) || (isProUser && proRemaining === 0);
            // Don't show the alarming "limit reached" banner when purchased credits
            // cover the shortfall — the plan limit is a soft ceiling, not a hard wall.
            // The non-urgent "N sessions left" nudge is still useful, so only hide
            // the urgent "limit reached" variant when credits are available.
            if (isUrgent && creditBalance !== null && creditBalance > 0) return null;
            const message = showPro
              ? proRemaining === 0
                ? 'Monthly session limit reached — resets 1st of next month.'
                : `${proRemaining} of ${PRO_MONTHLY_LIMIT} sessions left this month.`
              : showStarter
              ? starterRemaining === 0
                ? 'Sprint Pack used up — buy session credits to keep going.'
                : `${starterRemaining} of ${STARTER_WEEKLY_LIMIT} sessions left in your pack.`
              : freeLeft <= 0
              ? 'No free sessions left — upgrade to continue.'
              : freeLeft === 1
              ? 'Last free session — make it your hardest target company.'
              : `${freeLeft} free sessions remaining.`;
            return (
              <div
                style={{
                  background: isUrgent ? 'rgba(185,28,28,0.08)' : 'rgba(180,83,9,0.08)',
                  color: isUrgent ? T.error : T.copper,
                  border: `1px solid ${isUrgent ? 'rgba(185,28,28,0.2)' : 'rgba(180,83,9,0.2)'}`,
                  borderRadius: 10,
                  padding: '10px 16px',
                  marginBottom: 14,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{message}</span>
                {(showFree || showStarter) && (
                  <button
                    type="button"
                    onClick={() => setShowUpgradeModal(true)}
                    style={{ background: 'none', border: 'none', fontWeight: 600,
                             color: 'inherit', cursor: 'pointer', fontSize: 13,
                             textDecoration: 'underline', padding: 0 }}
                  >
                    Upgrade
                  </button>
                )}
              </div>
            );
          })()}
          <div className="hsx-setup-cta-zone" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 48, paddingTop: 24 }}>
            {(() => {
              const needsMic = micRequired && formComplete && micStatus !== "granted" && micStatus !== "requesting";
              const isHardDisabled = !formComplete || starting || !isOnline || micStatus === "requesting";
              const ctaLabel = starting
                ? "Starting…"
                : needsMic
                  ? "Allow microphone to start"
                  : "Start practice";
              const shortcutHint = isIOS ? "" : " · ⌘/Ctrl + Enter";
              const ctaTitle = !formComplete
                ? "Pick a target role and interview focus to continue."
                : needsMic
                  ? micStatus === "denied"
                    ? "Microphone is blocked. Open browser settings to allow it, then try again."
                    : "We need microphone access to start a voice interview."
                  : !isOnline
                    ? "You're offline. Reconnect to start."
                    : `Start your practice interview${shortcutHint}`;
              const onCtaClick = () => {
                if (needsMic) { void requestMic(); return; }
                handleStart();
              };
              return (
                <button
                  type="button"
                  onClick={onCtaClick}
                  disabled={isHardDisabled}
                  title={ctaTitle}
                  aria-label={ctaTitle ?? ctaLabel}
                  className="hsx-setup-cta"
                  style={{
                    fontFamily: F.sans, fontSize: 16, fontWeight: 600, padding: "18px 36px", borderRadius: 12,
                    /* Disabled state uses a fully-saturated neutral pair
                       (creamSoft + inkSoft) so contrast stays AA and the
                       button is unmistakably non-actionable. Avoids the
                       contrast trap of "indigo at 45% opacity on cream". */
                    background: isHardDisabled ? T.creamSoft : T.indigo,
                    color: isHardDisabled ? T.inkSoft : T.cream,
                    border: `1px solid ${isHardDisabled ? T.line : "transparent"}`,
                    cursor: isHardDisabled ? "not-allowed" : "pointer",
                    opacity: needsMic && !isHardDisabled ? 0.85 : 1,
                    transition: "all 180ms cubic-bezier(.2,.7,.2,1)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 12,
                    boxShadow: isHardDisabled ? "none" : "0 2px 4px rgba(20,17,10,.10), 0 12px 28px -10px rgba(49,46,129,.45)",
                    letterSpacing: 0.1,
                    minWidth: 320,
                  }}
                >
                  {starting ? (
                    <span style={{ width: 16, height: 16, border: `2.5px solid ${T.indigoRing}`, borderTopColor: T.cream, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  ) : null}
                  {ctaLabel}
                  {!starting && (
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  )}
                </button>
              );
            })()}

            {usingCredit && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 12, color: T.inkSoft }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                1 session credit will be used · {creditBalance} remaining
              </div>
            )}

            <div aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6, fontFamily: F.sans, fontSize: 12, color: T.inkSoft, minHeight: 18 }}>
              {micStatus === "granted" && cameraStatus === "granted" && "Mic and camera ready — you're all set."}
              {micStatus === "granted" && cameraStatus !== "granted" && "Mic ready. Camera is optional."}
              {micStatus !== "granted" && (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Your responses stay private and are never shared.
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      {launching && countdown !== null && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: T.cream, animation: "launchIn 0.4s ease",
        }}>
          {countdown > 0 ? (
            <>
              <div key={countdown} style={{
                width: 120, height: 120, borderRadius: "50%",
                background: `linear-gradient(135deg, rgba(49,46,129,0.12), rgba(49,46,129,0.04))`,
                border: `2px solid ${T.indigoRing}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 32,
                animation: "countdownPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}>
                <span style={{
                  fontFamily: F.serif, fontSize: 56, fontWeight: 600,
                  color: T.indigo, lineHeight: 1,
                  animation: "countdownFade 1s ease",
                }}>
                  {countdown}
                </span>
              </div>
              <p style={{ fontFamily: F.sans, fontSize: 15, color: T.inkFaint, letterSpacing: "0.02em" }}>
                Get ready...
              </p>
            </>
          ) : (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: 16, marginBottom: 24,
                background: `linear-gradient(135deg, rgba(49,46,129,0.15), rgba(49,46,129,0.05))`,
                border: "1px solid rgba(49,46,129,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "launchPulse 1.2s ease-in-out infinite",
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.indigo} strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <h2 style={{ fontFamily: F.serif, fontSize: 28, fontWeight: 400, color: T.coal, marginBottom: 8, letterSpacing: "-0.02em" }}>
                Let's go!
              </h2>
            </>
          )}
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => { setShowUpgradeModal(false); if (atSessionLimit) router.push("/dashboard"); }}
          sessionsUsed={freeSessionCount}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          onPaymentSuccess={(tier: string, _start: string, end: string) => {
            setShowUpgradeModal(false);
            // Refresh credit balance so the gate clears immediately and the
            // user can start a session without a full page reload.
            if (user?.id) {
              getCreditBalance(user.id).then(b => setCreditBalance(b)).catch(() => {});
            }
            // Sync tier change into in-memory user so the limit check updates.
            // Subscription purchases return tier="starter"|"pro"; credit
            // purchases return tier="free" (no tier change) — only upgrade.
            if (tier && tier !== "free" && authUpdateUser) {
              authUpdateUser({ subscriptionTier: tier as "starter" | "pro", subscriptionEnd: end || undefined });
            }
          }}
        />
      )}
    </div>
  );
}

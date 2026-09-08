/* HireStepX — Onboarding panels (production, cream-themed)
   Replaces 5 exports from src/OnboardingPanels.tsx with cream/coal/indigo
   versions matching the canvas designs in tempo/designs/canvases/onboarding.
   The remaining exports (EmailVerificationBanner, SessionSetupStep,
   PermissionsStep, LaunchOverlay) continue to live in the legacy file. */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { tokens as t, fonts as f, shadows } from "../auth/_tokens";
import { Field, Wordmark } from "../auth/_fields";
import { AUTH_STYLES } from "../auth/_styles";
import type { ResumeProfile } from "../dashboardData";
import type { ParsedResume } from "../resumeParser";
import { OnboardingStepper, type OnboardingStep } from "./_shared";
import { ONBOARDING_STYLES } from "./_styles";

/* ─── TopBar ──────────────────────────────────────────────────────────── */

export interface TopBarProps {
  step: number;
  emailUnverified: boolean;
  onNavigateHome: () => void;
  onStepClick: (stepNum: number) => void;
  onLogout?: () => void;
  userEmail?: string;
  userAvatar?: string;
  userName?: string;
}

export function TopBar({
  step,
  emailUnverified,
  onNavigateHome,
  onLogout,
  userEmail,
  userName,
}: TopBarProps) {
  const stepperCurrent: OnboardingStep =
    step === 1 ? "upload" : step === 2 ? "analyse" : "review";
  const display = (userName || userEmail || "").trim();
  const initials =
    display
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  // Avatar dropdown menu — basic show/hide with click-outside dismissal.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="hsx-login-topbar"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "32px 48px",
        gap: 16,
        marginTop: emailUnverified ? 44 : 0,
      }}
    >
      <div style={{ justifySelf: "start" }}>
        <button
          type="button"
          onClick={onNavigateHome}
          aria-label="HireStepX home"
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
        >
          <Wordmark />
        </button>
      </div>
      <div style={{ justifySelf: "center" }}>
        <OnboardingStepper current={stepperCurrent} />
      </div>
      <div ref={menuRef} style={{ justifySelf: "end", position: "relative" }}>
        {display && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Account: ${display}`}
            title={display}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: f.sans,
              fontSize: 14,
              fontWeight: 500,
              color: t.coal,
              background: "transparent",
              border: `1px solid ${menuOpen ? t.lineStrong : "transparent"}`,
              borderRadius: 999,
              padding: "4px 10px 4px 4px",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: t.indigo100,
                color: t.indigo,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: f.serif,
                fontSize: 13,
              }}
            >
              {initials}
            </span>
            <span className="hsx-onb-account-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
              {display}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        {menuOpen && display && (
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              minWidth: 200,
              background: t.white,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              boxShadow: shadows.card,
              padding: 6,
              zIndex: 20,
              fontFamily: f.sans,
            }}
          >
            <div style={{ padding: "6px 10px", fontSize: 12, color: t.inkSoft, borderBottom: `1px solid ${t.line}`, marginBottom: 4 }}>
              Signed in as<br />
              <span style={{ color: t.coal, fontWeight: 500 }}>{userEmail || display}</span>
            </div>
            {onLogout && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onLogout(); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: f.sans,
                  fontSize: 14,
                  color: t.coal,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = t.creamSoft; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/* ─── ResumeEmptyState (Upload) ──────────────────────────────────────── */

export interface ResumeEmptyStateProps {
  isDragging: boolean;
  dragFileName: string;
  resumeError: string;
  showUndo: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (file: File | undefined) => void;
  onUndo: () => void;
  onSkip?: () => void;
}

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt";
const MAX_FILE_MB = 10;

export function ResumeEmptyState({
  isDragging,
  dragFileName,
  resumeError,
  showUndo,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onUndo,
  onSkip,
}: ResumeEmptyStateProps) {
  return (
    <>
      <style>{AUTH_STYLES}{ONBOARDING_STYLES}</style>
      <div className="hsx-onb-stack hsx-onb-state-enter" style={{ width: "100%", maxWidth: 540, margin: "0 auto" }}>
        {/* Extra breathing room under the hero so the subtitle doesn't crowd
            the drop zone — supplements the stack's 16px gap. */}
        <div className="hsx-login-hero hsx-onb-hero" style={{ width: "100%", textAlign: "center", marginBottom: 12 }}>
          <h1
            style={{ fontFamily: f.serif, fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.05, fontWeight: 400, letterSpacing: "-0.02em", margin: 0, color: t.coal, textWrap: "balance" }}
          >
            Drop your{" "}
            <em style={{ fontStyle: "italic", fontWeight: 400, color: t.copper }}>
              resume
            </em>
          </h1>
          <p
            style={{ fontFamily: f.sans, fontSize: 16, lineHeight: 1.55, color: t.inkSoft, marginTop: 14, marginBottom: 0, textWrap: "balance" }}
          >
            We&apos;ll read it once and tune every interview to your role,
            experience, and the gaps worth working on.
          </p>
        </div>

        {resumeError && (
          <div
            role="alert"
            style={{ background: t.error100, border: `1px solid ${t.error}`, borderRadius: 10, padding: "12px 14px", fontFamily: f.sans, fontSize: 13, color: t.error, lineHeight: 1.4 }}
          >
            {resumeError}
            {showUndo && (
              <button
                type="button"
                onClick={onUndo}
                style={{ marginLeft: 12, background: "transparent", border: "none", color: t.indigo, cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}
              >
                Undo
              </button>
            )}
          </div>
        )}

        <label
          htmlFor="resume-file-input"
          aria-label="Upload resume — drag a file here or click to browse"
          className="hsx-onb-drop"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            display: "block",
            width: "100%",
            padding: "40px 24px",
            border: `2px dashed ${isDragging ? t.indigo : t.lineStrong}`,
            background: isDragging ? t.indigo100 : t.creamSoft,
            borderRadius: 14,
            cursor: "pointer",
            textAlign: "center",
            transition: "background 160ms ease, border-color 160ms ease",
          }}
        >
          <input
            ref={fileInputRef}
            id="resume-file-input"
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={(e) => onFileChange(e.target.files?.[0])}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
            aria-describedby="resume-help"
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div
              aria-hidden="true"
              style={{ width: 56, height: 56, borderRadius: 14, background: t.copperSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: f.sans, fontSize: 16, fontWeight: 600, color: t.coal, lineHeight: 1.3 }}>
                {dragFileName ? `Drop "${dragFileName}"` : (
                  <>
                    Drag a file here, or <span style={{ color: t.indigo }}>browse</span>
                  </>
                )}
              </div>
              <div
                id="resume-help"
                style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft, marginTop: 6 }}
              >
                PDF, DOC, DOCX, or TXT · up to {MAX_FILE_MB} MB
              </div>
            </div>
          </div>
        </label>

        {/* Trust pills — first-time users hesitate to upload a resume
            (PII concern). The previous single-line copy was too subtle.
            Three concrete pills are easier to scan and each addresses
            a specific worry: TLS, no-sale assertion, deletion right.
            DPDP Act 2023 explicitly requires the deletion right; we
            surface it here at the moment of friction. */}
        <ul
          aria-label="How we handle your resume"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            margin: 0,
            padding: 0,
            listStyle: "none",
            fontFamily: f.sans,
            fontSize: 12,
            color: t.inkSoft,
            lineHeight: 1.4,
          }}
        >
          {[
            { label: "Encrypted in transit (TLS)", icon: "lock" },
            { label: "Never sold or shared", icon: "shield" },
            { label: "Delete any time (DPDP)", icon: "trash" },
          ].map((p) => (
            <li
              key={p.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                background: t.creamSoft,
                border: `1px solid ${t.line}`,
                borderRadius: 999,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {p.icon === "lock" && (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </>
                )}
                {p.icon === "shield" && (
                  <>
                    <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" />
                    <polyline points="9 12 11 14 15 10" />
                  </>
                )}
                {p.icon === "trash" && (
                  <>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </>
                )}
              </svg>
              {p.label}
            </li>
          ))}
        </ul>

        {onSkip && (
          // Promoted from a small ghost link to a visible secondary button.
          // Mobile-first Indian users without a PDF resume on their phone
          // were stuck on this screen — the previous skip was too subtle
          // to compete with the big drop-zone above. This pairs with the
          // "or" divider so users see two paths, not one path + an escape.
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }} aria-hidden="true">
              <div style={{ flex: 1, height: 1, background: t.line }} />
              <span style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: t.line }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <button
                type="button"
                onClick={onSkip}
                style={{
                  fontFamily: f.sans, fontSize: 14, fontWeight: 600, color: t.indigo,
                  background: "transparent", border: `1px solid ${t.lineStrong}`,
                  borderRadius: 10, cursor: "pointer", padding: "12px 20px",
                  minHeight: 44, // mobile tap target
                }}
              >
                Continue without resume
              </button>
              <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, marginTop: 8 }}>
                You can add one later from Settings.
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── ResumeLoadingState (Analysing) ─────────────────────────────────── */

export interface ResumeLoadingStateProps {
  analysisStage: number;
  fileName: string;
  onCancel?: () => void;
  userName?: string;
  onUserNameChange?: (v: string) => void;
  targetRole?: string;
  onTargetRoleChange?: (v: string) => void;
  /** Inline warning shown below the target role input when the entered
   * role doesn't match the resume's apparent domain (e.g. resume reads
   * "Product Designer" but role is "Java Developer"). Hidden when null. */
  targetRoleMismatch?: string | null;
  onTargetRoleBlur?: () => void;
}

const STATUS_BEATS = [
  "Reading your file…",
  "Extracting work history…",
  "Identifying skills and stack…",
  "Mapping role and seniority…",
  "Looking for patterns worth practising…",
];

export function ResumeLoadingState({
  analysisStage,
  fileName,
  onCancel,
  userName,
  onUserNameChange,
  targetRole,
  onTargetRoleChange,
  targetRoleMismatch,
  onTargetRoleBlur,
}: ResumeLoadingStateProps) {
  const [progress, setProgress] = useState(8);
  // Drive the bar from server-reported analysisStage when we have it.
  // Each stage is roughly 25% of the total work, so we floor the bar
  // at the stage's progress level — prevents the bar from "lying"
  // (sitting at 30% when the LLM has actually finished stage 3).
  useEffect(() => {
    if (analysisStage >= 0) {
      const stageFloor = Math.min(95, 15 + analysisStage * 22);
      setProgress((p) => Math.max(p, stageFloor));
    }
  }, [analysisStage]);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.06 : p));
    }, 220);
    return () => clearInterval(id);
  }, []);

  // Use server-driven analysisStage (0-4) when available; else cycle locally.
  const liveStatus =
    analysisStage >= 0 && analysisStage < STATUS_BEATS.length
      ? STATUS_BEATS[analysisStage]
      : STATUS_BEATS[0];

  return (
    <>
      <style>{AUTH_STYLES}{ONBOARDING_STYLES}</style>
      <div className="hsx-onb-stack hsx-onb-state-enter" style={{ width: "100%", maxWidth: 540, margin: "0 auto" }}>
        <div className="hsx-login-hero hsx-onb-hero" style={{ width: "100%", textAlign: "center" }}>
          <h1
            style={{ fontFamily: f.serif, fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.05, fontWeight: 400, letterSpacing: "-0.02em", margin: 0, color: t.coal }}
          >
            Reading your{" "}
            <em style={{ fontStyle: "italic", fontWeight: 400, color: t.copper }}>
              resume
            </em>
          </h1>
          <p
            style={{ fontFamily: f.sans, fontSize: 16, lineHeight: 1.55, color: t.inkSoft, marginTop: 14, marginBottom: 0, textWrap: "balance" }}
          >
            Tuning your practice to your role and experience.
            <br />
            Detailed resumes take a few seconds longer.
          </p>
        </div>

        {fileName && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: `1px solid ${t.line}`,
              background: t.creamSoft,
              borderRadius: 10,
              marginTop: 12,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span style={{ fontFamily: f.sans, fontSize: 14, fontWeight: 500, color: t.coal, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName}
            </span>
            <span style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: t.copper }}>
              Analysing
            </span>
          </div>
        )}

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Resume analysis progress"
          style={{ position: "relative", width: "100%", height: 6, background: t.line, borderRadius: 999, overflow: "hidden" }}
        >
          <div
            style={{
              position: "relative",
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${t.indigo} 0%, ${t.copper} 100%)`,
              borderRadius: 999,
              transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
              overflow: "hidden",
            }}
          >
            <span className="hsx-onb-shimmer" aria-hidden="true" />
          </div>
        </div>

        <p
          aria-live="polite"
          style={{ fontFamily: f.mono, fontSize: 12, letterSpacing: "0.06em", color: t.inkSoft, margin: 0, textAlign: "center", minHeight: "1.2em" }}
        >
          <span key={liveStatus} className="hsx-onb-status">{liveStatus}</span>
        </p>

        {/* Optional fields surfaced during loading so users can pre-fill
            while the AI works. Uses the same Field atom as Login/Signup
            so the typography + spacing match the rest of the cream system. */}
        {(onUserNameChange || onTargetRoleChange) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            {onUserNameChange && (
              <Field
                label="Your name"
                type="text"
                name="user-name"
                value={userName || ""}
                onChange={(v) => onUserNameChange(v)}
                placeholder="What should we call you?"
                autoComplete="given-name"
                maxLength={64}
              />
            )}
            {onTargetRoleChange && (
              <div onBlur={onTargetRoleBlur}>
                <Field
                  label="Target role (optional)"
                  type="text"
                  name="target-role"
                  value={targetRole || ""}
                  onChange={(v) => onTargetRoleChange(v)}
                  placeholder="e.g. Senior Backend Engineer"
                  autoComplete="off"
                  maxLength={120}
                />
                {targetRoleMismatch && (
                  <p
                    role="status"
                    aria-live="polite"
                    style={{ marginTop: 6, fontFamily: f.sans, fontSize: 12, color: t.copper, lineHeight: 1.4 }}
                  >
                    {targetRoleMismatch}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4, fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          Parsed once, never shared. You can delete it any time.
        </div>

        {onCancel && (
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={onCancel}
              className="hsx-link-indigo"
              style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 500, color: t.indigo, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── ProfileReadyState (Review) ─────────────────────────────────────── */

export interface ProfileReadyStateProps {
  aiProfile: ResumeProfile;
  resumeParsed: ParsedResume;
  userName: string;
  fileName: string;
  resumeText: string;
  targetRole: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUserNameChange: (v: string) => void;
  onTargetRoleChange?: (v: string) => void;
  onReanalyze: () => void;
  onRemove: () => void;
  /** Optional CTA wired into the score card. When supplied, the
      gauge renders a primary "Start mock interview" button under
      its stats so the user has a clear next step in the hero row. */
  onStartInterview?: () => void;
  /** Optional secondary path. Pairs with onStartInterview to
      render a "Dashboard" outline button next to the primary. */
  onGoToDashboard?: () => void;
  starting?: boolean;
}

export function ProfileReadyState({
  aiProfile,
  resumeParsed,
  userName,
  fileName,
  targetRole,
  onTargetRoleChange,
  onReanalyze,
  onRemove,
  onStartInterview,
  onGoToDashboard,
  starting,
}: ProfileReadyStateProps) {
  void resumeParsed; // kept for parity with the production interface
  // Inline editable target-role — drafts locally so the user can revise before
  // committing. Falls back to the AI's interpretation if blank.
  const [roleEditing, setRoleEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState(targetRole || "");
  useEffect(() => {
    setRoleDraft(targetRole || "");
  }, [targetRole]);

  // Score count-up (rAF, reduced-motion respected).
  const targetScore = aiProfile.resumeScore;
  const [displayScore, setDisplayScore] = useState<number | null>(targetScore == null ? null : 0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (targetScore == null) {
      setDisplayScore(null);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayScore(targetScore);
      return;
    }
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(targetScore * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetScore]);

  const scoreTone =
    targetScore == null
      ? "muted"
      : targetScore >= 80
        ? "success"
        : targetScore >= 60
          ? "warning"
          : "error";

  // Top-skills disclosure
  const SKILLS_VISIBLE = 8;
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const visibleSkills = skillsExpanded ? aiProfile.topSkills : aiProfile.topSkills.slice(0, SKILLS_VISIBLE);
  const hiddenSkills = Math.max(0, aiProfile.topSkills.length - SKILLS_VISIBLE);

  // Name comes from signup (passed in as userName prop). Resume parsing
  // is no longer a fallback — it produced too many false positives
  // (institutions, degree lines). If userName is empty, we render no
  // name and use email-initials downstream.
  const trimmedName = (userName && userName.trim()) || "";

  // resumeScore is only ever populated on the real LLM analysis path
  // (server-handlers/analyze-resume.ts computes it from the rubric
  // breakdown); the client-side regex fallback profile never sets it.
  // Use that as the signal for whether this card is showing AI output
  // or a degraded fallback — the badge must not claim success it didn't have.
  const isRealAiProfile = aiProfile.resumeScore != null;

  return (
    <>
      <style>{AUTH_STYLES}{ONBOARDING_STYLES}</style>
      <div className="hsx-onb-stack hsx-onb-state-enter" style={{ width: "100%", maxWidth: 1320, margin: "0 auto" }}>
        {/* Hero row — stretch so the right-side ScoreGauge card matches
            the identity card's height. Avoids the void that appeared
            below the gauge when the identity card had longer content. */}
        <div
          className="hsx-onb-hero-row"
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "stretch" }}
        >
          {/* Identity card */}
          <section
            style={{ background: t.white, border: `1px solid ${t.line}`, borderRadius: 14, padding: "18px 20px", boxShadow: shadows.card, display: "flex", flexDirection: "column" }}
          >
            {isRealAiProfile ? (
              <div
                role="status"
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: t.success100, border: `1px solid rgba(21, 128, 61, 0.25)`, fontFamily: f.mono, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: t.success, fontWeight: 500, marginBottom: 14 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                AI analysis complete
              </div>
            ) : (
              <div
                role="status"
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: t.warning100, border: `1px solid ${t.warningLine}`, fontFamily: f.mono, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: t.warningInk, fontWeight: 500, marginBottom: 14 }}
              >
                Quick profile — AI analysis unavailable
              </div>
            )}

            <h1
              className="hsx-onb-profile-headline"
              style={{ fontFamily: f.serif, fontSize: "clamp(1.75rem, 3.2vw, 2.25rem)", lineHeight: 1.15, fontWeight: 400, color: t.coal, letterSpacing: "-0.01em", margin: 0, marginBottom: 12 }}
            >
              {aiProfile.headline || "Your profile"}
            </h1>

            {/* Editable target role — chip-style. Click to edit; Enter or
                blur commits. Lets users override the AI's role guess
                without re-analyzing. */}
            {onTargetRoleChange && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: t.inkFaint }}>
                  Target role
                </span>
                {roleEditing ? (
                  <input
                    /* Inline-edit pattern: focus on mount via ref+effect rather
                       than autoFocus, which a11y tooling flags as disorienting. */
                    ref={(el) => { if (el && document.activeElement !== el) el.focus(); }}
                    type="text"
                    value={roleDraft}
                    onChange={(e) => setRoleDraft(e.target.value)}
                    onBlur={() => {
                      setRoleEditing(false);
                      if (roleDraft !== (targetRole || "")) onTargetRoleChange(roleDraft);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                      if (e.key === "Escape") {
                        setRoleDraft(targetRole || "");
                        setRoleEditing(false);
                      }
                    }}
                    placeholder="e.g. Senior Backend Engineer"
                    maxLength={120}
                    style={{
                      fontFamily: f.sans,
                      fontSize: 13,
                      padding: "4px 10px",
                      border: `1px solid ${t.indigo}`,
                      borderRadius: 999,
                      background: t.indigo100,
                      color: t.indigo,
                      outline: "none",
                      minWidth: 180,
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setRoleEditing(true)}
                    title="Edit target role"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: f.sans,
                      fontSize: 13,
                      fontWeight: 500,
                      color: t.indigo,
                      background: t.indigo100,
                      border: `1px solid ${t.indigo}`,
                      borderRadius: 999,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {targetRole && targetRole.trim()
                      ? targetRole
                      : (aiProfile.headline?.split(/\s+with\s+/i)[0]?.trim() || "Add target role")}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {aiProfile.summary && (
              <p style={{ fontFamily: f.sans, fontSize: 14.5, lineHeight: 1.6, color: t.inkSoft, margin: 0, marginBottom: 16, flex: 1, whiteSpace: "pre-wrap" }}>
                {aiProfile.summary}
              </p>
            )}

            <div
              className="hsx-onb-source-row"
              style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: `1px solid ${t.line}`, fontFamily: f.sans, fontSize: 13, color: t.inkSoft, flexWrap: "wrap" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Source: {fileName || "resume"}
              </span>
              <button
                type="button"
                onClick={onReanalyze}
                className="hsx-link-indigo"
                title="Re-run the AI parse on this file"
                style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 500, color: t.indigo, background: "transparent", border: "none", cursor: "pointer", textDecoration: "none", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Re-analyze
              </button>
              <span style={{ width: 1, height: 12, background: t.line }} aria-hidden="true" />
              <button
                type="button"
                onClick={onRemove}
                className="hsx-link-indigo"
                style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 500, color: t.inkSoft, background: "transparent", border: "none", cursor: "pointer", textDecoration: "none", padding: 0 }}
              >
                Remove
              </button>
            </div>
          </section>

          {/* Score gauge + stats. Identity row at top anchors "this score
              belongs to Jay Vyas" — important when the topbar shows an
              institutional account name and the resume name is the one the
              AI session will personalise to. */}
          <ScoreGauge
            score={displayScore}
            tone={scoreTone as "success" | "warning" | "error" | "muted"}
            yearsExperience={aiProfile.yearsExperience}
            industries={aiProfile.industries}
            onStartInterview={onStartInterview}
            onGoToDashboard={onGoToDashboard}
            starting={starting}
          />
        </div>

        {/* Body — bento-grid layout. Previously a 3-column flowing
            stack with align-items: start, which left voids at the
            bottom of shorter columns. Now organised into 3 logical
            rows where every card in a row stretches to the same
            height, so cards never feel "shorter than their peers". */}
        <div
          className="hsx-onb-body-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}
        >
          {/* ── ROW 1 — RESUME PROFILE NARRATIVE ──
              Career trajectory (wide) + Top skills (narrow). */}
          {aiProfile.careerTrajectory && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 7" }}>
              <SectionCard label="Career trajectory">
                <p style={{ fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.6, color: t.coal, margin: 0 }}>
                  {aiProfile.careerTrajectory}
                </p>
              </SectionCard>
            </div>
          )}

          {aiProfile.topSkills.length > 0 && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 5" }}>
              <SectionCard label="Top skills">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {visibleSkills.map((s) => (
                    <Pill key={s} tone="muted" label={s} />
                  ))}
                  {hiddenSkills > 0 && (
                    <button
                      type="button"
                      onClick={() => setSkillsExpanded((v) => !v)}
                      style={{ display: "inline-flex", alignItems: "center", fontFamily: f.sans, fontSize: 12, fontWeight: 500, color: t.indigo, background: "transparent", border: `1px dashed ${t.indigo}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      {skillsExpanded ? "Show fewer" : `+ ${hiddenSkills} more`}
                    </button>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── ROW 2 — INTERVIEW READINESS TRIAD ──
              Three equal cards: Achievements + Strengths + Worth Practising.
              All evidence-based assessments at equal weight. */}
          {aiProfile.keyAchievements.length > 0 && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 4" }}>
              <SectionCard label="Key achievements">
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {aiProfile.keyAchievements.map((line, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.55, color: t.coal }}>
                      <span style={{ flexShrink: 0, marginTop: 6, width: 4, height: 4, borderRadius: 999, background: t.copper }} aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          )}

          {aiProfile.interviewStrengths.length > 0 && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 4" }}>
              <StrengthGapCard label="Interview strengths" tone="success" items={aiProfile.interviewStrengths} />
            </div>
          )}

          {aiProfile.interviewGaps.length > 0 && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 4" }}>
              <StrengthGapCard label="Worth practising" tone="copper" items={aiProfile.interviewGaps} />
            </div>
          )}

          {/* ── ROW 3 — ACTION PLAN PAIR ──
              Improve your resume (what to fix) + Focus area
              (what we'll cover). Two equal halves. */}
          {aiProfile.improvements && aiProfile.improvements.length > 0 && (
            <div className="hsx-onb-cell" style={{ gridColumn: "span 6" }}>
              <SectionCard label="Improve your resume">
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {aiProfile.improvements.map((line, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.55, color: t.coal }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.copper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }}>
                        <line x1="12" y1="20" x2="12" y2="10" />
                        <polyline points="7 14 12 9 17 14" />
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          )}

          {/* Focus area — Practice preview derived from top skills + gaps. */}
          <div className="hsx-onb-cell" style={{ gridColumn: "span 6" }}>
            <SectionCard label="Focus area">
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {(() => {
                  const items: string[] = [];
                  if (aiProfile.topSkills.length > 0) {
                    items.push(`Technical depth on ${aiProfile.topSkills.slice(0, 3).join(", ")}`);
                  }
                  if (aiProfile.interviewGaps.length > 0) {
                    items.push("Behavioural stories at scale");
                  }
                  if (aiProfile.seniorityLevel) {
                    items.push(`${aiProfile.seniorityLevel}-level system-design questions`);
                  }
                  if (items.length === 0) {
                    items.push("Personalised question mix based on your profile");
                  }
                  return items.slice(0, 3).map((line, i) => (
                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.55, color: t.coal }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.indigo} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 4 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {line}
                    </li>
                  ));
                })()}
              </ul>
              <p
                style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: t.inkFaint, marginTop: 12, marginBottom: 0 }}
              >
                {trimmedName
                  ? `Tuned to ${trimmedName.split(/\s+/)[0]}'s profile`
                  : "Tuned to your profile"}
              </p>
            </SectionCard>
          </div>

          {/* ── ROW 4 — TRUST ATTRIBUTION (full width, low emphasis) ── */}
          <div className="hsx-onb-cell" style={{ gridColumn: "span 12" }}>
            <SectionCard label="Based on">
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {[
                  "Resume content & structure",
                  "Projects depth & impact",
                  "Quantified achievements",
                  "Industry & role benchmarking",
                ].map((line) => (
                  <li key={line} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.5, color: t.coal }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {line}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── ScoreGauge ─────────────────────────────────────────────────────── */

function ScoreGauge({
  score,
  tone,
  yearsExperience,
  industries,
  onStartInterview,
  onGoToDashboard,
  starting,
}: {
  score: number | null;
  tone: "success" | "warning" | "error" | "muted";
  yearsExperience?: number | null;
  industries?: string[];
  /** Optional primary CTA. When provided, renders inside the gauge
      card so the user has a clear action right next to their score
      — no scrolling needed. */
  onStartInterview?: () => void;
  /** Optional secondary path. When supplied alongside the primary,
      the gauge card renders both as a button pair. */
  onGoToDashboard?: () => void;
  starting?: boolean;
}) {
  const color =
    tone === "success" ? t.success : tone === "warning" ? t.warning : tone === "error" ? t.error : t.inkSoft;
  const label =
    score == null
      ? "—"
      : tone === "success"
        ? "Strong"
        : tone === "warning"
          ? "Fair"
          : tone === "error"
            ? "Needs work"
            : "—";
  const reassurance =
    score == null
      ? "We couldn't compute a score from this file."
      : tone === "success"
        ? "Strong foundation. A few polish moves and you'll stand out."
        : tone === "warning"
          ? "Strong foundation. With a few improvements, you'll stand out."
          : "Plenty of room to grow. Practice will move the needle quickly.";

  const r = 74;
  const cx = 90;
  const cy = 86;
  const circumference = Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const filled = circumference * pct;

  const industriesLabel = industries && industries.length > 0 ? industries.slice(0, 3).join(" · ") : null;
  // "X+ yrs" if we have years; "<1 yr" if explicitly 0; otherwise null.
  // Display format mirrors the rest of the product.
  const experienceLabel =
    typeof yearsExperience === "number"
      ? yearsExperience >= 1
        ? `${yearsExperience}+ yrs`
        : "<1 yr"
      : null;
  const hasStats = !!(experienceLabel || industriesLabel);

  return (
    <section
      className="hsx-onb-score-shell"
      style={{ background: t.white, border: `1px solid ${t.line}`, borderRadius: 14, padding: "18px 20px", boxShadow: shadows.card, display: "flex", flexDirection: "column", gap: 14, height: "100%" }}
    >
      <div
        className="hsx-onb-score-gauge"
        role={score != null ? "img" : undefined}
        aria-label={score != null ? `Clarity score ${score} out of 100, ${label.toLowerCase()}` : "Clarity score unavailable"}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", flex: "1 1 auto", justifyContent: "center" }}
      >
        <div style={{ position: "relative", width: 180, height: 100 }}>
          <svg width="180" height="100" viewBox="0 0 180 100" aria-hidden="true">
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={t.line} strokeWidth="10" strokeLinecap="round" />
            {score != null && (
              <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} />
            )}
          </svg>
          <div
            style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontFamily: f.serif, fontSize: 40, fontWeight: 400, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {score == null ? "—" : score}
              </span>
              {score != null && (
                <span style={{ fontFamily: f.sans, fontSize: 13, color: t.inkFaint }}>/ 100</span>
              )}
            </div>
            {score != null && (
              <span style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color, marginTop: 4, fontWeight: 500 }}>
                {label}
              </span>
            )}
          </div>
        </div>
        <div>
          <div
            style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: t.inkFaint, marginBottom: 6 }}
          >
            Clarity Score
          </div>
          <p style={{ fontFamily: f.sans, fontSize: 14, lineHeight: 1.55, color: t.coal, margin: 0 }}>
            {reassurance}
          </p>
        </div>
      </div>

      {hasStats && (
        <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* These rows display data — not clickable. Black ink keeps
              indigo reserved for actually-interactive elements
              (CTAs, links). Reduces visual noise.

              The "You" row was removed: identity is already anchored
              by the topbar avatar + the hero greeting, so repeating
              it inside the score card was redundant chrome. */}
          {experienceLabel && <StatRow label="Experience" value={experienceLabel} />}
          {industriesLabel && <StatRow label="Industries" value={industriesLabel} />}
        </div>
      )}

      {/* CTA pair — primary "Start mock interview" + secondary
          "Dashboard". Side-by-side at the bottom of the score card.
          On <520px the .hsx-onb-cta-pair stylesheet rule stacks
          them vertically so neither truncates. */}
      {onStartInterview && (
        <div className="hsx-onb-cta-pair" style={{ marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onStartInterview}
            disabled={!!starting}
            className="hsx-onb-cta-primary"
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              height: 44,
              background: t.indigo,
              color: t.white,
              border: 0,
              borderRadius: 10,
              fontFamily: f.sans,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              cursor: starting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 0.15s ease, transform 0.1s ease",
              opacity: starting ? 0.85 : 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {starting ? "Starting…" : "Start mock interview"}
            {!starting && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          {onGoToDashboard && (
            <button
              type="button"
              onClick={onGoToDashboard}
              disabled={!!starting}
              style={{
                flexShrink: 0,
                height: 44,
                padding: "0 16px",
                background: "transparent",
                color: t.inkSoft,
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                fontFamily: f.sans,
                fontSize: 14,
                fontWeight: 500,
                cursor: starting ? "not-allowed" : "pointer",
                transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!starting) {
                  e.currentTarget.style.background = t.creamSoft;
                  e.currentTarget.style.borderColor = t.inkSoft;
                  e.currentTarget.style.color = t.coal;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = t.line;
                e.currentTarget.style.color = t.inkSoft;
              }}
            >
              Dashboard
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function StatRow({
  label,
  value,
  valueTone,
  avatarInitials,
}: {
  label: string;
  value: string;
  valueTone?: "indigo";
  avatarInitials?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: t.inkFaint, flexShrink: 0 }}>
        {label}
      </span>
      <span
        title={value}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: f.sans, fontSize: 13, fontWeight: 600, color: valueTone === "indigo" ? t.indigo : t.coal, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
      >
        {avatarInitials && (
          <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 999, background: t.indigo100, color: t.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: f.serif, fontSize: 11, fontWeight: 400, flexShrink: 0 }}>
            {avatarInitials}
          </span>
        )}
        {value}
      </span>
    </div>
  );
}

function SectionCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <section
      style={{ background: t.white, border: `1px solid ${t.line}`, borderRadius: 14, padding: "14px 16px", boxShadow: shadows.card, height: "100%", display: "flex", flexDirection: "column" }}
    >
      {label && (
        <div
          style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}
        >
          {label}
        </div>
      )}
      {children}
    </section>
  );
}

function Pill({ tone, label }: { tone: "indigo" | "muted"; label: string }) {
  const m =
    tone === "indigo"
      ? { bg: t.indigo100, border: t.indigo, fg: t.indigo }
      : { bg: t.creamSoft, border: t.line, fg: t.coal };
  return (
    <span
      title={label}
      style={{ display: "inline-flex", alignItems: "center", fontFamily: f.sans, fontSize: 12, fontWeight: 500, color: m.fg, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
    >
      {label}
    </span>
  );
}

function StrengthGapCard({ label, tone, items }: { label: string; tone: "success" | "copper"; items: string[] }) {
  const accent = tone === "success" ? t.success : t.copper;
  return (
    <section style={{ background: t.white, border: `1px solid ${t.line}`, borderRadius: 14, padding: "14px 16px", boxShadow: shadows.card, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: f.mono, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: accent, marginBottom: 8 }}>
        {tone === "success" ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="20" x2="12" y2="10" />
            <polyline points="7 14 12 9 17 14" />
          </svg>
        )}
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((line, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: f.sans, fontSize: 13.5, lineHeight: 1.55, color: t.coal }}>
            <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 7, width: 4, height: 4, borderRadius: 999, background: accent }} />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── NavigationFooter ───────────────────────────────────────────────── */

export interface NavigationFooterProps {
  isContinueDisabled: boolean;
  starting: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onStart?: () => void;
  onStartInterview?: () => void;
  onGoToDashboard?: () => void;
  onSkip?: () => void;
  resumeScore?: number | null;
  hasResume?: boolean;
  quotaHint?: string | null;
}

export function NavigationFooter({
  isContinueDisabled,
  starting,
  saveStatus,
  onStart,
  onStartInterview,
  onGoToDashboard,
  hasResume,
  quotaHint,
}: NavigationFooterProps) {
  const dualMode = !!(hasResume && onStartInterview && onGoToDashboard);
  const primaryDisabled = isContinueDisabled || starting;

  // ── Single-step / pre-resume path: simple "Continue" button. ─────────
  if (!dualMode) {
    const isGhost = primaryDisabled;
    const primaryStyle: React.CSSProperties = {
      fontFamily: f.sans,
      fontSize: 15,
      fontWeight: 600,
      color: isGhost ? t.inkFaint : t.cream,
      background: isGhost ? t.creamSoft : t.indigo,
      border: isGhost ? `1px solid ${t.line}` : "1px solid transparent",
      borderRadius: 10,
      padding: "14px 24px",
      cursor: primaryDisabled ? "not-allowed" : "pointer",
      boxShadow: isGhost ? "none" : shadows.cta,
      letterSpacing: 0.1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minWidth: 220,
    };
    return (
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={onStart}
          disabled={primaryDisabled}
          aria-busy={starting || undefined}
          style={primaryStyle}
        >
          {starting ? "Starting…" : "Continue"}
        </button>
        {quotaHint && (
          <div style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: t.inkFaint }}>
            {quotaHint}
          </div>
        )}
      </div>
    );
  }

  // ── Dual-mode (post-resume): all CTAs (Start mock interview +
  // Dashboard) now live inside the ScoreGauge card. Skip link and
  // quota hint were redundant with that — both removed. We only
  // render save-status here as a small operational signal in case
  // the background session-save fails.
  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {saveStatus === "saving" && (
        <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint }}>Saving…</div>
      )}
      {saveStatus === "error" && (
        <div style={{ fontFamily: f.sans, fontSize: 12, color: t.error }}>
          Couldn&apos;t save — your work is safe locally.
        </div>
      )}
    </div>
  );
}

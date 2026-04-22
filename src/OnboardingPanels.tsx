import React from "react";
import { c, font } from "./tokens";
import type { ResumeProfile } from "./dashboardData";
import type { ParsedResume } from "./resumeParser";

/* ═══════════════════════════════════════════════
   Extracted presentational components from Onboarding.tsx
   ═══════════════════════════════════════════════ */

/* ─── Email Verification Banner ─── */

export function EmailVerificationBanner() {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "12px 24px", background: "rgba(212,179,127,0.1)", borderBottom: "1px solid rgba(212,179,127,0.2)", textAlign: "center", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
      <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk }}>
        Check your inbox for a verification link — your progress is saved automatically.
      </span>
    </div>
  );
}

/* ─── Top Bar (logo + stepper) ─── */

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

export function TopBar({ emailUnverified, onNavigateHome, onLogout, userEmail, userAvatar, userName }: TopBarProps) {
  const displayName = userName || userEmail || "";
  const initial = (userName?.[0] || userEmail?.[0] || "?").toUpperCase();
  return (
    <div style={{ padding: "18px 40px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderBottom: `1px solid rgba(245,242,237,0.04)`, background: "rgba(6,6,7,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10, marginTop: emailUnverified ? 44 : 0 }}>
      {/* Logo */}
      <div role="button" tabIndex={0} onClick={onNavigateHome} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigateHome(); } }} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} title="Back to home">
        <div style={{ width: 6, height: 6, borderRadius: 2, background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, boxShadow: "0 0 8px rgba(212,179,127,0.3)" }} />
        <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>HireStepX</span>
      </div>
      {/* Center label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "rgba(212,179,127,0.1)",
          border: `1.5px solid ${c.gilt}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(212,179,127,0.15)",
        }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt }}>1</span>
        </div>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ivory, fontWeight: 500 }}>Upload Resume</span>
      </div>
      {/* User badge + Logout */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        {displayName && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 4px 4px", borderRadius: 20, background: "rgba(245,242,237,0.04)", border: "1px solid rgba(245,242,237,0.06)" }}>
            {userAvatar ? (
              <img src={userAvatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(212,179,127,0.12)", border: "1px solid rgba(212,179,127,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt }}>{initial}</span>
              </div>
            )}
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
          </div>
        )}
        {onLogout && (
          <button onClick={onLogout} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            fontFamily: font.ui, fontSize: 12, color: c.stone, background: "rgba(245,242,237,0.04)",
            border: `1px solid rgba(245,242,237,0.08)`, borderRadius: 6, cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.ivory; e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; e.currentTarget.style.borderColor = "rgba(245,242,237,0.08)"; }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Step 1: Resume Empty State (drop zone) ─── */

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
}

export function ResumeEmptyState({ isDragging, dragFileName, resumeError, showUndo, fileInputRef, onDragOver, onDragLeave, onDrop, onFileChange, onUndo }: ResumeEmptyStateProps) {
  return (
    <>
      <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
      <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
        Upload your resume <span style={{ color: c.ember }}>*</span>
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
        Upload your resume to get personalized interview questions tailored to your experience.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
        className={!resumeError && !isDragging ? "ob-drop" : undefined}
        style={{
          border: `1.5px dashed ${isDragging ? c.gilt : resumeError ? c.ember : "rgba(212,179,127,0.18)"}`,
          borderRadius: 16, padding: isDragging ? "48px 24px" : "56px 24px",
          textAlign: "center", cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          background: isDragging ? "rgba(212,179,127,0.04)" : c.graphite,
          boxShadow: isDragging ? "0 0 30px rgba(212,179,127,0.08), inset 0 0 30px rgba(212,179,127,0.03)" : "none",
          marginBottom: 16,
        }}
      >
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => onFileChange(e.target.files?.[0])} style={{ display: "none" }} />
        {resumeError ? (
          <div>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ember, marginBottom: 4, lineHeight: 1.5 }}>{resumeError}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Click to try a different file</p>
          </div>
        ) : isDragging ? (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px", background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.gilt }}>Release to upload</p>
            {dragFileName && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, marginTop: 4 }}>{dragFileName}</p>}
          </>
        ) : (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px", background: "rgba(212,179,127,0.05)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.ivory, marginBottom: 6 }}>Drop your resume here</p>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16 }}>or click to browse</p>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
              {["PDF", "DOCX", "TXT"].map((t) => (
                <span key={t} style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 500, color: c.stone, background: "rgba(245,242,237,0.03)", padding: "6px 14px", borderRadius: 10, border: `1px solid rgba(245,242,237,0.06)`, letterSpacing: "0.05em" }}>{t}</span>
              ))}
              <span style={{ fontFamily: font.ui, fontSize: 11, color: "rgba(154,149,144,0.5)" }}>Max 10 MB</span>
            </div>
          </>
        )}
      </div>

      {/* Privacy bar */}
      {!showUndo && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderRadius: 12, background: c.graphite, border: `1px solid ${c.border}` }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>Your resume text is used only to generate personalized interview questions. You can delete it anytime.</p>
        </div>
      )}

      {/* Undo toast */}
      {showUndo && (
        <div className="ob-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, animation: "toastIn 0.25s ease-out", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Resume removed</span>
          <button onClick={onUndo}
            style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: "2px 8px" }}>
            Undo
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Step 1: Resume Loading State ─── */

export interface ResumeLoadingStateProps {
  analysisStage: number;
  fileName: string;
  onCancel?: () => void;
}

export function ResumeLoadingState({ analysisStage, fileName, onCancel }: ResumeLoadingStateProps) {
  return (
    <>
      <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
      <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
        Upload your resume <span style={{ color: c.ember }}>*</span>
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
        Upload your resume to get personalized interview questions tailored to your experience.
      </p>

      <div className="ob-card" style={{ borderRadius: 16, padding: "48px 32px", textAlign: "center", border: `1px solid rgba(245,242,237,0.06)` }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, margin: "0 auto 24px", background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 24, height: 24, border: "2.5px solid rgba(212,179,127,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>
        <h3 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 20, letterSpacing: "-0.02em" }}>Building your profile</h3>

        <div style={{ maxWidth: 300, margin: "0 auto 20px", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          {[
            { label: "Extracting text", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
            { label: "Identifying skills & experience", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
            { label: "Analyzing strengths & gaps", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg> },
            { label: "Generating your profile", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
          ].map((stage, i) => {
            const done = analysisStage > i;
            const active = analysisStage === i;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: active ? 1 : done ? 0.5 : 0.2, transition: "opacity 0.4s ease" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: done ? c.sage : active ? c.gilt : c.stone, background: done ? "rgba(122,158,126,0.08)" : active ? "rgba(212,179,127,0.08)" : "transparent" }}>
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : active ? (
                    <div style={{ width: 10, height: 10, border: "1.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  ) : stage.icon}
                </div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: active ? 500 : 400, color: done ? c.sage : active ? c.ivory : c.stone }}>{stage.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ maxWidth: 300, margin: "0 auto", height: 3, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
          <div className="ob-progress-bar" style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${c.gilt}, ${c.giltDark})` }} />
        </div>
        {fileName && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, padding: "6px 14px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}` }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{fileName}</span>
          </div>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{ display: "block", margin: "20px auto 0", fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "6px 16px", borderRadius: 8, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = c.ivory)}
            onMouseLeave={e => (e.currentTarget.style.color = c.stone)}
          >
            Cancel
          </button>
        )}
      </div>
    </>
  );
}

/* ─── Step 1: Profile Ready State ─── */

export interface ProfileReadyStateProps {
  aiProfile: ResumeProfile;
  resumeParsed: ParsedResume;
  userName: string;
  fileName: string;
  resumeText: string;
  targetRole: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUserNameChange: (v: string) => void;
  onReanalyze: () => void;
  onRemove: () => void;
  onReplaceFile: () => void;
}

export function ProfileReadyState({ aiProfile, resumeParsed, userName, fileName, resumeText: _resumeText, targetRole: _targetRole, fileInputRef: _fileInputRef, onUserNameChange, onReanalyze, onRemove, onReplaceFile }: ProfileReadyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Step heading */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
        <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
          Your candidate profile
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
          We've analyzed your resume. Review your profile below, then continue to set up your session.
        </p>
      </div>

      {/* Header: headline + badges + actions */}
      <div className="ob-card ob-s1-header" style={{ borderRadius: 14, padding: "20px 24px", border: `1px solid rgba(245,242,237,0.06)`, display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div className="ob-s1-header-text" style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: font.display, fontSize: 22, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 8 }}>
            {aiProfile.headline && aiProfile.headline !== "Analyzing..." ? aiProfile.headline : userName || resumeParsed.name || "Your Profile"}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {aiProfile.seniorityLevel && <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.18)", borderRadius: 4, padding: "2px 10px" }}>{aiProfile.seniorityLevel}</span>}
            {aiProfile.yearsExperience && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.yearsExperience}+ yrs</span>}
            {aiProfile.industries && aiProfile.industries.length > 0 && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.industries.slice(0, 2).join(", ")}</span>}
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{aiProfile.summary}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{fileName}</span>
            <span style={{ color: c.stone, fontSize: 11 }}>·</span>
            <button onClick={onReplaceFile} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Replace</button>
          </div>
        </div>
        <div className="ob-s1-header-actions" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onReanalyze}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Re-analyze
          </button>
          <button onClick={onRemove}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,242,237,0.15)"; e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Remove
          </button>
        </div>
      </div>

      {/* Name field + Resume Score */}
      <div className="ob-s1-name-score" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Editable Name */}
        <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px" }}>
          <label htmlFor="ob-name" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Your Name <span style={{ color: c.ember }}>*</span>
          </label>
          <input
            id="ob-name" type="text" value={userName}
            onChange={(e) => onUserNameChange(e.target.value)}
            placeholder="Enter your name (used by AI interviewer)"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8,
              background: c.graphite, border: `1.5px solid ${!userName.trim() ? c.ember : c.border}`,
              color: c.ivory, fontFamily: font.ui, fontSize: 14,
              outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = c.gilt; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = !userName.trim() ? c.ember : c.border; }}
          />
          {!userName.trim() && <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>Name is required for the interview</p>}
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4 }}>The AI interviewer will address you by this name</p>
        </div>

        {/* Resume Score */}
        <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px", border: `1px solid ${aiProfile.resumeScore != null && aiProfile.resumeScore < 50 ? "rgba(212,179,127,0.2)" : aiProfile.resumeScore != null && aiProfile.resumeScore >= 50 ? "rgba(122,158,126,0.2)" : "rgba(245,242,237,0.06)"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Resume Score</h4>
          </div>
          {aiProfile.resumeScore != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(245,242,237,0.06)" strokeWidth="5" />
                  <circle cx="32" cy="32" r="28" fill="none"
                    stroke={aiProfile.resumeScore >= 50 ? c.sage : c.gilt}
                    strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${(aiProfile.resumeScore / 100) * 175.9} 175.9`}
                    transform="rotate(-90 32 32)"
                    style={{ transition: "stroke-dasharray 0.6s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: aiProfile.resumeScore >= 50 ? c.sage : c.gilt }}>{aiProfile.resumeScore}</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: aiProfile.resumeScore >= 50 ? c.sage : c.gilt, marginBottom: 4 }}>
                  {aiProfile.resumeScore >= 80 ? "Excellent" : aiProfile.resumeScore >= 65 ? "Good" : aiProfile.resumeScore >= 50 ? "Acceptable" : "Room to Grow"}
                </p>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>
                  {aiProfile.resumeScore >= 50
                    ? "Your resume meets the minimum standard. You can proceed to interview practice."
                    : "A few tweaks could make your resume stronger. Practice interviews will help too!"}
                </p>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Score not available — try re-analyzing or upload a different format</p>
          )}
        </div>
      </div>

      {/* Resume Improvement Suggestions */}
      {aiProfile.improvements && aiProfile.improvements.length > 0 && aiProfile.resumeScore != null && aiProfile.resumeScore < 50 && (
        <div className="ob-card fade-up-2" style={{ borderRadius: 14, padding: "20px 24px", border: "1px solid rgba(212,179,127,0.12)", background: "rgba(212,179,127,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
            <h4 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.gilt, margin: 0 }}>Quick wins for your resume</h4>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: "auto" }}>Small changes, big impact</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {aiProfile.improvements.map((tip, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(245,242,237,0.02)", border: "1px solid rgba(245,242,237,0.04)" }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt }}>{i + 1}</span>
                </div>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 14, textAlign: "center" }}>
            Try these tips and re-upload, or continue — practicing will help just as much!
          </p>
        </div>
      )}

      {/* 3-column grid: Skills | Achievements | Strengths & Gaps */}
      <div className="ob-s1-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {aiProfile.topSkills && aiProfile.topSkills.length > 0 && (
          <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Top Skills</h4>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {aiProfile.topSkills.slice(0, 6).map((skill, i) => (
                <span key={i} style={{ fontFamily: font.ui, fontSize: 11, color: i < 3 ? c.ivory : c.chalk, background: i < 3 ? "linear-gradient(135deg, rgba(212,179,127,0.12), rgba(212,179,127,0.05))" : "rgba(245,242,237,0.03)", border: `1px solid ${i < 3 ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, borderRadius: 10, padding: "5px 10px", fontWeight: i < 3 ? 500 : 400 }}>{skill}</span>
              ))}
            </div>
          </div>
        )}

        {aiProfile.keyAchievements && aiProfile.keyAchievements.length > 0 && (
          <div className="ob-card fade-up-2" style={{ borderRadius: 14, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 15l-2 5-1-3-3-1 5-2"/><circle cx="12" cy="8" r="6"/></svg>
              <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Key Achievements</h4>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {aiProfile.keyAchievements.slice(0, 2).map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(245,242,237,0.02)", border: `1px solid rgba(245,242,237,0.04)` }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths & Gaps stacked */}
        <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aiProfile.interviewStrengths && aiProfile.interviewStrengths.length > 0 && (
            <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>Strengths</h4>
              </div>
              {aiProfile.interviewStrengths.slice(0, 2).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{s}</span>
                </div>
              ))}
            </div>
          )}
          {aiProfile.interviewGaps && aiProfile.interviewGaps.length > 0 && (
            <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>To Prepare</h4>
              </div>
              {aiProfile.interviewGaps.slice(0, 2).map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{g}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Career trajectory */}
      {aiProfile.careerTrajectory && (
        <div className="ob-card fade-up-3" style={{ borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, border: `1px solid rgba(245,242,237,0.04)` }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" style={{ flexShrink: 0 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{aiProfile.careerTrajectory}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Step 2: Session Setup (Role, Focus, Length) ─── */

export interface SessionSetupStepProps {
  targetRole: string;
  targetCompany: string;
  interviewFocus: string[];
  sessionLength: string;
  roleAutoFilled: boolean;
  roleTouched: boolean;
  isFreeUser: boolean;
  resumeSkipped?: boolean;
  userName?: string;
  onUserNameChange?: (v: string) => void;
  onRoleChange: (v: string) => void;
  onCompanyChange: (v: string) => void;
  onFocusChange: (v: string[]) => void;
  onSessionLengthChange: (v: string) => void;
  onShowUpgrade: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party autocomplete component with dynamic props
  AutocompleteInput: React.ComponentType<any>;
  ROLE_SUGGESTIONS: string[];
  COMPANY_SUGGESTIONS: string[];
}

export function SessionSetupStep({ targetRole, targetCompany, interviewFocus, sessionLength, roleAutoFilled, roleTouched, isFreeUser, resumeSkipped, userName, onUserNameChange, onRoleChange, onCompanyChange, onFocusChange, onSessionLengthChange, onShowUpgrade, AutocompleteInput, ROLE_SUGGESTIONS, COMPANY_SUGGESTIONS }: SessionSetupStepProps) {
  return (
    <div>
      <div style={{ marginBottom: 32 }} className="fade-up-1">
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 2 — Your First Session</p>
        <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
          Set up your practice session
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
          {resumeSkipped ? "Tell us a bit about yourself so we can personalize your interview." : "We've pre-filled your target role from your resume. Adjust if needed, then choose your interview focus."}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Name field — shown when resume was skipped */}
        {resumeSkipped && onUserNameChange && (
          <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Name</span>
            </div>
            <input
              type="text" value={userName || ""} onChange={(e) => onUserNameChange(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: "100%", fontFamily: font.ui, fontSize: 14, color: c.ivory, padding: "10px 14px", borderRadius: 10,
                background: c.graphite, border: `1.5px solid ${c.border}`, outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = c.gilt; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = c.border; }}
            />
          </div>
        )}

        {/* Role & Company */}
        <div className={`ob-card ${resumeSkipped ? "fade-up-2" : "fade-up-1"}`} style={{ borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Target Role</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>— AI tailors questions to this role</span>
          </div>
          <div className="ob-s2-role-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <AutocompleteInput id="ob-role" value={targetRole} onChange={(v: string) => { onRoleChange(v); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required error={roleTouched && !targetRole.trim() ? "Required to personalize your questions" : undefined} />
              {roleAutoFilled && targetRole && (
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Auto-filled from resume
                </p>
              )}
            </div>
            <div>
              <AutocompleteInput id="ob-company" value={targetCompany} onChange={onCompanyChange} suggestions={COMPANY_SUGGESTIONS} placeholder="e.g. Google, Stripe..." label="Company (optional)" />
            </div>
          </div>
        </div>

        {/* Interview Focus */}
        <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Focus <span style={{ color: c.ember, fontWeight: 400 }}>*</span></span>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Choose what you want to practice. AI will prepare questions based on your selection.</p>
          <div className="ob-s2-focus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { value: "Behavioral", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, desc: "STAR-format questions about past experiences" },
              { value: "Strategic", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, desc: "Vision-setting, roadmap & business alignment" },
              { value: "Technical Leadership", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, desc: "System design, architecture & tech decisions" },
              { value: "Case Study", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, desc: "Analyze real business scenarios & problems" },
              { value: "Campus Placement", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg>, desc: "College interview prep — projects, goals & teamwork" },
              { value: "HR Round", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, desc: "Personality, cultural fit & soft skills" },
              { value: "Management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, desc: "Leadership style, team building & change management" },
              { value: "Panel Interview", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, desc: "Multi-interviewer format with varied perspectives" },
              { value: "Salary Negotiation", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, desc: "Practice negotiating compensation & benefits" },
              { value: "Government / PSU", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>, desc: "Public service motivation, ethics & current affairs" },
            ].map(opt => {
              const sel = interviewFocus[0] === opt.value;
              return (
                <button key={opt.value} className="ob-focus-card" onClick={() => onFocusChange([opt.value])}
                  style={{
                    padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left",
                    background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                    border: `1.5px solid ${sel ? c.gilt : c.border}`,
                    boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                    display: "flex", alignItems: "center", gap: 12, color: sel ? c.gilt : c.stone,
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? "rgba(212,179,127,0.1)" : "rgba(245,242,237,0.03)", border: `1px solid ${sel ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {opt.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block" }}>{opt.value}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>{opt.desc}</span>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${sel ? c.gilt : "rgba(245,242,237,0.12)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.gilt }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Session Length */}
        <div className="ob-card fade-up-3" style={{ borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Length</span>
          </div>
          <div className="ob-s2-session-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {(([
              { value: "10m", label: "10 min", desc: "Quick practice", sub: "2-3 questions", paidOnly: false },
              { value: "15m", label: "15 min", desc: "Standard session", sub: "4-5 questions", recommended: true, paidOnly: true },
              { value: "25m", label: "25 min", desc: "Deep dive", sub: "6-8 questions", paidOnly: true },
            ] as { value: string; label: string; desc: string; sub: string; paidOnly: boolean; recommended?: boolean }[])).map(opt => {
              const locked = opt.paidOnly && isFreeUser;
              const sel = sessionLength === opt.value;
              return (
                <button key={opt.value} onClick={() => { if (locked) { onShowUpgrade(); } else { onSessionLengthChange(opt.value); } }}
                  style={{
                    padding: "16px 14px", borderRadius: 12, cursor: "pointer", textAlign: "center", position: "relative",
                    background: sel ? "rgba(212,179,127,0.08)" : "transparent",
                    border: `1.5px solid ${sel ? c.gilt : c.border}`,
                    boxShadow: sel ? "0 0 16px rgba(212,179,127,0.06)" : "none",
                    transition: "all 0.2s",
                    opacity: locked ? 0.5 : 1,
                  }}>
                  {opt.recommended && !locked && (
                    <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: c.obsidian, background: c.gilt, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</span>
                  )}
                  {locked && (
                    <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.1)", border: "1px solid rgba(212,179,127,0.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 3 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Upgrade
                    </span>
                  )}
                  <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: sel ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.label}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: sel ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{opt.desc}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 3: Permissions & Review ─── */

export interface PermissionsStepProps {
  micStatus: "idle" | "requesting" | "granted" | "denied";
  micLevel: number;
  userName: string;
  fileName: string;
  targetRole: string;
  targetCompany: string;
  interviewFocus: string[];
  sessionLength: string;
  onRequestMic: () => void;
  onEditStep: (step: number) => void;
}

export function PermissionsStep({ micStatus, micLevel, userName, fileName, targetRole, targetCompany, interviewFocus, sessionLength, onRequestMic, onEditStep }: PermissionsStepProps) {
  return (
    <div>
      <div style={{ marginBottom: 32 }} className="fade-up-1">
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 3 — Almost There</p>
        <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
          Allow permissions & review
        </h2>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
          We need microphone access for the interview. Review your profile below, then you're ready to go.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Mic Permission */}
        <div className={`ob-card fade-up-1 ${micStatus !== "granted" ? "ob-mic-pulse" : ""}`} style={{
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 14,
          border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
          background: micStatus === "granted" ? "rgba(122,158,126,0.03)" : undefined,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: micStatus === "granted" ? "rgba(122,158,126,0.08)" : "rgba(245,242,237,0.03)", border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.2)" : "rgba(245,242,237,0.06)"}` }}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={micStatus === "granted" ? c.sage : c.stone} strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: micStatus === "granted" ? c.sage : c.ivory }}>
              {micStatus === "granted" ? "Microphone connected" : micStatus === "denied" ? "Mic denied — you can type instead" : "Microphone"}
            </span>
            {micStatus === "granted" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ width: 60, height: 3, borderRadius: 2, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: c.sage, width: `${Math.max(5, micLevel)}%`, transition: "width 0.1s" }} />
                </div>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }}>Live</span>
              </div>
            )}
          </div>
          {micStatus !== "granted" && (
            <button onClick={onRequestMic}
              style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 8, padding: "7px 16px", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; }}>
              {micStatus === "denied" ? "Retry" : "Allow"}
            </button>
          )}
        </div>

        {/* Profile Review Card */}
        <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Profile</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Name", value: userName.trim() || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, editStep: 1 },
              { label: "Resume", value: fileName || "Not uploaded", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, editStep: 1 },
              { label: "Target Role", value: targetRole || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, editStep: 2 },
              { label: "Target Company", value: targetCompany || "Exploring", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>, editStep: 2 },
              { label: "Interview Focus", value: interviewFocus.length > 0 ? interviewFocus.join(", ") : "None selected", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, editStep: 2 },
              { label: "Session Length", value: sessionLength === "10m" ? "10 minutes" : sessionLength === "25m" ? "25 minutes" : "15 minutes", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, editStep: 2 },
            ].map((item, i, arr) => (
              <div key={item.label}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, flexShrink: 0 }}>{item.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: item.value === "Not set" || item.value === "Not uploaded" || item.value === "None selected" ? "rgba(154,149,144,0.5)" : c.ivory, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                      {item.value}
                    </span>
                    <button
                      onClick={() => onEditStep(item.editStep)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: 0.3, transition: "opacity 0.2s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                      aria-label={`Edit ${item.label}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                </div>
                {i < arr.length - 1 && <div style={{ height: 1, background: "rgba(245,242,237,0.04)" }} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Navigation Footer ─── */

export interface NavigationFooterProps {
  isContinueDisabled: boolean;
  starting: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onStart: () => void;
}

export function NavigationFooter({ isContinueDisabled, starting, saveStatus, onStart }: NavigationFooterProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
      <button onClick={onStart} disabled={isContinueDisabled || starting}
        style={{
          fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
          background: (isContinueDisabled || starting) ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
          color: (isContinueDisabled || starting) ? "rgba(212,179,127,0.4)" : c.obsidian,
          cursor: (isContinueDisabled || starting) ? "not-allowed" : "pointer",
          transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
          boxShadow: (isContinueDisabled || starting) ? "none" : "0 8px 24px rgba(212,179,127,0.2)",
        }}
        onMouseEnter={(e) => { if (!isContinueDisabled && !starting) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,179,127,0.3)"; } }}
        onMouseLeave={(e) => { if (!isContinueDisabled && !starting) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,179,127,0.2)"; } }}>
        {starting ? (
          <div style={{ width: 16, height: 16, border: "2.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        ) : (
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18m-6-6l6 6-6 6"/></svg>
        )}
        {starting ? "Setting up..." : "Go to Dashboard"}
      </button>

      {saveStatus !== "idle" && (
        <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, animation: "fadeUp 0.25s ease-out" }}>
          {saveStatus === "saving" && <div style={{ width: 10, height: 10, border: "1.5px solid rgba(212,179,127,0.3)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />}
          {saveStatus === "saved" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
          {saveStatus === "error" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>}
          <span style={{ fontFamily: font.ui, fontSize: 11, color: saveStatus === "error" ? c.ember : saveStatus === "saved" ? c.sage : c.stone }}>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Progress saved" : "Save failed — your data is safe locally"}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Launch Overlay ─── */

export function LaunchOverlay({ interviewFocus }: { interviewFocus: string[] }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: c.obsidian,
      animation: "launchIn 0.4s ease",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16, marginBottom: 24,
        background: `linear-gradient(135deg, rgba(212,179,127,0.15), rgba(212,179,127,0.05))`,
        border: "1px solid rgba(212,179,127,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "launchPulse 1.2s ease-in-out infinite",
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
      </div>
      <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
        Let's go!
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone }}>
        Launching your {interviewFocus[0]?.toLowerCase() || "practice"} interview...
      </p>
    </div>
  );
}

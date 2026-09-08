"use client";

/* Full-detail dialog opened by clicking a row in the Jobs tab table
   (DashboardJobs.tsx). Mirrors the modal pattern established by
   UpgradeModal (dashboardComponents.tsx): fixed backdrop + centered
   card, Escape/backdrop-click/close-button all wired to the same
   onClose, and a Tab focus trap so keyboard users can't tab out to
   the page behind it. */

import { useEffect, useRef } from "react";
import { tokens as t, fonts as f, shadows } from "./auth/_tokens";
import { daysAgo, formatComp, formatExperience, WORK_MODE_LABEL } from "./hiringMatchFormat";
import type { JobMatch } from "./DashboardJobs";

export default function JobDetailModal({ job, onClose }: { job: JobMatch; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const comp = formatComp(job.budgetMin, job.budgetMax);
  const exp = formatExperience(job.experienceMin, job.experienceMax);
  const mode = job.workMode ? WORK_MODE_LABEL[job.workMode] || job.workMode : null;
  const closed = job.status === "closed" || job.status === "failed";

  const statLabel = (value: string | null, fallback: string) => (
    <span style={{ color: t.inkFaint, fontStyle: value ? "normal" : "italic" }}>{value || fallback}</span>
  );

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- dialog backdrop dismissal
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,17,10,0.40)", padding: 20 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-detail-title"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stops click propagation to backdrop */}
      <div
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.creamRaised, border: `1px solid ${t.line}`, borderRadius: 16,
          padding: "28px 26px", maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto",
          position: "relative", boxShadow: shadows.modal, outline: "none",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: t.inkSoft, cursor: "pointer", padding: 4 }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, paddingRight: 24 }}>
          {job.companyLogoPath ? (
            <img
              src={job.companyLogoPath}
              alt={`${job.companyName} logo`}
              width={44}
              height={44}
              style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.line}` }}
            />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: t.cream, border: `1px solid ${t.line}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontFamily: f.serif, fontSize: 18, color: t.inkSoft,
            }}>
              {job.companyName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 id="job-detail-title" style={{ fontFamily: f.sans, fontSize: 19, fontWeight: 700, color: t.coal, margin: 0 }}>
              {job.roleTitle}
            </h2>
            <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, marginTop: 3 }}>
              {job.companyWebsite ? (
                <a href={job.companyWebsite} target="_blank" rel="noopener noreferrer" style={{ color: t.inkSoft, textDecoration: "underline" }}>
                  {job.companyName}
                </a>
              ) : job.companyName}
              {" · "}{job.location || "Location not specified"}{mode ? ` · ${mode}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {job.unlocked ? (
            <span style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: 0.4, color: t.indigoDeep, background: t.indigo100, padding: "4px 10px", borderRadius: 999 }}>
              CONTACTED
            </span>
          ) : (
            <span style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: 0.4, color: t.inkSoft, background: t.cream, padding: "4px 10px", borderRadius: 999 }}>
              {job.matchScore}% MATCH
            </span>
          )}
          {closed && !job.unlocked && (
            <span style={{ fontFamily: f.mono, fontSize: 10.5, letterSpacing: 0.4, color: t.inkFaint, background: t.cream, padding: "4px 10px", borderRadius: 999 }}>
              ROLE CLOSED
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontFamily: f.sans, fontSize: 13, marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${t.line}` }}>
          <div>{statLabel(comp, "Compensation not disclosed")}</div>
          <div>{statLabel(exp ? `${exp} exp` : null, "Experience not specified")}</div>
          <div>{statLabel(job.openPositions != null ? `${job.openPositions} opening${job.openPositions === 1 ? "" : "s"}` : null, "Openings not specified")}</div>
          <div>
            <span style={{ color: t.inkFaint, fontStyle: job.noticePeriodPref ? "normal" : "italic" }}>
              Notice: {job.noticePeriodPref || "Not specified"}
            </span>
          </div>
          <div>{statLabel(job.preferredIndustry, "Any industry")}</div>
          <div>{statLabel(job.dueDate ? `Hiring by ${job.dueDate}` : null, "Open-ended timeline")}</div>
        </div>

        {job.skills.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {job.skills.map((s, i) => (
              <span key={i} style={{ fontFamily: f.sans, fontSize: 11.5, color: t.coal, background: t.cream, border: `1px solid ${t.line}`, padding: "3px 9px", borderRadius: 999 }}>
                {s}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint, fontStyle: "italic", margin: "0 0 16px" }}>
            No specific skills listed for this role.
          </p>
        )}

        {job.description && (
          <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: "0 0 12px", lineHeight: 1.6 }}>
            {job.description}
          </p>
        )}

        {job.responsibilities && (
          <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: "0 0 12px", lineHeight: 1.6 }}>
            <strong>Responsibilities: </strong>{job.responsibilities}
          </p>
        )}

        {job.niceToHave && (
          <p style={{ fontFamily: f.sans, fontSize: 12.5, color: t.inkSoft, margin: "0 0 12px", lineHeight: 1.55 }}>
            <strong style={{ color: t.coal }}>Nice to have: </strong>{job.niceToHave}
          </p>
        )}

        {!job.description && !job.responsibilities && !job.niceToHave && (
          <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint, fontStyle: "italic", margin: "0 0 12px" }}>
            This employer hasn't added a role description yet.
          </p>
        )}

        {job.perksAndBenefits.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {job.perksAndBenefits.map((p, i) => (
              <span key={i} style={{ fontFamily: f.sans, fontSize: 11, color: t.inkSoft, border: `1px solid ${t.line}`, padding: "2px 9px", borderRadius: 999 }}>
                {p}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: f.sans, fontSize: 11.5, color: t.inkFaint, fontStyle: "italic", margin: "0 0 14px" }}>
            No perks or benefits listed.
          </p>
        )}

        <div style={{ fontFamily: f.sans, fontSize: 11, color: t.inkFaint, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
          {job.unlocked && job.unlockedAt
            ? `Contacted ${daysAgo(job.unlockedAt)} · matched ${daysAgo(job.matchedAt)}`
            : `Matched ${daysAgo(job.matchedAt)}`}
        </div>
      </div>
    </div>
  );
}

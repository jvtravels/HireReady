"use client";
/**
 * Coverage panel — shows skill ↔ role reconciliation against:
 *   1. The user's *target role* (if recognised), as a primary panel
 *   2. The four interview-type vocabularies, as condensed pills
 *
 * Replaces the previous 4-tile grid that gave generic technical/
 * behavioral feedback regardless of who the user actually wanted to
 * interview as. A PM no longer gets told to add "kafka" to their
 * resume.
 */

import { useMemo } from "react";
import { c, font } from "../tokens";
import type { ResumeProfile } from "../dashboardData";
import type { InterviewType } from "../resumeFitness";
import {
  reconcileResumeAgainstRole,
  reconcileForTargetRole,
  labelForRoleSlug,
} from "../skillReconcile";

interface Props {
  profile: ResumeProfile;
  targetRole: string | null | undefined;
}

const INTERVIEW_TYPES: InterviewType[] = ["behavioral", "technical", "system_design", "case"];
const INTERVIEW_LABEL: Record<InterviewType, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  system_design: "System Design",
  case: "Case",
};

export default function CoveragePanel({ profile, targetRole }: Props) {
  const roleSpecific = useMemo(
    () => reconcileForTargetRole(profile, targetRole),
    [profile, targetRole],
  );

  const interviewTypeRecs = useMemo(
    () => Object.fromEntries(
      INTERVIEW_TYPES.map(t => [t, reconcileResumeAgainstRole(profile, t)] as const),
    ) as Record<InterviewType, ReturnType<typeof reconcileResumeAgainstRole>>,
    [profile],
  );

  return (
    <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 22px", marginBottom: 14 }}>
      <h3 style={{ fontFamily: font.display, fontSize: 16, color: c.ivory, marginBottom: 4, letterSpacing: "-0.01em" }}>Coverage</h3>
      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 14 }}>
        Keywords your resume covers vs. what the role expects.
      </p>

      {/* Friendly CTA when we don't have a target role to anchor on.
        * Without it, the panel below shows the four interview-type
        * vocabularies which are useful but generic — calling out the
        * upgrade path lets the user know they can do better. */}
      {!targetRole && (
        <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(212,179,127,0.06)", border: `1px solid ${c.border}` }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>
            Set your <strong style={{ color: c.gilt }}>target role</strong> on the dashboard to see role-specific coverage (PM, designer, SDE, etc.).
          </span>
        </div>
      )}

      {/* Role-specific panel — primary surface when target role is known */}
      {roleSpecific && (
        <div style={{ background: c.obsidian, borderRadius: 10, border: `1px solid rgba(212,179,127,0.25)`, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.gilt }}>
              {labelForRoleSlug(roleSpecific.roleSlug)}
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: roleSpecific.result.coveragePct >= 60 ? c.sage : roleSpecific.result.coveragePct >= 30 ? c.gilt : c.stone }}>
              {roleSpecific.result.coveragePct}% coverage
            </span>
          </div>
          {roleSpecific.result.matched.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>You cover</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {roleSpecific.result.matched.slice(0, 10).map(m => (
                  <span key={m} style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, background: "rgba(140,182,144,0.08)", padding: "2px 7px", borderRadius: 3 }}>{m}</span>
                ))}
                {roleSpecific.result.matched.length > 10 && (
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>+{roleSpecific.result.matched.length - 10}</span>
                )}
              </div>
            </div>
          )}
          {roleSpecific.result.topGaps.length > 0 && (
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.ember, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add to strengthen</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {roleSpecific.result.topGaps.map(g => (
                  <span key={g} style={{ fontFamily: font.mono, fontSize: 10, color: c.ember, background: "rgba(196,112,90,0.08)", padding: "2px 7px", borderRadius: 3 }}>{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interview-type panels — condensed when role-specific is shown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {INTERVIEW_TYPES.map(t => {
          const rec = interviewTypeRecs[t];
          return (
            <div key={t} style={{ background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}`, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory }}>{INTERVIEW_LABEL[t]}</span>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: rec.coveragePct >= 60 ? c.sage : rec.coveragePct >= 30 ? c.gilt : c.stone }}>{rec.coveragePct}%</span>
              </div>
              {rec.topGaps.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {rec.topGaps.slice(0, 4).map(g => (
                    <span key={g} style={{ fontFamily: font.mono, fontSize: 9, color: c.ember, background: "rgba(196,112,90,0.06)", padding: "1px 5px", borderRadius: 2 }}>{g}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

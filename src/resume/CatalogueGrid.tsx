"use client";
/**
 * Multi-resume catalogue grid + per-card version timeline. Extracted
 * from DashboardResume.tsx to keep that file under the file-length
 * threshold and to give the catalogue a clean prop boundary.
 *
 * Owns its own UI-only state (rename draft, archive confirm, timeline
 * expansion). The parent owns the data + action callbacks.
 *
 * Mobile + a11y improvements over the inlined version:
 *   - Chips include a single-letter band prefix (E/G/F/L) so the band
 *     is communicated by shape, not just colour — accessible to
 *     colourblind users
 *   - Tap targets are ≥24px; chip font 10px (was 9px)
 *   - aria-expanded on history toggle, aria-live on inline confirm
 *   - Archive uses an inline confirm row instead of window.confirm
 */

import { useState } from "react";
import { c, font } from "../tokens";
import type { ResumeProfile } from "../dashboardData";
import type { InterviewType, FitnessBand } from "../resumeFitness";
import { computeResumeDiff } from "../resumeDiff";
import type { ResumeCardData, FitnessAll } from "./types";

interface Props {
  resumes: ResumeCardData[];
  fitsByResumeId: Record<string, FitnessAll | null>;
  activatingId: string | null;
  archivingId: string | null;
  onMakeActive: (resumeId: string, versionId: string, profile: ResumeProfile | null, fileName: string | null) => void | Promise<void>;
  onArchive: (resumeId: string, isActive: boolean) => void | Promise<void>;
  onRename: (resumeId: string, newTitle: string) => void | Promise<void>;
}

const bandColor = (b: FitnessBand) =>
  b === "excellent" ? c.sage : b === "good" ? c.gilt : b === "fair" ? c.stone : c.ember;

const bandLetter: Record<FitnessBand, string> = {
  excellent: "E",
  good: "G",
  fair: "F",
  low: "L",
};

const typeLabel: Record<InterviewType, string> = {
  behavioral: "BEH",
  technical: "TECH",
  system_design: "SYS",
  case: "CASE",
};

export default function CatalogueGrid({
  resumes,
  fitsByResumeId,
  activatingId,
  archivingId,
  onMakeActive,
  onArchive,
  onRename,
}: Props) {
  const [expandedTimeline, setExpandedTimeline] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {resumes.map(r => {
        const fits = fitsByResumeId[r.id] ?? null;
        const expanded = !!expandedTimeline[r.id];
        const isRenaming = renamingId === r.id;
        const isConfirmingArchive = archiveConfirmId === r.id;

        return (
          <div key={r.id} style={{ background: c.graphite, border: `1px solid ${r.isActive ? c.gilt : c.border}`, borderRadius: 12, padding: "14px 16px" }}>
            {/* Header row: domain badge + active/make-active + archive */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.domain}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {r.isActive ? (
                  <span
                    title="This is the resume your interview sessions use right now."
                    style={{
                      fontFamily: font.ui,
                      fontSize: 10,
                      fontWeight: 600,
                      color: c.sage,
                      background: "rgba(140,182,144,0.10)",
                      border: "1px solid rgba(140,182,144,0.3)",
                      borderRadius: 4,
                      padding: "2px 8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Active
                  </span>
                ) : (
                  <button
                    onClick={() => r.latestVersionId && onMakeActive(r.id, r.latestVersionId, r.latestProfile, r.latestFileName)}
                    disabled={activatingId === r.id || !r.latestVersionId}
                    style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", minHeight: 26, cursor: activatingId === r.id ? "wait" : "pointer", opacity: activatingId === r.id ? 0.6 : 1 }}
                    title="Switch this resume to be the one used for interview sessions"
                  >
                    {activatingId === r.id ? "…" : "Make active"}
                  </button>
                )}
                {!r.isActive && !isConfirmingArchive && (
                  <button
                    onClick={() => setArchiveConfirmId(r.id)}
                    disabled={archivingId === r.id}
                    title="Archive this resume"
                    aria-label="Archive resume"
                    style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", lineHeight: 1, minHeight: 26, minWidth: 26 }}
                  >
                    {archivingId === r.id ? "…" : "✕"}
                  </button>
                )}
              </div>
            </div>

            {/* Inline archive confirm — replaces window.confirm() */}
            {isConfirmingArchive && (
              <div role="alertdialog" aria-live="polite" style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.25)" }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, marginBottom: 6 }}>Archive this resume? It stops appearing in this list. Past sessions stay readable.</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { setArchiveConfirmId(null); onArchive(r.id, r.isActive); }}
                    style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.obsidian, background: c.ember, border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", minHeight: 26 }}
                  >
                    Archive
                  </button>
                  <button
                    onClick={() => setArchiveConfirmId(null)}
                    style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", minHeight: 26 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Title row with pencil rename */}
            {isRenaming ? (
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <input
                  autoFocus
                  defaultValue={renameDraft}
                  aria-label="Resume title"
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); onRename(r.id, renameDraft); setRenamingId(null); }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.obsidian, border: `1px solid ${c.gilt}`, borderRadius: 4, padding: "4px 6px", flex: 1, minWidth: 0 }}
                />
                <button
                  onMouseDown={(e) => { e.preventDefault(); onRename(r.id, renameDraft); setRenamingId(null); }}
                  title="Save (Enter)"
                  style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.obsidian, background: c.gilt, border: "none", borderRadius: 4, padding: "0 10px", cursor: "pointer", minHeight: 26 }}
                >
                  Save
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setRenamingId(null); }}
                  title="Cancel (Esc)"
                  aria-label="Cancel rename"
                  style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "0 10px", cursor: "pointer", minHeight: 26 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }} title={r.title}>{r.title}</p>
                <button
                  onClick={() => { setRenameDraft(r.title); setRenamingId(r.id); }}
                  title="Rename"
                  aria-label="Rename resume"
                  style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", lineHeight: 1, flexShrink: 0, minHeight: 26, minWidth: 26 }}
                >
                  ✎
                </button>
              </div>
            )}

            {/* Version + history toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: fits ? 8 : 0 }}>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>v{r.latestVersion}{r.latestScore != null ? ` · Score ${r.latestScore}` : ""}</p>
              {r.versions.length > 1 && (
                <button
                  onClick={() => setExpandedTimeline(t => ({ ...t, [r.id]: !t[r.id] }))}
                  aria-expanded={expanded}
                  aria-controls={`history-${r.id}`}
                  style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", minHeight: 22 }}
                >
                  {expanded ? "Hide history ↑" : `Show ${r.versions.length} versions ↓`}
                </button>
              )}
            </div>

            {/* Fitness chips: now with letter prefix for accessibility */}
            {fits && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(["behavioral", "technical", "system_design", "case"] as InterviewType[]).map(t => (
                  <span
                    key={t}
                    title={fits[t].rationale}
                    style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: bandColor(fits[t].band), background: `${bandColor(fits[t].band)}1A`, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 3 }}
                  >
                    <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.8 }}>[{bandLetter[fits[t].band]}]</span>
                    {typeLabel[t]} {fits[t].score}
                  </span>
                ))}
              </div>
            )}

            {/* Expanded version timeline with diff */}
            {expanded && r.versions.length > 1 && (
              <div id={`history-${r.id}`} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                {r.versions.map((v, vIdx) => {
                  const isCurrent = v.id === r.latestVersionId;
                  const dateLabel = v.createdAt ? new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
                  const newerVersion = vIdx > 0 ? r.versions[vIdx - 1] : null;
                  const diff = newerVersion ? computeResumeDiff(v.profile, newerVersion.profile) : null;
                  return (
                    <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
                          v{v.versionNumber}{v.score != null ? ` · ${v.score}` : ""}{dateLabel ? ` · ${dateLabel}` : ""}
                        </span>
                        {isCurrent ? (
                          <span style={{ fontFamily: font.ui, fontSize: 9, color: c.sage }}>current</span>
                        ) : (
                          <button
                            onClick={() => onMakeActive(r.id, v.id, v.profile, v.fileName)}
                            disabled={activatingId === r.id}
                            style={{ fontFamily: font.ui, fontSize: 10, color: c.gilt, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 3, padding: "2px 8px", cursor: activatingId === r.id ? "wait" : "pointer", minHeight: 22 }}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                      {diff && !diff.isUnchanged && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 8, borderLeft: `2px solid ${c.border}` }}>
                          {diff.scoreDelta != null && diff.scoreDelta !== 0 && (
                            <span style={{ fontFamily: font.mono, fontSize: 9, color: diff.scoreDelta > 0 ? c.sage : c.ember }}>
                              score {diff.scoreDelta > 0 ? "+" : ""}{diff.scoreDelta} → v{newerVersion!.versionNumber}
                            </span>
                          )}
                          {diff.headlineChanged && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>headline updated</span>
                          )}
                          {diff.summaryChanged && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>summary updated</span>
                          )}
                          {diff.addedSkills.length > 0 && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }} title={diff.addedSkills.join(", ")}>
                              + skills: {diff.addedSkills.slice(0, 3).join(", ")}{diff.addedSkills.length > 3 ? ` +${diff.addedSkills.length - 3}` : ""}
                            </span>
                          )}
                          {diff.removedSkills.length > 0 && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.ember }} title={diff.removedSkills.join(", ")}>
                              − skills: {diff.removedSkills.slice(0, 3).join(", ")}{diff.removedSkills.length > 3 ? ` −${diff.removedSkills.length - 3}` : ""}
                            </span>
                          )}
                          {diff.addedAchievements.length > 0 && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }} title={diff.addedAchievements.join("\n")}>
                              + {diff.addedAchievements.length} achievement{diff.addedAchievements.length === 1 ? "" : "s"}
                            </span>
                          )}
                          {diff.removedAchievements.length > 0 && (
                            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.ember }} title={diff.removedAchievements.join("\n")}>
                              − {diff.removedAchievements.length} achievement{diff.removedAchievements.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import { c, font } from "./tokens";
import {
  fetchStoryNotebook,
  markStoryReviewed,
  deleteStory,
  type StoryNotebookRow,
} from "./dashboardData";

/* ─── Story Notebook page ───────────────────────────────────────────
 * Layer on top of the story_notebook table shipped earlier. Surfaces
 * the user's saved STAR stories with spaced-repetition ordering:
 * stories unreviewed for ≥7d rise to the top as "due for review".
 * Reviewing a story bumps last_used_at; deleting removes it.
 */

type FilterTab = "due" | "recent" | "all";

export default function StoryNotebookPage() {
  const [rows, setRows] = useState<StoryNotebookRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("due");

  const load = useCallback(async () => {
    const data = await fetchStoryNotebook();
    setRows(data);
  }, []);

  useEffect(() => { load(); track("notebook_viewed"); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (tab === "due")    return rows.filter((r) => r.daysStale >= 7);
    if (tab === "recent") return rows.filter((r) => r.daysStale < 7);
    return rows;
  }, [rows, tab]);

  const dueCount = rows?.filter((r) => r.daysStale >= 7).length ?? 0;

  const onReview = async (id: string) => {
    setBusyId(id);
    try {
      await markStoryReviewed(id);
      track("notebook_story_reviewed", { storyId: id });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this story? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await deleteStory(id);
      track("notebook_story_deleted", { storyId: id });
      setExpandedId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 0" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          Story Notebook
        </h1>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
          Your saved interview stories, surfaced on a spaced-repetition schedule.
          Stories you haven't reviewed in a week rise to the top.
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Story filters" style={{
        display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${c.border}`,
      }}>
        {([
          { id: "due" as const,    label: `Due for review`,  count: dueCount },
          { id: "recent" as const, label: "Recently reviewed" },
          { id: "all" as const,    label: "All" },
        ]).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: active ? 600 : 500,
                color: active ? c.ivory : c.stone, background: "transparent",
                border: "none", padding: "10px 14px", cursor: "pointer",
                borderBottom: active ? `2px solid ${c.gilt}` : "2px solid transparent",
                marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = c.chalk; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = c.stone; }}
            >
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span style={{
                  fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.obsidian,
                  background: c.gilt, borderRadius: 10, padding: "1px 7px",
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {rows === null && (
        <div style={{ padding: 40, textAlign: "center", color: c.stone, fontFamily: font.ui, fontSize: 13 }}>
          Loading your notebook…
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <EmptyNotebook />
      )}

      {filtered && filtered.length === 0 && rows && rows.length > 0 && (
        <div style={{ padding: 24, textAlign: "center", color: c.stone, fontFamily: font.ui, fontSize: 13 }}>
          {tab === "due" ? "Nothing due for review — great work." : "No stories in this view."}
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((row) => (
            <StoryRow
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
              onReview={() => onReview(row.id)}
              onDelete={() => onDelete(row.id)}
              busy={busyId === row.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StoryRow({ row, expanded, onToggle, onReview, onDelete, busy }: {
  row: StoryNotebookRow;
  expanded: boolean;
  onToggle: () => void;
  onReview: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const due = row.daysStale >= 7;
  return (
    <div style={{
      background: c.graphite, borderRadius: 12, border: `1px solid ${due ? "rgba(212,179,127,0.25)" : c.border}`,
      overflow: "hidden", transition: "border-color 200ms",
    }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left", color: c.ivory,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          {due && (
            <span style={{
              fontFamily: font.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              color: c.gilt, background: "rgba(212,179,127,0.1)", padding: "2px 6px", borderRadius: 3, flexShrink: 0,
            }}>Due</span>
          )}
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {row.title}
          </span>
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone, flexShrink: 0, marginLeft: 12 }}>
          {row.daysStale === 0 ? "today" : `${row.daysStale}d stale`}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {row.question && (
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Question</span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.6, margin: "6px 0 0" }}>{row.question}</p>
            </div>
          )}
          {row.answerText && (
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your Answer</span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.7, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{row.answerText}</p>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 2 }}>
            <button
              onClick={onDelete}
              disabled={busy}
              style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember,
                background: "transparent", border: `1px solid rgba(196,112,90,0.25)`,
                borderRadius: 8, padding: "6px 12px", cursor: busy ? "default" : "pointer",
              }}
            >Delete</button>
            <button
              onClick={onReview}
              disabled={busy}
              style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.obsidian,
                background: c.gilt, border: "none", borderRadius: 8, padding: "6px 14px",
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "…" : "Mark reviewed"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyNotebook() {
  return (
    <div style={{
      background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
      padding: "40px 32px", textAlign: "center",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px",
        background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h2 style={{ fontFamily: font.display, fontSize: 20, fontWeight: 400, color: c.ivory, margin: "0 0 6px" }}>
        Your notebook is empty
      </h2>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: 0, maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        After an interview, open any question in your results report and click{" "}
        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.gilt }}>Save to Notebook</span>{" "}
        to build a reusable story bank.
      </p>
    </div>
  );
}

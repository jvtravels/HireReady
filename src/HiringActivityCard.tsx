"use client";

/* Dashboard right-rail panel — the candidate-facing half of the employer
   talent-roster feature. Settings → "Visible to employers" turns matching
   on; this panel is where a candidate actually sees the effect of that
   toggle in full: shortlisted/contacted counts, and per-match detail (role,
   company, comp range, work mode, experience band, matched skills, match
   score, and when they were matched/contacted) — not just a name and a
   pill. Fetches /api/candidate-hiring-activity, which returns
   { discoverable: false } immediately for anyone who hasn't opted in, so
   this renders a lightweight opt-in nudge rather than empty data. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "./supabase";
import { tokens as t, fonts as f } from "./auth/_tokens";
import { daysAgo, formatComp, formatExperience, WORK_MODE_LABEL } from "./hiringMatchFormat";

interface HiringMatch {
  roleTitle: string;
  companyName: string;
  location: string;
  workMode: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  skills: string[];
  matchScore: number;
  unlocked: boolean;
  matchedAt: string;
  unlockedAt: string | null;
}

// Everything beyond this teaser count lives on the dedicated Jobs tab —
// the dashboard card's job is to prompt a visit, not be the full list.
const DASHBOARD_TEASER_LIMIT = 3;

interface HiringActivity {
  discoverable: boolean;
  shortlistedCount?: number;
  unlockedCount?: number;
  recent?: HiringMatch[];
}

export default function HiringActivityCard() {
  const router = useRouter();
  const [data, setData] = useState<HiringActivity | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/candidate-hiring-activity", { headers });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json) setData(json as HiringActivity);
      } catch {
        // stay quiet on transient failure — this is a nice-to-have, not core flow
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const boxStyle: React.CSSProperties = {
    padding: "18px",
    background: t.creamSoft,
    border: `1px solid ${t.line}`,
    borderRadius: 10,
  };

  const label = (
    <p style={{ fontFamily: f.mono, fontSize: 11, letterSpacing: 0.5, color: t.inkSoft, margin: "0 0 10px", textTransform: "uppercase" }}>
      Hiring activity
    </p>
  );

  if (!data.discoverable) {
    return (
      <div style={boxStyle}>
        {label}
        <p style={{ fontFamily: f.sans, fontSize: 13, color: t.coal, margin: "0 0 8px", lineHeight: 1.5 }}>
          Turn on "Visible to employers" in Settings to let companies on our talent roster match you to open roles.
        </p>
        <p style={{ fontFamily: f.sans, fontSize: 11.5, color: t.inkFaint, margin: "0 0 12px", lineHeight: 1.5 }}>
          Once on, employers with a matching role see your resume, skills, and practice history — and can unlock your
          contact details to reach out directly. You can turn it back off anytime.
        </p>
        <button
          type="button"
          onClick={() => router.push("/settings")}
          style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.lineStrong}`,
            background: "transparent", color: t.coal, fontFamily: f.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          Open Settings
        </button>
      </div>
    );
  }

  const shortlisted = data.shortlistedCount ?? 0;
  const unlocked = data.unlockedCount ?? 0;
  const matches = (data.recent || []).slice(0, DASHBOARD_TEASER_LIMIT);

  return (
    <div style={boxStyle}>
      {label}

      {shortlisted === 0 ? (
        <p style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft, margin: 0, lineHeight: 1.5 }}>
          You're visible to employers. No matches yet — we'll surface this the moment a role fits your profile.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 20, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${t.line}` }}>
            <div>
              <div style={{ fontFamily: f.serif, fontSize: 26, color: t.coal, lineHeight: 1 }}>{shortlisted}</div>
              <div style={{ fontFamily: f.sans, fontSize: 11.5, color: t.inkSoft, marginTop: 2 }}>Shortlisted for</div>
            </div>
            <div>
              <div style={{ fontFamily: f.serif, fontSize: 26, color: t.coal, lineHeight: 1 }}>{unlocked}</div>
              <div style={{ fontFamily: f.sans, fontSize: 11.5, color: t.inkSoft, marginTop: 2 }}>Contacted you</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {matches.map((r, i) => {
              const comp = formatComp(r.budgetMin, r.budgetMax);
              const exp = formatExperience(r.experienceMin, r.experienceMax);
              const mode = r.workMode ? WORK_MODE_LABEL[r.workMode] || r.workMode : null;
              return (
                <div
                  key={i}
                  style={{
                    padding: "12px", borderRadius: 8,
                    background: r.unlocked ? t.indigo100 : t.cream,
                    border: `1px solid ${r.unlocked ? t.indigoDeep : t.line}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 700, color: t.coal, minWidth: 0 }}>
                      {r.roleTitle}
                    </div>
                    {r.unlocked ? (
                      <span style={{
                        flexShrink: 0, fontFamily: f.mono, fontSize: 10, letterSpacing: 0.4, color: t.indigoDeep,
                        background: t.cream, padding: "3px 8px", borderRadius: 999,
                      }}>
                        CONTACTED
                      </span>
                    ) : (
                      <span style={{
                        flexShrink: 0, fontFamily: f.mono, fontSize: 10, letterSpacing: 0.4, color: t.inkSoft,
                        background: t.cream, padding: "3px 8px", borderRadius: 999,
                      }}>
                        {r.matchScore}% MATCH
                      </span>
                    )}
                  </div>

                  <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, marginBottom: 6 }}>
                    {r.companyName}{r.location ? ` · ${r.location}` : ""}{mode ? ` · ${mode}` : ""}
                  </div>

                  {(comp || exp) && (
                    <div style={{ display: "flex", gap: 12, fontFamily: f.sans, fontSize: 11.5, color: t.inkFaint, marginBottom: r.skills.length ? 8 : 6 }}>
                      {comp && <span>{comp}</span>}
                      {exp && <span>{exp} exp</span>}
                    </div>
                  )}

                  {r.skills.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {r.skills.map((s, si) => (
                        <span key={si} style={{
                          fontFamily: f.sans, fontSize: 10.5, color: t.coal, background: t.cream,
                          border: `1px solid ${t.line}`, padding: "2px 7px", borderRadius: 999,
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ fontFamily: f.sans, fontSize: 10.5, color: t.inkFaint }}>
                    {r.unlocked && r.unlockedAt
                      ? `Contacted ${daysAgo(r.unlockedAt)} · matched ${daysAgo(r.matchedAt)}`
                      : `Matched ${daysAgo(r.matchedAt)}`}
                  </div>
                </div>
              );
            })}
          </div>

          {shortlisted > matches.length && (
            <button
              type="button"
              onClick={() => router.push("/jobs")}
              style={{
                marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 8,
                border: `1px solid ${t.lineStrong}`, background: "transparent", color: t.coal,
                fontFamily: f.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              View all {shortlisted} matches →
            </button>
          )}
        </>
      )}
    </div>
  );
}

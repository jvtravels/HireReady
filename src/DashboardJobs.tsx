"use client";

/* Dedicated Jobs tab — the full-detail counterpart to the dashboard's
   HiringActivityCard teaser. Companies pick candidates off the talent
   roster; there's no apply flow, so this page is a read-only, complete
   view of every match: full role detail, employer branding, and status,
   rather than the top-3 summary shown on the dashboard. Fetches
   /api/candidate-hiring-activity?full=1 to get the uncapped list plus
   the extra fields (notice period, responsibilities, perks, etc.) the
   dashboard card doesn't render. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "./supabase";
import { tokens as t, fonts as f } from "./auth/_tokens";
import { daysAgo, WORK_MODE_LABEL } from "./hiringMatchFormat";
import JobDetailModal from "./JobDetailModal";

export interface JobMatch {
  roleTitle: string;
  companyName: string;
  companyLogoPath: string | null;
  companyWebsite: string | null;
  location: string;
  workMode: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  skills: string[];
  noticePeriodPref: string | null;
  openPositions: number | null;
  description: string | null;
  responsibilities: string | null;
  niceToHave: string | null;
  perksAndBenefits: string[];
  preferredIndustry: string | null;
  dueDate: string | null;
  status: string | null;
  matchScore: number;
  unlocked: boolean;
  matchedAt: string;
  unlockedAt: string | null;
}

interface HiringActivity {
  discoverable: boolean;
  shortlistedCount?: number;
  unlockedCount?: number;
  recent?: JobMatch[];
}

export default function DashboardJobs() {
  const router = useRouter();
  const [data, setData] = useState<HiringActivity | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<JobMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/candidate-hiring-activity?full=1", { headers });
        const json = await res.json().catch(() => null);
        if (!cancelled) {
          if (res.ok && json) setData(json as HiringActivity);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const heading = (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontFamily: f.serif, fontSize: 28, color: t.coal, margin: "0 0 6px" }}>Jobs</h1>
      <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, margin: 0, lineHeight: 1.5 }}>
        Employers on our talent roster match to your profile and reach out directly — there's nothing to apply to here.
      </p>
    </div>
  );

  if (!loaded) {
    return <div style={{ maxWidth: 760 }}>{heading}</div>;
  }

  if (!data || !data.discoverable) {
    return (
      <div style={{ maxWidth: 760 }}>
        {heading}
        <div style={{ padding: 20, background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 10 }}>
          <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, margin: "0 0 8px", lineHeight: 1.5 }}>
            Turn on "Visible to employers" in Settings to let companies on our talent roster match you to open roles.
          </p>
          <p style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint, margin: "0 0 14px", lineHeight: 1.5 }}>
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
      </div>
    );
  }

  const shortlisted = data.shortlistedCount ?? 0;
  const unlocked = data.unlockedCount ?? 0;
  const matches = data.recent || [];

  return (
    <div style={{ maxWidth: 760 }}>
      {heading}

      {shortlisted === 0 ? (
        <div style={{ padding: 20, background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 10 }}>
          <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, margin: 0, lineHeight: 1.5 }}>
            You're visible to employers. No matches yet — we'll surface this the moment a role fits your profile.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 28, marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${t.line}` }}>
            <div>
              <div style={{ fontFamily: f.serif, fontSize: 30, color: t.coal, lineHeight: 1 }}>{shortlisted}</div>
              <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, marginTop: 3 }}>Shortlisted for</div>
            </div>
            <div>
              <div style={{ fontFamily: f.serif, fontSize: 30, color: t.coal, lineHeight: 1 }}>{unlocked}</div>
              <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkSoft, marginTop: 3 }}>Contacted you</div>
            </div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${t.line}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: f.sans }}>
              <thead>
                <tr>
                  {["Role", "Company", "Location", "Status", "Matched"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left", padding: "10px 14px", fontSize: 11, letterSpacing: 0.4,
                        textTransform: "uppercase", color: t.inkFaint, background: t.creamSoft,
                        borderBottom: `1px solid ${t.line}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map((r, i) => {
                  const mode = r.workMode ? WORK_MODE_LABEL[r.workMode] || r.workMode : null;
                  const closed = r.status === "closed" || r.status === "failed";
                  return (
                    <tr
                      key={i}
                      tabIndex={0}
                      role="button"
                      aria-label={`View details for ${r.roleTitle} at ${r.companyName}`}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(r); }
                      }}
                      style={{
                        cursor: "pointer",
                        background: r.unlocked ? t.indigo100 : "transparent",
                        borderBottom: i < matches.length - 1 ? `1px solid ${t.line}` : "none",
                      }}
                    >
                      <td style={{ padding: "12px 14px", fontSize: 13.5, fontWeight: 600, color: t.coal }}>
                        {r.roleTitle}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: t.inkSoft }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {r.companyLogoPath ? (
                            <img
                              src={r.companyLogoPath}
                              alt={`${r.companyName} logo`}
                              width={22}
                              height={22}
                              style={{ borderRadius: 5, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.line}` }}
                            />
                          ) : (
                            <div style={{
                              width: 22, height: 22, borderRadius: 5, background: t.cream, border: `1px solid ${t.line}`,
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              fontFamily: f.serif, fontSize: 11, color: t.inkSoft,
                            }}>
                              {r.companyName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {r.companyName}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: t.inkSoft }}>
                        {r.location || "Not specified"}{mode ? ` · ${mode}` : ""}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {r.unlocked ? (
                            <span style={{
                              fontFamily: f.mono, fontSize: 10.5, letterSpacing: 0.4, color: t.indigoDeep,
                              background: t.cream, padding: "3px 9px", borderRadius: 999,
                            }}>
                              CONTACTED
                            </span>
                          ) : (
                            <span style={{
                              fontFamily: f.mono, fontSize: 10.5, letterSpacing: 0.4, color: t.inkSoft,
                              background: t.cream, padding: "3px 9px", borderRadius: 999,
                            }}>
                              {r.matchScore}% MATCH
                            </span>
                          )}
                          {closed && !r.unlocked && (
                            <span style={{
                              fontFamily: f.mono, fontSize: 10, letterSpacing: 0.4, color: t.inkFaint,
                              background: t.cream, padding: "2px 8px", borderRadius: 999,
                            }}>
                              ROLE CLOSED
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: t.inkFaint, whiteSpace: "nowrap" }}>
                        {daysAgo(r.matchedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && <JobDetailModal job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

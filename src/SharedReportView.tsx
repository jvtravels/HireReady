"use client";
import { useEffect, useState } from "react";
import { c, font } from "./tokens";
import type { SessionReport } from "./dashboardData";

/**
 * Public read-only view rendered at /report/share/[token].
 * Fetches a sanitized report from /api/share-report?token=... — no auth.
 * Sensitive fields (transcripts, full per-question content, verbatim
 * quotes) are stripped server-side unless the candidate opted in
 * when they generated the link.
 */

interface SharedReportPayload {
  report: Partial<SessionReport> | null;
  meta: {
    candidateName: string;
    targetRole: string;
    targetCompany: string;
    sessionType: string;
    difficulty: string;
    score: number;
    durationSec: number;
    date: string;
    skillScores: Record<string, unknown> | null;
  };
  expiresAt: string;
  includeTranscript: boolean;
  includePerQuestion: boolean;
}

const BAND_META: Record<string, { label: string; color: string; bg: string }> = {
  strongHire:   { label: "Strong Hire",    color: c.sage,  bg: "rgba(122,158,126,0.10)" },
  hire:         { label: "Hire",           color: c.sage,  bg: "rgba(122,158,126,0.06)" },
  leanHire:     { label: "Lean Hire",      color: c.gilt,  bg: "rgba(212,179,127,0.08)" },
  noHire:       { label: "No Hire",        color: c.ember, bg: "rgba(196,112,90,0.06)" },
  strongNoHire: { label: "Strong No Hire", color: c.ember, bg: "rgba(196,112,90,0.10)" },
};

export default function SharedReportView({ token }: { token: string }) {
  const [data, setData] = useState<SharedReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/share-report?token=${encodeURIComponent(token)}`, { method: "GET" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        setData(body as SharedReportPayload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load report");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, padding: "32px 20px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Branding header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: font.display, fontSize: 16, color: c.obsidian, fontWeight: 700,
          }}>H</div>
          <span style={{ fontFamily: font.display, fontSize: 18, fontWeight: 400, color: c.ivory, letterSpacing: "-0.01em" }}>HireStepX</span>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginLeft: "auto" }}>Shared Interview Report</span>
        </div>

        {loading && (
          <div role="status" aria-live="polite" style={{ background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: `3px solid rgba(212,179,127,0.18)`, borderTopColor: c.gilt, borderRadius: "50%", margin: "0 auto 16px", animation: "srspin 0.9s linear infinite" }} />
            <style>{`@keyframes srspin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: 0 }}>Loading report…</p>
          </div>
        )}

        {error && (
          <div role="alert" style={{ background: c.graphite, border: `1px solid rgba(196,112,90,0.25)`, borderRadius: 14, padding: "32px", textAlign: "center" }}>
            <p style={{ fontFamily: font.display, fontSize: 22, color: c.ivory, margin: "0 0 8px", fontWeight: 400, letterSpacing: "-0.01em" }}>This link isn&apos;t available</p>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, margin: 0 }}>{error}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 16 }}>
              Ask the candidate to send a fresh link, or visit{" "}
              <a href="https://hirestepx.com" style={{ color: c.gilt, textDecoration: "underline" }}>hirestepx.com</a>{" "}
              to learn more.
            </p>
          </div>
        )}

        {data && data.report && <ReportBody data={data} />}
      </div>
    </div>
  );
}

function ReportBody({ data }: { data: SharedReportPayload }) {
  const { report, meta } = data;
  if (!report) return null;
  const bandKey = report.band || "leanHire";
  const bandMeta = BAND_META[bandKey] || BAND_META.leanHire;
  const skills = (report.skills as Array<{ name: string; score: number }> | undefined) || [];
  const wins = (report.wins as Array<{ text: string; questionIdx: number }> | undefined) || [];
  const fixes = (report.fixes as Array<{ text: string; questionIdx: number }> | undefined) || [];

  const expiresAtFormatted = new Date(data.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const minutes = Math.round((meta.durationSec || 0) / 60);
  const dateFormatted = new Date(meta.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      {/* Hero — score + band + meta + verdict */}
      <div style={{
        background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
        padding: "28px 32px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <span style={{
              display: "inline-block", fontFamily: font.ui, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: bandMeta.color, background: bandMeta.bg, padding: "4px 10px", borderRadius: 4, marginBottom: 10,
            }}>{bandMeta.label}</span>
            <h1 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              {meta.candidateName}
            </h1>
            {report.verdict && (
              <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.6, margin: "0 0 12px", maxWidth: 560 }}>
                {String(report.verdict)}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: font.ui, fontSize: 11, color: c.stone }}>
              <span>{meta.targetRole}</span>
              {meta.targetCompany && <><span>·</span><span>{meta.targetCompany}</span></>}
              <span>·</span>
              <span style={{ textTransform: "capitalize" }}>{meta.sessionType}</span>
              <span>·</span>
              <span style={{ textTransform: "capitalize" }}>{meta.difficulty}</span>
              <span>·</span>
              <span>{minutes} min</span>
              <span>·</span>
              <span>{dateFormatted}</span>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: font.mono, fontSize: 56, fontWeight: 700, color: c.ivory, lineHeight: 1 }}>
              {report.overallScore ?? meta.score}
            </div>
            <div style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 4 }}>/ 100</div>
          </div>
        </div>

        {/* Wins / Fixes */}
        {(wins.length > 0 || fixes.length > 0) && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14, marginTop: 20,
          }}>
            {wins.length > 0 && <WinFixList items={wins} label="What worked" tone="win" />}
            {fixes.length > 0 && <WinFixList items={fixes} label="What to fix" tone="fix" />}
          </div>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div style={{
          background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
          padding: "22px 28px", marginBottom: 20,
        }}>
          <h2 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, margin: "0 0 14px" }}>Skills</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {skills.map((s) => {
              const pct = Math.max(0, Math.min(100, s.score));
              const barColor = pct >= 70 ? c.sage : pct >= 50 ? c.gilt : c.ember;
              return (
                <div key={s.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory }}>{s.name}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: barColor }}>{pct}</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(245,242,237,0.05)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer / expiry / CTA */}
      <div style={{
        background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 14,
        padding: "20px 28px", textAlign: "center",
      }}>
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "0 0 12px" }}>
          This shared link expires {expiresAtFormatted}.
          {!data.includeTranscript && !data.includePerQuestion && (
            <> · Transcript and per-question answers were hidden by the candidate.</>
          )}
        </p>
        <a
          href="https://hirestepx.com"
          style={{
            display: "inline-block",
            fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            border: "none", borderRadius: 10, padding: "10px 22px",
            textDecoration: "none",
            boxShadow: "0 6px 18px rgba(212,179,127,0.18)",
          }}
        >Practice your own interview →</a>
      </div>
    </>
  );
}

function WinFixList({ items, label, tone }: {
  items: Array<{ text: string; questionIdx: number }>;
  label: string;
  tone: "win" | "fix";
}) {
  const accent = tone === "win" ? c.sage : c.gilt;
  const bg = tone === "win" ? "rgba(122,158,126,0.05)" : "rgba(212,179,127,0.05)";
  const border = tone === "win" ? "rgba(122,158,126,0.18)" : "rgba(212,179,127,0.18)";
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 10,
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <span style={{
        fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: accent,
        letterSpacing: "0.08em", textTransform: "uppercase",
      }}>{label}</span>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {items.slice(0, 3).map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: accent, flexShrink: 0 }} />
            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, lineHeight: 1.5 }}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

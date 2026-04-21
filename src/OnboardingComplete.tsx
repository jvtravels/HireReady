"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { getUserSessions } from "./supabase";

function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 70) return c.gilt;
  return c.ember;
}

function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  return "Keep Practicing";
}

export default function OnboardingComplete() {
  const router = useRouter();
  const { user } = useAuth();

  const [stateData, setStateData] = useState<Record<string, unknown>>(() => {
    try {
      const raw = sessionStorage.getItem("hirestepx_onboarding_result");
      if (raw) { sessionStorage.removeItem("hirestepx_onboarding_result"); return JSON.parse(raw); }
    } catch { /* expected */ }
    return {};
  });
  const [loading, setLoading] = useState(!stateData.score);

  useEffect(() => {
    if (stateData.score || !user?.id) { setLoading(false); return; }
    getUserSessions(user.id).then(sessions => {
      if (sessions.length > 0) {
        const latest = sessions[0];
        setStateData({
          score: latest.score ?? 72,
          aiFeedback: latest.ai_feedback ?? "",
          skillScores: latest.skill_scores ?? null,
        });
      } else if (user.hasCompletedOnboarding) {
        router.replace("/dashboard");
      } else {
        router.replace("/onboarding");
      }
      setLoading(false);
    }).catch(() => {
      router.replace(user.hasCompletedOnboarding ? "/dashboard" : "/onboarding");
    });
  }, [user?.id]);

  const score: number = (stateData.score as number) || 72;
  const aiFeedback: string = (stateData.aiFeedback as string) || "";
  const skillScores: Record<string, number> | null = (stateData.skillScores as Record<string, number>) || null;
  const weakestSkill = skillScores
    ? Object.entries(skillScores).sort(([, a], [, b]) => (a as number) - (b as number))[0]?.[0] || null
    : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${c.border}`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone }}>Loading your results...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>HireStepX</span>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 540, animation: "obcFadeIn 0.6s ease both" }}>

          {/* Score Section */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16, animation: "obcFadeIn 0.5s ease 0.2s both" }}>Your Practice Score</p>

            <div style={{
              width: 100, height: 100, borderRadius: "50%", margin: "0 auto 16px",
              background: `conic-gradient(${scoreLabelColor(score)} ${score * 3.6}deg, ${c.graphite} 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 40px ${scoreLabelColor(score)}20`,
              animation: "obcScaleIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both",
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", background: c.obsidian,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: scoreLabelColor(score) }}>{score}</span>
              </div>
            </div>

            <span style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: scoreLabelColor(score),
              display: "inline-block", padding: "4px 14px", borderRadius: 20,
              background: `${scoreLabelColor(score)}15`, border: `1px solid ${scoreLabelColor(score)}30`,
            }}>
              {scoreLabel(score)}
            </span>

            {aiFeedback && (
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, marginTop: 16, maxWidth: 440, margin: "16px auto 0" }}>
                {aiFeedback}
              </p>
            )}

            {/* Skill breakdown */}
            {skillScores && Object.keys(skillScores).length > 0 && (
              <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                {Object.entries(skillScores).map(([skill, s]) => (
                  <span key={skill} style={{
                    fontFamily: font.ui, fontSize: 11, color: scoreLabelColor(s as number),
                    background: `${scoreLabelColor(s as number)}10`, border: `1px solid ${scoreLabelColor(s as number)}20`,
                    borderRadius: 10, padding: "4px 10px",
                  }}>
                    {skill}: {s as number}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* What's next — retention-focused */}
          <div style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "28px", marginBottom: 32,
            animation: "obcFadeIn 0.5s ease 0.6s both",
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Great first session{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 8, lineHeight: 1.6 }}>
                {weakestSkill
                  ? `Session 2 will target your biggest growth area: ${weakestSkill}. Most users improve 15+ points after focused practice.`
                  : "Session 2 will dig deeper into targeted practice. Most users improve 15+ points after focused sessions."}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
              {[
                { num: "1", label: "Warmup", done: true },
                { num: "2", label: weakestSkill ? `Focus: ${weakestSkill}` : "Focus Session", done: false },
                { num: "3", label: "Full Simulation", done: false },
              ].map(s => (
                <div key={s.num} style={{
                  padding: "12px", borderRadius: 10, textAlign: "center",
                  background: s.done ? "rgba(122,158,126,0.06)" : "rgba(245,242,237,0.02)",
                  border: `1px solid ${s.done ? "rgba(122,158,126,0.2)" : c.border}`,
                  opacity: s.done ? 1 : 0.6,
                }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: s.done ? c.sage : c.stone, letterSpacing: "0.06em" }}>
                    {s.done ? "DONE" : `SESSION ${s.num}`}
                  </span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, display: "block", marginTop: 4 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animation: "obcFadeIn 0.5s ease 0.8s both" }}>
            <button
              onClick={() => router.push("/session/new")}
              className="shimmer-btn"
              style={{
                fontFamily: font.ui, fontSize: 15, fontWeight: 600,
                padding: "16px 44px", borderRadius: 10, border: "none",
                background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                color: c.obsidian, cursor: "pointer",
                transition: "all 0.25s ease",
                display: "inline-flex", alignItems: "center", gap: 10,
                boxShadow: "0 8px 32px rgba(212,179,127,0.25)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(212,179,127,0.35)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(212,179,127,0.25)"; }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
              Continue to Session 2
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
              onMouseLeave={(e) => e.currentTarget.style.color = c.stone}
            >
              Go to dashboard
            </button>
          </div>

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes obcFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes obcScaleIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
          `}</style>
        </div>
      </div>
    </div>
  );
}

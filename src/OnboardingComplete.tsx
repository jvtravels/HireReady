"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { getUserSessions } from "./supabase";
import { FREE_SESSION_LIMIT } from "./dashboardData";
import { captureClientEvent } from "./posthogClient";

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
  const [sessionCount, setSessionCount] = useState(1);

  useEffect(() => {
    captureClientEvent("onboarding_completed", { user_id: user?.id || null });
    if (stateData.score || !user?.id) { setLoading(false); return; }
    getUserSessions(user.id).then(sessions => {
      setSessionCount(sessions.length || 1);
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

          {/* Share your score */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 28, animation: "obcFadeIn 0.5s ease 0.5s both" }}>
            <button onClick={() => {
              const text = `I just scored ${score}/100 on my first AI mock interview on HireStepX!\n\n${skillScores ? Object.entries(skillScores).map(([k, v]) => `${k}: ${v}`).join(" · ") + "\n\n" : ""}Practice your interviews with AI: https://app.hirestepx.com\n\n#InterviewPrep #HireStepX #MockInterview`;
              if (navigator.share) { navigator.share({ text }).catch(() => {}); }
              else { navigator.clipboard.writeText(text).then(() => {}); }
            }} style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone,
              background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: "8px 16px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share Score
            </button>
            <button onClick={() => {
              const text = encodeURIComponent(`Just scored ${score}/100 on my first AI mock interview on HireStepX!\n\nAI-powered interview practice is a game-changer.\n\n#InterviewPrep #HireStepX #MockInterview #CareerGrowth`);
              window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://app.hirestepx.com")}&text=${text}`, "_blank", "noopener,noreferrer");
            }} style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone,
              background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: "8px 16px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              LinkedIn
            </button>
            <button onClick={() => {
              const text = encodeURIComponent(`I just scored ${score}/100 on my first AI mock interview on HireStepX!\n\nPractice yours: https://app.hirestepx.com`);
              window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
            }} style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone,
              background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8,
              padding: "8px 16px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,179,127,0.3)"; e.currentTarget.style.color = c.ivory; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>
          </div>

          {/* Contextual upgrade nudge based on score & session count */}
          {(!user?.subscriptionTier || user.subscriptionTier === "free") && (
            <div style={{
              background: score >= 70 ? "rgba(122,158,126,0.06)" : "rgba(212,179,127,0.06)",
              borderRadius: 14, border: `1px solid ${score >= 70 ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
              padding: "20px 24px", marginBottom: 24, textAlign: "center",
              animation: "obcFadeIn 0.5s ease 0.55s both",
            }}>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, fontWeight: 500, marginBottom: 4 }}>
                {sessionCount === 1
                  ? "Unlock 15-minute sessions for deeper, more realistic interview practice."
                  : score >= 85
                    ? "You're already interview-ready — longer sessions will sharpen your edge."
                    : score >= 70
                      ? "Great progress! 15-min sessions unlock deeper practice to push past 85."
                      : `${FREE_SESSION_LIMIT - sessionCount <= 0 ? "You've used all" : `Only ${FREE_SESSION_LIMIT - sessionCount}`} free session${FREE_SESSION_LIMIT - sessionCount === 1 ? "" : "s"} left — upgrade to keep improving.`}
              </p>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 12 }}>
                {score >= 70 ? "Pro users improve 2× faster with extended sessions and analytics." : "Most users see 15+ point improvement with focused practice."}
              </p>
              <button
                onClick={() => router.push("/dashboard?upgrade=1")}
                style={{
                  fontFamily: font.ui, fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: 8,
                  border: "none", background: "rgba(212,179,127,0.15)", color: c.gilt, cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.15)"; }}
              >
                View Plans — from ₹10/session
              </button>
            </div>
          )}

          {/* What's next — retention or graduation */}
          {sessionCount >= FREE_SESSION_LIMIT ? (
            <div style={{
              background: `linear-gradient(135deg, rgba(212,179,127,0.08) 0%, ${c.graphite} 100%)`,
              borderRadius: 14, border: `1px solid rgba(212,179,127,0.2)`,
              padding: "32px 28px", marginBottom: 32, textAlign: "center",
              animation: "obcFadeIn 0.5s ease 0.6s both",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎓</div>
              <span style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory }}>
                Curriculum Complete{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
              </span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 8, lineHeight: 1.6, maxWidth: 380, margin: "8px auto 0" }}>
                You've finished all {FREE_SESSION_LIMIT} free sessions. Your score went from your first session to {score} — that's real progress.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 20, marginBottom: 20 }}>
                {[
                  { num: "1", label: "Warmup", done: true },
                  { num: "2", label: weakestSkill ? `Focus: ${weakestSkill}` : "Focus", done: true },
                  { num: "3", label: "Challenge", done: true },
                ].map(s => (
                  <div key={s.num} style={{
                    padding: "12px", borderRadius: 10, textAlign: "center",
                    background: "rgba(122,158,126,0.06)", border: "1px solid rgba(122,158,126,0.2)",
                  }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.sage, letterSpacing: "0.06em" }}>DONE</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, display: "block", marginTop: 4 }}>{s.label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.gilt, marginBottom: 16 }}>
                Keep your momentum — upgrade to continue practicing with longer sessions, analytics, and AI coaching.
              </p>
              <button
                onClick={() => router.push("/dashboard?upgrade=1")}
                style={{
                  fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "12px 32px", borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer",
                  boxShadow: "0 8px 32px rgba(212,179,127,0.25)", transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(212,179,127,0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(212,179,127,0.25)"; }}
              >
                Upgrade — from ₹10/session
              </button>
            </div>
          ) : (
            <div style={{
              background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
              padding: "28px", marginBottom: 32,
              animation: "obcFadeIn 0.5s ease 0.6s both",
            }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>
                  {sessionCount === 1 ? "Great first session" : `Session ${sessionCount} complete`}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
                </span>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 8, lineHeight: 1.6 }}>
                  {weakestSkill
                    ? `Session ${sessionCount + 1} will target your biggest growth area: ${weakestSkill}. Most users improve 15+ points after focused practice.`
                    : `Session ${sessionCount + 1} will dig deeper into targeted practice. Most users improve 15+ points after focused sessions.`}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
                {[
                  { num: "1", label: "Warmup", done: sessionCount >= 1 },
                  { num: "2", label: weakestSkill ? `Focus: ${weakestSkill}` : "Focus Session", done: sessionCount >= 2 },
                  { num: "3", label: "Full Simulation", done: sessionCount >= 3 },
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
          )}

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animation: "obcFadeIn 0.5s ease 0.8s both" }}>
            <button
              onClick={() => sessionCount >= FREE_SESSION_LIMIT ? router.push("/dashboard?upgrade=1") : router.push("/session/new")}
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
              {sessionCount >= FREE_SESSION_LIMIT ? "Upgrade to Keep Practicing" : `Continue to Session ${sessionCount + 1}`}
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

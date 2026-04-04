import { useNavigate, useLocation } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";

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
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = (location.state as any) || {};
  const score: number = state.score || 72;
  const aiFeedback: string = state.aiFeedback || "";
  const skillScores: Record<string, number> | null = state.skillScores || null;

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>HireReady</span>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px", overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 540 }}>

          {/* Score Section */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Your Practice Score</p>

            <div style={{
              width: 100, height: 100, borderRadius: "50%", margin: "0 auto 16px",
              background: `conic-gradient(${scoreLabelColor(score)} ${score * 3.6}deg, ${c.graphite} 0deg)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 40px ${scoreLabelColor(score)}20`,
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
                    borderRadius: 6, padding: "4px 10px",
                  }}>
                    {skill}: {s as number}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* What's next */}
          <div style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "28px", marginBottom: 32, textAlign: "center",
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Great first session{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</span>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginTop: 8, lineHeight: 1.6 }}>
              Your profile is set up and ready. Start a full session to get deeper feedback, or explore your dashboard to track progress over time.
            </p>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => navigate("/session/new")}
              className="shimmer-btn"
              style={{
                fontFamily: font.ui, fontSize: 15, fontWeight: 600,
                padding: "16px 44px", borderRadius: 10, border: "none",
                background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`,
                color: c.obsidian, cursor: "pointer",
                transition: "all 0.25s ease",
                display: "inline-flex", alignItems: "center", gap: 10,
                boxShadow: "0 8px 32px rgba(201,169,110,0.25)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(201,169,110,0.35)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.25)"; }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
              Start a Full Session
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
              onMouseLeave={(e) => e.currentTarget.style.color = c.stone}
            >
              Go to dashboard
            </button>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  );
}

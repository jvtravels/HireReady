import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";

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
  const { user, updateUser } = useAuth();
  const state = (location.state as any) || {};
  const score: number = state.score || 72;
  const aiFeedback: string = state.aiFeedback || "";
  const skillScores: Record<string, number> | null = state.skillScores || null;

  // Optional personalization fields
  const [company, setCompany] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [fileName, setFileName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeParsed, setResumeParsed] = useState<ParsedResume | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setResumeError("");
    setResumeParsing(true);
    try {
      const text = await extractResumeText(file);
      const data = parseResumeData(text);
      setResumeText(text);
      setResumeParsed(data);
    } catch (err: any) {
      setResumeError(err.message || "Failed to parse resume");
      setResumeText("");
      setResumeParsed(null);
    } finally {
      setResumeParsing(false);
    }
  };

  const handleStartFullSession = () => {
    // Save any optional data the user provided
    const updates: Record<string, any> = {};
    if (company.trim()) updates.targetCompany = company.trim();
    if (interviewDate) updates.interviewDate = interviewDate;
    if (fileName) {
      updates.resumeFileName = fileName;
      if (resumeText) updates.resumeText = resumeText;
      if (resumeParsed) updates.resumeData = resumeParsed;
    }
    if (Object.keys(updates).length > 0) updateUser(updates);
    navigate("/session/new");
  };

  const handleGoDashboard = () => {
    const updates: Record<string, any> = {};
    if (company.trim()) updates.targetCompany = company.trim();
    if (interviewDate) updates.interviewDate = interviewDate;
    if (fileName) {
      updates.resumeFileName = fileName;
      if (resumeText) updates.resumeText = resumeText;
      if (resumeParsed) updates.resumeData = resumeParsed;
    }
    if (Object.keys(updates).length > 0) updateUser(updates);
    navigate("/dashboard");
  };

  const daysUntilInterview = interviewDate
    ? Math.max(0, Math.ceil((new Date(interviewDate).getTime() - Date.now()) / 86400000))
    : null;

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

          {/* Personalization section */}
          <div style={{
            background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
            padding: "28px", marginBottom: 32,
          }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Make your next session even better</span>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 4, lineHeight: 1.5 }}>These are optional — add them now or anytime from Settings.</p>
            </div>

            {/* Resume upload */}
            <div style={{ marginTop: 20 }}>
              <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
                Resume <span style={{ color: c.stone, fontWeight: 400 }}> — get questions from your experience</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileChange(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${isDragging ? c.gilt : fileName ? c.sage : "rgba(201,169,110,0.2)"}`,
                  borderRadius: 10, padding: fileName ? "12px 16px" : "20px 16px",
                  textAlign: "center", cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: isDragging ? "rgba(201,169,110,0.04)" : fileName ? "rgba(122,158,126,0.04)" : "transparent",
                }}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                {fileName ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {resumeParsing ? (
                        <div style={{ width: 14, height: 14, border: `2px solid rgba(201,169,110,0.3)`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      ) : resumeError ? (
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                      ) : (
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory }}>{fileName}</span>
                      {resumeParsed && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage }}>{resumeParsed.skills.length} skills found</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); }}
                      style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Drop resume or click to browse</span>
                    <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone, background: c.obsidian, padding: "2px 6px", borderRadius: 3, border: `1px solid ${c.border}` }}>PDF</span>
                  </div>
                )}
              </div>
              {resumeError && <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>{resumeError}</p>}
            </div>

            {/* Target company */}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="ob-company" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
                Target company <span style={{ color: c.stone, fontWeight: 400 }}> — we'll match their interview style</span>
              </label>
              <input
                id="ob-company" type="text" value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google, Stripe, Series B startup..."
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: c.obsidian, border: `1.5px solid ${c.border}`,
                  color: c.ivory, fontFamily: font.ui, fontSize: 13,
                  outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                onBlur={(e) => e.currentTarget.style.borderColor = c.border}
              />
            </div>

            {/* Interview date */}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="ob-date" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
                Interview date <span style={{ color: c.stone, fontWeight: 400 }}> — we'll pace your practice</span>
              </label>
              <input
                id="ob-date" type="date" value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: c.obsidian, border: `1.5px solid ${c.border}`,
                  color: c.ivory, fontFamily: font.ui, fontSize: 13,
                  outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
                  colorScheme: "dark",
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                onBlur={(e) => e.currentTarget.style.borderColor = c.border}
              />
              {daysUntilInterview !== null && daysUntilInterview > 0 && (
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, marginTop: 4 }}>
                  {daysUntilInterview} day{daysUntilInterview !== 1 ? "s" : ""} to go — {daysUntilInterview <= 7 ? "time for focused practice!" : "plenty of time to build confidence."}
                </p>
              )}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleStartFullSession}
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
              onClick={handleGoDashboard}
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

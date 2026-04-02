import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";

const TOTAL_STEPS = 5;

const roleOptions = [
  "VP of Engineering",
  "Director of Product",
  "Senior Engineering Manager",
  "Head of Design",
  "Chief of Staff",
  "VP of Marketing",
  "Director of Operations",
  "Other",
];

const interviewTypes = [
  { id: "behavioral", label: "Behavioral", desc: "Leadership, decision-making, conflict resolution", icon: "💬" },
  { id: "strategic", label: "Strategic", desc: "Vision, roadmap, business alignment", icon: "🎯" },
  { id: "technical", label: "Technical Leadership", desc: "Architecture, system design, tech strategy", icon: "⚙️" },
  { id: "case", label: "Case Study", desc: "Problem-solving, analytical frameworks", icon: "📊" },
];

const industryOptions = [
  "SaaS / Cloud", "Fintech", "E-Commerce", "Healthcare / Biotech",
  "AI / ML", "Consumer Tech", "Enterprise", "Crypto / Web3", "Other",
];

const companyExamples = [
  "Google", "Meta", "Amazon", "Stripe", "Databricks",
  "Figma", "Notion", "Airbnb", "Series A-C Startup", "Other",
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [targetRole, setTargetRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["behavioral"]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New personalization fields
  const [targetCompany, setTargetCompany] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [learningStyle, setLearningStyle] = useState<"direct" | "encouraging">("direct");
  const [sessionLength, setSessionLength] = useState<10 | 15 | 25>(15);
  const [interviewDate, setInterviewDate] = useState("");

  const canContinue = () => {
    if (step === 1) return targetRole !== "" && (targetRole !== "Other" || customRole !== "");
    if (step === 2) return targetCompany !== "" && (targetCompany !== "Other" || customCompany !== "") && industry !== "";
    if (step === 3) return true; // resume is optional now
    if (step === 4) return true; // preferences always valid
    return true;
  };

  const [resumeText, setResumeText] = useState("");
  const [resumeParsed, setResumeParsed] = useState<ParsedResume | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");

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

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      if (step === 1) {
        const role = targetRole === "Other" ? customRole : targetRole;
        updateUser({ targetRole: role, interviewTypes: selectedTypes });
      }
      if (step === 2) {
        const company = targetCompany === "Other" ? customCompany : targetCompany;
        updateUser({ targetCompany: company, industry });
      }
      if (step === 3) {
        updateUser({ resumeFileName: fileName || null, resumeText: resumeText || undefined, resumeData: resumeParsed || undefined });
      }
      if (step === 4) {
        updateUser({ learningStyle, preferredSessionLength: sessionLength, interviewDate: interviewDate || undefined });
      }
      setStep(step + 1);
    } else {
      updateUser({ hasCompletedOnboarding: true });
      navigate("/dashboard");
    }
  };

  const stepLabels = ["Your Target", "Company & Industry", "Your Experience", "Preferences", "Ready"];

  const inputStyle = {
    width: "100%" as const, padding: "14px 18px", borderRadius: 10,
    background: c.graphite, border: `1.5px solid ${c.border}`,
    color: c.ivory, fontFamily: font.ui, fontSize: 14,
    outline: "none" as const, transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>Level Up</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{
                width: i + 1 === step ? 32 : 24, height: 4, borderRadius: 2,
                background: i + 1 <= step ? c.gilt : c.border,
                transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              }} />
            </div>
          ))}
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.stone, marginLeft: 8 }}>{step}/{TOTAL_STEPS}</span>
        </div>
        <button onClick={() => { updateUser({ hasCompletedOnboarding: true }); navigate("/dashboard"); }}
          style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", transition: "color 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
          onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
          Skip for now
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* Step 1: Role + interview types */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 40 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Step 1 — {stepLabels[0]}</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>What role are you interviewing for?</h2>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6 }}>We'll tailor every question to this role's expectations and seniority level.</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {roleOptions.map((role) => (
                  <button key={role} onClick={() => setTargetRole(role)}
                    style={{ padding: "14px 18px", borderRadius: 10, cursor: "pointer", background: targetRole === role ? "rgba(201,169,110,0.08)" : c.graphite, border: `1.5px solid ${targetRole === role ? c.gilt : c.border}`, color: targetRole === role ? c.ivory : c.chalk, fontFamily: font.ui, fontSize: 13, fontWeight: 500, textAlign: "left", transition: "all 0.25s ease", boxShadow: targetRole === role ? "0 0 20px rgba(201,169,110,0.08)" : "none" }}
                    onMouseEnter={(e) => { if (targetRole !== role) e.currentTarget.style.borderColor = c.borderHover; }}
                    onMouseLeave={(e) => { if (targetRole !== role) e.currentTarget.style.borderColor = c.border; }}>
                    {role}
                  </button>
                ))}
              </div>
              {targetRole === "Other" && (
                <input type="text" id="custom-role" aria-label="Enter your target role" value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Enter your target role" autoFocus
                  style={{ ...inputStyle, marginTop: 12 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
              )}
              <div style={{ marginTop: 32 }}>
                <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 12, letterSpacing: "0.02em" }}>Interview focus (select one or more)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {interviewTypes.map((type) => {
                    const selected = selectedTypes.includes(type.id);
                    return (
                      <button key={type.id} onClick={() => setSelectedTypes(selected ? selectedTypes.filter(t => t !== type.id) : [...selectedTypes, type.id])}
                        style={{ padding: "14px 16px", borderRadius: 10, cursor: "pointer", background: selected ? "rgba(201,169,110,0.06)" : c.graphite, border: `1.5px solid ${selected ? "rgba(201,169,110,0.3)" : c.border}`, textAlign: "left", transition: "all 0.25s ease" }}
                        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = c.borderHover; }}
                        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = c.border; }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{type.icon}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: selected ? c.ivory : c.chalk }}>{type.label}</span>
                        </div>
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4, paddingLeft: 24 }}>{type.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Company & Industry */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 40 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Step 2 — {stepLabels[1]}</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>Where are you interviewing?</h2>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6 }}>We'll adapt question style and expectations to match this company's interview culture.</p>
              </div>

              <label htmlFor="target-company" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10, letterSpacing: "0.02em" }}>Target company</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                {companyExamples.map((co) => (
                  <button key={co} onClick={() => setTargetCompany(co)}
                    style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: targetCompany === co ? "rgba(201,169,110,0.08)" : c.graphite, border: `1.5px solid ${targetCompany === co ? c.gilt : c.border}`, color: targetCompany === co ? c.ivory : c.chalk, fontFamily: font.ui, fontSize: 12, fontWeight: 500, textAlign: "center", transition: "all 0.2s ease" }}
                    onMouseEnter={(e) => { if (targetCompany !== co) e.currentTarget.style.borderColor = c.borderHover; }}
                    onMouseLeave={(e) => { if (targetCompany !== co) e.currentTarget.style.borderColor = c.border; }}>
                    {co}
                  </button>
                ))}
              </div>
              {targetCompany === "Other" && (
                <input type="text" id="target-company" aria-label="Enter company name" value={customCompany} onChange={(e) => setCustomCompany(e.target.value)} placeholder="Enter company name" autoFocus
                  style={{ ...inputStyle, marginBottom: 8 }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
              )}

              <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10, marginTop: 28, letterSpacing: "0.02em" }}>Industry</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {industryOptions.map((ind) => (
                  <button key={ind} onClick={() => setIndustry(ind)}
                    style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: industry === ind ? "rgba(201,169,110,0.08)" : c.graphite, border: `1.5px solid ${industry === ind ? c.gilt : c.border}`, color: industry === ind ? c.ivory : c.chalk, fontFamily: font.ui, fontSize: 12, fontWeight: 500, textAlign: "center", transition: "all 0.2s ease" }}
                    onMouseEnter={(e) => { if (industry !== ind) e.currentTarget.style.borderColor = c.borderHover; }}
                    onMouseLeave={(e) => { if (industry !== ind) e.currentTarget.style.borderColor = c.border; }}>
                    {ind}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 28 }}>
                <label htmlFor="interview-date" style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8, letterSpacing: "0.02em" }}>When is your interview?</label>
                <input type="date" id="interview-date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)}
                  style={{ ...inputStyle, colorScheme: "dark" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
                  onBlur={(e) => e.currentTarget.style.borderColor = c.border} />
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 6 }}>We'll create a personalized prep plan based on your timeline.</p>
              </div>
            </div>
          )}

          {/* Step 3: Resume */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 40 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Step 3 — {stepLabels[2]}</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>Upload your resume</h2>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6 }}>We'll generate questions from your actual experience — no generic prompts.</p>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileChange(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current?.click()}
                style={{ border: `2px dashed ${isDragging ? c.gilt : fileName ? c.sage : "rgba(201,169,110,0.2)"}`, borderRadius: 16, padding: "48px 32px", textAlign: "center", cursor: "pointer", transition: "all 0.3s ease", background: isDragging ? "rgba(201,169,110,0.04)" : fileName ? "rgba(122,158,126,0.04)" : "transparent" }}>
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                {fileName ? (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px", background: resumeParsing ? "rgba(201,169,110,0.08)" : resumeError ? "rgba(196,112,90,0.08)" : `${c.sage}15`, border: `1px solid ${resumeParsing ? "rgba(201,169,110,0.2)" : resumeError ? "rgba(196,112,90,0.2)" : `${c.sage}25`}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {resumeParsing ? (
                        <div style={{ width: 20, height: 20, border: `2px solid rgba(201,169,110,0.3)`, borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      ) : resumeError ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.ivory, marginBottom: 4 }}>{fileName}</p>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: resumeParsing ? c.gilt : resumeError ? c.ember : c.sage }}>
                      {resumeParsing ? "Analyzing resume..." : resumeError ? resumeError : `${resumeParsed?.skills.length || 0} skills · ${resumeParsed?.experience.length || 0} roles · ${resumeParsed?.education.length || 0} degrees found`}
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); }} style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "none", border: "none", cursor: "pointer", marginTop: 12, textDecoration: "underline" }}>Replace file</button>
                  </>
                ) : (
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px", background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.ivory, marginBottom: 4 }}>Drop your resume here</p>
                    <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 16 }}>or click to browse</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                      {["PDF", "DOCX", "TXT"].map((type) => (
                        <span key={type} style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, background: c.graphite, padding: "4px 10px", borderRadius: 4, border: `1px solid ${c.border}` }}>{type}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Parsed resume preview */}
              {resumeParsed && !resumeParsing && (resumeParsed.skills.length > 0 || resumeParsed.experience.length > 0) && (
                <div style={{ marginTop: 16, background: c.graphite, borderRadius: 10, border: `1px solid ${c.border}`, padding: "16px 20px" }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.sage, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>What we found</span>
                  {resumeParsed.skills.length > 0 && (
                    <div style={{ marginBottom: resumeParsed.experience.length > 0 ? 12 : 0 }}>
                      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 6 }}>Skills</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {resumeParsed.skills.slice(0, 12).map((skill, i) => (
                          <span key={i} style={{ fontFamily: font.ui, fontSize: 11, color: c.ivory, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", borderRadius: 5, padding: "3px 9px" }}>{skill}</span>
                        ))}
                        {resumeParsed.skills.length > 12 && (
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.slate, padding: "3px 6px" }}>+{resumeParsed.skills.length - 12} more</span>
                        )}
                      </div>
                    </div>
                  )}
                  {resumeParsed.experience.length > 0 && (
                    <div>
                      <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginBottom: 6 }}>Recent roles</p>
                      {resumeParsed.experience.slice(0, 3).map((exp, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ width: 4, height: 4, borderRadius: 2, background: i === 0 ? c.gilt : c.border, flexShrink: 0 }} />
                          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory }}>{exp.title}</span>
                          {exp.company && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>at {exp.company}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 16, padding: "14px 16px", borderRadius: 10, background: c.graphite, border: `1px solid ${c.border}` }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>Your resume text is used only to generate personalized interview questions. You can delete it anytime.</p>
              </div>
            </div>
          )}

          {/* Step 4: Preferences — learning style + session length */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 40 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Step 4 — {stepLabels[3]}</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 8 }}>How should we coach you?</h2>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6 }}>These preferences shape how your AI interviewer gives feedback.</p>
              </div>

              <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 12, letterSpacing: "0.02em" }}>Feedback style</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
                {([
                  { id: "direct" as const, label: "Direct & Blunt", desc: "Tell me exactly what's wrong. No sugarcoating.", icon: "🎯" },
                  { id: "encouraging" as const, label: "Encouraging First", desc: "Lead with what I did well, then suggest improvements.", icon: "💪" },
                ] as const).map((style) => (
                  <button key={style.id} onClick={() => setLearningStyle(style.id)}
                    style={{ padding: "20px 18px", borderRadius: 12, cursor: "pointer", background: learningStyle === style.id ? "rgba(201,169,110,0.08)" : c.graphite, border: `1.5px solid ${learningStyle === style.id ? c.gilt : c.border}`, textAlign: "left", transition: "all 0.25s ease" }}
                    onMouseEnter={(e) => { if (learningStyle !== style.id) e.currentTarget.style.borderColor = c.borderHover; }}
                    onMouseLeave={(e) => { if (learningStyle !== style.id) e.currentTarget.style.borderColor = c.border; }}>
                    <span style={{ fontSize: 24, display: "block", marginBottom: 10 }}>{style.icon}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: learningStyle === style.id ? c.ivory : c.chalk, display: "block", marginBottom: 4 }}>{style.label}</span>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, lineHeight: 1.5 }}>{style.desc}</p>
                  </button>
                ))}
              </div>

              <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 12, letterSpacing: "0.02em" }}>Preferred session length</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {([
                  { mins: 10 as const, label: "Quick", desc: "2-3 questions", icon: "⚡" },
                  { mins: 15 as const, label: "Standard", desc: "4-5 questions", icon: "🎙️" },
                  { mins: 25 as const, label: "Deep Dive", desc: "6-8 questions", icon: "🔬" },
                ] as const).map((opt) => (
                  <button key={opt.mins} onClick={() => setSessionLength(opt.mins)}
                    style={{ padding: "18px 14px", borderRadius: 10, cursor: "pointer", background: sessionLength === opt.mins ? "rgba(201,169,110,0.08)" : c.graphite, border: `1.5px solid ${sessionLength === opt.mins ? c.gilt : c.border}`, textAlign: "center", transition: "all 0.25s ease" }}
                    onMouseEnter={(e) => { if (sessionLength !== opt.mins) e.currentTarget.style.borderColor = c.borderHover; }}
                    onMouseLeave={(e) => { if (sessionLength !== opt.mins) e.currentTarget.style.borderColor = c.border; }}>
                    <span style={{ fontSize: 20, display: "block", marginBottom: 6 }}>{opt.icon}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, color: sessionLength === opt.mins ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.mins}m</span>
                    <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: sessionLength === opt.mins ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{opt.label}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Ready — personalized preview */}
          {step === 5 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: 20, margin: "0 auto 28px", background: "rgba(201,169,110,0.08)", border: "1px solid rgba(201,169,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(201,169,110,0.1)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
              <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>You're all set</p>
              <h2 style={{ fontFamily: font.display, fontSize: 36, fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 12 }}>Your personalized prep is ready</h2>
              <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.6, marginBottom: 40, maxWidth: 440, margin: "0 auto 40px" }}>
                We've built a custom interview experience for{" "}
                <span style={{ color: c.gilt, fontWeight: 600 }}>{targetRole === "Other" ? customRole : targetRole}</span>
                {targetCompany && targetCompany !== "Other" && <> at <span style={{ color: c.gilt, fontWeight: 600 }}>{targetCompany}</span></>}
                {customCompany && targetCompany === "Other" && <> at <span style={{ color: c.gilt, fontWeight: 600 }}>{customCompany}</span></>}
                .
              </p>

              <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "24px 28px", textAlign: "left", maxWidth: 440, margin: "0 auto 40px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Profile</span>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage }}>Personalized</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Target Role", value: targetRole === "Other" ? customRole : targetRole },
                    { label: "Company", value: targetCompany === "Other" ? customCompany : targetCompany },
                    { label: "Industry", value: industry },
                    { label: "Resume", value: fileName ? `${fileName}${resumeParsed ? ` (${resumeParsed.skills.length} skills, ${resumeParsed.experience.length} roles)` : ""}` : "Not uploaded" },
                    { label: "Focus Areas", value: selectedTypes.map(t => interviewTypes.find(it => it.id === t)?.label).join(", ") },
                    { label: "Feedback Style", value: learningStyle === "direct" ? "Direct & Blunt" : "Encouraging First" },
                    { label: "Session Length", value: `${sessionLength} minutes` },
                    ...(interviewDate ? [{ label: "Interview Date", value: new Date(interviewDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }] : []),
                  ].filter(item => item.value).map((item) => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{item.label}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, fontWeight: 500, textAlign: "right", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40 }}>
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)}
                style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.stone, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
                onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
            ) : <div />}
            <button onClick={handleNext} disabled={!canContinue()} className="shimmer-btn"
              style={{
                fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "14px 36px", borderRadius: 8, border: "none",
                background: canContinue() ? (step === TOTAL_STEPS ? c.gilt : c.ivory) : `${c.ivory}30`,
                color: canContinue() ? c.obsidian : `${c.obsidian}60`,
                cursor: canContinue() ? "pointer" : "not-allowed",
                transition: "all 0.25s ease", display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={(e) => { if (canContinue()) { e.currentTarget.style.background = c.gilt; e.currentTarget.style.boxShadow = "0 8px 32px rgba(201,169,110,0.2)"; } }}
              onMouseLeave={(e) => { if (canContinue()) { e.currentTarget.style.background = step === TOTAL_STEPS ? c.gilt : c.ivory; e.currentTarget.style.boxShadow = "none"; } }}>
              {step === TOTAL_STEPS ? "Start Practicing" : "Continue"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

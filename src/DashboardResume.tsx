import { useState, useEffect, useRef } from "react";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { useDashboard } from "./DashboardContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";
import { type ResumeProfile, analyzeResumeWithAI } from "./dashboardData";
import { DataLoadingSkeleton } from "./dashboardComponents";

export default function DashboardResume() {
  useDocTitle("Resume");
  const { user, updateUser } = useAuth();
  const { persisted, updatePersisted, dataLoading } = useDashboard();

  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(user?.resumeFileName || persisted.resumeFileName);
  const [resumeText, setResumeText] = useState("");
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [phase, setPhase] = useState<"idle" | "extracting" | "analyzing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [needsReupload, setNeedsReupload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reanalyzeDone, setReanalyzeDone] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analysisSource, setAnalysisSource] = useState<"ai" | "fallback" | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const analyzingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (user?.resumeText) setResumeText(user.resumeText);
    if (user?.resumeFileName) setFileName(user.resumeFileName);

    const stored = user?.resumeData as unknown as (ResumeProfile & { name?: string; skills?: string[] }) | undefined;
    if (stored) {
      // Check if this is a full AI profile (has real data beyond the fallback)
      const isFallback = !stored.headline || stored.headline === "Resume uploaded" ||
        (!stored.seniorityLevel && (!stored.topSkills || stored.topSkills.length === 0) && (!stored.interviewStrengths || stored.interviewStrengths.length === 0));
      if (stored.headline && !isFallback) {
        setProfile(stored);
        setAnalysisSource("ai");
        setPhase("done");
      } else if (isFallback && user?.resumeText && !analyzingRef.current) {
        // Fallback profile stored — auto-trigger AI re-analysis
        analyzingRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        setProfile(stored); // show fallback while analyzing
        setPhase("analyzing");
        analyzeResumeWithAI(user.resumeText, user?.targetRole)
          .then(result => {
            if (result?.profile) {
              setProfile(result.profile);
              updateUser({ resumeData: result.profile as unknown as ParsedResume });
            }
            setPhase("done");
          })
          .catch(() => setPhase("done"))
          .finally(() => { analyzingRef.current = false; });
      } else if (stored.name || stored.skills) {
        const parsed = stored as any;
        const fallback: ResumeProfile = {
          headline: parsed.name || "Resume uploaded",
          summary: parsed.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
          yearsExperience: null, seniorityLevel: "",
          topSkills: (parsed.skills || []).slice(0, 8),
          keyAchievements: (parsed.experience || []).flatMap((e: any) => e.bullets || []).slice(0, 5),
          industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "",
        };
        setProfile(fallback);
        setAnalysisSource("fallback");
        setPhase("done");
      }
    } else if (user?.resumeText && user?.resumeFileName) {
      // Resume was uploaded (e.g. during onboarding) but no AI profile exists yet.
      // Auto-trigger AI analysis (guard against duplicate calls).
      if (analyzingRef.current) return;
      analyzingRef.current = true;
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      setPhase("analyzing");
      analyzeResumeWithAI(user.resumeText, user?.targetRole)
        .then(result => {
          if (result?.profile) {
            setProfile(result.profile);
            updateUser({ resumeData: result.profile as unknown as ParsedResume });
          }
          setPhase("done");
        })
        .catch(() => setPhase("done"))
        .finally(() => { analyzingRef.current = false; });
    } else if (user?.resumeFileName) {
      // Resume filename exists but no text/analysis — mark done but show re-upload prompt
      setPhase("done");
      setNeedsReupload(true);
    }
  }, [user?.resumeData, user?.resumeFileName, user?.resumeText]);

  if (dataLoading) return <DataLoadingSkeleton />;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File too large — please upload a file under 10 MB.");
      setPhase("error");
      return;
    }
    setFileName(file.name);
    setErrorMsg("");
    setProfile(null);
    setNeedsReupload(false);
    setAnalysisSource(null);
    setTruncated(false);

    setPhase("extracting");
    let text: string;
    try {
      text = await extractResumeText(file);
      setResumeText(text);
      updatePersisted({ resumeFileName: file.name });
      updateUser({ resumeFileName: file.name, resumeText: text });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to parse resume");
      setPhase("error");
      return;
    }

    setPhase("analyzing");
    let result: { profile: ResumeProfile; truncated?: boolean } | null = null;
    try {
      result = await Promise.race([
        analyzeResumeWithAI(text, user?.targetRole),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30_000)),
      ]);
    } catch { /* timeout or network error — fall through to fallback */ }
    if (result?.profile) {
      setProfile(result.profile);
      setAnalysisSource("ai");
      setTruncated(!!result.truncated);
      updateUser({ resumeData: result.profile as unknown as ParsedResume });
      setPhase("done");
    } else {
      setErrorMsg("AI analysis unavailable — showing basic profile from your resume. You can re-analyze anytime.");
      const parsed = parseResumeData(text);
      const fallback: ResumeProfile = {
        headline: parsed.name || "Resume uploaded",
        summary: parsed.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
        yearsExperience: null, seniorityLevel: "",
        topSkills: (parsed.skills || []).slice(0, 8),
        keyAchievements: (parsed.experience || []).flatMap((e: any) => e.bullets || []).slice(0, 5),
        industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "",
      };
      setProfile(fallback);
      setAnalysisSource("fallback");
      updateUser({ resumeData: fallback as unknown as ParsedResume });
      setPhase("done");
    }
  };

  const handleRemove = () => {
    setFileName(null);
    setResumeText("");
    setProfile(null);
    setPhase("idle");
    setErrorMsg("");
    updatePersisted({ resumeFileName: null });
    updateUser({ resumeFileName: null, resumeText: undefined, resumeData: undefined });
  };

  const handleReanalyze = async () => {
    if (!resumeText || reanalyzing) return;
    setReanalyzing(true);
    setReanalyzeDone(false);
    setErrorMsg("");
    try {
      const result = await Promise.race([
        analyzeResumeWithAI(resumeText, user?.targetRole),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30_000)),
      ]);
      if (result?.profile) {
        setProfile(result.profile);
        setAnalysisSource("ai");
        setTruncated(!!result.truncated);
        updateUser({ resumeData: result.profile as unknown as ParsedResume });
      } else {
        setErrorMsg("AI couldn't extract structured data. Try re-uploading a cleaner PDF or DOCX.");
      }
    } catch {
      setErrorMsg("Analysis timed out after 30s. Check your connection and try again.");
    }
    setReanalyzing(false);
    setReanalyzeDone(true);
    setTimeout(() => setReanalyzeDone(false), 5000);
  };

  const triggerUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.txt";
    input.onchange = (e) => { handleFile((e.target as HTMLInputElement).files?.[0]); };
    input.click();
  };

  if (phase === "extracting" || phase === "analyzing") {
    return (
      <div style={{ margin: "0 auto", padding: "20px 0" }}>
        <div style={{ background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 24px", background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 24, height: 24, border: "2.5px solid rgba(212,179,127,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
          <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {phase === "extracting" ? "Reading your resume" : "Building your profile"}
          </h2>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
            {phase === "extracting" ? `Extracting text from ${fileName || "your document"}...` : "AI is analyzing your experience, skills, and achievements to create a personalized candidate profile..."}
          </p>
          {phase === "analyzing" && (
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginTop: 12 }}>This usually takes 10–20 seconds.</p>
          )}
          {fileName && (
            <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, background: c.obsidian, borderRadius: 8, padding: "8px 16px", border: `1px solid ${c.border}` }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{fileName}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div style={{ margin: "0 auto", padding: "20px 0" }}>
        <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em" }}>Resume Intelligence</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 28, lineHeight: 1.6 }}>
          Upload your resume and our AI will build a candidate profile — identifying your strengths, key achievements, and areas to prepare for interviews.
        </p>
        <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={triggerUpload}
          style={{ border: `2px dashed ${isDragging ? c.gilt : "rgba(212,179,127,0.2)"}`, borderRadius: 16, padding: "64px 32px", textAlign: "center", background: isDragging ? "rgba(212,179,127,0.04)" : "transparent", transition: "all 0.2s ease", cursor: "pointer" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px", background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.ivory, marginBottom: 6 }}>Drop your resume here</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20 }}>or click to browse</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {["PDF", "DOCX", "TXT"].map((type) => (
              <span key={type} style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.stone, background: c.graphite, padding: "4px 12px", borderRadius: 4, border: `1px solid ${c.border}` }}>{type}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 16px", borderRadius: 8, background: "rgba(212,179,127,0.03)", border: `1px solid ${c.border}` }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Your resume is analyzed securely and never shared. Delete anytime.</span>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ margin: "0 auto", padding: "20px 0" }}>
        <h2 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em" }}>Resume Intelligence</h2>
        <div role="alert" style={{ background: c.graphite, borderRadius: 14, border: "1px solid rgba(196,112,90,0.15)", padding: "32px", textAlign: "center", marginTop: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 16px", background: "rgba(196,112,90,0.08)", border: "1px solid rgba(196,112,90,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory, marginBottom: 4 }}>Couldn't process this file</p>
          <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20 }}>{errorMsg}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={triggerUpload} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian, background: c.gilt, border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", transition: "filter 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}>Try another file</button>
            <button onClick={() => { setPhase("idle"); setErrorMsg(""); }} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 24px", cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>Dismiss</button>
          </div>
        </div>
      </div>
    );
  }

  // Profile view (done state)
  return (
    <div style={{ margin: "0 auto", padding: "20px 0" }}>
      <div style={{ background: `linear-gradient(135deg, ${c.graphite} 0%, rgba(212,179,127,0.04) 100%)`, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 28px 24px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {profile?.headline ? <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.3 }}>{profile.headline}</h2> : <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.3 }}>Resume uploaded</h2>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {profile?.seniorityLevel ? <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.15)", borderRadius: 5, padding: "3px 10px" }}>{profile.seniorityLevel}</span> : null}
              {profile?.yearsExperience != null && profile.yearsExperience > 0 && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{profile.yearsExperience}+ years experience</span>}
              {profile?.industries && profile.industries.length > 0 && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{profile.industries.join(", ")}</span>}
              {analysisSource && (
                <span style={{ fontFamily: font.ui, fontSize: 10, color: analysisSource === "ai" ? c.sage : c.stone, background: analysisSource === "ai" ? "rgba(122,158,126,0.08)" : "rgba(245,242,237,0.04)", border: `1px solid ${analysisSource === "ai" ? "rgba(122,158,126,0.15)" : c.border}`, borderRadius: 5, padding: "2px 8px" }}>
                  {analysisSource === "ai" ? "AI Profile" : "Basic Extract"}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 16, alignItems: "center" }}>
            {reanalyzeDone && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, marginRight: 4 }}>Updated ✓</span>}
            {reanalyzing && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, marginRight: 4 }}>Analyzing...</span>}
            <button onClick={handleReanalyze} disabled={reanalyzing} aria-label="Re-analyze resume" title="Re-analyze" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: reanalyzing ? "default" : "pointer", opacity: reanalyzing ? 0.5 : 1, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { if (!reanalyzing) e.currentTarget.style.background = "rgba(245,242,237,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}>
              {reanalyzing
                ? <div style={{ width: 14, height: 14, border: "2px solid rgba(212,179,127,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              }
            </button>
            {confirmDelete ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }} onKeyDown={(e) => { if (e.key === "Escape") setConfirmDelete(false); }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ember }}>Delete?</span>
                <button autoFocus onClick={() => { handleRemove(); setConfirmDelete(false); }} aria-label="Confirm delete resume" style={{ padding: "4px 10px", borderRadius: 10, border: "none", background: c.ember, color: "#fff", fontFamily: font.ui, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} aria-label="Cancel delete" style={{ padding: "4px 10px", borderRadius: 10, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, fontFamily: font.ui, fontSize: 11, cursor: "pointer" }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} aria-label="Delete resume" title="Remove resume" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(196,112,90,0.04)", border: "1px solid rgba(196,112,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.04)"; }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            )}
          </div>
        </div>
        {profile?.summary && <p style={{ fontFamily: font.ui, fontSize: 13.5, color: c.chalk, lineHeight: 1.7, margin: 0 }}>{profile.summary}</p>}
        {truncated && (
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Only the first 3,000 characters were analyzed. For best results, keep your resume concise.
          </p>
        )}
        {analysisSource === "fallback" && resumeText && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(212,179,127,0.04)", border: "1px solid rgba(212,179,127,0.1)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>AI analysis wasn't available — showing basic extraction. Click re-analyze for a full profile.</span>
          </div>
        )}
        {needsReupload && !profile && (
          <div style={{ marginTop: 14, padding: "16px 20px", borderRadius: 10, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)` }}>
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, margin: "0 0 12px" }}>
              Your resume was uploaded but the AI summary wasn't generated. Re-upload it to get a detailed profile analysis with strengths, skills, and interview preparation insights.
            </p>
            <button onClick={triggerUpload} style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
              fontFamily: font.ui, fontSize: 12, fontWeight: 600, transition: "filter 0.15s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}>
              Re-upload for AI Analysis
            </button>
          </div>
        )}
        {profile?.careerTrajectory && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(122,158,126,0.04)", border: "1px solid rgba(122,158,126,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, textTransform: "uppercase", letterSpacing: "0.05em" }}>Career Trajectory</span>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.5 }}>{profile.careerTrajectory}</span>
          </div>
        )}
        {fileName && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{fileName}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, opacity: 0.5 }}>·</span>
            <button onClick={triggerUpload} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: 2, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>Replace</button>
          </div>
        )}
      </div>

      {profile?.topSkills && profile.topSkills.length > 0 && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Top Skills</h3>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profile.topSkills.map((skill, i) => (
              <span key={i} style={{ fontFamily: font.ui, fontSize: 12.5, color: i < 3 ? c.ivory : c.chalk, background: i < 3 ? "rgba(212,179,127,0.1)" : "rgba(245,242,237,0.04)", border: `1px solid ${i < 3 ? "rgba(212,179,127,0.18)" : c.border}`, borderRadius: 8, padding: "6px 14px", fontWeight: i < 3 ? 500 : 400 }}>{skill}</span>
            ))}
          </div>
        </div>
      )}

      {profile?.keyAchievements && profile.keyAchievements.length > 0 && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Key Achievements</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profile.keyAchievements.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 16px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 10, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.5, margin: 0 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {((profile?.interviewStrengths && profile.interviewStrengths.length > 0) || (profile?.interviewGaps && profile.interviewGaps.length > 0)) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
          {profile?.interviewStrengths && profile.interviewStrengths.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Strengths</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.interviewStrengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {profile?.interviewGaps && profile.interviewGaps.length > 0 && (
            <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Focus Areas</h3>
                <span style={{ position: "relative", display: "inline-block" }}
                  onMouseEnter={() => setTooltipVisible(true)} onMouseLeave={() => setTooltipVisible(false)}>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, cursor: "help", borderBottom: `1px dotted ${c.stone}` }}>Why these?</span>
                  {tooltipVisible && (
                    <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "normal", width: 240, padding: "10px 12px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.5, zIndex: 10, pointerEvents: "none" }}>
                      Topics the AI suggests you practice — not weaknesses, just areas where extra prep will boost your confidence.
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.interviewGaps.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 8, background: "rgba(212,179,127,0.03)", border: `1px solid ${c.border}` }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Your resume is analyzed securely and never shared. Delete anytime.</span>
      </div>
    </div>
  );
}

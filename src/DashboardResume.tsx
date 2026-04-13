import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { useDashboard } from "./DashboardContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";
import { type ResumeProfile, analyzeResumeWithAI } from "./dashboardData";
import { DataLoadingSkeleton } from "./dashboardComponents";

/* ─── Resume Version History (localStorage) ─── */
const RESUME_HISTORY_KEY = "hirestepx_resume_history";
interface ResumeVersion { fileName: string; date: string; resumeScore?: number; }
function saveResumeVersion(fileName: string, resumeScore?: number) {
  try {
    const raw = localStorage.getItem(RESUME_HISTORY_KEY);
    const history: ResumeVersion[] = raw ? JSON.parse(raw) : [];
    history.unshift({ fileName, date: new Date().toISOString(), resumeScore });
    // Keep last 10 versions
    localStorage.setItem(RESUME_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch { /* expected: localStorage may be unavailable */ }
}
function getResumeHistory(): ResumeVersion[] {
  try {
    const raw = localStorage.getItem(RESUME_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/* ─── ATS Compliance Check (client-side keyword matching) ─── */
interface ATSResult {
  score: number;
  label: string;
  found: string[];
  missing: string[];
  suggestions: string[];
}

function computeATSScore(resumeText: string, _targetRole?: string, jdText?: string): ATSResult {
  const text = resumeText.toLowerCase();

  // Common ATS-required sections
  const requiredSections = [
    { name: "Contact Info", keywords: ["email", "@", "phone", "linkedin"] },
    { name: "Work Experience", keywords: ["experience", "worked", "role", "position", "company"] },
    { name: "Education", keywords: ["education", "university", "degree", "bachelor", "master", "b.tech", "b.e", "mba"] },
    { name: "Skills", keywords: ["skills", "technologies", "tools", "proficient"] },
  ];

  // Common action verbs ATS systems look for
  const actionVerbs = ["achieved", "led", "managed", "developed", "implemented", "designed", "built", "increased", "reduced", "improved", "launched", "delivered", "created", "optimized", "coordinated", "analyzed"];

  // Metrics/quantification patterns
  const hasMetrics = /\d+%|\$\d|[0-9]+\+?\s*(users|customers|team|members|engineers|projects|clients|revenue)/i.test(resumeText);

  // Check sections
  const foundSections = requiredSections.filter(s => s.keywords.some(k => text.includes(k)));
  const missingSections = requiredSections.filter(s => !s.keywords.some(k => text.includes(k)));

  // Check action verbs
  const foundVerbs = actionVerbs.filter(v => new RegExp(`\\b${v}\\w*\\b`, "i").test(text));

  // JD keyword matching if JD provided
  let jdKeywords: string[] = [];
  let foundJdKeywords: string[] = [];
  let missingJdKeywords: string[] = [];
  if (jdText) {
    const jdWords = jdText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const commonWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "with", "they", "been", "have", "from", "this", "that", "will", "would", "there", "their", "what", "about", "which", "when", "make", "like", "time", "just", "know", "take", "come", "could", "than", "look", "only", "into", "year", "your", "some", "them", "also", "should", "able", "work", "experience", "must", "strong"]);
    const freq: Record<string, number> = {};
    for (const w of jdWords) {
      if (!commonWords.has(w) && w.length > 3) freq[w] = (freq[w] || 0) + 1;
    }
    jdKeywords = Object.entries(freq).filter(([, c]) => c >= 2).map(([w]) => w).slice(0, 20);
    foundJdKeywords = jdKeywords.filter(k => new RegExp(`\\b${k}\\b`, "i").test(text));
    missingJdKeywords = jdKeywords.filter(k => !new RegExp(`\\b${k}\\b`, "i").test(text));
  }

  // Score
  let score = 0;
  score += foundSections.length * 15; // up to 60
  score += Math.min(20, foundVerbs.length * 3); // up to 20
  score += hasMetrics ? 10 : 0;
  score += jdKeywords.length > 0 ? Math.round((foundJdKeywords.length / jdKeywords.length) * 10) : 10;
  score = Math.min(100, Math.max(0, score));

  const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Needs Work" : "Poor";

  const found = [
    ...foundSections.map(s => s.name),
    foundVerbs.length > 0 ? `${foundVerbs.length} action verbs` : null,
    hasMetrics ? "Quantified achievements" : null,
    ...foundJdKeywords.map(k => `JD keyword: ${k}`),
  ].filter(Boolean) as string[];

  const missing = [
    ...missingSections.map(s => `Missing: ${s.name} section`),
    foundVerbs.length < 5 ? "Add more action verbs (achieved, led, built...)" : null,
    !hasMetrics ? "Add quantified metrics (%, $, numbers)" : null,
    ...missingJdKeywords.slice(0, 5).map(k => `Missing JD keyword: ${k}`),
  ].filter(Boolean) as string[];

  const suggestions = [
    missingSections.length > 0 ? `Add clear section headers: ${missingSections.map(s => s.name).join(", ")}` : null,
    !hasMetrics ? "Quantify your achievements with specific numbers, percentages, or dollar amounts" : null,
    foundVerbs.length < 5 ? "Start bullet points with strong action verbs: achieved, led, implemented, designed" : null,
    missingJdKeywords.length > 3 ? "Mirror key terms from the job description in your resume" : null,
    "Use standard section headings (Experience, Education, Skills) for better ATS parsing",
    "Avoid tables, graphics, and complex formatting that ATS cannot read",
  ].filter(Boolean) as string[];

  return { score, label, found, missing, suggestions: suggestions.slice(0, 5) };
}

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
  const [jdText, setJdText] = useState("");
  const [jdComparing, setJdComparing] = useState(false);
  const [jdResult, setJdResult] = useState<{
    matchScore: number;
    matchLabel: string;
    matchedSkills: string[];
    missingSkills: string[];
    keyStrengths: string[];
    gaps: string[];
    interviewTips: string[];
    suggestedFocus: string;
  } | null>(null);
  const analyzingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  // ATS compliance check — auto-computes when resume/JD changes
  const atsResult = useMemo<ATSResult | null>(() => {
    const rText = user?.resumeText || resumeText;
    if (!rText) return null;
    return computeATSScore(rText, user?.targetRole, jdText || undefined);
  }, [user?.resumeText, resumeText, user?.targetRole, jdText]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  const handleJDCompare = async () => {
    if (!jdText.trim() || !user?.resumeText) return;
    setJdComparing(true);
    try {
      const { getSupabase } = await import("./supabase");
      const sb = await getSupabase();
      const token = (await sb.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/analyze-jd-match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resumeText: user.resumeText, jobDescription: jdText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setJdResult(data.analysis);
        try { sessionStorage.setItem("hirestepx_jd_analysis", JSON.stringify(data.analysis)); } catch { /* quota */ }
      }
    } catch { /* non-critical */ }
    setJdComparing(false);
  };

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
        analyzeResumeWithAI(user.resumeText, user?.targetRole, abortControllerRef.current.signal)
          .then(result => {
            if (result?.profile) {
              setProfile(result.profile);
              updateUser({ resumeData: { ...result.profile, _type: "ai" } as unknown as ParsedResume });
            }
            setPhase("done");
          })
          .catch(() => setPhase("done"))
          .finally(() => { analyzingRef.current = false; });
      } else if (stored.name || stored.skills) {
        type LegacyResume = { name?: string; summary?: string; skills?: string[]; experience?: { bullets?: string[] }[] };
        const parsed = stored as unknown as LegacyResume;
        const fallback: ResumeProfile = {
          headline: parsed.name || "Resume uploaded",
          summary: parsed.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
          yearsExperience: null, seniorityLevel: "",
          topSkills: (parsed.skills || []).slice(0, 8),
          keyAchievements: (parsed.experience || []).flatMap(e => e.bullets || []).slice(0, 5),
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
      analyzeResumeWithAI(user.resumeText, user?.targetRole, abortControllerRef.current.signal)
        .then(result => {
          if (result?.profile) {
            setProfile(result.profile);
            updateUser({ resumeData: { ...result.profile, _type: "ai" } as unknown as ParsedResume });
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
    if (file.name.toLowerCase().endsWith(".doc")) {
      setErrorMsg("Old .doc format is not supported. Please convert to .docx or PDF first (open in Word or Google Docs → Save As).");
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to parse resume");
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
      updateUser({ resumeData: { ...result.profile, _type: "ai" } as unknown as ParsedResume });
      saveResumeVersion(file.name, result.profile.resumeScore);
      setPhase("done");
    } else {
      setErrorMsg("AI analysis unavailable — showing basic profile from your resume. You can re-analyze anytime.");
      const parsed = parseResumeData(text);
      const fallback: ResumeProfile = {
        headline: parsed.name || "Resume uploaded",
        summary: parsed.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
        yearsExperience: null, seniorityLevel: "",
        topSkills: (parsed.skills || []).slice(0, 8),
        keyAchievements: (parsed.experience || []).flatMap(e => e.bullets || []).slice(0, 5),
        industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "",
      };
      setProfile(fallback);
      setAnalysisSource("fallback");
      updateUser({ resumeData: { ...fallback, _type: "fallback" } as unknown as ParsedResume });
      saveResumeVersion(file.name);
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
        updateUser({ resumeData: { ...result.profile, _type: "ai" } as unknown as ParsedResume });
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
        <div role="button" tabIndex={0} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={triggerUpload}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerUpload(); } }}
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
            <button onClick={handleReanalyze} disabled={reanalyzing} aria-label="Re-analyze resume" title="Re-analyze" style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: reanalyzing ? "default" : "pointer", opacity: reanalyzing ? 0.5 : 1, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { if (!reanalyzing) e.currentTarget.style.background = "rgba(245,242,237,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}>
              {reanalyzing
                ? <div style={{ width: 14, height: 14, border: "2px solid rgba(212,179,127,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              }
            </button>
            {confirmDelete ? (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- container for confirmation buttons needs Escape key handling
              <div style={{ display: "flex", gap: 4, alignItems: "center" }} onKeyDown={(e) => { if (e.key === "Escape") setConfirmDelete(false); }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ember }}>Delete?</span>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus management: auto-focus confirm button for destructive action */}
                <button autoFocus onClick={() => { handleRemove(); setConfirmDelete(false); }} aria-label="Confirm delete resume" style={{ padding: "4px 10px", borderRadius: 10, border: "none", background: c.ember, color: "#fff", fontFamily: font.ui, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} aria-label="Cancel delete" style={{ padding: "4px 10px", borderRadius: 10, border: `1px solid ${c.border}`, background: "transparent", color: c.stone, fontFamily: font.ui, fontSize: 11, cursor: "pointer" }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} aria-label="Delete resume" title="Remove resume" style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(196,112,90,0.04)", border: "1px solid rgba(196,112,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
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
            Your resume was truncated to fit the analysis window. For best results, keep your resume to 2 pages.
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

      {/* Resume version history */}
      {(() => {
        const history = getResumeHistory();
        if (history.length < 2) return null;
        return (
          <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "16px 24px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Version History</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {history.slice(0, 5).map((v, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < Math.min(history.length, 5) - 1 ? `1px solid ${c.border}` : "none" }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: i === 0 ? c.chalk : c.stone, flex: 1 }}>
                    {v.fileName}
                    {i === 0 && <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage, marginLeft: 6, fontWeight: 600 }}>CURRENT</span>}
                  </span>
                  {v.resumeScore != null && (
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: v.resumeScore >= 65 ? c.sage : v.resumeScore >= 40 ? c.gilt : c.ember }}>{v.resumeScore}/100</span>
                  )}
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>{new Date(v.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* ─── JD Comparison ─── */}
      <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.ivory} strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>Job Description Match</h3>
        </div>
        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste a job description to compare against your resume..."
          style={{
            width: "100%", minHeight: 100, padding: 12, fontFamily: font.ui, fontSize: 13,
            background: c.obsidian, color: c.ivory, border: `1px solid ${c.border}`, borderRadius: 8,
            resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5,
          }}
        />
        {user?.resumeText && (
          <button
            onClick={handleJDCompare}
            disabled={!jdText.trim() || jdComparing}
            style={{
              marginTop: 10, padding: "8px 20px", fontFamily: font.ui, fontSize: 13, fontWeight: 600,
              background: !jdText.trim() || jdComparing ? c.stone : c.sage, color: c.obsidian,
              border: "none", borderRadius: 8, cursor: !jdText.trim() || jdComparing ? "not-allowed" : "pointer",
              opacity: !jdText.trim() || jdComparing ? 0.5 : 1, transition: "opacity 0.2s",
            }}
          >
            {jdComparing ? "Comparing..." : "Compare"}
          </button>
        )}
      </div>

      {jdResult && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          {/* Match Score */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              border: `3px solid ${jdResult.matchScore >= 70 ? c.sage : jdResult.matchScore >= 40 ? c.gilt : c.ember}`,
            }}>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: jdResult.matchScore >= 70 ? c.sage : jdResult.matchScore >= 40 ? c.gilt : c.ember }}>
                {jdResult.matchScore}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{jdResult.matchLabel}</div>
              <div style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Match Score</div>
            </div>
          </div>

          {/* Matched Skills */}
          {jdResult.matchedSkills.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Matched Skills</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {jdResult.matchedSkills.map((s, i) => (
                  <span key={i} style={{ fontFamily: font.ui, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${c.sage}22`, color: c.sage, border: `1px solid ${c.sage}44` }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Missing Skills */}
          {jdResult.missingSkills.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Missing Skills</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {jdResult.missingSkills.map((s, i) => (
                  <span key={i} style={{ fontFamily: font.ui, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${c.ember}22`, color: c.ember, border: `1px solid ${c.ember}44` }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Key Strengths */}
          {jdResult.keyStrengths.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Key Strengths</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {jdResult.keyStrengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {jdResult.gaps.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gaps</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {jdResult.gaps.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{g}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interview Tips */}
          {jdResult.interviewTips.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Interview Tips</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {jdResult.interviewTips.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.ivory, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Focus */}
          {jdResult.suggestedFocus && (
            <div style={{ marginBottom: 14, padding: 12, background: c.obsidian, borderRadius: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggested Focus</span>
              <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, margin: "6px 0 10px" }}>{jdResult.suggestedFocus}</p>
              <button
                onClick={() => { navigate("/session/new"); }}
                style={{
                  padding: "6px 14px", fontFamily: font.ui, fontSize: 12, fontWeight: 600,
                  background: c.sage, color: c.obsidian, border: "none", borderRadius: 6, cursor: "pointer",
                }}
              >
                Practice this
              </button>
            </div>
          )}

          {/* Use JD in next interview */}
          <button
            onClick={() => {
              try { sessionStorage.setItem("hirestepx_jd_text", jdText); } catch { /* quota */ }
              navigate("/session/new");
            }}
            style={{
              width: "100%", padding: "10px 16px", fontFamily: font.ui, fontSize: 13, fontWeight: 600,
              background: "transparent", color: c.sage, border: `1px solid ${c.sage}`, borderRadius: 8,
              cursor: "pointer", transition: "background 0.2s",
            }}
          >
            Use this JD in your next interview
          </button>
        </div>
      )}

      {/* ─── ATS Compliance Check ─── */}
      {atsResult && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
            <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: 0 }}>ATS Compliance Check</h3>
          </div>

          {/* Score circle + label */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              border: `3px solid ${atsResult.score >= 85 ? c.sage : atsResult.score >= 70 ? c.sage : atsResult.score >= 50 ? c.gilt : c.ember}`,
            }}>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: atsResult.score >= 70 ? c.sage : atsResult.score >= 50 ? c.gilt : c.ember }}>
                {atsResult.score}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{atsResult.label}</div>
              <div style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>ATS Compatibility Score</div>
            </div>
          </div>

          {/* Found items */}
          {atsResult.found.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Found</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {atsResult.found.map((item, i) => (
                  <span key={i} style={{ fontFamily: font.ui, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${c.sage}22`, color: c.sage, border: `1px solid ${c.sage}44` }}>{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Missing items */}
          {atsResult.missing.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Missing</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {atsResult.missing.map((item, i) => (
                  <span key={i} style={{ fontFamily: font.ui, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${c.ember}22`, color: c.ember, border: `1px solid ${c.ember}44` }}>{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {atsResult.suggestions.length > 0 && (
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>Suggestions</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {atsResult.suggestions.map((tip, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.08)", borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profile?.resumeScore != null && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={profile.resumeScore >= 65 ? c.sage : c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Resume Quality</h3>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: profile.resumeScore >= 65 ? c.sage : profile.resumeScore >= 40 ? c.gilt : c.ember }}>{profile.resumeScore}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>/100</span>
            </div>
          </div>
          <div style={{ height: 6, background: c.obsidian, borderRadius: 3, overflow: "hidden", marginBottom: profile.improvements && profile.improvements.length > 0 ? 16 : 0 }}>
            <div style={{ height: "100%", width: `${profile.resumeScore}%`, background: profile.resumeScore >= 65 ? c.sage : profile.resumeScore >= 40 ? c.gilt : c.ember, borderRadius: 3, transition: "width 0.4s ease" }} />
          </div>
          {profile.improvements && profile.improvements.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>How to improve</span>
              {profile.improvements.map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.08)", borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
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

"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import type { ParsedResume } from "./resumeParser";
import type { ResumeProfile } from "./dashboardData";
import { track } from "@vercel/analytics";
import {
  EmailVerificationBanner, TopBar,
  ResumeEmptyState, ResumeLoadingState, ProfileReadyState,
  NavigationFooter,
} from "./OnboardingPanels";

const OB_STEP_KEY = "hirestepx_ob_step";
const OB_FORM_KEY = "hirestepx_ob_form";
function clearObStep() { try { localStorage.removeItem(OB_STEP_KEY); localStorage.removeItem(OB_FORM_KEY); } catch { /* expected */ } }

export default function Onboarding() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuth();

  const startingRef = useRef(false);
  useEffect(() => {
    if (user?.hasCompletedOnboarding && !startingRef.current) router.replace("/dashboard");
  }, [user?.hasCompletedOnboarding, router]);

  // ─── Resume state ───
  const [fileName, setFileName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeParsed, setResumeParsed] = useState<ParsedResume | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [dragFileName, setDragFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiProfile, setAiProfile] = useState<ResumeProfile | null>(null);
  const [aiPhase, setAiPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const [analysisStage, setAnalysisStage] = useState(0);
  const [userName, setUserName] = useState(user?.name || "");
  const undoRef = useRef<{ fileName: string; resumeText: string; resumeParsed: ParsedResume | null; aiProfile: ResumeProfile | null; aiPhase: "idle" | "analyzing" | "done"; targetRole: string; userName: string } | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<number>(0);
  const [targetRole, setTargetRole] = useState(user?.targetRole || "");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); };
  }, []);

  // ─── Auto-save name & targetRole to localStorage + Supabase (debounced 1.5s) ───
  const autoSaveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<{ name: string; role: string }>({ name: user?.name || "", role: user?.targetRole || "" });
  useEffect(() => {
    if (!user || !resumeParsed) return; // only auto-save after resume is ready
    const name = userName.trim();
    const role = targetRole.trim();
    if (name === lastSavedRef.current.name && role === lastSavedRef.current.role) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      // Save to localStorage immediately (so refresh won't lose input)
      try { localStorage.setItem("hirestepx_ob_form", JSON.stringify({ name, role })); } catch { /* quota */ }
      const updates: Partial<Parameters<typeof updateUser>[0]> = {};
      if (name && name !== lastSavedRef.current.name) updates.name = name;
      if (role && role !== lastSavedRef.current.role) updates.targetRole = role;
      if (Object.keys(updates).length === 0) return;
      lastSavedRef.current = { name, role };
      updateUser(updates).catch(err => console.warn("[onboarding] auto-save failed:", err instanceof Error ? err.message : err));
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [userName, targetRole, user, resumeParsed, updateUser]);

  // Restore name/role from localStorage if user-data isn't loaded yet
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hirestepx_ob_form");
      if (!raw) return;
      const saved = JSON.parse(raw) as { name?: string; role?: string };
      if (saved.name && !userName) setUserName(saved.name);
      if (saved.role && !targetRole) setTargetRole(saved.role);
    } catch { /* noop */ }
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Restore resume from user profile on mount/refresh ───
  const resumeRestoredRef = useRef(false);
  useEffect(() => {
    if (resumeRestoredRef.current || resumeParsed || resumeParsing) return;
    // Try localStorage fallback if Supabase columns are missing
    const localResume = (() => { try { const r = localStorage.getItem("hirestepx_resume"); return r ? JSON.parse(r) as { fileName: string; text: string; data: ParsedResume; aiProfile?: ResumeProfile } : null; } catch { return null; } })();
    const rFileName = user?.resumeFileName || localResume?.fileName;
    if (!rFileName) return;
    resumeRestoredRef.current = true;
    setFileName(rFileName);
    const rText = user?.resumeText || localResume?.text;
    if (!rText) {
      setResumeError("Your resume text wasn't saved properly. Please re-upload your resume to continue.");
      return;
    }
    setResumeText(rText);
    import("./resumeParser").then(async ({ parseResumeData }) => {
      const data = user?.resumeData || localResume?.data || parseResumeData(rText);
      setResumeParsed(data);
      const savedAiProfile = localResume?.aiProfile || (data as ParsedResume & { aiProfile?: ResumeProfile })?.aiProfile;
      if (data.name && !userName) setUserName(data.name);
      const isRealAiProfile = savedAiProfile && savedAiProfile.headline
        && savedAiProfile.resumeScore != null
        && savedAiProfile.topSkills && savedAiProfile.topSkills.length > 0
        && (savedAiProfile as unknown as Record<string, unknown>)._type !== "fallback";
      if (isRealAiProfile) {
        setAiProfile(savedAiProfile);
        setAiPhase("done");
        if (!data.name && !userName && savedAiProfile.headline !== "Analyzing...") {
          setUserName(savedAiProfile.headline.split(/[—–|,]/)[0].trim().slice(0, 40));
        }
      } else {
        if (savedAiProfile) setAiProfile(savedAiProfile);
        setAiPhase("analyzing");
        const autoRole = data.experience?.[0]?.title || "";
        const { analyzeResumeWithAI } = await import("./dashboardData");
        analysisAbortRef.current?.abort();
        analysisAbortRef.current = new AbortController();
        analyzeResumeWithAI(rText, targetRole || autoRole, analysisAbortRef.current.signal)
          .then(result => {
            if (result && "profile" in result) {
              setAiProfile(result.profile);
              try { const cached = localStorage.getItem("hirestepx_resume"); if (cached) { const obj = JSON.parse(cached); obj.aiProfile = result.profile; localStorage.setItem("hirestepx_resume", JSON.stringify(obj)); } } catch { /* noop */ }
            }
          })
          .catch(err => { console.error("[onboarding] AI analysis error:", err instanceof Error ? err.message : err); })
          .finally(() => setAiPhase("done"));
      }
      if (!targetRole) {
        const aiRole = savedAiProfile?.headline && savedAiProfile.headline !== "Analyzing..." ? savedAiProfile.headline.split(/\s+with\s+/i)[0] : "";
        const parserRole = data.experience?.[0]?.title || "";
        const autoRole = aiRole || parserRole;
        if (autoRole) setTargetRole(autoRole);
      }
    }).catch(err => console.error("[onboarding-restore] PARSER ERROR:", err));
  }, [user?.resumeFileName, user?.resumeText]);

  // Auto re-analyze when profile is fallback/stale (e.g. previous analysis timed out)
  const reanalyzedRef = useRef(false);
  useEffect(() => {
    if (reanalyzedRef.current) return;
    if (!user || !resumeParsed) return;
    const hasRealScore = aiProfile?.resumeScore != null;
    if (hasRealScore) { reanalyzedRef.current = true; return; }
    const textForAnalysis = resumeText || user.resumeText;
    if (!textForAnalysis || textForAnalysis.length < 20) return;
    reanalyzedRef.current = true;
    setAiPhase("analyzing");
    analysisAbortRef.current?.abort();
    const ac = new AbortController();
    analysisAbortRef.current = ac;
    const timer = setTimeout(() => { ac.abort(); }, 20000);

    function getTokenFromStorage(): string | null {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw)?.access_token || null;
          }
        }
      } catch { /* noop */ }
      return null;
    }

    async function doAnalysis(): Promise<void> {
      let token = getTokenFromStorage();
      if (!token) {
        await new Promise(r => setTimeout(r, 2000));
        token = getTokenFromStorage();
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/analyze-resume", { method: "POST", headers, signal: ac.signal, body: JSON.stringify({ resumeText: textForAnalysis, targetRole }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.profile) {
        setAiProfile(data.profile);
        try { const cached = localStorage.getItem("hirestepx_resume"); if (cached) { const obj = JSON.parse(cached); obj.aiProfile = data.profile; localStorage.setItem("hirestepx_resume", JSON.stringify(obj)); } } catch { /* noop */ }
      }
    }

    doAnalysis()
      .catch(err => console.error("[onboarding] Auto re-analysis failed:", err instanceof Error ? err.message : err))
      .finally(() => { clearTimeout(timer); setAiPhase("done"); });
    return () => { clearTimeout(timer); ac.abort(); };
  }, [user, resumeParsed, resumeText, aiProfile?.resumeScore, targetRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress stage timer for resume analysis
  useEffect(() => {
    if (aiPhase !== "analyzing" && !resumeParsing) { setAnalysisStage(0); return; }
    setAnalysisStage(0);
    const timers = [
      setTimeout(() => setAnalysisStage(1), 2000),
      setTimeout(() => setAnalysisStage(2), 6000),
      setTimeout(() => setAnalysisStage(3), 12000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [aiPhase, resumeParsing]);

  // ─── Keyboard shortcut: Enter to go to dashboard ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === "Enter" && resumeParsed && aiPhase === "done" && userName.trim()) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resumeParsed, aiPhase, userName, starting]);

  // ─── File handling ───
  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setResumeError("File is too large. Please upload a file under 10 MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["pdf", "docx", "doc", "txt"];
    const allowedMimes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!ext || !allowedExts.includes(ext) || (file.type && !allowedMimes.includes(file.type))) {
      setResumeError("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    setFileName(file.name);
    setResumeError("");
    setResumeParsing(true);
    try {
      const { extractResumeText, parseResumeData } = await import("./resumeParser");
      const { analyzeResumeWithAI } = await import("./dashboardData");
      const text = await extractResumeText(file);
      if (!text || text.trim().length < 30) {
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (fileExt && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(fileExt)) {
          throw new Error("Image files aren't supported. Please upload a PDF, DOCX, or TXT resume.");
        }
        throw new Error("Very little text was extracted from this file. Please check that it contains your resume content, or try a different format (PDF or DOCX).");
      }
      const data = parseResumeData(text);
      setResumeText(text);
      setResumeParsed(data);
      // Save to localStorage immediately — Supabase columns may not exist
      try { localStorage.setItem("hirestepx_resume", JSON.stringify({ fileName: file.name, text, data })); } catch { /* quota */ }
      const fallback: ResumeProfile = {
        headline: data.name || "Analyzing...",
        summary: data.summary || "", yearsExperience: null, seniorityLevel: "",
        topSkills: [],
        keyAchievements: [], industries: [],
        interviewStrengths: [], interviewGaps: [],
        careerTrajectory: "",
      };
      setAiProfile(fallback);
      const autoRole = data.experience?.[0]?.title || "";
      if (autoRole && !targetRole) setTargetRole(autoRole);
      const parsedName = data.name || "";
      if (parsedName && !userName) setUserName(parsedName);
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = new AbortController();
      const currentAbort = analysisAbortRef.current;
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      let aiSuccess = false;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, targetRole || autoRole, currentAbort.signal),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000)),
          new Promise<null>((_, reject) => {
            currentAbort.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
          aiSuccess = true;
          if (finalProfile.headline && finalProfile.headline !== "Analyzing...") {
            setTargetRole(finalProfile.headline.split(/\s+with\s+/i)[0]);
          }
        }
      } catch (analysisErr: unknown) {
        if (analysisErr instanceof Error && analysisErr.message === "aborted") return;
        console.warn("[onboarding] AI analysis failed, using fallback:", analysisErr instanceof Error ? analysisErr.message : analysisErr);
      }
      if (!aiSuccess && !reanalyzedRef.current && data.skills.length > 0) {
        const cleanSkills = data.skills.filter(s =>
          s.length >= 2 && s.length < 30 &&
          !s.includes(".") &&
          s.split(/\s+/).length <= 4 &&
          !/^(and|or|the|with|for|from|working|worked|used|using|also|various)\b/i.test(s)
        );
        if (cleanSkills.length > 0) {
          finalProfile = { ...fallback, topSkills: cleanSkills.slice(0, 8), headline: data.name || "Your Profile" };
          setAiProfile(finalProfile);
        }
      }
      setResumeParsing(false);
      if (!reanalyzedRef.current) setAiPhase("done");
      const profileSave: Partial<Parameters<typeof updateUser>[0]> = {
        resumeFileName: file.name,
        resumeText: text,
        resumeData: { ...finalProfile, _type: aiSuccess ? "ai" : "fallback", _parsed: data } as unknown as ParsedResume,
      };
      if (!targetRole && autoRole) profileSave.targetRole = autoRole;
      if (data.name) profileSave.name = data.name;
      if (data.location) profileSave.city = data.location;
      if (finalProfile.seniorityLevel) {
        const seniorityMap: Record<string, string> = {
          "entry": "entry", "junior": "entry", "fresher": "fresher", "intern": "fresher",
          "mid": "mid", "mid-level": "mid",
          "senior": "senior", "staff": "senior", "principal": "senior",
          "lead": "lead",
          "director": "executive", "vp": "executive", "c-suite": "executive", "executive": "executive",
        };
        const mapped = seniorityMap[finalProfile.seniorityLevel.toLowerCase()] || "";
        if (mapped) profileSave.experienceLevel = mapped;
      }
      try { localStorage.setItem("hirestepx_resume", JSON.stringify({ fileName: file.name, text, data, aiProfile: finalProfile })); } catch { /* quota exceeded */ }
      setSaveStatus("saving");
      try {
        await updateUser(profileSave);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (saveErr) {
        console.error("[onboarding] Failed to save resume to profile:", saveErr);
        setSaveStatus("error");
      }
    } catch (err: unknown) {
      setResumeError(err instanceof Error ? err.message : "Failed to parse resume");
      setResumeText(""); setResumeParsed(null);
    } finally {
      setResumeParsing(false);
    }
  };

  /**
   * Finalize onboarding and navigate to the chosen destination.
   *   "interview" → /session/new?firstFree=1 (recommended path)
   *   "dashboard" → /dashboard
   *   "skip"      → /dashboard (no resume), tracked separately
   */
  const finalizeOnboarding = async (dest: "interview" | "dashboard" | "skip") => {
    if (starting) return;
    setStarting(true);
    startingRef.current = true;
    const saveData: Partial<Parameters<typeof updateUser>[0]> = {};
    if (userName.trim()) saveData.name = userName.trim();
    if (targetRole.trim()) saveData.targetRole = targetRole.trim();
    saveData.hasCompletedOnboarding = true;
    if (fileName) {
      saveData.resumeFileName = fileName;
      saveData.resumeText = resumeText;
      saveData.resumeData = (aiProfile
        ? { ...aiProfile, _type: "ai" }
        : { ...(resumeParsed || {}), _type: "fallback" }
      ) as unknown as ParsedResume;
    }
    setSaveStatus("saving");
    if (Object.keys(saveData).length > 0) {
      try {
        await Promise.race([
          updateUser(saveData),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]);
        setSaveStatus("saved");
      } catch (err) {
        console.warn("[finalizeOnboarding] save failed or timed out, proceeding anyway:", err);
        setSaveStatus("error");
      }
    } else {
      setSaveStatus("saved");
    }
    clearObStep();
    track("onboarding_completed", {
      targetRole: targetRole || "",
      hasResume: !!fileName,
      resumeScore: aiProfile?.resumeScore ?? null,
      dest,
    });
    if (dest === "interview") router.push("/session/new?firstFree=1");
    else router.push("/dashboard");
  };

  const handleStartInterview = () => { finalizeOnboarding("interview"); };
  const handleGoToDashboard = () => { finalizeOnboarding("dashboard"); };
  const handleSkip = () => { finalizeOnboarding("skip"); };
  // Back-compat: Enter key defaults to dashboard (safer than auto-starting an interview).
  const handleStart = handleGoToDashboard;

  const isBusy = resumeParsing || aiPhase === "analyzing";
  const noResume = !resumeParsed && !resumeParsing && aiPhase !== "analyzing";
  const nameEmpty = aiPhase === "done" && !userName.trim();
  const isContinueDisabled = isBusy || noResume || nameEmpty;

  const handleReanalyze = () => {
    setAiPhase("analyzing");
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = new AbortController();
    const ac = analysisAbortRef.current;
    const timer = setTimeout(() => ac.abort(), 30000);
    import("./dashboardData").then(({ analyzeResumeWithAI }) => {
      analyzeResumeWithAI(resumeText, targetRole, ac.signal)
        .then(r => { if (r && typeof r === "object" && "profile" in r) setAiProfile(r.profile); })
        .catch(err => { console.error("[onboarding] Re-analyze failed:", err instanceof Error ? err.message : err); })
        .finally(() => { clearTimeout(timer); setAiPhase("done"); });
    });
  };

  const handleCancelAnalysis = () => {
    analysisAbortRef.current?.abort();
    setResumeParsing(false);
    setAiPhase("idle");
    setFileName("");
    setResumeText("");
    setResumeParsed(null);
    setAiProfile(null);
  };

  const handleRemoveResume = () => {
    undoRef.current = { fileName, resumeText, resumeParsed, aiProfile, aiPhase, targetRole, userName };
    setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); setAiProfile(null); setAiPhase("idle"); setTargetRole(""); setUserName("");
    try { localStorage.removeItem("hirestepx_resume"); } catch { /* noop */ }
    setShowUndo(true); clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => { setShowUndo(false); undoRef.current = null; }, 12000);
  };

  const handleUndo = () => {
    if (!undoRef.current) return;
    const s = undoRef.current;
    setFileName(s.fileName); setResumeText(s.resumeText); setResumeParsed(s.resumeParsed); setAiProfile(s.aiProfile); setAiPhase(s.aiPhase); setTargetRole(s.targetRole); setUserName(s.userName);
    setShowUndo(false); clearTimeout(undoTimerRef.current); undoRef.current = null;
  };

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,179,127,0.03) 0%, ${c.obsidian} 70%)`, display: "flex", flexDirection: "column", position: "relative" }}>
      {user && !user.emailVerified && <EmailVerificationBanner email={user.email} />}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes progressFill { 0% { width: 0%; } 30% { width: 35%; } 60% { width: 65%; } 80% { width: 80%; } 100% { width: 92%; } }
        .ob-progress-bar { animation: progressFill 18s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton-line { background: linear-gradient(90deg, rgba(245,242,237,0.03) 25%, rgba(245,242,237,0.07) 50%, rgba(245,242,237,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: 6px; }
        .fade-up-1 { animation: fadeUp 0.35s ease-out 0ms both; }
        .fade-up-2 { animation: fadeUp 0.35s ease-out 80ms both; }
        .fade-up-3 { animation: fadeUp 0.35s ease-out 160ms both; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ob-card { background: rgba(17,17,19,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(245,242,237,0.06); }
        .ob-drop:hover { border-color: rgba(212,179,127,0.35) !important; background: rgba(212,179,127,0.02) !important; }
        @media (max-width: 768px) {
          .ob-s1-split { flex-direction: column !important; }
          .ob-s1-left { max-width: 100% !important; }
          .ob-s1-profile-grid { grid-template-columns: 1fr !important; }
          .ob-s1-sg-grid { grid-template-columns: 1fr !important; }
          .ob-s1-header { flex-direction: column !important; }
          .ob-s1-header-text { max-width: 100% !important; }
          .ob-s1-header-actions { position: static !important; margin-top: 8px !important; }
          .ob-s1-name-score { grid-template-columns: 1fr !important; }
        }
        @media (max-height: 700px) {
          .ob-content-area { padding-top: 16px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      <TopBar
        step={1} emailUnverified={!!(user && !user.emailVerified)}
        onNavigateHome={() => router.push("/")}
        onStepClick={() => {}}
        onLogout={async () => { await logout(); router.push("/"); }}
        userEmail={user?.email || ""}
        userAvatar={undefined}
        userName={user?.name || userName}
      />

      <div className="ob-content-area" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div style={{ width: "100%", maxWidth: !resumeParsed ? "min(680px, calc(100vw - 32px))" : "min(960px, calc(100vw - 32px))", transition: "max-width 0.4s ease" }}>
          {!resumeParsed && !resumeParsing && aiPhase !== "analyzing" && (
            <ResumeEmptyState
              isDragging={isDragging} dragFileName={dragFileName} resumeError={resumeError}
              showUndo={showUndo} fileInputRef={fileInputRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); if (!dragFileName && e.dataTransfer.types.includes("Files")) setDragFileName(e.dataTransfer.items?.[0]?.getAsFile?.()?.name || ""); }}
              onDragLeave={() => { setIsDragging(false); setDragFileName(""); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); setDragFileName(""); handleFileChange(e.dataTransfer.files[0]); }}
              onFileChange={handleFileChange} onUndo={handleUndo}
              onSkip={handleSkip}
            />
          )}
          {(resumeParsing || aiPhase === "analyzing") && aiPhase !== "done" && (
            <ResumeLoadingState analysisStage={analysisStage} fileName={fileName} onCancel={handleCancelAnalysis} />
          )}
          {resumeParsed && !resumeParsing && aiPhase === "done" && (
            <ProfileReadyState
              aiProfile={aiProfile || { headline: resumeParsed.name || "Your Profile", summary: "", yearsExperience: null, seniorityLevel: "", topSkills: resumeParsed.skills?.slice(0, 8) || [], keyAchievements: [], industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "" }}
              resumeParsed={resumeParsed} userName={userName}
              fileName={fileName} resumeText={resumeText} targetRole={targetRole}
              fileInputRef={fileInputRef} onUserNameChange={setUserName}
              onReanalyze={handleReanalyze} onRemove={handleRemoveResume}
              onReplaceFile={() => fileInputRef.current?.click()}
            />
          )}

          <NavigationFooter
            isContinueDisabled={isContinueDisabled}
            starting={starting} saveStatus={saveStatus}
            onStart={handleStart}
            onStartInterview={handleStartInterview}
            onGoToDashboard={handleGoToDashboard}
            resumeScore={aiProfile?.resumeScore ?? null}
            hasResume={!!resumeParsed && aiPhase === "done"}
          />
        </div>
      </div>
    </div>
  );
}

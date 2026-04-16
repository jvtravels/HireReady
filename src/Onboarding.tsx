import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";
import { analyzeResumeWithAI, type ResumeProfile } from "./dashboardData";
import { unlockAudio } from "./tts";
import { UpgradeModal } from "./dashboardComponents";
import { track } from "@vercel/analytics";
import { ROLE_SUGGESTIONS, COMPANY_SUGGESTIONS, sampleDiverse } from "./onboardingData";
import {
  EmailVerificationBanner, TopBar,
  ResumeEmptyState, ResumeLoadingState, ProfileReadyState,
  SessionSetupStep, PermissionsStep, NavigationFooter, LaunchOverlay,
} from "./OnboardingPanels";

const TOTAL_STEPS = 3;

/* ─── Autocomplete Input Component ─── */
function AutocompleteInput({
  id, value, onChange, placeholder, suggestions, label, required, error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suggestions: string[];
  label?: string;
  required?: boolean;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Stable diverse sample for empty-state (computed once)
  const [diverseSample] = useState(() => sampleDiverse(suggestions, 8));

  // Cleanup: set focused to false on unmount
  useEffect(() => {
    return () => { setFocused(false); };
  }, []);
  const filtered = focused
    ? value.length > 0
      ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
      : diverseSample // Show diverse suggestions from across categories
    : [];

  // Update dropdown position when filtered results change or input is focused
  useEffect(() => {
    if (filtered.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 8; // min distance from viewport edge
      let left = rect.left;
      let width = rect.width;
      // Clamp width so dropdown doesn't exceed viewport
      if (width > vw - pad * 2) width = vw - pad * 2;
      // Clamp left so dropdown stays within viewport
      if (left < pad) left = pad;
      if (left + width > vw - pad) left = vw - pad - width;
      // If dropdown would overflow bottom, show above input
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const top = spaceBelow < 120 ? Math.max(pad, rect.top - 224) : rect.bottom + 4;
      setDropdownPos({ top, left, width });
    }
  }, [filtered.length, focused, value]);

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 8 }}>
          {label} {required && <span style={{ color: c.ember }}>*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        id={id} type="text" value={value}
        onChange={(e) => { onChange(e.target.value); setSelectedIdx(-1); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); setFocused(false); inputRef.current?.blur(); return; }
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); onChange(filtered[selectedIdx]); setFocused(false); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 10,
          background: c.graphite, border: `1.5px solid ${error ? c.ember : focused ? c.gilt : c.border}`,
          color: c.ivory, fontFamily: font.ui, fontSize: 14,
          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
        }}
      />
      {error && <p id={`${id}-error`} role="alert" style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>{error}</p>}
      {filtered.length > 0 && dropdownPos && createPortal(
        <div role="listbox" style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button key={s} role="option" aria-selected={i === selectedIdx} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none", textAlign: "left",
                fontFamily: font.ui, fontSize: 13, cursor: "pointer",
                background: i === selectedIdx ? "rgba(212,179,127,0.08)" : "transparent",
                color: i === selectedIdx ? c.ivory : c.chalk,
              }}>
              {s}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const OB_STEP_KEY = "hirestepx_ob_step";
const OB_FORM_KEY = "hirestepx_ob_form";
function saveObStep(step: number) { try { localStorage.setItem(OB_STEP_KEY, String(step)); } catch { /* expected: localStorage may be unavailable */ } }
function loadObStep(): number { try { const v = localStorage.getItem(OB_STEP_KEY); return v ? Math.min(Math.max(parseInt(v), 1), TOTAL_STEPS) : 1; } catch { /* expected: localStorage may be unavailable */ return 1; } }
function clearObStep() { try { localStorage.removeItem(OB_STEP_KEY); localStorage.removeItem(OB_FORM_KEY); } catch { /* expected: localStorage may be unavailable */ } }
function saveObForm(data: { targetRole: string; targetCompany: string; interviewFocus: string[]; sessionLength: string }) {
  try { localStorage.setItem(OB_FORM_KEY, JSON.stringify(data)); } catch { /* expected: localStorage may be unavailable */ }
}
function loadObForm(): { targetRole: string; targetCompany: string; interviewFocus: string[]; sessionLength: string } | null {
  try { const raw = localStorage.getItem(OB_FORM_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

const SESSION_LENGTH_MAP: Record<string, 10 | 15 | 25> = { "10m": 10, "15m": 15, "25m": 25 };

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();

  // Redirect returning users who already completed onboarding (but not during active start)
  const startingRef = useRef(false);
  useEffect(() => {
    if (user?.hasCompletedOnboarding && !startingRef.current) navigate("/dashboard", { replace: true });
  }, [user?.hasCompletedOnboarding, navigate]);

  const [step, setStep] = useState(loadObStep);
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");

  // ─── Step 1: Resume ───
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
  const undoRef = useRef<{ fileName: string; resumeText: string; resumeParsed: ParsedResume | null; aiProfile: ResumeProfile | null; aiPhase: "idle" | "analyzing" | "done"; targetRole: string; targetCompany: string; userName: string } | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [resumeSkipped, setResumeSkipped] = useState(false);
  const undoTimerRef = useRef<number>(0);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // ─── Restore resume from user profile on mount/refresh ───
  const resumeRestoredRef = useRef(false);
  useEffect(() => {
    if (resumeRestoredRef.current || resumeParsed || resumeParsing) return;
    if (!user?.resumeFileName || !user?.resumeText) return;
    resumeRestoredRef.current = true;
    setFileName(user.resumeFileName);
    setResumeText(user.resumeText);
    // Restore parsed data from DB
    const data = user.resumeData || parseResumeData(user.resumeText);
    setResumeParsed(data);
    // Restore AI profile if it was saved with the resume data
    const savedAiProfile = (data as ParsedResume & { aiProfile?: ResumeProfile })?.aiProfile;
    // Prefer parsed name from resume over AI headline
    if (data.name && !userName) setUserName(data.name);
    if (savedAiProfile && savedAiProfile.headline) {
      setAiProfile(savedAiProfile);
      setAiPhase("done");
      if (!data.name && !userName && savedAiProfile.headline !== "Analyzing...") {
        setUserName(savedAiProfile.headline.split(/[—–|,]/)[0].trim().slice(0, 40));
      }
    } else {
      // No AI profile saved — re-analyze
      setAiPhase("analyzing");
      const autoRole = data.experience?.[0]?.title || "";
      analyzeResumeWithAI(user.resumeText, targetRole || autoRole)
        .then(result => {
          if (result && "profile" in result) {
            setAiProfile(result.profile);
          }
        })
        .catch(() => {})
        .finally(() => setAiPhase("done"));
    }
    if (!targetRole) {
      // Prefer AI headline (accurate role title) over raw parser title (may be company name)
      const aiRole = savedAiProfile?.headline && savedAiProfile.headline !== "Analyzing..." ? savedAiProfile.headline : "";
      const parserRole = data.experience?.[0]?.title || "";
      const autoRole = aiRole || parserRole;
      if (autoRole) {
        setTargetRole(autoRole);
        setRoleAutoFilled(true);
      }
    }
  }, [user?.resumeFileName, user?.resumeText]);

  // ─── Step 2: Profile (restored from localStorage if available) ───
  const [savedForm] = useState(loadObForm);
  const [targetRole, setTargetRole] = useState(savedForm?.targetRole || user?.targetRole || "");
  const [roleAutoFilled, setRoleAutoFilled] = useState(false);
  const [roleTouched, setRoleTouched] = useState(false);
  const [targetCompany, setTargetCompany] = useState(savedForm?.targetCompany || user?.targetCompany || "");
  const [interviewFocus, setInterviewFocus] = useState<string[]>(savedForm?.interviewFocus?.slice(0, 1) || ["Behavioral"]);
  const [upgradedTier, setUpgradedTier] = useState<string | null>(null); // Fix #8: local override after upgrade
  const isFreeUser = upgradedTier ? false : (!user?.subscriptionTier || user.subscriptionTier === "free");
  const [sessionLength, setSessionLength] = useState(() => {
    const saved = savedForm?.sessionLength || "10m";
    // Free users can only use 10m
    if (isFreeUser && saved !== "10m") return "10m";
    return saved;
  });

  // Auto-save form data on changes
  useEffect(() => {
    saveObForm({ targetRole, targetCompany, interviewFocus, sessionLength });
  }, [targetRole, targetCompany, interviewFocus, sessionLength]);

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

  // ─── Step 3: Mic ───
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);

  const goNext = () => { setSlideDir("forward"); setStep(s => { const next = Math.min(s + 1, TOTAL_STEPS); saveObStep(next); track("onboarding_step", { step: next }); return next; }); };
  const goBack = () => { setSlideDir("back"); setStep(s => { const next = Math.max(s - 1, 1); saveObStep(next); return next; }); };

  // ─── File handling ───
  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    // Reset file input so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
    // File size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setResumeError("File is too large. Please upload a file under 10 MB.");
      return;
    }
    // Validate file type by extension and MIME
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
    setResumeSkipped(false);
    try {
      const text = await extractResumeText(file);
      if (!text || text.trim().length < 30) {
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (fileExt && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(fileExt)) {
          throw new Error("Image files aren't supported. Please upload a PDF, DOCX, or TXT resume.");
        }
        // For PDFs, extractResumeText now throws with a specific scanned-PDF message.
        // This catch handles DOCX/TXT files that yield very little text.
        throw new Error("Very little text was extracted from this file. Please check that it contains your resume content, or try a different format (PDF or DOCX).");
      }
      const data = parseResumeData(text);
      setResumeText(text);
      setResumeParsed(data);
      // Build minimal fallback profile — don't use client-parsed skills (often garbage from PDFs)
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
      if (autoRole && !targetRole) { setTargetRole(autoRole); setRoleAutoFilled(true); }
      const parsedName = data.name || "";
      if (parsedName && !userName) { setUserName(parsedName); }
      // AI analysis in background — abort previous if any
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = new AbortController();
      const currentAbort = analysisAbortRef.current;
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      let aiSuccess = false;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, targetRole || autoRole),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
          new Promise<null>((_, reject) => {
            currentAbort.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
          aiSuccess = true;
          // Auto-fill role from AI headline — it's more accurate than the raw parser
          // Override if role was auto-filled (not user-edited) or empty
          if (finalProfile.headline && finalProfile.headline !== "Analyzing..." && (!roleTouched)) {
            setTargetRole(finalProfile.headline);
            setRoleAutoFilled(true);
          }
        }
      } catch (analysisErr: unknown) {
        if (analysisErr instanceof Error && analysisErr.message === "aborted") return; // Upload was superseded
      }
      // If AI failed, use client-parsed data as fallback but only the clean fields
      if (!aiSuccess && data.skills.length > 0) {
        // Filter out skills that look like sentence fragments
        const cleanSkills = data.skills.filter(s => s.length < 30 && !s.includes(".") && s.split(/\s+/).length <= 4);
        if (cleanSkills.length > 0) {
          finalProfile = { ...fallback, topSkills: cleanSkills.slice(0, 8), headline: data.name || "Your Profile" };
          setAiProfile(finalProfile);
        }
      }
      setResumeParsing(false);
      setAiPhase("done");
      // Save resume info to profile immediately — only set name/role if not already set
      const profileSave: Partial<Parameters<typeof updateUser>[0]> = {
        resumeFileName: file.name,
        resumeText: text,
        resumeData: { ...data, aiProfile: finalProfile } as unknown as ParsedResume,
      };
      if (!targetRole && autoRole) profileSave.targetRole = autoRole;
      if (data.name) profileSave.name = data.name;
      if (data.location) profileSave.city = data.location;
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

  // ─── Mic ───
  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStatus("granted");
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(poll);
      };
      poll();
    } catch { setMicStatus("denied"); }
  }, []);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (step < TOTAL_STEPS) {
          if (step === 1 && !resumeSkipped && (!resumeParsed || aiPhase !== "done" || !userName.trim())) return;
          if (step === 2 && (!targetRole.trim() || interviewFocus.length === 0)) return;
          goNext();
        } else {
          handleStart();
        }
      } else if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, resumeParsed, aiPhase, userName, targetRole, interviewFocus, starting]);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    startingRef.current = true;
    // Allow proceeding even without mic — text input fallback exists in Interview
    cancelAnimationFrame(animFrameRef.current);
    // Don't stop mic stream — Interview component will re-use the permission grant
    // Only include fields that have values — don't overwrite existing data with empty strings
    const saveData: Partial<Parameters<typeof updateUser>[0]> = {};
    if (userName.trim()) saveData.name = userName.trim();
    if (targetRole.trim()) saveData.targetRole = targetRole.trim();
    if (targetCompany.trim()) saveData.targetCompany = targetCompany.trim();
    if (interviewFocus.length > 0) saveData.interviewTypes = interviewFocus;
    if (sessionLength) saveData.preferredSessionLength = SESSION_LENGTH_MAP[sessionLength] || 15;
    saveData.hasCompletedOnboarding = true;
    // Only send resume fields if user uploaded a resume in this session
    if (fileName) {
      saveData.resumeFileName = fileName;
      saveData.resumeText = resumeText;
      saveData.resumeData = (aiProfile || resumeParsed) as unknown as ParsedResume;
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
        console.warn("[handleStart] save failed or timed out, proceeding anyway:", err);
        setSaveStatus("error");
      }
    } else {
      setSaveStatus("saved");
    }
    clearObStep();
    unlockAudio();
    // Map onboarding focus labels to SessionSetup type IDs
    const FOCUS_TO_TYPE: Record<string, string> = { "Behavioral": "behavioral", "Strategic": "strategic", "Technical Leadership": "technical", "Case Study": "case-study", "Campus Placement": "campus-placement", "HR Round": "hr-round", "Management": "management", "Panel Interview": "panel", "Salary Negotiation": "salary-negotiation", "Government / PSU": "government-psu" };
    const focusType = FOCUS_TO_TYPE[interviewFocus[0]] || "behavioral";
    track("onboarding_complete", { focus: focusType, sessionLength, role: targetRole, hasMic: micStatus === "granted" });
    track("onboarding_completed", { targetRole: targetRole || "", hasResume: !!fileName });
    // Show launch animation before navigating
    setLaunching(true);
    await new Promise(r => setTimeout(r, 1400));
    navigate(`/interview?type=${encodeURIComponent(focusType)}&difficulty=standard&mini=true`);
  };

  const isStep1Busy = step === 1 && (resumeParsing || aiPhase === "analyzing");
  const isStep1NoResume = step === 1 && !resumeParsed && !resumeParsing && aiPhase !== "analyzing" && !resumeSkipped;
  const isStep1NameEmpty = step === 1 && aiPhase === "done" && !userName.trim() && !resumeSkipped;
  const isStep2Disabled = step === 2 && (!targetRole.trim() || interviewFocus.length === 0);
  const isContinueDisabled = isStep1Busy || isStep1NoResume || isStep1NameEmpty || isStep2Disabled;

  const handleReanalyze = () => {
    setAiPhase("analyzing");
    Promise.race([analyzeResumeWithAI(resumeText, targetRole), new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000))])
      .then(r => { if (r && typeof r === "object" && "profile" in r) setAiProfile(r.profile); setAiPhase("done"); })
      .catch(() => setAiPhase("done"));
  };

  const handleRemoveResume = () => {
    undoRef.current = { fileName, resumeText, resumeParsed, aiProfile, aiPhase, targetRole, targetCompany, userName };
    setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); setAiProfile(null); setAiPhase("idle"); setTargetRole(""); setTargetCompany(""); setUserName("");
    setShowUndo(true); clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => { setShowUndo(false); undoRef.current = null; }, 12000);
  };

  const handleUndo = () => {
    if (!undoRef.current) return;
    const s = undoRef.current;
    setFileName(s.fileName); setResumeText(s.resumeText); setResumeParsed(s.resumeParsed); setAiProfile(s.aiProfile); setAiPhase(s.aiPhase); setTargetRole(s.targetRole); setTargetCompany(s.targetCompany); setUserName(s.userName);
    setShowUndo(false); clearTimeout(undoTimerRef.current); undoRef.current = null;
  };

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,179,127,0.03) 0%, ${c.obsidian} 70%)`, display: "flex", flexDirection: "column", position: "relative" }}>
      {user && !user.emailVerified && <EmailVerificationBanner />}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes progressFill { 0% { width: 0%; } 30% { width: 35%; } 60% { width: 65%; } 80% { width: 80%; } 100% { width: 92%; } }
        .ob-progress-bar { animation: progressFill 18s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        @keyframes slideInForward { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInBack { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        .ob-step { animation: ${slideDir === "forward" ? "slideInForward" : "slideInBack"} 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton-line { background: linear-gradient(90deg, rgba(245,242,237,0.03) 25%, rgba(245,242,237,0.07) 50%, rgba(245,242,237,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: 6px; }
        .fade-up-1 { animation: fadeUp 0.35s ease-out 0ms both; }
        .fade-up-2 { animation: fadeUp 0.35s ease-out 80ms both; }
        .fade-up-3 { animation: fadeUp 0.35s ease-out 160ms both; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes launchIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes launchPulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
        .ob-card { background: rgba(17,17,19,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(245,242,237,0.06); }
        .ob-card-gold { background: linear-gradient(135deg, rgba(17,17,19,0.8) 0%, rgba(212,179,127,0.06) 100%); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(212,179,127,0.1); }
        .ob-drop:hover { border-color: rgba(212,179,127,0.35) !important; background: rgba(212,179,127,0.02) !important; }
        .ob-focus-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; border-color: rgba(212,179,127,0.3) !important; }
        @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(212,179,127,0); } 50% { box-shadow: 0 0 0 8px rgba(212,179,127,0.12); } }
        .ob-mic-pulse { animation: micPulse 2s ease-in-out infinite; }
        @media (max-width: 768px) {
          .ob-s1-split { flex-direction: column !important; }
          .ob-s1-left { max-width: 100% !important; }
          .ob-s1-profile-grid { grid-template-columns: 1fr !important; }
          .ob-s1-sg-grid { grid-template-columns: 1fr !important; }
          .ob-s1-header { flex-direction: column !important; }
          .ob-s1-header-text { max-width: 100% !important; }
          .ob-s1-header-actions { position: static !important; margin-top: 8px !important; }
          .ob-s1-name-score { grid-template-columns: 1fr !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr 1fr !important; }
          .ob-s2-bottom-row { grid-template-columns: 1fr !important; }
          .ob-s2-session-grid { grid-template-columns: 1fr !important; }
          .ob-s2-role-grid { grid-template-columns: 1fr !important; }
          .ob-s3-profile-row { flex-direction: column !important; }
        }
        @media (max-height: 700px) {
          .ob-content-area { padding-top: 16px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      <TopBar step={step} emailUnverified={!!(user && !user.emailVerified)} onNavigateHome={() => navigate("/")} onStepClick={(s) => { setSlideDir("back"); setStep(s); saveObStep(s); }} onLogout={async () => { await logout(); navigate("/"); }} />

      {/* ─── Content ─── */}
      <div className="ob-content-area" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div key={step} className="ob-step" style={{ width: "100%", maxWidth: step === 3 ? "min(680px, calc(100vw - 32px))" : (step === 1 && !resumeParsed) ? "min(680px, calc(100vw - 32px))" : "min(960px, calc(100vw - 32px))", transition: "max-width 0.4s ease" }}>

          {step === 1 && (
            <div>
              {!resumeParsed && !resumeParsing && aiPhase !== "analyzing" && (
                <ResumeEmptyState
                  isDragging={isDragging} dragFileName={dragFileName} resumeError={resumeError}
                  showUndo={showUndo} fileInputRef={fileInputRef}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); if (!dragFileName && e.dataTransfer.types.includes("Files")) setDragFileName(e.dataTransfer.items?.[0]?.getAsFile?.()?.name || ""); }}
                  onDragLeave={() => { setIsDragging(false); setDragFileName(""); }}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); setDragFileName(""); handleFileChange(e.dataTransfer.files[0]); }}
                  onFileChange={handleFileChange} onUndo={handleUndo}
                  onSkip={() => { setResumeSkipped(true); goNext(); }}
                />
              )}
              {(resumeParsing || aiPhase === "analyzing") && aiPhase !== "done" && (
                <ResumeLoadingState analysisStage={analysisStage} fileName={fileName} />
              )}
              {resumeParsed && !resumeParsing && aiPhase === "done" && aiProfile && (
                <ProfileReadyState
                  aiProfile={aiProfile} resumeParsed={resumeParsed} userName={userName}
                  fileName={fileName} resumeText={resumeText} targetRole={targetRole}
                  fileInputRef={fileInputRef} onUserNameChange={setUserName}
                  onReanalyze={handleReanalyze} onRemove={handleRemoveResume}
                  onReplaceFile={() => fileInputRef.current?.click()}
                />
              )}
            </div>
          )}

          {step === 2 && (
            <SessionSetupStep
              targetRole={targetRole} targetCompany={targetCompany} interviewFocus={interviewFocus}
              sessionLength={sessionLength} roleAutoFilled={roleAutoFilled} roleTouched={roleTouched}
              isFreeUser={isFreeUser} resumeSkipped={resumeSkipped} userName={userName} onUserNameChange={setUserName}
              onRoleChange={(v) => { setTargetRole(v); setRoleAutoFilled(false); setRoleTouched(true); }}
              onCompanyChange={setTargetCompany} onFocusChange={setInterviewFocus}
              onSessionLengthChange={setSessionLength} onShowUpgrade={() => setShowUpgradeModal(true)}
              AutocompleteInput={AutocompleteInput} ROLE_SUGGESTIONS={ROLE_SUGGESTIONS} COMPANY_SUGGESTIONS={COMPANY_SUGGESTIONS}
            />
          )}

          {step === 3 && (
            <PermissionsStep
              micStatus={micStatus} micLevel={micLevel} userName={userName} fileName={fileName}
              targetRole={targetRole} targetCompany={targetCompany} interviewFocus={interviewFocus}
              sessionLength={sessionLength} onRequestMic={requestMic}
              onEditStep={(s) => { setSlideDir("back"); setStep(s); }}
            />
          )}

          <NavigationFooter
            step={step} totalSteps={TOTAL_STEPS} isContinueDisabled={isContinueDisabled}
            starting={starting} micStatus={micStatus} saveStatus={saveStatus}
            interviewFocus={interviewFocus} onBack={goBack} onNext={goNext} onStart={handleStart}
          />
        </div>
      </div>

      {launching && <LaunchOverlay interviewFocus={interviewFocus} />}

      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          sessionsUsed={0}
          user={user}
          currentTier={user?.subscriptionTier || "free"}
          onPaymentSuccess={(tier, start, end) => {
            setShowUpgradeModal(false);
            setUpgradedTier(tier);
            if (sessionLength === "10m") setSessionLength("15m");
            updateUser({ subscriptionTier: tier as "starter" | "pro", subscriptionStart: start, subscriptionEnd: end });
            track("onboarding_upgrade", { tier });
          }}
        />
      )}
    </div>
  );
}

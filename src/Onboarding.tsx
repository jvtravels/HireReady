import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { extractResumeText, parseResumeData, type ParsedResume } from "./resumeParser";
import { analyzeResumeWithAI, type ResumeProfile } from "./dashboardData";

const TOTAL_STEPS = 3;

/* ─── Suggestion data ─── */
const ROLE_SUGGESTIONS = [
  "Senior Software Engineer", "Senior Engineering Manager", "Staff Engineer", "Principal Engineer",
  "VP of Engineering", "Director of Engineering", "Engineering Manager", "Head of Engineering", "CTO",
  "Director of Product", "Senior Product Manager", "VP of Product", "Head of Product", "Chief Product Officer",
  "Head of Design", "Senior UX Designer", "Design Manager", "VP of Design",
  "Chief of Staff", "VP of Marketing", "Director of Marketing", "Head of Growth",
  "Director of Operations", "VP of Operations", "Data Science Manager", "Head of Data",
  "ML Engineering Manager", "Director of Analytics", "VP of Sales", "Director of Sales",
  "Solutions Architect", "Technical Program Manager", "Senior TPM", "Director of QA", "VP of People", "Head of Talent",
];

const COMPANY_SUGGESTIONS = [
  "Google", "Meta", "Amazon", "Apple", "Microsoft", "Netflix", "Stripe", "Airbnb", "Uber", "Spotify",
  "Databricks", "Figma", "Notion", "Coinbase", "Salesforce", "Adobe", "Oracle", "Snowflake", "Palantir", "Shopify",
  "Square (Block)", "Atlassian", "Slack", "LinkedIn", "Twitter (X)", "Pinterest", "Snap", "Lyft", "DoorDash",
  "Instacart", "Robinhood", "Plaid", "OpenAI", "Anthropic", "Scale AI",
  "Series A Startup", "Series B Startup", "Series C+ Startup", "Pre-seed / Seed Startup", "Enterprise / Fortune 500",
];

/* ─── Autocomplete Input Component ─── */
function AutocompleteInput({
  id, value, onChange, placeholder, suggestions, label, required,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suggestions: string[];
  label?: string;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const filtered = focused && value.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 6)
    : [];

  // Update dropdown position when filtered results change or input is focused
  useEffect(() => {
    if (filtered.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
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
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && selectedIdx >= 0) { e.preventDefault(); onChange(filtered[selectedIdx]); setFocused(false); }
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 10,
          background: c.graphite, border: `1.5px solid ${focused ? c.gilt : c.border}`,
          color: c.ivory, fontFamily: font.ui, fontSize: 14,
          outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
        }}
      />
      {filtered.length > 0 && dropdownPos && createPortal(
        <div style={{
          position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map((s, i) => (
            <button key={s} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none", textAlign: "left",
                fontFamily: font.ui, fontSize: 13, cursor: "pointer",
                background: i === selectedIdx ? "rgba(201,169,110,0.08)" : "transparent",
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

const OB_STEP_KEY = "hireready_ob_step";
function saveObStep(step: number) { try { localStorage.setItem(OB_STEP_KEY, String(step)); } catch {} }
function loadObStep(): number { try { const v = localStorage.getItem(OB_STEP_KEY); return v ? Math.min(Math.max(parseInt(v), 1), TOTAL_STEPS) : 1; } catch { return 1; } }
function clearObStep() { try { localStorage.removeItem(OB_STEP_KEY); } catch {} }

const SESSION_LENGTH_MAP: Record<string, 10 | 15 | 25> = { "10m": 10, "15m": 15, "25m": 25 };

export default function Onboarding() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [step, setStep] = useState(loadObStep);
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");

  // ─── Step 1: Resume ───
  const [fileName, setFileName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeParsed, setResumeParsed] = useState<ParsedResume | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragFileName, setDragFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiProfile, setAiProfile] = useState<ResumeProfile | null>(null);
  const [aiPhase, setAiPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const undoRef = useRef<{ fileName: string; resumeText: string; resumeParsed: ParsedResume | null; aiProfile: ResumeProfile | null; aiPhase: "idle" | "analyzing" | "done"; targetRole: string; targetCompany: string } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<number>(0);

  // ─── Step 2: Profile ───
  const [targetRole, setTargetRole] = useState("");
  const [roleAutoFilled, setRoleAutoFilled] = useState(false);
  const [targetCompany, setTargetCompany] = useState("");
  const [interviewFocus, setInterviewFocus] = useState<string[]>(["Behavioral"]);
  const [sessionLength, setSessionLength] = useState("15m");

  // ─── Step 3: Mic/Camera ───
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [camStatus, setCamStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [micLevel, setMicLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);

  const goNext = () => { setSlideDir("forward"); setStep(s => { const next = Math.min(s + 1, TOTAL_STEPS); saveObStep(next); return next; }); };
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
    setFileName(file.name);
    setResumeError("");
    setResumeParsing(true);
    try {
      const text = await extractResumeText(file);
      if (!text || text.trim().length < 30) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) {
          throw new Error("Image files aren't supported. Please upload a PDF, DOCX, or TXT resume.");
        }
        throw new Error("We couldn't extract text from this file. Try a different format.");
      }
      const data = parseResumeData(text);
      setResumeText(text);
      setResumeParsed(data);
      // Build fallback profile
      const fallback: ResumeProfile = {
        headline: data.name || "Your Profile",
        summary: "", yearsExperience: null, seniorityLevel: "",
        topSkills: data.skills.slice(0, 8),
        keyAchievements: [], industries: [],
        interviewStrengths: [], interviewGaps: [],
        careerTrajectory: "",
      };
      setAiProfile(fallback);
      const autoRole = data.experience?.[0]?.title || "";
      if (autoRole && !targetRole) { setTargetRole(autoRole); setRoleAutoFilled(true); }
      // AI analysis in background
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, targetRole || autoRole),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
        }
      } catch {}
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
      console.log("[onboarding] Saving resume to profile:", { fileName: profileSave.resumeFileName, textLength: profileSave.resumeText?.length, hasData: !!profileSave.resumeData });
      try {
        await updateUser(profileSave);
        console.log("[onboarding] Resume saved to profile successfully");
      } catch (saveErr) {
        console.error("[onboarding] Failed to save resume to profile:", saveErr);
      }
    } catch (err: any) {
      setResumeError(err.message || "Failed to parse resume");
      setResumeText(""); setResumeParsed(null);
    } finally {
      setResumeParsing(false);
    }
  };

  // ─── Mic/Camera ───
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

  const camStreamRef = useRef<MediaStream | null>(null);
  const requestCamera = useCallback(async () => {
    setCamStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      setCamStatus("granted");
      if (streamRef.current) { stream.getTracks().forEach(t => streamRef.current!.addTrack(t)); }
      else { streamRef.current = stream; }
    } catch (err: any) {
      setCamStatus("denied");
      console.warn("Camera access denied:", err?.name, err?.message);
    }
  }, []);

  // Attach camera stream to video element when it mounts or step changes
  useEffect(() => {
    if (step === 3 && camStatus === "granted" && videoRef.current && camStreamRef.current) {
      // Check if camera tracks are still active
      const videoTracks = camStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0 && videoTracks[0].readyState === "live") {
        videoRef.current.srcObject = camStreamRef.current;
      } else {
        // Stream died (e.g., navigated away and back) — reset status
        setCamStatus("idle");
        camStreamRef.current = null;
      }
    }
  }, [camStatus, step]);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current?.getTracks().forEach(t => t.stop());
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
          if (step === 2 && (!targetRole.trim() || interviewFocus.length === 0)) return;
          goNext();
        } else {
          if (micStatus !== "granted") return;
          handleStart();
        }
      } else if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const handleStart = async () => {
    if (micStatus !== "granted") return;
    cancelAnimationFrame(animFrameRef.current);
    // Don't stop mic stream — Interview component will re-use the permission grant
    // Only stop camera stream (not needed in interview by default)
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    // Only include fields that have values — don't overwrite existing data with empty strings
    const saveData: Partial<Parameters<typeof updateUser>[0]> = {
      hasCompletedOnboarding: true,
    };
    if (targetRole.trim()) saveData.targetRole = targetRole.trim();
    if (targetCompany.trim()) saveData.targetCompany = targetCompany.trim();
    if (interviewFocus.length > 0) saveData.interviewTypes = interviewFocus;
    if (sessionLength) saveData.preferredSessionLength = SESSION_LENGTH_MAP[sessionLength] || 15;
    // Only send resume fields if user uploaded a resume in this session
    if (fileName) {
      saveData.resumeFileName = fileName;
      saveData.resumeText = resumeText;
      saveData.resumeData = (aiProfile || resumeParsed) as unknown as ParsedResume;
    }
    console.log("[handleStart] saving onboarding data:", JSON.stringify(saveData, null, 2));
    try {
      await updateUser(saveData);
      console.log("[handleStart] save complete, navigating...");
    } catch (err) {
      console.error("[handleStart] save failed:", err);
    }
    clearObStep();
    navigate("/interview?type=behavioral&difficulty=standard&mini=true");
  };

  const isStep1Busy = step === 1 && (resumeParsing || aiPhase === "analyzing");
  const isStep2Disabled = step === 2 && (!targetRole.trim() || interviewFocus.length === 0);
  const isContinueDisabled = isStep1Busy || isStep2Disabled;

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(201,169,110,0.03) 0%, ${c.obsidian} 70%)`, display: "flex", flexDirection: "column", position: "relative" }}>
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
        .skeleton-line { background: linear-gradient(90deg, rgba(240,237,232,0.03) 25%, rgba(240,237,232,0.07) 50%, rgba(240,237,232,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: 6px; }
        .fade-up-1 { animation: fadeUp 0.35s ease-out 0ms both; }
        .fade-up-2 { animation: fadeUp 0.35s ease-out 80ms both; }
        .fade-up-3 { animation: fadeUp 0.35s ease-out 160ms both; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .ob-card { background: rgba(22,22,24,0.7); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(240,237,232,0.06); }
        .ob-card-gold { background: linear-gradient(135deg, rgba(22,22,24,0.8) 0%, rgba(201,169,110,0.06) 100%); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(201,169,110,0.1); }
        .ob-drop:hover { border-color: rgba(201,169,110,0.35) !important; background: rgba(201,169,110,0.02) !important; }
        .ob-focus-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; border-color: rgba(201,169,110,0.3) !important; }
        @keyframes micPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,169,110,0); } 50% { box-shadow: 0 0 0 8px rgba(201,169,110,0.12); } }
        .ob-mic-pulse { animation: micPulse 2s ease-in-out infinite; }
        @media (max-width: 768px) {
          .ob-s1-split { flex-direction: column !important; }
          .ob-s1-left { max-width: 100% !important; }
          .ob-s1-profile-grid { grid-template-columns: 1fr !important; }
          .ob-s1-sg-grid { grid-template-columns: 1fr !important; }
          .ob-s1-header { flex-direction: column !important; }
          .ob-s1-header-text { max-width: 100% !important; }
          .ob-s1-header-actions { position: static !important; margin-top: 8px !important; }
          .ob-s2-focus-grid { grid-template-columns: 1fr 1fr !important; }
          .ob-s2-bottom-row { grid-template-columns: 1fr !important; }
          .ob-s3-profile-row { flex-direction: column !important; }
          .ob-s3-perm-row { flex-direction: column !important; gap: 12px !important; }
        }
        @media (max-height: 700px) {
          .ob-content-area { padding-top: 16px !important; padding-bottom: 16px !important; }
        }
      `}</style>

      {/* ─── Top Bar ─── */}
      <div style={{ padding: "18px 40px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderBottom: `1px solid rgba(240,237,232,0.04)`, background: "rgba(10,10,11,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
        {/* Logo — left */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: 2, background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`, boxShadow: "0 0 8px rgba(201,169,110,0.3)" }} />
          <span style={{ fontFamily: font.display, fontSize: 17, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>HireReady</span>
        </div>
        {/* Stepper — center */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {["Resume", "Profile", "Ready"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: step > i + 1 ? `linear-gradient(135deg, ${c.gilt}, #B8923E)` : step === i + 1 ? "rgba(201,169,110,0.1)" : "transparent",
                border: `1.5px solid ${step >= i + 1 ? c.gilt : "rgba(240,237,232,0.08)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: step === i + 1 ? "0 0 12px rgba(201,169,110,0.15)" : "none",
              }}>
                {step > i + 1 ? (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.obsidian} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: step === i + 1 ? c.gilt : c.stone }}>{i + 1}</span>
                )}
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: step === i + 1 ? c.ivory : c.stone, fontWeight: step === i + 1 ? 500 : 400 }}>{label}</span>
              {i < 2 && <div style={{ width: 24, height: 1, background: step > i + 1 ? `linear-gradient(90deg, ${c.gilt}, rgba(201,169,110,0.2))` : "rgba(240,237,232,0.06)", transition: "background 0.4s", borderRadius: 1 }} />}
            </div>
          ))}
        </div>
        {/* Right spacer for grid balance */}
        <div />
      </div>

      {/* ─── Content ─── */}
      <div className="ob-content-area" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div key={step} className="ob-step" style={{ width: "100%", maxWidth: step === 3 ? 680 : (step === 1 && !resumeParsed) ? 680 : 960, transition: "max-width 0.4s ease" }}>

          {/* ════════════════ STEP 1: Resume Intelligence ════════════════ */}
          {step === 1 && (
            <div>
              {/* ── State: Empty / Error ── */}
              {!resumeParsed && !resumeParsing && aiPhase !== "analyzing" && (
                <>
                  {/* Step label */}
                  <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>

                  {/* Heading */}
                  <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                    Upload your resume <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 400, color: c.stone }}>(optional)</span>
                  </h2>

                  {/* Description */}
                  <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
                    Upload to get personalized questions from your experience, or skip to use general questions.
                  </p>

                  {/* Drop zone — full width */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); if (!dragFileName && e.dataTransfer.types.includes("Files")) setDragFileName(e.dataTransfer.items?.[0]?.getAsFile?.()?.name || ""); }}
                    onDragLeave={() => { setIsDragging(false); setDragFileName(""); }}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); setDragFileName(""); handleFileChange(e.dataTransfer.files[0]); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={!resumeError && !isDragging ? "ob-drop" : undefined}
                    style={{
                      border: `1.5px dashed ${isDragging ? c.gilt : resumeError ? c.ember : "rgba(201,169,110,0.18)"}`,
                      borderRadius: 16, padding: isDragging ? "48px 24px" : "56px 24px",
                      textAlign: "center", cursor: "pointer",
                      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                      background: isDragging ? "rgba(201,169,110,0.04)" : c.graphite,
                      boxShadow: isDragging ? "0 0 30px rgba(201,169,110,0.08), inset 0 0 30px rgba(201,169,110,0.03)" : "none",
                      marginBottom: 16,
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                    {resumeError ? (
                      <div>
                        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ember, marginBottom: 4, lineHeight: 1.5 }}>{resumeError}</p>
                        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Click to try a different file</p>
                      </div>
                    ) : isDragging ? (
                      <>
                        <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px", background: "rgba(201,169,110,0.1)", border: "1px solid rgba(201,169,110,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.gilt }}>Release to upload</p>
                        {dragFileName && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, marginTop: 4 }}>{dragFileName}</p>}
                      </>
                    ) : (
                      <>
                        <div style={{ width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px", background: "rgba(201,169,110,0.05)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 500, color: c.ivory, marginBottom: 6 }}>Drop your resume here</p>
                        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 16 }}>or click to browse</p>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
                          {["PDF", "DOCX", "TXT"].map((t) => (
                            <span key={t} style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 500, color: c.stone, background: "rgba(240,237,232,0.03)", padding: "6px 14px", borderRadius: 6, border: `1px solid rgba(240,237,232,0.06)`, letterSpacing: "0.05em" }}>{t}</span>
                          ))}
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: "rgba(154,149,144,0.5)" }}>Max 10 MB</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Privacy bar */}
                  {!showUndo && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderRadius: 12, background: c.graphite, border: `1px solid ${c.border}` }}>
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, lineHeight: 1.5 }}>Your resume text is used only to generate personalized interview questions. You can delete it anytime.</p>
                    </div>
                  )}

                  {/* Undo toast */}
                  {showUndo && (
                    <div className="ob-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, animation: "toastIn 0.25s ease-out", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>Resume removed</span>
                      <button onClick={() => {
                        if (!undoRef.current) return;
                        const s = undoRef.current;
                        setFileName(s.fileName); setResumeText(s.resumeText); setResumeParsed(s.resumeParsed); setAiProfile(s.aiProfile); setAiPhase(s.aiPhase); setTargetRole(s.targetRole); setTargetCompany(s.targetCompany);
                        setShowUndo(false); clearTimeout(undoTimerRef.current); undoRef.current = null;
                      }}
                        style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: "2px 8px" }}>
                        Undo
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── State: Building profile (parsing + AI analyzing) ── */}
              {(resumeParsing || aiPhase === "analyzing") && aiPhase !== "done" && (
                <>
                  {/* Same headings as empty state */}
                  <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
                  <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                    Upload your resume <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 400, color: c.stone }}>(optional)</span>
                  </h2>
                  <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, marginBottom: 28 }}>
                    Upload to get personalized questions from your experience, or skip to use general questions.
                  </p>

                  {/* Loading card — replaces the drop zone */}
                  <div className="ob-card" style={{ borderRadius: 16, padding: "64px 32px", textAlign: "center", border: `1px solid rgba(240,237,232,0.06)` }}>
                    <div style={{ width: 60, height: 60, borderRadius: 16, margin: "0 auto 24px", background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 24, height: 24, border: "2.5px solid rgba(201,169,110,0.2)", borderTopColor: c.gilt, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    </div>
                    <h3 style={{ fontFamily: font.display, fontSize: 28, fontWeight: 400, color: c.ivory, marginBottom: 14, letterSpacing: "-0.02em" }}>Building your profile</h3>
                    <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7, maxWidth: 440, margin: "0 auto 8px" }}>
                      AI is analyzing your experience, skills, and achievements to create a personalized candidate profile...
                    </p>
                    {/* Progress bar */}
                    <div style={{ maxWidth: 320, margin: "20px auto 0", height: 4, borderRadius: 2, background: "rgba(240,237,232,0.06)", overflow: "hidden" }}>
                      <div className="ob-progress-bar" style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, ${c.gilt}, #B8923E)` }} />
                    </div>
                    <p style={{ fontFamily: font.ui, fontSize: 12, color: "rgba(154,149,144,0.5)", marginTop: 8 }}>Usually 10–20 seconds</p>
                    {fileName && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20, padding: "8px 16px", borderRadius: 8, background: c.graphite, border: `1px solid ${c.border}` }}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: font.ui, fontSize: 14, color: c.ivory }}>{fileName}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── State: Profile ready ── */}
              {resumeParsed && !resumeParsing && aiPhase === "done" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Step heading */}
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 1 — Your Experience</p>
                    <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                      Upload your resume <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 400, color: c.stone }}>(optional)</span>
                    </h2>
                    <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                      Upload to get personalized questions from your experience, or skip to use general questions.
                    </p>
                  </div>

                  {/* Header: headline + badges + actions — compact row */}
                  <div className="ob-card ob-s1-header" style={{ borderRadius: 14, padding: "20px 24px", border: `1px solid rgba(240,237,232,0.06)`, display: "flex", alignItems: "flex-start", gap: 20 }}>
                    <div className="ob-s1-header-text" style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: font.display, fontSize: 22, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 8 }}>
                        {aiProfile.headline || resumeParsed.name}
                      </h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {aiProfile.seniorityLevel && <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: "1px solid rgba(201,169,110,0.18)", borderRadius: 4, padding: "2px 10px" }}>{aiProfile.seniorityLevel}</span>}
                        {aiProfile.yearsExperience && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.yearsExperience}+ yrs</span>}
                        {aiProfile.industries && aiProfile.industries.length > 0 && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{aiProfile.industries.slice(0, 2).join(", ")}</span>}
                      </div>
                      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{aiProfile.summary}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{fileName}</span>
                        <span style={{ color: c.stone, fontSize: 11 }}>·</span>
                        <button onClick={() => fileInputRef.current?.click()} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Replace</button>
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={(e) => handleFileChange(e.target.files?.[0])} style={{ display: "none" }} />
                      </div>
                    </div>
                    <div className="ob-s1-header-actions" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setAiPhase("analyzing"); analyzeResumeWithAI(resumeText, targetRole).then(r => { if (r?.profile) setAiProfile(r.profile); setAiPhase("done"); }).catch(() => setAiPhase("done")); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(240,237,232,0.15)"; e.currentTarget.style.color = c.ivory; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        Re-analyze
                      </button>
                      <button onClick={() => {
                        undoRef.current = { fileName, resumeText, resumeParsed, aiProfile, aiPhase, targetRole, targetCompany };
                        setFileName(""); setResumeText(""); setResumeParsed(null); setResumeError(""); setAiProfile(null); setAiPhase("idle"); setTargetRole(""); setTargetCompany("");
                        setShowUndo(true); clearTimeout(undoTimerRef.current);
                        undoTimerRef.current = window.setTimeout(() => { setShowUndo(false); undoRef.current = null; }, 8000);
                      }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, background: c.graphite, border: `1px solid ${c.border}`, cursor: "pointer", fontFamily: font.ui, fontSize: 11, color: c.stone, transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(240,237,232,0.15)"; e.currentTarget.style.color = c.ivory; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.color = c.stone; }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* 3-column grid: Skills | Achievements | Strengths & Gaps */}
                  <div className="ob-s1-profile-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {/* Skills */}
                    {aiProfile.topSkills && aiProfile.topSkills.length > 0 && (
                      <div className="ob-card fade-up-1" style={{ borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Top Skills</h4>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {aiProfile.topSkills.slice(0, 6).map((skill, i) => (
                            <span key={i} style={{ fontFamily: font.ui, fontSize: 11, color: i < 3 ? c.ivory : c.chalk, background: i < 3 ? "linear-gradient(135deg, rgba(201,169,110,0.12), rgba(201,169,110,0.05))" : "rgba(240,237,232,0.03)", border: `1px solid ${i < 3 ? "rgba(201,169,110,0.2)" : "rgba(240,237,232,0.06)"}`, borderRadius: 6, padding: "5px 10px", fontWeight: i < 3 ? 500 : 400 }}>{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Achievements */}
                    {aiProfile.keyAchievements && aiProfile.keyAchievements.length > 0 && (
                      <div className="ob-card fade-up-2" style={{ borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><path d="M12 15l-2 5-1-3-3-1 5-2"/><circle cx="12" cy="8" r="6"/></svg>
                          <h4 style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, margin: 0 }}>Key Achievements</h4>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {aiProfile.keyAchievements.slice(0, 2).map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(240,237,232,0.02)", border: `1px solid rgba(240,237,232,0.04)` }}>
                              <div style={{ width: 18, height: 18, borderRadius: 5, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                              </div>
                              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strengths & Gaps stacked */}
                    <div className="fade-up-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {aiProfile.interviewStrengths && aiProfile.interviewStrengths.length > 0 && (
                        <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>Strengths</h4>
                          </div>
                          {aiProfile.interviewStrengths.slice(0, 2).map((s, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.sage, flexShrink: 0, marginTop: 5 }} />
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiProfile.interviewGaps && aiProfile.interviewGaps.length > 0 && (
                        <div className="ob-card" style={{ borderRadius: 14, padding: "16px 20px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <h4 style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.ivory, margin: 0 }}>To Prepare</h4>
                          </div>
                          {aiProfile.interviewGaps.slice(0, 2).map((g, i) => (
                            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                              <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.gilt, flexShrink: 0, marginTop: 5 }} />
                              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, lineHeight: 1.4 }}>{g}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Career trajectory + privacy — compact row */}
                  {aiProfile.careerTrajectory && (
                    <div className="ob-card fade-up-3" style={{ borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, border: `1px solid rgba(240,237,232,0.04)` }}>
                      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="1.5" style={{ flexShrink: 0 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, lineHeight: 1.4 }}>{aiProfile.careerTrajectory}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════ STEP 2: Your First Session ════════════════ */}
          {step === 2 && (
            <div>
              {/* Heading */}
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 2 — Your First Session</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Set up your practice session
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                  {resumeParsed ? "We've pre-filled some details from your resume. Adjust anything before your first session." : "Tell us about the role you're targeting so the AI can tailor every question."}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* ── Section 1: Role & Company ── */}
                <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Target Role</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontWeight: 400, marginLeft: 4 }}>— AI tailors questions to this role</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <AutocompleteInput id="ob-role" value={targetRole} onChange={(v) => { setTargetRole(v); setRoleAutoFilled(false); }} suggestions={ROLE_SUGGESTIONS} placeholder="e.g. Senior Engineering Manager..." label="Role" required />
                      {roleAutoFilled && targetRole && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                          Auto-filled from resume
                        </p>
                      )}
                      {!targetRole.trim() && interviewFocus.length > 0 && (
                        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 4 }}>Required to personalize your questions</p>
                      )}
                    </div>
                    <div>
                      <AutocompleteInput id="ob-company" value={targetCompany} onChange={setTargetCompany} suggestions={COMPANY_SUGGESTIONS} placeholder="e.g. Google, Stripe..." label="Company (optional)" />
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Interview Focus ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Interview Focus <span style={{ color: c.ember, fontWeight: 400 }}>*</span></span>
                  </div>
                  <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 16, paddingLeft: 36 }}>Select the areas you want the AI to focus on. This directly shapes your questions.</p>
                  <div className="ob-s2-focus-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { value: "Behavioral", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, desc: "Leadership, decision-making, conflict resolution" },
                      { value: "Strategic", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, desc: "Vision, roadmap, business alignment" },
                      { value: "Technical Leadership", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>, desc: "Architecture, system design, tech strategy" },
                      { value: "Case Study", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, desc: "Problem-solving, analytical frameworks" },
                    ].map(opt => {
                      const sel = interviewFocus.includes(opt.value);
                      return (
                        <button key={opt.value} className="ob-focus-card" onClick={() => setInterviewFocus(prev => prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value])}
                          style={{
                            padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left",
                            background: sel ? "rgba(201,169,110,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(201,169,110,0.06)" : "none",
                            display: "flex", alignItems: "center", gap: 12, color: sel ? c.gilt : c.stone,
                          }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: sel ? "rgba(201,169,110,0.1)" : "rgba(240,237,232,0.03)", border: `1px solid ${sel ? "rgba(201,169,110,0.2)" : "rgba(240,237,232,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {opt.icon}
                          </div>
                          <div>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block" }}>{opt.value}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, lineHeight: 1.4 }}>{opt.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {interviewFocus.length === 0 && (
                    <p style={{ fontFamily: font.ui, fontSize: 11, color: c.ember, marginTop: 8, paddingLeft: 36 }}>Select at least one focus area</p>
                  )}
                </div>

                {/* ── Section 3: Session Length ── */}
                <div className="ob-card fade-up-3" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Session Length</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { value: "10m", label: "10 min", desc: "Quick practice", sub: "2–3 questions" },
                      { value: "15m", label: "15 min", desc: "Standard session", sub: "4–5 questions", recommended: true },
                      { value: "25m", label: "25 min", desc: "Deep dive", sub: "6–8 questions" },
                    ].map(opt => {
                      const sel = sessionLength === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setSessionLength(opt.value)}
                          style={{
                            padding: "16px 14px", borderRadius: 12, cursor: "pointer", textAlign: "center", position: "relative",
                            background: sel ? "rgba(201,169,110,0.08)" : "transparent",
                            border: `1.5px solid ${sel ? c.gilt : c.border}`,
                            boxShadow: sel ? "0 0 16px rgba(201,169,110,0.06)" : "none",
                            transition: "all 0.2s",
                          }}>
                          {opt.recommended && (
                            <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.obsidian, background: c.gilt, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</span>
                          )}
                          <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: sel ? c.gilt : c.ivory, display: "block", marginBottom: 2 }}>{opt.label}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: sel ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{opt.desc}</span>
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{opt.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ STEP 3: Permissions & Review ════════════════ */}
          {step === 3 && (
            <div>
              {/* Heading — consistent with Steps 1 & 2 */}
              <div style={{ marginBottom: 32 }} className="fade-up-1">
                <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Step 3 — Almost There</p>
                <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, letterSpacing: "-0.025em", lineHeight: 1.2, marginBottom: 10 }}>
                  Allow permissions & review
                </h2>
                <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, lineHeight: 1.7 }}>
                  We need microphone access for the interview. Review your profile below, then you're ready to go.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* ── Permissions Card ── */}
                <div className="ob-card fade-up-1" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Permissions</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Mic */}
                    <div className={micStatus !== "granted" ? "ob-mic-pulse ob-s3-perm-row" : "ob-s3-perm-row"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: micStatus === "granted" ? "rgba(122,158,126,0.04)" : "rgba(240,237,232,0.02)", border: `1px solid ${micStatus === "granted" ? "rgba(122,158,126,0.12)" : "rgba(201,169,110,0.2)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: micStatus === "granted" ? `${c.sage}12` : "rgba(240,237,232,0.03)", border: `1px solid ${micStatus === "granted" ? `${c.sage}25` : "rgba(240,237,232,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={micStatus === "granted" ? c.sage : c.stone} strokeWidth="1.5" strokeLinecap="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          </svg>
                        </div>
                        <div>
                          <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory }}>Microphone</p>
                          <p style={{ fontFamily: font.ui, fontSize: 11, color: micStatus === "granted" ? c.sage : micStatus === "denied" ? c.ember : c.stone }}>
                            {micStatus === "granted" ? "Connected — ready to go" : micStatus === "denied" ? "Permission denied — click Retry" : "Required for the interview"}
                          </p>
                        </div>
                      </div>
                      {micStatus === "granted" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(240,237,232,0.06)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 2, background: c.sage, width: `${Math.max(5, micLevel)}%`, transition: "width 0.1s" }} />
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      ) : (
                        <button onClick={requestMic}
                          style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.gilt, background: "rgba(201,169,110,0.08)", border: `1px solid rgba(201,169,110,0.2)`, borderRadius: 8, padding: "8px 18px", cursor: "pointer", transition: "all 0.2s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.15)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.08)"; }}>
                          {micStatus === "denied" ? "Retry" : "Allow Microphone"}
                        </button>
                      )}
                    </div>

                    {/* Camera */}
                    <div className="ob-s3-perm-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: camStatus === "granted" ? "rgba(122,158,126,0.04)" : "rgba(240,237,232,0.02)", border: `1px solid ${camStatus === "granted" ? "rgba(122,158,126,0.12)" : "rgba(240,237,232,0.06)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: camStatus === "granted" ? `${c.sage}12` : "rgba(240,237,232,0.03)", border: `1px solid ${camStatus === "granted" ? `${c.sage}25` : "rgba(240,237,232,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={camStatus === "granted" ? c.sage : c.stone} strokeWidth="1.5" strokeLinecap="round">
                            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                          </svg>
                        </div>
                        <div>
                          <p style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory }}>Camera <span style={{ fontSize: 11, color: c.stone, fontWeight: 400 }}>(optional)</span></p>
                          <p style={{ fontFamily: font.ui, fontSize: 11, color: camStatus === "granted" ? c.sage : camStatus === "denied" ? c.ember : c.stone }}>
                            {camStatus === "granted" ? "Connected" : camStatus === "denied" ? "No worries — camera is optional" : "For a realistic interview feel"}
                          </p>
                        </div>
                      </div>
                      {camStatus === "granted" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <button onClick={requestCamera}
                          style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "rgba(240,237,232,0.03)", border: `1px solid rgba(240,237,232,0.06)`, borderRadius: 8, padding: "8px 18px", cursor: "pointer", transition: "all 0.2s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.06)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(240,237,232,0.03)"; }}>
                          {camStatus === "denied" ? "Retry" : "Enable"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Camera preview */}
                  {camStatus === "granted" && (
                    <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "16/9", maxHeight: 140 }}>
                      <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                    </div>
                  )}
                </div>

                {/* ── Your Profile Card ── */}
                <div className="ob-card fade-up-2" style={{ borderRadius: 16, padding: "24px 28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Your Profile</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { label: "Resume", value: fileName || "Not uploaded", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, editStep: 1 },
                      { label: "Target Role", value: targetRole || "Not set", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>, editStep: 2 },
                      { label: "Target Company", value: targetCompany || "Exploring", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/></svg>, editStep: 2 },
                      { label: "Interview Focus", value: interviewFocus.length > 0 ? interviewFocus.join(", ") : "None selected", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, editStep: 2 },
                      { label: "Session Length", value: sessionLength === "10m" ? "10 minutes" : sessionLength === "25m" ? "25 minutes" : "15 minutes", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, editStep: 2 },
                    ].map((item, i, arr) => (
                      <div key={item.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
                            <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, flexShrink: 0 }}>{item.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: item.value === "Not set" || item.value === "Not uploaded" || item.value === "None selected" ? "rgba(154,149,144,0.5)" : c.ivory, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                              {item.value}
                            </span>
                            <button
                              onClick={() => { setSlideDir("back"); setStep(item.editStep); }}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: 0.3, transition: "opacity 0.2s" }}
                              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
                              aria-label={`Edit ${item.label}`}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.stone} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        </div>
                        {i < arr.length - 1 && <div style={{ height: 1, background: "rgba(240,237,232,0.04)" }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Navigation ─── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
            {step < TOTAL_STEPS ? (
              <button onClick={goNext} disabled={isContinueDisabled}
                style={{
                  fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                  background: isContinueDisabled ? "rgba(201,169,110,0.15)" : `linear-gradient(135deg, ${c.gilt}, #B8923E)`,
                  color: isContinueDisabled ? "rgba(201,169,110,0.4)" : c.obsidian,
                  cursor: isContinueDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                  boxShadow: isContinueDisabled ? "none" : "0 8px 24px rgba(201,169,110,0.2)",
                }}
                onMouseEnter={(e) => { if (!isContinueDisabled) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(201,169,110,0.3)"; } }}
                onMouseLeave={(e) => { if (!isContinueDisabled) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(201,169,110,0.2)"; } }}>
                Continue
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ) : (
              <button onClick={handleStart} disabled={micStatus !== "granted"}
                style={{
                  fontFamily: font.ui, fontSize: 15, fontWeight: 600, padding: "14px 40px", borderRadius: 10, border: "none",
                  background: micStatus === "granted" ? `linear-gradient(135deg, ${c.gilt}, #B8923E)` : "rgba(201,169,110,0.15)",
                  color: micStatus === "granted" ? c.obsidian : "rgba(201,169,110,0.4)",
                  cursor: micStatus === "granted" ? "pointer" : "not-allowed",
                  transition: "all 0.25s ease", display: "inline-flex", alignItems: "center", gap: 8,
                  boxShadow: micStatus === "granted" ? "0 8px 24px rgba(201,169,110,0.2)" : "none",
                }}
                onMouseEnter={(e) => { if (micStatus === "granted") { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(201,169,110,0.3)"; } }}
                onMouseLeave={(e) => { if (micStatus === "granted") { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(201,169,110,0.2)"; } }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21"/></svg>
                {micStatus === "granted" ? "Start Practice Interview" : "Allow microphone to continue"}
              </button>
            )}

            {step === 1 && !resumeParsed && !resumeParsing && (
              <button onClick={goNext}
                style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "color 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
                onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
                Skip, I'll add later
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
            {step > 1 && (
              <button onClick={goBack}
                style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.stone, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "color 0.2s" }}
                onMouseEnter={(e) => e.currentTarget.style.color = c.ivory}
                onMouseLeave={(e) => e.currentTarget.style.color = c.stone}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

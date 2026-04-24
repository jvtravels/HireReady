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

/**
 * Reject company-name-shaped strings that the parser sometimes mis-classifies
 * as job titles (e.g. "Unpause Studio", "Acme Corp"). A real role almost
 * always contains one of these tokens. Stops the auto-fill from showing
 * "Unpause Studio" in the Target Role field.
 */
const ROLE_KEYWORDS = /\b(engineer|developer|designer|manager|director|lead|architect|analyst|consultant|specialist|coordinator|scientist|researcher|writer|editor|marketer|seller|recruiter|administrator|administrator|officer|associate|principal|staff|senior|junior|head|chief|vp|vice\s*president|founder|co[-\s]?founder|ceo|cto|cfo|coo|cpo|cmo|product|engineering|design|marketing|sales|operations|hr|finance|legal|data|software|frontend|backend|fullstack|full[-\s]?stack|devops|sre|security|qa|qe|test|intern|trainee|fresher|apprentice|technician|operator|teacher|professor|nurse|doctor|advisor|strategist|partner|liaison|representative|agent|executive|generalist|architect|programmer)\b/i;

function looksLikeJobTitle(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false;
  return ROLE_KEYWORDS.test(s);
}

/** Walk the parser's experience list and return the first entry whose title actually looks like a role. */
function extractRoleFromExperience(experience?: { title?: string }[]): string {
  if (!experience) return "";
  for (const e of experience) {
    if (e?.title && looksLikeJobTitle(e.title)) return e.title;
  }
  return "";
}

/**
 * Shape check for a human name. Defensive fallback in case the resume
 * parser ever returns a stray city / role / company here again.
 *
 * Intentionally lenient — previous version rejected:
 *   • single-token names (Prince, Madonna, Rihanna)
 *   • names with initials (K. Venkatraman)
 *   • names in non-Latin scripts (Devanagari, Tamil, Arabic, etc.)
 *
 * In an India-first product, rejecting non-Latin names was the biggest
 * issue. The new check rejects only obvious non-names (commas, emails,
 * numbers, excessive length) and shapes that contain forbidden role
 * keywords (e.g. "Senior Designer" is a role, not a name).
 */
function looksLikePersonName(s?: string | null): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  // Reject anything with commas, at-signs, digits — clearly not a name
  if (/[,@0-9]/.test(trimmed)) return false;
  // Reject role/company-shaped strings: if it contains role keywords,
  // the parser probably mis-classified a job title as a name.
  if (ROLE_KEYWORDS.test(trimmed)) return false;
  // Max 5 tokens — "Dr. Jane Marie O'Brien-Smith" fits; "Jane Smith
  // is looking for a Senior Engineer role" doesn't.
  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 5) return false;
  // At least one letter (covers Latin + every Unicode script via \p{L})
  return /\p{L}/u.test(trimmed);
}

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
  // Transient UI messages — saved-draft toast (#13) and autosave feedback (#15)
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [autosaveFlash, setAutosaveFlash] = useState(false);

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
      updateUser(updates)
        .then(() => {
          // #15 — surface autosave success so users can trust the silent auto-save
          setAutosaveFlash(true);
          setTimeout(() => setAutosaveFlash(false), 1800);
        })
        .catch(err => console.warn("[onboarding] auto-save failed:", err instanceof Error ? err.message : err));
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [userName, targetRole, user, resumeParsed, updateUser]);

  // ─── #13: Saved-draft toast on return ─────────────────────────────────────
  // When a user comes back (fresh page load) and we successfully restore a
  // previous resume from localStorage or their Supabase profile, surface a
  // small "Welcome back — we kept your resume" toast so they know the app
  // retained their progress. Fires exactly once per mount.
  const draftToastFiredRef = useRef(false);
  useEffect(() => {
    if (draftToastFiredRef.current) return;
    if (!resumeParsed || !fileName) return;
    // Skip if this mount is the result of the user uploading right now
    // (resumeParsing would have been true) vs a restore.
    if (resumeParsing) return;
    draftToastFiredRef.current = true;
    setDraftToast(`Welcome back — we kept your resume (${fileName})`);
    const t = setTimeout(() => setDraftToast(null), 5000);
    return () => clearTimeout(t);
  }, [resumeParsed, fileName, resumeParsing]);

  // ─── #19: Exit-intent hint ────────────────────────────────────────────────
  // If a user has uploaded a resume but not yet clicked "Start interview",
  // mousing toward the top of the viewport (tab close) triggers a single-
  // use reassurance toast: "Your resume is saved — come back anytime."
  // No modal; no capture form. Just closing the trust gap.
  const exitFiredRef = useRef(false);
  useEffect(() => {
    if (!resumeParsed) return;
    if (exitFiredRef.current) return;
    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY < 20 && !exitFiredRef.current) {
        exitFiredRef.current = true;
        setDraftToast("Your resume is saved — take your time, it'll be here when you get back.");
        setTimeout(() => setDraftToast(null), 6000);
      }
    }
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [resumeParsed]);

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
    // Only consult the localStorage cache when it demonstrably belongs to
    // the currently-signed-in user. AuthContext wipes this key on user
    // change, but we guard here too so a race between this effect and the
    // wipe effect can't surface a previous user's resume. Without this
    // check, signup #2 on a shared browser used to see signup #1's file
    // name in the onboarding UI.
    const activeUserId = (() => { try { return localStorage.getItem("hirestepx_last_user_id"); } catch { return null; } })();
    const localResume = user?.id && activeUserId === user.id
      ? (() => { try { const r = localStorage.getItem("hirestepx_resume"); return r ? JSON.parse(r) as { fileName: string; text: string; data: ParsedResume; aiProfile?: ResumeProfile } : null; } catch { return null; } })()
      : null;
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
    import("./resumeParser").then(async ({ parseResumeData, isFallbackResume, isAiResume }) => {
      // Resolve a ParsedResume (fallback shape) for local use. If the
      // stored resume is the AI variant, we don't have the regex-level
      // fields (experience/education) — re-parse from raw text so this
      // component can keep operating on the fallback shape it expects.
      const stored = user?.resumeData;
      const fromStored = isFallbackResume(stored)
        ? { name: stored.name, email: stored.email, phone: stored.phone, location: stored.location, linkedin: stored.linkedin, summary: stored.summary, skills: stored.skills, experience: stored.experience, education: stored.education, certifications: stored.certifications }
        : null;
      const data: ParsedResume = fromStored || localResume?.data || parseResumeData(rText);
      setResumeParsed(data);
      // Prefer the AI profile from the stored union if present, else
      // fall back to the localStorage mirror.
      const savedAiProfile = (isAiResume(stored)
        ? { headline: stored.headline, summary: stored.summary, yearsExperience: stored.yearsExperience, seniorityLevel: stored.seniorityLevel, topSkills: stored.topSkills, keyAchievements: stored.keyAchievements, industries: stored.industries, interviewStrengths: stored.interviewStrengths, interviewGaps: stored.interviewGaps, careerTrajectory: stored.careerTrajectory, resumeScore: stored.resumeScore, improvements: stored.improvements }
        : null) || localResume?.aiProfile;
      if (looksLikePersonName(data.name) && !userName) setUserName(data.name);
      const isRealAiProfile = !!(savedAiProfile && savedAiProfile.headline
        && savedAiProfile.resumeScore != null
        && savedAiProfile.topSkills && savedAiProfile.topSkills.length > 0);
      if (isRealAiProfile) {
        setAiProfile(savedAiProfile);
        setAiPhase("done");
        // Intentionally do NOT fall back to AI headline here. AI's
        // headline is a role/summary ("Senior Product Designer with 5+
        // years…"), not a person's name — falling back to it would put
        // the user's job title in the Name field. Better to leave the
        // field empty and let the user type it.
      } else {
        if (savedAiProfile) setAiProfile(savedAiProfile);
        setAiPhase("analyzing");
        const autoRole = extractRoleFromExperience(data.experience);
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
        const parserRole = extractRoleFromExperience(data.experience);
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
    // If handleFileUpload's primary analysis is already in flight (aiPhase
    // is already "analyzing"), don't fire a second one. The previous
    // implementation raced both calls in parallel — the primary used the
    // XHR helper (fast), this one used raw fetch (got hung by the
    // Loom/Jam fetch interceptor for 20s) and kept the loading screen up.
    if (aiPhase === "analyzing") return;
    const textForAnalysis = resumeText || user.resumeText;
    if (!textForAnalysis || textForAnalysis.length < 20) return;
    reanalyzedRef.current = true;
    setAiPhase("analyzing");
    analysisAbortRef.current?.abort();
    const ac = new AbortController();
    analysisAbortRef.current = ac;
    const timer = setTimeout(() => { ac.abort(); }, 20000);

    // Use the shared analyzeResumeWithAI helper (XHR-based) instead of raw
    // fetch. Browser extensions that wrap window.fetch were hanging this
    // call indefinitely; XHR sidesteps them.
    import("./dashboardData").then(async ({ analyzeResumeWithAI }) => {
      try {
        const result = await analyzeResumeWithAI(textForAnalysis, targetRole, ac.signal);
        if (result?.profile) {
          setAiProfile(result.profile);
          try { const cached = localStorage.getItem("hirestepx_resume"); if (cached) { const obj = JSON.parse(cached); obj.aiProfile = result.profile; localStorage.setItem("hirestepx_resume", JSON.stringify(obj)); } } catch { /* noop */ }
        }
      } catch (err) {
        console.error("[onboarding] Auto re-analysis failed:", err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timer);
        setAiPhase("done");
      }
    });
    return () => { clearTimeout(timer); ac.abort(); };
  }, [user, resumeParsed, resumeText, aiProfile?.resumeScore, aiPhase, targetRole]); // eslint-disable-line react-hooks/exhaustive-deps

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
    track("resume_upload_started", { sizeBytes: file.size, ext: file.name.split(".").pop()?.toLowerCase() || "" });
    if (file.size > 10 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setResumeError(`Your file is ${mb} MB. Max is 10 MB — try compressing your PDF (e.g. smallpdf.com/compress-pdf) or export at lower quality.`);
      track("resume_upload_failed", { reason: "too_large", sizeBytes: file.size });
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["pdf", "docx", "doc", "txt"];
    const allowedMimes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!ext || !allowedExts.includes(ext) || (file.type && !allowedMimes.includes(file.type))) {
      if (ext && ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"].includes(ext)) {
        setResumeError("Image files aren't supported. Export your resume as a PDF or DOCX and try again.");
      } else if (ext && ["pages", "numbers", "key"].includes(ext)) {
        setResumeError("Apple iWork files aren't supported. In Pages → File → Export To → PDF, then upload.");
      } else {
        setResumeError(`.${ext || "this"} files aren't supported. Please upload a PDF, DOCX, or TXT file.`);
      }
      track("resume_upload_failed", { reason: "unsupported_type", ext: ext || "unknown" });
      return;
    }
    setFileName(file.name);
    setResumeError("");
    setResumeParsing(true);
    try {
      const { extractResumeText, parseResumeDataAsync } = await import("./resumeParser");
      const { analyzeResumeWithAI } = await import("./dashboardData");
      const text = await extractResumeText(file);
      if (!text || text.trim().length < 30) {
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        if (fileExt && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(fileExt)) {
          throw new Error("Image files aren't supported. Please upload a PDF, DOCX, or TXT resume.");
        }
        if (fileExt === "pdf") {
          throw new Error("This looks like a scanned PDF — we can't extract its text. Try exporting from your resume builder as a searchable PDF, or save as DOCX and re-upload.");
        }
        throw new Error("Very little text was extracted. The file may be empty or corrupted — try re-exporting as a PDF or DOCX.");
      }
      const data = await parseResumeDataAsync(text);
      setResumeText(text);
      setResumeParsed(data);
      track("resume_upload_completed", { textLen: text.length, skillCount: data.skills?.length || 0, hasName: !!data.name });
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
      const autoRole = extractRoleFromExperience(data.experience);
      // Only seed the field with a parser-derived role when it actually
      // looks like a job title — extractRoleFromExperience filters out
      // company names. The AI step that follows can override with a
      // proper headline; if the parser returned nothing usable we'd
      // rather show an empty field than "Unpause Studio".
      if (autoRole && !targetRole) setTargetRole(autoRole);
      // Only seed the Name field when the parser returned something that
      // actually looks like a person's name. Same rationale as the role
      // gate above — parser would otherwise surface cities ("Mumbai") or
      // free text from the resume header.
      if (looksLikePersonName(data.name) && !userName) setUserName(data.name);
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = new AbortController();
      const currentAbort = analysisAbortRef.current;
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      let aiSuccess = false;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, targetRole || autoRole, currentAbort.signal),
          // 40s budget — see DashboardResume.tsx comment. Matches server's
          // worst-case Groq→Gemini fallback path plus pre-checks.
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 40000)),
          new Promise<null>((_, reject) => {
            currentAbort.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
          aiSuccess = true;
          if (finalProfile.headline && finalProfile.headline !== "Analyzing...") {
            // AI headlines look like "Senior Product Designer with 5+ years…"
            // — slice off everything from " with " onwards to get just the role.
            const aiRole = finalProfile.headline.split(/\s+with\s+/i)[0].trim();
            if (looksLikeJobTitle(aiRole)) setTargetRole(aiRole);
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
        // Store only the AI-derived profile + a marker. We deliberately DO
        // NOT embed `data` (the raw ParsedResume) here — it duplicates
        // resume_text which already lives in its own column, and roughly
        // doubles the row size for no functional benefit. If we ever need
        // the structured parse again we can rehydrate it from resume_text.
        //
        // Shape: finalProfile is a ResumeProfile (AI output) whether the
        // AI call succeeded or we synthesised one from the fallback.
        // Tag appropriately — readers use isAiResume/isFallbackResume.
        resumeData: aiSuccess
          ? { _type: "ai", ...finalProfile }
          : { _type: "fallback", ...data },
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
      const msg = err instanceof Error ? err.message : "Failed to parse resume";
      setResumeError(msg);
      setResumeText(""); setResumeParsed(null);
      track("resume_upload_failed", { reason: "parse_error", message: msg.slice(0, 100) });
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
      if (aiProfile) {
        saveData.resumeData = { _type: "ai", ...aiProfile };
      } else if (resumeParsed) {
        saveData.resumeData = { _type: "fallback", ...resumeParsed };
      }
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

  // Keyboard shortcuts — power-user-friendly:
  //   Cmd/Ctrl + U → open the file picker (works from any onboarding state)
  //   Cmd/Ctrl + Enter → start the interview (only when profile is ready)
  // Prevents default so we don't collide with browser defaults.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "u" || e.key === "U") {
        if (!resumeParsing) { e.preventDefault(); fileInputRef.current?.click(); }
      } else if (e.key === "Enter") {
        if (resumeParsed && aiPhase === "done" && userName.trim() && !starting) {
          e.preventDefault();
          handleStartInterview();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resumeParsed, aiPhase, userName, starting, resumeParsing]);

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
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
        @keyframes scoreReveal {
          0%   { transform: scale(0.85); filter: brightness(1.1); box-shadow: 0 0 0 0 rgba(212,179,127,0.45); }
          50%  { transform: scale(1.04); filter: brightness(1.25); box-shadow: 0 0 0 10px rgba(212,179,127,0); }
          100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 0 rgba(212,179,127,0); }
        }
        @keyframes cardMorphIn {
          0%   { opacity: 0; transform: translateY(4px); filter: blur(3px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .ob-score-reveal { animation: scoreReveal 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both; }
        .ob-card-morph { animation: cardMorphIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
        /* Removed: fake progressFill animation (18s stall → 92%) — replaced
           by honest elapsed-seconds counter in ResumeLoadingState. */
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
          /* Mobile density: show only Skills by default; collapse rest behind details */
          .ob-mobile-collapse { display: none !important; }
          .ob-mobile-expanded .ob-mobile-collapse { display: flex !important; }
          .ob-mobile-expanded .ob-card.ob-mobile-collapse { display: block !important; }
          .ob-see-more { display: flex !important; }
          .ob-footer-ctas { flex-direction: column-reverse !important; }
          .ob-footer-ctas button { width: 100% !important; }
        }
        @media (min-width: 769px) { .ob-see-more { display: none !important; } }
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
            <ResumeLoadingState
              analysisStage={analysisStage}
              fileName={fileName}
              onCancel={handleCancelAnalysis}
              userName={userName}
              onUserNameChange={setUserName}
              targetRole={targetRole}
              onTargetRoleChange={setTargetRole}
            />
          )}
          {resumeParsed && !resumeParsing && aiPhase === "done" && (
            <ProfileReadyState
              aiProfile={aiProfile || { headline: resumeParsed.name || "Your Profile", summary: "", yearsExperience: null, seniorityLevel: "", topSkills: resumeParsed.skills?.slice(0, 8) || [], keyAchievements: [], industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "" }}
              resumeParsed={resumeParsed} userName={userName}
              fileName={fileName} resumeText={resumeText} targetRole={targetRole}
              fileInputRef={fileInputRef} onUserNameChange={setUserName}
              onTargetRoleChange={setTargetRole}
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
            // #14 — surface free-tier quota near the primary CTA so users
            // don't discover the session limit mid-flow. For paid users
            // the hint is empty (NavigationFooter hides it).
            quotaHint={
              user && (!user.subscriptionTier || user.subscriptionTier === "free")
                ? `${Math.max(0, 3 - (user.practiceTimestamps?.length || 0))} free interviews included`
                : null
            }
          />
        </div>
      </div>

      {/* #13 + #19 — welcome-back toast (resume restored) + exit-intent reassurance */}
      {draftToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
            zIndex: 100, maxWidth: "calc(100vw - 32px)",
            padding: "12px 18px", borderRadius: 10,
            background: "rgba(17,17,19,0.95)", border: `1px solid rgba(212,179,127,0.25)`,
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: font.ui, fontSize: 13, color: c.chalk,
            animation: "toastIn 0.25s ease-out",
          }}
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {draftToast}
        </div>
      )}

      {/* #15 — autosave feedback: tiny flash in the corner when the debounced
          profile write lands. Non-intrusive; users who aren't looking for it
          won't notice, users who are will know their edits are safe. */}
      {autosaveFlash && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 16, right: 16, zIndex: 99,
            padding: "6px 12px", borderRadius: 8,
            background: "rgba(122,158,126,0.1)", border: `1px solid rgba(122,158,126,0.25)`,
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.sage,
            animation: "toastIn 0.2s ease-out",
          }}
        >
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          Saved
        </div>
      )}
    </div>
  );
}

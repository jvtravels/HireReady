"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { font } from "./tokens";
import { useAuth } from "./AuthContext";
import type { ParsedResume } from "./resumeParser";
import type { ResumeProfile } from "./dashboardData";
import { FREE_SESSION_LIMIT } from "./dashboardData";
import { track } from "@vercel/analytics";
import { EmailVerificationBanner } from "./onboarding/EmailVerificationBanner";
import {
  TopBar,
  ResumeEmptyState,
  ResumeLoadingState,
  ProfileReadyState,
  NavigationFooter,
} from "./onboarding/Panels";
import { tokens as ot } from "./auth/_tokens";
import { detectResumeRoleMismatch } from "../server-handlers/_resume-role-match";

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

// Degree / subject / institution keywords — when a saved name field
// contains these, it's almost certainly a parser mis-classification
// from the pre-fix days (e.g. "BTech Computer Science", "DY PATIL
// UNIVERSITY", "Bachelor Of Engineering"). looksLikePersonName uses
// this in addition to ROLE_KEYWORDS so display-layer fallbacks
// reject historical bad values, not just new uploads.
const NON_NAME_KEYWORDS = /\b(?:university|college|institute|institution|academy|school|consultancy|consulting|services|solutions|technologies|technology|systems|limited|ltd|pvt|private|inc|corporation|corp|company|llc|btech|b\.tech|mtech|m\.tech|bsc|b\.sc|msc|m\.sc|bcom|b\.com|mcom|m\.com|bca|mca|llb|llm|mbbs|bds|mba|bachelor|bachelors|master|masters|diploma|graduate|graduation|postgraduate|undergraduate|phd|doctorate|fellowship|certification|certificate|computer|information|electronics|mechanical|electrical|civil|chemical|biotechnology|biotech|commerce|arts|economics|psychology|physics|chemistry|biology|mathematics|statistics)\b/i;

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
 * Map a target role string into a coarse domain bucket the server
 * understands. Used as the resume_versions.domain qualifier so a user
 * who switches roles (PM → designer → SDE) gets a separate resume row
 * per domain rather than overwriting the previous one. Default
 * "general" keeps things working when the role is empty / unknown.
 */
function roleToDomain(role: string | null | undefined): string {
  const r = (role || "").toLowerCase();
  if (!r) return "general";
  if (/\b(designer|design|ux|ui|product\s*designer|graphic|visual)\b/.test(r)) return "design";
  if (/\b(product\s*manager|pm|product\s*owner|po)\b/.test(r)) return "pm";
  if (/\b(sales|account\s*executive|business\s*development|bd|bdr|sdr)\b/.test(r)) return "sales";
  if (/\b(engineer|developer|programmer|sde|swe|architect|devops|sre)\b/.test(r)) return "sde";
  if (/\b(data\s*scientist|ml|machine\s*learning|analyst|data\s*analyst|research)\b/.test(r)) return "data";
  if (/\b(marketing|growth|content|seo|copywriter)\b/.test(r)) return "marketing";
  return "general";
}

/**
 * Compute SHA-256 hex of the file's bytes. The server validates this
 * cheaply before storing — it's used as a stable file identity (not
 * just the text hash) so we can detect "same file uploaded twice"
 * even after re-saves that change whitespace. Web Crypto only; falls
 * back to null if SubtleCrypto is unavailable.
 */
async function computeFileHash(file: File): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
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
  // Reject degree / subject / institution-shaped strings. Catches
  // historical bad data like "BTech Computer Science", "DY PATIL
  // UNIVERSITY", "MBA Finance" that may already be saved on a
  // user's profile from before the parser fix landed.
  if (NON_NAME_KEYWORDS.test(trimmed)) return false;
  // Max 5 tokens — "Dr. Jane Marie O'Brien-Smith" fits; "Jane Smith
  // is looking for a Senior Engineer role" doesn't.
  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 5) return false;
  // At least one letter (covers Latin + every Unicode script via \p{L})
  return /\p{L}/u.test(trimmed);
}

export default function Onboarding() {
  const router = useRouter();
  const { user, updateUser, logout, loading: authLoading } = useAuth();

  const startingRef = useRef(false);
  // Track whether we should render the onboarding UI at all. The bug
  // user reported was: returning users (hasCompletedOnboarding = true)
  // saw the resume section flash for ~1-2s before being redirected to
  // /dashboard. That happened because Onboarding mounted IMMEDIATELY
  // and only checked hasCompletedOnboarding inside a useEffect — by
  // the time the redirect fired, React had already painted a frame
  // (or several) of onboarding content.
  //
  // Now: while AuthContext is still loading OR if the user has
  // already completed onboarding, we render a minimal cream screen
  // (matches /loading.tsx) and let the redirect fire silently. The
  // jerk-then-redirect flicker is gone.
  const shouldRedirectAway = !!user?.hasCompletedOnboarding && !startingRef.current;
  useEffect(() => {
    if (shouldRedirectAway) router.replace("/dashboard");
  }, [shouldRedirectAway, router]);

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
  // Gate the saved user.name through the person-name validator on
  // mount so historical bad values (e.g. "BTech Computer Science",
  // "DY PATIL UNIVERSITY") don't seed userName. The user can still
  // type a real name and we'll save it.
  const [userName, setUserName] = useState(
    looksLikePersonName(user?.name) ? (user?.name || "") : ""
  );
  const undoRef = useRef<{ fileName: string; resumeText: string; resumeParsed: ParsedResume | null; aiProfile: ResumeProfile | null; aiPhase: "idle" | "analyzing" | "done"; targetRole: string; userName: string } | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef<number>(0);
  const [targetRole, setTargetRole] = useState(user?.targetRole || "");
  const [roleMismatchBlurred, setRoleMismatchBlurred] = useState(false);
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
    // 3.5s auto-dismiss (was 5s — too long, felt stuck). The toast
    // also has a manual close button now so it can't feel stuck.
    const t = setTimeout(() => setDraftToast(null), 3500);
    return () => clearTimeout(t);
  }, [resumeParsed, fileName, resumeParsing]);

  // Clear the welcome-back toast when the user starts a new upload.
  // Keeping it visible during the loading state was the "stuck" feeling
  // they reported — by then the message is no longer relevant.
  useEffect(() => {
    if (resumeParsing) setDraftToast(null);
  }, [resumeParsing]);

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
      // Name is taken from signup (user.name) — no longer copied from
      // the resume. Resume parsing produced too many false positives
      // ("BTech Computer Science", "DY PATIL UNIVERSITY", etc.) and
      // every signed-up user has already given us their real name.
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
              // Persist the version pointer to the user's profile if a
              // new analysis ran. Skip when unchanged so we don't burn
              // a write on a cache-hit.
              if (result.resumeVersionId && result.resumeVersionId !== user?.resumeVersionId) {
                updateUser({ resumeVersionId: result.resumeVersionId }).catch(() => { /* best-effort */ });
              }
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
    // Restore-from-stored-resume effect: only re-runs when the saved file changes.
    // Including the rest (targetRole / resumeParsed / updateUser etc.) would re-trigger
    // analysis whenever the user types a role, which is the exact opposite of what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          if (result.resumeVersionId && result.resumeVersionId !== user.resumeVersionId) {
            updateUser({ resumeVersionId: result.resumeVersionId }).catch(() => { /* best-effort */ });
          }
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
    // handleStart is a stable wrapper around finalizeOnboarding that has no closure-state of its own; rebinding the listener every render to capture a fresh ref would churn for no behavioral gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Compute file-byte hash in parallel with text extraction. Used
      // by the server-side resume cache as a stable file-identity key
      // alongside text_hash, so re-uploads of the same file converge
      // on the same cached analysis even when pdf.js versions tweak
      // whitespace. Best-effort — null on browsers without SubtleCrypto.
      const fileHashPromise = computeFileHash(file);
      let text = await extractResumeText(file);
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
      // Mirror the server's 50,000-char ceiling (analyze-resume.ts rejects
      // longer text with a 400) on the client. A resume this long is almost
      // always a parsing artifact (embedded fonts, repeated boilerplate);
      // trimming up front keeps the meaningful first pages and avoids an
      // opaque post-upload failure. P0-5: client/server limits now agree.
      const MAX_RESUME_TEXT_CHARS = 50000;
      if (text.length > MAX_RESUME_TEXT_CHARS) {
        track("resume_text_trimmed", { originalLen: text.length, trimmedTo: MAX_RESUME_TEXT_CHARS });
        text = text.slice(0, MAX_RESUME_TEXT_CHARS);
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
      // Name comes from the signup form, not from resume parsing. The
      // resume name regex produced too many false positives (institution
      // names, degree lines like "BTech Computer Science"). Every signed-
      // up user has already given us their real name; we trust that.
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = new AbortController();
      const currentAbort = analysisAbortRef.current;
      setAiPhase("analyzing");
      let finalProfile: ResumeProfile = fallback;
      let aiSuccess = false;
      // Captured from analyze-resume's response so we can pin the user's
      // profile to the canonical resume_versions row immediately. If the
      // tab closes between LLM completion and the updateUser PATCH, the
      // version row is already durable on the server (analyze-resume
      // persists it before responding); the user just won't have the
      // pointer on their profile until next analysis. This still beats
      // the previous behavior where the binding was localStorage-only.
      let analyzedVersionId: string | null = null;
      // Resolve the file hash before the analyze call so the server can
      // dedupe by file identity. Awaiting here adds a few ms over the
      // text extraction we already did — typically <50ms for a 200KB
      // PDF. Worth it for cache parity.
      const fileHash = await fileHashPromise;
      const effectiveRole = targetRole || autoRole;
      try {
        const result = await Promise.race([
          analyzeResumeWithAI(text, effectiveRole, currentAbort.signal, {
            domain: roleToDomain(effectiveRole),
            fileName: file.name,
            fileHash: fileHash ?? undefined,
          }),
          // 25s budget — aligned to the server's worst-case Groq→Gemini
          // fallback (~10s + 10s + ~3s pre-checks = ~23s). The previous
          // 40s ceiling let the client surface a "timeout" on requests
          // the server had actually completed; users saw "timed out"
          // for analyses that landed successfully in the DB. 25s leaves
          // a 2s buffer for network jitter on the response path.
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000)),
          new Promise<null>((_, reject) => {
            currentAbort.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
        if (result && typeof result === "object" && "profile" in result) {
          finalProfile = result.profile;
          setAiProfile(finalProfile);
          analyzedVersionId = result.resumeVersionId ?? null;
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
          // headline stays generic here — it must never be the candidate's own
          // name (data.name), which the UI renders both as the profile title
          // and, absent a separately-set targetRole, as the "Target role" pill.
          finalProfile = { ...fallback, topSkills: cleanSkills.slice(0, 8), headline: "Your Profile" };
          setAiProfile(finalProfile);
        }
      }
      setResumeParsing(false);
      // Always transition to "done" once handleFileUpload's analysis
      // completes — whether the AI call succeeded or we fell back to
      // the regex profile. The previous `if (!reanalyzedRef.current)`
      // guard caused a real race: setAiProfile (line ~425) re-ran the
      // re-analyze effect, which flipped reanalyzedRef.current to true
      // when hasRealScore became true, and then this line skipped the
      // setAiPhase("done") call → UI stayed stuck on "Reading your
      // resume…" forever, even though server returned 200. Refresh
      // showed the result because state rehydrated cleanly. Always
      // setting "done" here is correct — there's no scenario where
      // we want to remain in "analyzing" after this code path runs.
      setAiPhase("done");
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
        // Pin the user's profile to the canonical resume_versions row.
        // Sessions started after this point will capture this id so
        // their report can be replayed against the exact resume the
        // user was scored against.
        resumeVersionId: analyzedVersionId,
      };
      if (!targetRole && autoRole) profileSave.targetRole = autoRole;
      // Do NOT save data.name — we never overwrite the signup name with
      // the resume parser's guess. This was the source of the
      // "BTech Computer Science" / "DY PATIL UNIVERSITY" UI bugs:
      // even when display logic filtered bad names, profileSave.name
      // had already poisoned user.name in the database.
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
    // Wrap navigation so a router failure doesn't leave the CTA stuck
    // in "Starting…" with no way to recover. If navigation throws, we
    // reset starting and surface a toast.
    try {
      if (dest === "interview") router.push("/session/new?firstFree=1");
      else router.push("/dashboard");
    } catch (navErr) {
      console.warn("[finalizeOnboarding] navigation failed:", navErr);
      setStarting(false);
      startingRef.current = false;
      setDraftToast(dest === "skip"
        ? "Saved. You can come back anytime from Settings."
        : "Couldn't navigate — try again, or refresh the page.");
    }
  };

  const handleStartInterview = () => { finalizeOnboarding("interview"); };
  const handleGoToDashboard = () => { finalizeOnboarding("dashboard"); };
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
    // handleStartInterview is a stable wrapper around finalizeOnboarding; including it would re-bind keydown each render with no behavioral change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const timer = setTimeout(() => ac.abort(), 25000);
    import("./dashboardData").then(({ analyzeResumeWithAI }) => {
      // Re-analyze runs against the resume the user already has stored.
      // Thread domain through so the server keys the cache by both
      // text_hash and the user's current target role; without this,
      // a "Re-analyze after changing my role" would surface yesterday's
      // role's analysis from the cache.
      analyzeResumeWithAI(resumeText, targetRole, ac.signal, {
        domain: roleToDomain(targetRole),
        fileName: fileName || user?.resumeFileName || undefined,
      })
        .then(r => {
          if (r && typeof r === "object" && "profile" in r) {
            setAiProfile(r.profile);
            if (r.resumeVersionId && r.resumeVersionId !== user?.resumeVersionId) {
              updateUser({ resumeVersionId: r.resumeVersionId }).catch(() => { /* best-effort */ });
            }
          }
        })
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

  // Anti-flicker: skip rendering the onboarding shell when AuthContext
  // is still loading OR when we know we're about to redirect to
  // /dashboard. Returning a clean cream screen instead of the resume
  // section means returning users no longer see a 1-2s flash of
  // onboarding before the redirect fires. Matches /loading.tsx style.
  if (authLoading || shouldRedirectAway) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={{ minHeight: "100vh", background: ot.cream, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div
          style={{
            width: 36, height: 36,
            border: "2px solid rgba(180,83,9,0.15)",
            borderTopColor: "#312E81",
            borderRadius: "50%",
            animation: "ob-spin 800ms linear infinite",
          }}
        />
        <style>{`@keyframes ob-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Inline warning when the entered target role doesn't match the resume's
  // apparent domain. Hidden until the user blurs the input so we don't yell
  // mid-typing. detectResumeRoleMismatch is pure — safe in client bundle.
  const resumeTitleForMismatch =
    aiProfile?.headline?.trim() || resumeParsed?.experience?.[0]?.title || resumeParsed?.name || null;
  const mismatchResult =
    roleMismatchBlurred && targetRole.trim() && resumeTitleForMismatch
      ? detectResumeRoleMismatch({ resumeTitle: resumeTitleForMismatch, targetRole })
      : null;
  const roleMismatchWarning =
    mismatchResult && mismatchResult.severity === "hard"
      ? `Heads up — your resume reads "${resumeTitleForMismatch}" but you've entered "${targetRole}". You can continue; the interviewer will probe the pivot.`
      : null;

  return (
    <div style={{ minHeight: "100vh", background: ot.cream, display: "flex", flexDirection: "column", position: "relative", color: ot.coal }}>
      {user && !user.emailVerified && <EmailVerificationBanner email={user.email} />}
      <style>{`
        /* Toast slide-up — used by the draftToast + autosave flash below.
           Cream-themed; the dark-themed legacy keyframes have been pruned
           after the cream-redesign deploy. */
        @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

        /* Keeps the inner page content scrolling within the viewport on
           short laptops; matches the production footer's responsive needs. */
        @media (max-height: 700px) {
          .ob-content-area { padding-top: 16px !important; padding-bottom: 16px !important; }
        }
        @media (max-width: 768px) {
          .ob-footer-ctas { flex-direction: column-reverse !important; }
          .ob-footer-ctas button { width: 100% !important; }
        }
      `}</style>

      <TopBar
        // 1 = upload, 2 = analyse, 3 = review. Drives the Stepper highlight.
        step={
          aiPhase === "analyzing" || resumeParsing
            ? 2
            : resumeParsed && aiPhase === "done"
              ? 3
              : 1
        }
        emailUnverified={!!(user && !user.emailVerified)}
        onNavigateHome={() => router.push("/")}
        onStepClick={() => {}}
        onLogout={async () => { await logout(); router.push("/"); }}
        userEmail={user?.email || ""}
        userAvatar={undefined}
        // Name comes from the signup flow only. We don't fall back to
        // the resume parser anymore — see "BTech Computer Science" /
        // "DY PATIL UNIVERSITY" bug class. The looksLikePersonName
        // gate stays as defense-in-depth: any historical bad value
        // already saved on user.name from before this cleanup falls
        // through and TopBar renders email-initials instead.
        userName={
          (looksLikePersonName(userName) && userName.trim()) ||
          (looksLikePersonName(user?.name) && (user!.name || "")) ||
          ""
        }
      />

      <div className="ob-content-area" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", overflow: "auto" }}>
        <div style={{ width: "100%", maxWidth: !resumeParsed ? "min(680px, calc(100vw - 32px))" : "min(1360px, calc(100vw - 32px))", transition: "max-width 0.4s ease" }}>
          {!resumeParsed && !resumeParsing && aiPhase !== "analyzing" && (
            <ResumeEmptyState
              isDragging={isDragging} dragFileName={dragFileName} resumeError={resumeError}
              showUndo={showUndo} fileInputRef={fileInputRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); if (!dragFileName && e.dataTransfer.types.includes("Files")) setDragFileName(e.dataTransfer.items?.[0]?.getAsFile?.()?.name || ""); }}
              onDragLeave={() => { setIsDragging(false); setDragFileName(""); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); setDragFileName(""); handleFileChange(e.dataTransfer.files[0]); }}
              onFileChange={handleFileChange} onUndo={handleUndo}
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
              targetRoleMismatch={roleMismatchWarning}
              onTargetRoleBlur={() => setRoleMismatchBlurred(true)}
            />
          )}
          {resumeParsed && !resumeParsing && aiPhase === "done" && (
            <ProfileReadyState
              aiProfile={aiProfile || { headline: "Your Profile", summary: "", yearsExperience: null, seniorityLevel: "", topSkills: resumeParsed.skills?.slice(0, 8) || [], keyAchievements: [], industries: [], interviewStrengths: [], interviewGaps: [], careerTrajectory: "" }}
              resumeParsed={resumeParsed} userName={userName}
              fileName={fileName} resumeText={resumeText} targetRole={targetRole}
              fileInputRef={fileInputRef} onUserNameChange={setUserName}
              onTargetRoleChange={setTargetRole}
              onReanalyze={handleReanalyze} onRemove={handleRemoveResume}
              onStartInterview={handleStartInterview}
              onGoToDashboard={handleGoToDashboard}
              starting={starting}
            />
          )}

          <NavigationFooter
            isContinueDisabled={isContinueDisabled}
            starting={starting} saveStatus={saveStatus}
            onStart={handleStart}
            onStartInterview={handleStartInterview}
            onGoToDashboard={handleGoToDashboard}
            onSkip={noResume && !isBusy ? () => finalizeOnboarding("skip") : undefined}
            resumeScore={aiProfile?.resumeScore ?? null}
            hasResume={!!resumeParsed && aiPhase === "done"}
            // #14 — surface free-tier quota near the primary CTA so users
            // don't discover the session limit mid-flow. For paid users
            // the hint is empty (NavigationFooter hides it).
            quotaHint={
              user && (!user.subscriptionTier || user.subscriptionTier === "free")
                ? `${Math.max(0, FREE_SESSION_LIMIT - (user.practiceTimestamps?.length || 0))} free interview${FREE_SESSION_LIMIT - (user.practiceTimestamps?.length || 0) === 1 ? "" : "s"} left (one-time)`
                : null
            }
          />
        </div>
      </div>

      {/* #13 + #19 — welcome-back toast (resume restored) + exit-intent reassurance.
          Always renders a dismiss button so it can never feel "stuck". */}
      {draftToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
            zIndex: 100, maxWidth: "calc(100vw - 32px)",
            padding: "12px 14px 12px 18px", borderRadius: 10,
            background: ot.white, border: `1px solid ${ot.line}`,
            boxShadow: "0 10px 40px rgba(20,17,10,0.16)",
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: font.ui, fontSize: 13, color: ot.coal,
            animation: "toastIn 0.25s ease-out",
          }}
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ot.success} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span>{draftToast}</span>
          <button
            type="button"
            onClick={() => setDraftToast(null)}
            aria-label="Dismiss"
            style={{
              marginLeft: 4,
              width: 22, height: 22,
              border: "none",
              background: "transparent",
              color: ot.inkSoft,
              cursor: "pointer",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = ot.creamSoft; e.currentTarget.style.color = ot.coal; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ot.inkSoft; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
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
            background: ot.success100, border: `1px solid rgba(21, 128, 61, 0.25)`,
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: ot.success,
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

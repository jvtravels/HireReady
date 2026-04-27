"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { useDashboardCore, useDashboardUI } from "./DashboardContext";
import { extractResumeText, parseResumeData, isAiResume, isFallbackResume, type FallbackStoredResume } from "./resumeParser";
import { type ResumeProfile, analyzeResumeWithAI, ACTIVE_RESUME_VERSION_KEY } from "./dashboardData";
import { computeAllFitness, type InterviewType, type FitnessBand } from "./resumeFitness";
import { computeResumeDiff } from "./resumeDiff";
import { reconcileResumeAgainstRole } from "./skillReconcile";

/** Project a regex-fallback resume into the ResumeProfile shape the UI
 *  expects, so the AI and fallback branches can render through a single
 *  ResumeProfile path. First experience entry's bullets feed
 *  keyAchievements; anything missing falls back to a readable default. */
function fallbackToProfile(r: FallbackStoredResume): ResumeProfile {
  return {
    headline: r.name || "Resume uploaded",
    summary: r.summary || "Your resume has been uploaded and will be used to personalize your interview questions.",
    yearsExperience: null,
    seniorityLevel: "",
    topSkills: (r.skills || []).slice(0, 8),
    keyAchievements: (r.experience || []).flatMap(e => (e as { bullets?: string[] }).bullets || []).slice(0, 5),
    industries: [],
    interviewStrengths: [],
    interviewGaps: [],
    careerTrajectory: "",
  };
}
import { DataLoadingSkeleton } from "./dashboardComponents";

/**
 * Push the original file bytes up to /api/resume/upload-file. Best-effort:
 * if the Storage bucket isn't configured, the endpoint returns 503 with
 * `bucketMissing: true` and we silently no-op. Resume analysis itself is
 * unaffected — this is purely "archive the original PDF so we can let
 * the user re-download or audit it later".
 *
 * Encoding: read the file as ArrayBuffer, base64-encode in-browser, send
 * via apiFetch (XHR). Same transport layer as every other mutation.
 */
async function uploadOriginalFile(file: File, resumeVersionId: string): Promise<void> {
  const buf = await file.arrayBuffer();
  // btoa requires a binary string; build it in 32K chunks to avoid
  // "argument list too large" on bigger PDFs.
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  const fileBase64 = btoa(binary);
  const { apiFetch } = await import("./apiClient");
  const res = await apiFetch<{ ok?: boolean; bucketMissing?: boolean; file_path?: string; error?: string }>(
    "/api/resume/upload-file",
    {
      resumeVersionId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileBase64,
    },
  );
  if (!res.ok && !res.data?.bucketMissing) {
    // Bucket-missing is "expected" while file storage isn't enabled
    // for this Supabase project — don't spam the console.
    console.warn(`[resume] file storage upload failed (${res.status}): ${res.error}`);
  }
}

/* ─── Resume Version History (localStorage) ─── */
const RESUME_HISTORY_KEY = "hirestepx_resume_history";
interface ResumeVersion { fileName: string; date: string; resumeScore?: number; contentHash?: string; resumeText?: string; }
/** Simple fast hash of resume text to detect content changes */
function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}
function saveResumeVersion(fileName: string, resumeScore?: number, resumeText?: string) {
  try {
    const raw = localStorage.getItem(RESUME_HISTORY_KEY);
    const history: ResumeVersion[] = raw ? JSON.parse(raw) : [];
    const hash = resumeText ? hashText(resumeText) : undefined;
    // Same file AND same content = re-analysis of identical resume → update score only
    // Same file but different content (or no hash to compare) = genuinely new version
    const isDuplicate = history.length > 0
      && history[0].fileName === fileName
      && hash != null && history[0].contentHash != null
      && hash === history[0].contentHash;
    if (isDuplicate) {
      history[0].resumeScore = resumeScore ?? history[0].resumeScore;
      history[0].date = new Date().toISOString();
      if (resumeText) history[0].resumeText = resumeText.slice(0, 8000);
    } else {
      history.unshift({ fileName, date: new Date().toISOString(), resumeScore, contentHash: hash, resumeText: resumeText?.slice(0, 8000) });
    }
    // Keep last 10 versions
    localStorage.setItem(RESUME_HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  } catch { /* expected: localStorage may be unavailable */ }
}
function getResumeHistory(): ResumeVersion[] {
  try {
    const raw = localStorage.getItem(RESUME_HISTORY_KEY);
    const history: ResumeVersion[] = raw ? JSON.parse(raw) : [];
    // Retroactive dedup: earlier versions of saveResumeVersion could produce
    // near-identical rows (same filename, same text content) because the
    // auto-reanalyze useEffect ran on every user-object refresh. Collapse
    // them keeping the newest occurrence of each (fileName, contentHash)
    // pair and re-persist so the UI stabilises.
    const seen = new Set<string>();
    const deduped: ResumeVersion[] = [];
    for (const v of history) {
      const key = `${v.fileName}::${v.contentHash ?? "nohash"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(v);
    }
    if (deduped.length !== history.length) {
      try { localStorage.setItem(RESUME_HISTORY_KEY, JSON.stringify(deduped)); } catch { /* quota */ }
    }
    return deduped;
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

function computeATSScore(resumeText: string, _targetRole?: string): ATSResult {
  const text = resumeText.toLowerCase();
  const lines = resumeText.split("\n").filter(l => l.trim().length > 0);

  // ATS-required sections — check for clear section headings (not just word mentions)
  const requiredSections = [
    { name: "Contact Info", keywords: ["email", "@", "phone", "linkedin", "github"] },
    { name: "Work Experience", keywords: ["experience", "employment", "work history", "professional experience"] },
    { name: "Education", keywords: ["education", "academic", "university", "degree", "college"] },
    { name: "Skills", keywords: ["skills", "technical skills", "technologies", "competencies", "tools"] },
  ];

  // Bonus sections
  const bonusSections = [
    { name: "Summary", keywords: ["summary", "objective", "profile", "about"] },
    { name: "Projects", keywords: ["projects", "portfolio"] },
    { name: "Certifications", keywords: ["certifications", "certificates", "licenses"] },
  ];

  // Action verbs — require more for a high score
  const actionVerbs = ["achieved", "led", "managed", "developed", "implemented", "designed", "built", "increased", "reduced", "improved", "launched", "delivered", "created", "optimized", "coordinated", "analyzed", "spearheaded", "orchestrated", "streamlined", "pioneered", "established", "transformed", "automated", "mentored", "negotiated", "resolved"];

  // Metrics/quantification patterns
  const metricPatterns = [
    /\d+%/,
    /\$[\d,]+/,
    /\d+\+?\s*(users|customers|team|members|engineers|projects|clients|people)/i,
    /\d+x\b/i,
    /\b(revenue|growth|savings|reduction|increase|improvement)\b.*\d/i,
  ];
  const metricsFound = metricPatterns.filter(p => p.test(resumeText)).length;
  const hasMetrics = metricsFound > 0;

  // Check sections
  const foundSections = requiredSections.filter(s => s.keywords.some(k => text.includes(k)));
  const missingSections = requiredSections.filter(s => !s.keywords.some(k => text.includes(k)));
  const foundBonus = bonusSections.filter(s => s.keywords.some(k => text.includes(k)));

  // Check action verbs
  const foundVerbs = actionVerbs.filter(v => new RegExp(`\\b${v}\\w*\\b`, "i").test(text));

  // Length & density checks
  const wordCount = resumeText.trim().split(/\s+/).length;
  const hasSufficientLength = wordCount >= 150;
  const hasGoodLength = wordCount >= 300 && wordCount <= 1200;
  const bulletCount = (resumeText.match(/^[\s]*[-•●◦▪]/gm) || []).length;
  const hasBullets = bulletCount >= 3;

  // Formatting red flags
  const hasLongParagraphs = lines.some(l => l.trim().split(/\s+/).length > 60);
  const hasAllCapsBlocks = (resumeText.match(/^[A-Z\s]{20,}$/gm) || []).length > 3;

  // Score: 100 points total, harder to max out
  let score = 0;

  // Sections: up to 30 pts (required) + 6 pts (bonus)
  score += foundSections.length * 7.5;  // up to 30
  score += Math.min(6, foundBonus.length * 2); // up to 6

  // Action verbs: up to 15 pts (need 8+ verbs for full marks)
  score += Math.min(15, foundVerbs.length * 1.9);

  // Metrics: up to 15 pts (more metrics = higher score)
  score += Math.min(15, metricsFound * 5);

  // Structure: up to 14 pts
  score += hasSufficientLength ? 4 : 0;
  score += hasGoodLength ? 4 : 0;
  score += hasBullets ? 4 : 0;
  score += (!hasLongParagraphs) ? 2 : 0;

  // Formatting: up to 10 pts
  score += (!hasAllCapsBlocks) ? 3 : 0;
  score += (foundSections.length >= 3) ? 4 : 0;
  score += (wordCount > 100 && bulletCount >= 5) ? 3 : 0;

  // Penalties
  if (!hasSufficientLength) score -= 5;
  if (missingSections.length >= 2) score -= 5;
  if (foundVerbs.length < 3) score -= 5;

  score = Math.min(100, Math.max(0, Math.round(score)));

  const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Needs Work" : "Poor";

  const found = [
    ...foundSections.map(s => s.name),
    ...foundBonus.map(s => s.name),
    foundVerbs.length > 0 ? `${foundVerbs.length} action verbs` : null,
    hasMetrics ? "Quantified achievements" : null,
    hasBullets ? "Bullet-point formatting" : null,
    hasGoodLength ? "Good length" : null,
  ].filter(Boolean) as string[];

  const missing = [
    ...missingSections.map(s => `Missing: ${s.name} section`),
    foundVerbs.length < 5 ? "Add more action verbs (achieved, led, built, implemented...)" : null,
    !hasMetrics ? "Add quantified metrics (%, $, numbers)" : null,
    !hasBullets ? "Use bullet points for better readability" : null,
    !hasSufficientLength ? "Resume is too short — add more detail" : null,
    hasLongParagraphs ? "Break long paragraphs into bullet points" : null,
  ].filter(Boolean) as string[];

  const suggestions = [
    missingSections.length > 0 ? `Add clear section headers: ${missingSections.map(s => s.name).join(", ")}` : null,
    !hasMetrics ? "Quantify achievements with specific numbers (e.g., 'increased revenue by 30%')" : null,
    foundVerbs.length < 8 ? "Start bullet points with strong action verbs: achieved, led, implemented, designed" : null,
    !hasBullets ? "Format experience as bullet points for ATS readability" : null,
    hasLongParagraphs ? "Keep paragraphs under 3 lines — ATS and recruiters prefer concise bullets" : null,
    "Use standard section headings (Experience, Education, Skills) for better ATS parsing",
    "Avoid tables, graphics, and complex formatting that ATS cannot read",
  ].filter(Boolean) as string[];

  return { score, label, found, missing, suggestions: suggestions.slice(0, 5) };
}

export default function DashboardResume() {
  useDocTitle("Resume");
  const { user, updateUser } = useAuth();
  const { persisted, updatePersisted } = useDashboardCore();
  const { dataLoading } = useDashboardUI();

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
  // Resume v2 — domain tag selected at upload. Defaults to "general"
  // for back-compat with single-resume users. Persists in component
  // state only; on upload we pass it to /api/analyze-resume which
  // creates/finds the matching `resumes` row.
  const [domain, setDomain] = useState<string>("general");
  // Multi-resume list — shown above the single-active-resume card so
  // users can see they have e.g. an SDE resume + a PM resume in one
  // glance. Read-only for now; switching is a Phase 4 ticket.
  const [allResumes, setAllResumes] = useState<Array<{
    id: string;
    domain: string;
    title: string;
    latestVersion: number;
    latestVersionId: string | null;
    latestScore: number | null;
    latestProfile: ResumeProfile | null;
    latestFileName: string | null;
    updatedAt: string;
    isActive: boolean;
    versions: Array<{ id: string; versionNumber: number; isLatest: boolean; fileName: string | null; score: number | null; profile: ResumeProfile | null; createdAt: string | null }>;
  }>>([]);
  // Per-card "expand to show all versions" toggle — keyed by resumeId
  // so multiple cards can be expanded independently.
  const [expandedTimeline, setExpandedTimeline] = useState<Record<string, boolean>>({});
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // Per-bullet polish state. key = improvement index, value = pending /
  // returned suggestion. Lives only as long as the user is on the tab —
  // polishing is a transient UI nudge, not persisted.
  const [polished, setPolished] = useState<Record<number, { state: "loading" | "done" | "error"; rewrite?: string; rationale?: string; error?: string }>>({});
  const [activatingId, setActivatingId] = useState<string | null>(null);
  // Bump to force the catalogue useEffect to refetch (e.g. after the
  // server PATCH on Make Active so updated_at-based ordering reflects
  // DB truth).
  const [catalogueRefreshKey, setCatalogueRefreshKey] = useState(0);
  const analyzingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ATS compliance check — auto-computes when resume/JD changes
  const atsResult = useMemo<ATSResult | null>(() => {
    const rText = user?.resumeText || resumeText;
    if (!rText) return null;
    return computeATSScore(rText, user?.targetRole);
  }, [user?.resumeText, resumeText, user?.targetRole]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  // Fetch the user's full resume catalogue (all domains, all versions) so
  // we can render the multi-resume list view above the active card. RLS
  // restricts this to rows owned by the current user. Best-effort — if
  // the request fails (offline, RLS misconfig) the list just stays empty
  // and the single-active-resume UI renders as before.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { getSupabase } = await import("./supabase");
        const client = await getSupabase();
        const { data, error } = await client
          .from("resumes")
          .select("id, domain, title, active_version_id, updated_at, is_archived, resume_versions(id, version_number, parsed_data, is_latest, file_name, created_at)")
          .eq("user_id", user.id)
          .eq("is_archived", false)
          .order("updated_at", { ascending: false });
        if (cancelled || error || !Array.isArray(data)) return;
        type VersionRow = { id: string; version_number: number; parsed_data: ResumeProfile | null; is_latest: boolean; file_name: string | null; created_at: string | null };
        type ResumeRow = { id: string; domain: string; title: string | null; active_version_id: string | null; updated_at: string; resume_versions: VersionRow[] | null };
        // Active = the resume with the most-recent updated_at. The
        // server orders the response that way already, so the first
        // row in the array is the one driving the user's experience.
        // resumes.active_version_id is per-resume "which version of
        // this row is current" — every row has one, so it can't tell
        // us which resume is "active" in the user-facing sense.
        const transformed = (data as ResumeRow[]).map((r, idx) => {
          const versions = Array.isArray(r.resume_versions) ? r.resume_versions : [];
          const latest = versions.find(v => v.is_latest) ?? versions.sort((a, b) => b.version_number - a.version_number)[0];
          // Title resolution — show the actual uploaded filename, not the
          // domain code. Order:
          //   1. latest version's file_name (the most authoritative source —
          //      always set when the user uploaded a real file)
          //   2. resumes.title if it's not just the domain code
          //   3. friendly "{Domain} resume" fallback
          // The previous version of this fell back to the parsed headline,
          // which surfaced the LLM-generated tagline ("Senior Product
          // Designer with 5+…") instead of the filename. That confused
          // users into thinking the wrong resume was attached.
          const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          const niceTitle = latest?.file_name
            || (r.title && r.title !== r.domain ? r.title : null)
            || `${titleCase(r.domain)} resume`;
          // Sort versions newest-first for the timeline rendering.
          const sortedVersions = [...versions].sort((a, b) => b.version_number - a.version_number);
          return {
            id: r.id,
            domain: r.domain || "general",
            title: niceTitle,
            latestVersion: latest?.version_number ?? 1,
            latestVersionId: latest?.id ?? null,
            latestScore: typeof latest?.parsed_data?.resumeScore === "number" ? latest.parsed_data.resumeScore : null,
            latestProfile: latest?.parsed_data ?? null,
            latestFileName: latest?.file_name ?? null,
            updatedAt: r.updated_at,
            isActive: idx === 0,
            versions: sortedVersions.map(v => ({
              id: v.id,
              versionNumber: v.version_number,
              isLatest: v.is_latest,
              fileName: v.file_name,
              score: typeof v.parsed_data?.resumeScore === "number" ? v.parsed_data.resumeScore : null,
              profile: v.parsed_data,
              createdAt: v.created_at,
            })),
          };
        });
        setAllResumes(transformed);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, fileName, catalogueRefreshKey]);

  useEffect(() => {
    if (user?.resumeText) setResumeText(user.resumeText);
    if (user?.resumeFileName) setFileName(user.resumeFileName);

    const stored = user?.resumeData;
    if (stored) {
      if (isAiResume(stored)) {
        // AI variant carries headline/topSkills directly — show as-is.
        setProfile(stored);
        setAnalysisSource("ai");
        setPhase("done");
      } else if (isFallbackResume(stored) && user?.resumeText && !analyzingRef.current) {
        // Regex-fallback stored — opportunistically try AI re-analysis in
        // the background. Keep the fallback visible while we wait.
        analyzingRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        setProfile(fallbackToProfile(stored));
        setPhase("analyzing");
        analyzeResumeWithAI(user.resumeText, user?.targetRole, abortControllerRef.current.signal)
          .then(result => {
            if (result?.profile) {
              setProfile(result.profile);
              setAnalysisSource("ai");
              setErrorMsg("");
              updateUser({ resumeData: { _type: "ai", ...result.profile } });
            } else {
              setErrorMsg("AI analysis returned no results. Try clicking re-analyze.");
            }
            setPhase("done");
          })
          .catch(err => {
            const msg = err instanceof Error ? err.message : "Unknown error";
            setErrorMsg(`AI analysis failed: ${msg}`);
            console.error("[resume] AI re-analysis error:", err);
            setPhase("done");
          })
          .finally(() => { analyzingRef.current = false; });
      } else if (isFallbackResume(stored)) {
        // Fallback without resumeText to re-analyze — render it directly.
        setProfile(fallbackToProfile(stored));
        setAnalysisSource("fallback");
        setPhase("done");
        if (!user?.resumeText) setNeedsReupload(true);
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
            updateUser({ resumeData: { _type: "ai", ...result.profile } });
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

  /**
   * Promote a resume version to active. Three jobs:
   *   1. PATCH `resumes.active_version_id` + `updated_at` server-side
   *   2. Mirror the change into in-memory state — profile view, user
   *      data, and the sessionStorage key the interview engine reads
   *      at session init. Without (2) the catalogue badge moves but
   *      the next interview still pins to whatever resume the user
   *      last *analyzed*, which silently breaks the contract.
   *   3. Bump catalogueRefreshKey so cards re-order on the wire too.
   *
   * Used by both the "Make active" button on a non-active card and
   * the "Use this version" button on the per-version timeline.
   */
  const handleMakeActive = async (
    resumeId: string,
    versionId: string | null,
    chosenProfile?: ResumeProfile | null,
    chosenFileName?: string | null,
  ) => {
    if (!versionId) return;
    setActivatingId(resumeId);
    const prev = allResumes;
    setAllResumes(prev.map(r => ({ ...r, isActive: r.id === resumeId })));
    try {
      const { apiFetch } = await import("./apiClient");
      const res = await apiFetch<{ ok?: boolean; error?: string }>(
        "/api/resume/set-active",
        { resumeId, versionId },
      );
      if (!res.ok) {
        setAllResumes(prev); // revert
        setErrorMsg(res.error || "Failed to switch active resume");
        return;
      }
      // Server PATCH succeeded. Now keep local state in sync so the
      // profile view + interview engine pick up the new active resume
      // immediately without a page refresh.
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(ACTIVE_RESUME_VERSION_KEY, versionId);
        }
      } catch { /* restricted */ }
      if (chosenProfile) {
        setProfile(chosenProfile);
        setAnalysisSource("ai");
        updateUser({
          resumeData: { _type: "ai", ...chosenProfile },
          resumeFileName: chosenFileName || undefined,
        });
        if (chosenFileName) {
          setFileName(chosenFileName);
          updatePersisted({ resumeFileName: chosenFileName });
        }
      }
      setCatalogueRefreshKey(k => k + 1);
    } catch (err) {
      setAllResumes(prev);
      setErrorMsg((err as Error).message || "Failed to switch active resume");
    } finally {
      setActivatingId(null);
    }
  };

  /**
   * Rename a resume row's title. Direct supabase-js call — RLS already
   * scopes updates to the owner. Optimistic update with revert on error.
   */
  const handleRenameResume = async (resumeId: string, newTitle: string) => {
    const trimmed = newTitle.trim().slice(0, 120);
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const prev = allResumes;
    setAllResumes(prev.map(r => r.id === resumeId ? { ...r, title: trimmed } : r));
    setRenamingId(null);
    try {
      const { getSupabase } = await import("./supabase");
      const client = await getSupabase();
      const { error } = await client.from("resumes").update({ title: trimmed }).eq("id", resumeId);
      if (error) {
        setAllResumes(prev);
        setErrorMsg(`Rename failed: ${error.message}`);
      }
    } catch (err) {
      setAllResumes(prev);
      setErrorMsg((err as Error).message || "Rename failed");
    }
  };

  /**
   * Archive (soft-delete) a non-active resume. We keep the row in DB so
   * historical sessions that reference its versions still resolve. The
   * catalogue filters `is_archived=false`, so the user just stops seeing
   * it. Refuses if the resume is currently active — user must switch to
   * another resume first.
   */
  const handleArchiveResume = async (resumeId: string, isActive: boolean) => {
    if (isActive) {
      setErrorMsg("Switch to another resume first, then archive this one.");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("Archive this resume? You can recover it from support if needed; sessions that used it stay readable.")) {
      return;
    }
    setArchivingId(resumeId);
    const prev = allResumes;
    setAllResumes(prev.filter(r => r.id !== resumeId));
    try {
      const { getSupabase } = await import("./supabase");
      const client = await getSupabase();
      const { error } = await client.from("resumes").update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", resumeId);
      if (error) {
        setAllResumes(prev);
        setErrorMsg(`Archive failed: ${error.message}`);
      }
    } catch (err) {
      setAllResumes(prev);
      setErrorMsg((err as Error).message || "Archive failed");
    } finally {
      setArchivingId(null);
    }
  };

  /**
   * Replace an improvement bullet in-place with the polished suggestion.
   * Persists the edited profile to user.resumeData so the change survives
   * navigation. The cached resume_versions row in Postgres is intentionally
   * NOT mutated — we keep the original LLM output as the source of truth
   * and treat polish as a user-applied delta on top.
   */
  const handleApplyPolish = (idx: number, rewrite: string) => {
    if (!profile) return;
    const next = { ...profile, improvements: [...(profile.improvements || [])] };
    next.improvements![idx] = rewrite;
    setProfile(next);
    updateUser({ resumeData: { _type: "ai", ...next } });
    setPolished(p => {
      const copy = { ...p };
      delete copy[idx];
      return copy;
    });
  };

  /**
   * Ask the server to rewrite a single improvement bullet. Inline result
   * appears below the bullet; user can copy the suggestion or dismiss it.
   */
  const handlePolishBullet = async (idx: number, bullet: string) => {
    setPolished(p => ({ ...p, [idx]: { state: "loading" } }));
    try {
      const { apiFetch } = await import("./apiClient");
      const res = await apiFetch<{ rewrite?: string; rationale?: string; error?: string }>(
        "/api/resume/rewrite-bullet",
        { bullet, context: { role: user?.targetRole, domain } },
      );
      if (!res.ok || !res.data?.rewrite) {
        setPolished(p => ({ ...p, [idx]: { state: "error", error: res.error || "Polish failed" } }));
      } else {
        setPolished(p => ({ ...p, [idx]: { state: "done", rewrite: res.data!.rewrite, rationale: res.data!.rationale } }));
      }
    } catch (err) {
      setPolished(p => ({ ...p, [idx]: { state: "error", error: (err as Error).message } }));
    }
  };

  // Multi-resume catalogue grid. Used to live only in the idle phase
  // which meant nobody saw it once they had a profile. Now extracted
  // and rendered in BOTH idle and done phases. Threshold relaxed from
  // ">1" to ">=1" so a single-resume user still sees their fitness
  // chips; the "Make active" button just doesn't render on the active
  // card (no-op when there's nothing to switch from anyway).
  const cataloguePanel = allResumes.length >= 1 ? (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Your resumes</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {allResumes.map(r => {
          const fits = r.latestProfile ? computeAllFitness(r.latestProfile) : null;
          const bandColor = (b: FitnessBand) =>
            b === "excellent" ? c.sage : b === "good" ? c.gilt : b === "fair" ? c.stone : c.ember;
          const typeLabel: Record<InterviewType, string> = {
            behavioral: "BEH",
            technical: "TECH",
            system_design: "SYS",
            case: "CASE",
          };
          const expanded = !!expandedTimeline[r.id];
          const isRenaming = renamingId === r.id;
          return (
            <div key={r.id} style={{ background: c.graphite, border: `1px solid ${r.isActive ? c.gilt : c.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.gilt, background: "rgba(212,179,127,0.08)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.domain}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {r.isActive ? (
                    <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }}>Active</span>
                  ) : (
                    <button
                      onClick={() => handleMakeActive(r.id, r.latestVersionId, r.latestProfile, r.latestFileName)}
                      disabled={activatingId === r.id || !r.latestVersionId}
                      style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 8px", cursor: activatingId === r.id ? "wait" : "pointer", opacity: activatingId === r.id ? 0.6 : 1 }}
                      title="Switch this resume to be the one used for interview sessions"
                    >
                      {activatingId === r.id ? "…" : "Make active"}
                    </button>
                  )}
                  {!r.isActive && (
                    <button
                      onClick={() => handleArchiveResume(r.id, r.isActive)}
                      disabled={archivingId === r.id}
                      title="Archive this resume — sessions that used it stay readable"
                      aria-label="Archive resume"
                      style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
                    >
                      {archivingId === r.id ? "…" : "✕"}
                    </button>
                  )}
                </div>
              </div>
              {isRenaming ? (
                <input
                  autoFocus
                  defaultValue={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => handleRenameResume(r.id, renameDraft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameResume(r.id, renameDraft);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.obsidian, border: `1px solid ${c.gilt}`, borderRadius: 4, padding: "4px 6px", marginBottom: 4, width: "100%" }}
                />
              ) : (
                <button
                  onClick={() => { setRenameDraft(r.title); setRenamingId(r.id); }}
                  title="Rename"
                  style={{ all: "unset", display: "block", width: "100%", marginBottom: 4, cursor: "pointer" }}
                >
                  <p style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</p>
                </button>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: fits ? 8 : 0 }}>
                <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>v{r.latestVersion}{r.latestScore != null ? ` · Score ${r.latestScore}` : ""}</p>
                {r.versions.length > 1 && (
                  <button
                    onClick={() => setExpandedTimeline(t => ({ ...t, [r.id]: !t[r.id] }))}
                    style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {expanded ? "Hide history ↑" : `Show ${r.versions.length} versions ↓`}
                  </button>
                )}
              </div>
              {fits && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(["behavioral", "technical", "system_design", "case"] as InterviewType[]).map(t => (
                    <span
                      key={t}
                      title={fits[t].rationale}
                      style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, color: bandColor(fits[t].band), background: `${bandColor(fits[t].band)}1A`, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.04em" }}
                    >
                      {typeLabel[t]} {fits[t].score}
                    </span>
                  ))}
                </div>
              )}
              {expanded && r.versions.length > 1 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
                  {r.versions.map((v, vIdx) => {
                    const isCurrent = v.id === r.latestVersionId;
                    const dateLabel = v.createdAt ? new Date(v.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
                    // Diff against the immediately newer version (vIdx-1
                    // because the array is newest-first). For the very
                    // newest row there's nothing newer to compare to.
                    const newerVersion = vIdx > 0 ? r.versions[vIdx - 1] : null;
                    const diff = newerVersion ? computeResumeDiff(v.profile, newerVersion.profile) : null;
                    return (
                      <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.stone }}>
                            v{v.versionNumber}{v.score != null ? ` · ${v.score}` : ""}{dateLabel ? ` · ${dateLabel}` : ""}
                          </span>
                          {isCurrent ? (
                            <span style={{ fontFamily: font.ui, fontSize: 9, color: c.sage }}>current</span>
                          ) : (
                            <button
                              onClick={() => handleMakeActive(r.id, v.id, v.profile, v.fileName)}
                              disabled={activatingId === r.id}
                              style={{ fontFamily: font.ui, fontSize: 9, color: c.gilt, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 3, padding: "1px 6px", cursor: activatingId === r.id ? "wait" : "pointer" }}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                        {diff && !diff.isUnchanged && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 8, borderLeft: `2px solid ${c.border}` }}>
                            {diff.scoreDelta != null && diff.scoreDelta !== 0 && (
                              <span style={{ fontFamily: font.mono, fontSize: 9, color: diff.scoreDelta > 0 ? c.sage : c.ember }}>
                                score {diff.scoreDelta > 0 ? "+" : ""}{diff.scoreDelta} → v{newerVersion!.versionNumber}
                              </span>
                            )}
                            {diff.addedSkills.length > 0 && (
                              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.sage }} title={diff.addedSkills.join(", ")}>
                                + {diff.addedSkills.slice(0, 4).join(", ")}{diff.addedSkills.length > 4 ? ` +${diff.addedSkills.length - 4}` : ""}
                              </span>
                            )}
                            {diff.removedSkills.length > 0 && (
                              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.ember }} title={diff.removedSkills.join(", ")}>
                                − {diff.removedSkills.slice(0, 4).join(", ")}{diff.removedSkills.length > 4 ? ` −${diff.removedSkills.length - 4}` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

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

    // Compute SHA-256 of the original file bytes so the server can
    // dedup at the file level (even if the extracted text identically
    // matches a prior version, the file_hash distinguishes "exact same
    // PDF re-uploaded" from "different PDF with same text". Useful for
    // future audit/integrity checks; for now it just gets persisted on
    // the resume_versions row.
    let fileHash: string | undefined;
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      fileHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch { /* file-hash is best-effort */ }

    setPhase("analyzing");
    let result: { profile: ResumeProfile; truncated?: boolean; resumeVersionId?: string | null } | null = null;
    let analyzeError: string | null = null;
    try {
      result = await Promise.race([
        analyzeResumeWithAI(text, user?.targetRole, undefined, { fileName: file.name, fileHash, domain }),
        // 40s covers the server's worst case: Groq (15s) → Gemini fallback
        // (15s) + auth/rate/quota pre-checks (~2–5s). A tighter 25s budget
        // was killing legitimate fallback paths.
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 40_000)),
      ]);
    } catch (err) {
      // Preserve the real error so the UI can surface it (auth expired, quota,
      // LLM misconfigured, etc.) instead of a generic "unavailable" message.
      analyzeError = err instanceof Error ? err.message : String(err);
      console.error("[resume] Upload-time AI analysis failed:", analyzeError);
    }
    if (result?.profile) {
      setProfile(result.profile);
      setAnalysisSource("ai");
      setTruncated(!!result.truncated);
      updateUser({ resumeData: { _type: "ai", ...result.profile } });
      saveResumeVersion(file.name, result.profile.resumeScore, text);
      // Best-effort: ship the original file bytes to Supabase Storage
      // so the resume_versions row carries a file_path. Defensive — if
      // the bucket isn't configured (503 with bucketMissing=true) we
      // log and move on. Resume analysis already succeeded; archival
      // is bonus.
      if (result.resumeVersionId) {
        uploadOriginalFile(file, result.resumeVersionId).catch(err => {
          console.warn("[resume] file storage upload failed:", err?.message || err);
        });
      }
      setPhase("done");
    } else {
      const isTimeout = analyzeError?.toLowerCase().includes("timeout");
      const isAuth = analyzeError?.toLowerCase().includes("session") || analyzeError?.toLowerCase().includes("unauthorized");
      const isQuota = analyzeError?.toLowerCase().includes("quota") || analyzeError?.toLowerCase().includes("limit");
      setErrorMsg(
        isAuth
          ? "Session expired — please refresh and sign in again, then click Re-analyze."
          : isQuota
            ? `${analyzeError} — basic profile shown below.`
            : isTimeout
              ? "AI analysis timed out — showing basic profile. Click Re-analyze to retry."
              : analyzeError
                ? `AI analysis failed: ${analyzeError}. Showing basic profile — click Re-analyze to retry.`
                : "AI analysis unavailable — showing basic profile. Click Re-analyze to retry.",
      );
      const parsed = parseResumeData(text);
      // Store the raw regex-parse result as the fallback — it carries
      // the ParsedResume fields (name/experience/education) that the
      // FallbackStoredResume discriminator branch expects. UI rendering
      // runs through fallbackToProfile() to project into ResumeProfile.
      updateUser({ resumeData: { _type: "fallback", ...parsed } });
      setProfile(fallbackToProfile({ _type: "fallback", ...parsed }));
      setAnalysisSource("fallback");
      saveResumeVersion(file.name, undefined, text);
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
    updateUser({ resumeFileName: null, resumeText: "", resumeData: null });
    // Also clear the local resume cache so handleReanalyze's fallback chain
    // doesn't bring the deleted resume back from localStorage on the next
    // Re-analyze click. Onboarding writes the same key on upload, so staying
    // consistent with that namespace is important.
    try { localStorage.removeItem("hirestepx_resume"); } catch { /* noop */ }
  };

  const handleReanalyze = async () => {
    if (reanalyzing) return;
    // Fallback chain: local state → user profile → localStorage. The local
    // state may be empty on first render before the hydration useEffect runs,
    // or when the Supabase profile.resume_text column was skipped due to a
    // missing column and text lives only in localStorage under hirestepx_resume.
    let textForAnalysis = resumeText || user?.resumeText || "";
    if (!textForAnalysis) {
      try {
        const raw = localStorage.getItem("hirestepx_resume");
        if (raw) {
          const obj = JSON.parse(raw) as { text?: string };
          if (obj?.text) textForAnalysis = obj.text;
        }
      } catch { /* ignore */ }
    }
    if (!textForAnalysis || textForAnalysis.trim().length < 30) {
      setErrorMsg("Resume text not available — please click Replace and re-upload your resume to get AI analysis.");
      return;
    }
    // Sync local state so subsequent renders have the text available too.
    if (!resumeText) setResumeText(textForAnalysis);
    setReanalyzing(true);
    setReanalyzeDone(false);
    setErrorMsg("");
    const tStart = Date.now();
    console.log("[resume] Re-analyze triggered — text length:", textForAnalysis.length, "targetRole:", user?.targetRole || "(none)");
    // AbortController lets us actually cancel the underlying fetch when the
    // race timeout wins — without it the request stays in flight and never
    // surfaces in the Network tab as "canceled", which is exactly what made
    // the previous failure invisible.
    const reanalyzeAbort = new AbortController();
    const timeoutId = setTimeout(() => reanalyzeAbort.abort(), 40_000);
    try {
      const result = await Promise.race([
        analyzeResumeWithAI(textForAnalysis, user?.targetRole, reanalyzeAbort.signal),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 40_000)),
      ]);
      clearTimeout(timeoutId);
      const elapsed = Date.now() - tStart;
      if (result?.profile) {
        console.log(`[resume] Re-analyze SUCCESS in ${elapsed}ms — score=${result.profile.resumeScore} headline="${result.profile.headline}"`);
        setProfile(result.profile);
        setAnalysisSource("ai");
        setTruncated(!!result.truncated);
        updateUser({ resumeData: { _type: "ai", ...result.profile } });
        if (fileName) saveResumeVersion(fileName, result.profile.resumeScore, textForAnalysis);
      } else {
        console.warn(`[resume] Re-analyze returned no profile in ${elapsed}ms`, result);
        setErrorMsg("AI couldn't extract structured data. Try re-uploading a cleaner PDF or DOCX.");
      }
    } catch (err) {
      clearTimeout(timeoutId);
      reanalyzeAbort.abort(); // cancel underlying fetch on any failure
      const elapsed = Date.now() - tStart;
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[resume] Re-analyze FAILED after ${elapsed}ms: ${msg}`);
      setErrorMsg(msg.includes("timeout") ? `Analysis timed out after ${Math.round(elapsed / 1000)}s. Try again.` : `Analysis failed: ${msg}`);
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
          <button
            onClick={() => { abortControllerRef.current?.abort(); setPhase("idle"); setFileName(""); setResumeText(""); setProfile(null); }}
            style={{ display: "block", margin: "20px auto 0", fontFamily: font.ui, fontSize: 13, color: c.stone, background: "none", border: "none", cursor: "pointer", padding: "6px 16px", borderRadius: 8, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = c.ivory)}
            onMouseLeave={e => (e.currentTarget.style.color = c.stone)}
          >
            Cancel
          </button>
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
        {cataloguePanel}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <label htmlFor="resume-domain" style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textTransform: "uppercase", letterSpacing: "0.08em" }}>Domain</label>
          <select
            id="resume-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            style={{ fontFamily: font.ui, fontSize: 13, color: c.ivory, background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
          >
            <option value="general">General</option>
            <option value="sde">Software Engineering</option>
            <option value="pm">Product Management</option>
            <option value="design">Design</option>
            <option value="sales">Sales</option>
            <option value="marketing">Marketing</option>
            <option value="ops">Operations</option>
            <option value="hr">HR / People</option>
            <option value="data">Data / Analytics</option>
            <option value="custom">Custom</option>
          </select>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Tag this resume so we can group versions and tailor coaching.</span>
        </div>
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
      {cataloguePanel}
      <div style={{ background: `linear-gradient(135deg, ${c.graphite} 0%, rgba(212,179,127,0.04) 100%)`, borderRadius: 16, border: `1px solid ${c.border}`, padding: "28px 28px 24px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            {(() => {
              // AI returns sentence-style headlines like "Senior Product Designer
              // with 5+ years of experience designing scalable digital products".
              // For the title slot we want just the role part — the rest of the
              // sentence is already represented by the badge row (seniority,
              // years, industries) and the summary paragraph below.
              const fullHeadline = profile?.headline || "";
              const roleOnly = fullHeadline
                .split(/\s+(?:with|,|—|–|\||·)\s+/i)[0]
                .replace(/^(?:a|an|the)\s+/i, "")
                .trim();
              const display = roleOnly || fullHeadline || "Resume uploaded";
              return (
                <h2 style={{ fontFamily: font.display, fontSize: 24, color: c.ivory, marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.3 }}>
                  {display}
                </h2>
              );
            })()}
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
        {errorMsg && (
          <div role="alert" style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 8,
            background: "rgba(196,112,90,0.06)", border: "1px solid rgba(196,112,90,0.2)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.ember} strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, flex: 1, lineHeight: 1.5 }}>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg("")}
              aria-label="Dismiss error"
              style={{ background: "none", border: "none", color: c.stone, cursor: "pointer", padding: 4, display: "flex" }}
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
        {analysisSource === "fallback" && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(212,179,127,0.04)", border: "1px solid rgba(212,179,127,0.1)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, flex: 1 }}>
              {resumeText
                ? "Showing basic extraction. Run AI analysis for a full profile with score and insights."
                : "Resume text not available. Re-upload your resume to get a full AI profile with score and insights."}
            </span>
            {resumeText ? (
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                style={{
                  fontFamily: font.ui, fontSize: 11, fontWeight: 600,
                  color: reanalyzing ? "rgba(17,17,19,0.5)" : c.obsidian,
                  background: reanalyzing ? "rgba(212,179,127,0.25)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  border: "none", borderRadius: 6, padding: "5px 14px",
                  cursor: reanalyzing ? "default" : "pointer", whiteSpace: "nowrap",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  transition: "filter 0.15s",
                }}
              >
                {reanalyzing ? (
                  <>
                    <div style={{ width: 10, height: 10, border: "1.5px solid rgba(17,17,19,0.3)", borderTopColor: c.obsidian, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Analyzing…
                  </>
                ) : "Re-analyze with AI"}
              </button>
            ) : (
              <button onClick={triggerUpload} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, background: "none", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                Re-upload
              </button>
            )}
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
                  {i !== 0 && v.resumeText && (
                    <button
                      onClick={() => {
                        setFileName(v.fileName);
                        setResumeText(v.resumeText!);
                        setProfile(null);
                        setPhase("analyzing");
                        updateUser({ resumeFileName: v.fileName, resumeText: v.resumeText! });
                        updatePersisted({ resumeFileName: v.fileName });
                        abortControllerRef.current?.abort();
                        abortControllerRef.current = new AbortController();
                        analyzeResumeWithAI(v.resumeText!, user?.targetRole, abortControllerRef.current.signal)
                          .then(result => {
                            if (result?.profile) {
                              setProfile(result.profile);
                              setAnalysisSource("ai");
                              updateUser({ resumeData: { _type: "ai", ...result.profile } });
                              saveResumeVersion(v.fileName, result.profile.resumeScore, v.resumeText!);
                            }
                            setPhase("done");
                          })
                          .catch(() => setPhase("done"));
                      }}
                      style={{ fontFamily: font.ui, fontSize: 10, color: c.gilt, background: "none", border: `1px solid rgba(212,179,127,0.2)`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,179,127,0.08)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                    >
                      Restore
                    </button>
                  )}
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
              {profile.improvements.map((tip, i) => {
                // Defensive coerce: server normalizer should send strings,
                // but if a stale cache or third-party LLM returns
                // {change, why} objects we don't want React error #31 to
                // crash the page. Stringify keys → "key1 — key2" join.
                const text = typeof tip === "string"
                  ? tip
                  : tip && typeof tip === "object"
                    ? Object.values(tip as Record<string, unknown>).filter(v => typeof v === "string").join(" — ")
                    : String(tip ?? "");
                const polishState = polished[i];
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.gilt, background: "rgba(212,179,127,0.08)", borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                      <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5, flex: 1 }}>{text}</span>
                      <button
                        onClick={() => handlePolishBullet(i, text)}
                        disabled={polishState?.state === "loading"}
                        title="Rewrite this bullet with stronger verbs and metrics"
                        style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 8px", cursor: polishState?.state === "loading" ? "wait" : "pointer", flexShrink: 0, opacity: polishState?.state === "loading" ? 0.6 : 1 }}
                      >
                        {polishState?.state === "loading" ? "…" : polishState?.state === "done" ? "✓" : "Polish"}
                      </button>
                    </div>
                    {polishState?.state === "done" && polishState.rewrite && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 6, background: "rgba(140,182,144,0.05)", border: `1px solid rgba(140,182,144,0.2)` }}>
                        <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested rewrite</span>
                        <span style={{ fontFamily: font.ui, fontSize: 12.5, color: c.chalk, lineHeight: 1.5 }}>{polishState.rewrite}</span>
                        {polishState.rationale && (
                          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, fontStyle: "italic" }}>{polishState.rationale}</span>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <button
                            onClick={() => handleApplyPolish(i, polishState.rewrite!)}
                            style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.obsidian, background: c.sage, border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
                          >
                            Use this
                          </button>
                          <button
                            onClick={() => navigator.clipboard?.writeText(polishState.rewrite!)}
                            style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => setPolished(p => { const copy = { ...p }; delete copy[i]; return copy; })}
                            style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, background: "transparent", border: "none", cursor: "pointer", padding: "3px 6px" }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                    {polishState?.state === "error" && (
                      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ember }}>{polishState.error}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Skill ↔ role reconciliation. Shows the four interview types in
        * a tabbed grid (collapsed default), each surfacing what the
        * resume covers vs. what's missing. Powered by the same vocab
        * the fitness chips use, so the two views always agree. */}
      {profile && (
        <div style={{ background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`, padding: "20px 22px", marginBottom: 14 }}>
          <h3 style={{ fontFamily: font.display, fontSize: 16, color: c.ivory, marginBottom: 4, letterSpacing: "-0.01em" }}>Coverage by interview type</h3>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 14 }}>
            Which keywords each interview type expects, and which your resume covers right now.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {(["behavioral", "technical", "system_design", "case"] as InterviewType[]).map(t => {
              const rec = reconcileResumeAgainstRole(profile, t);
              const typeLabel: Record<InterviewType, string> = {
                behavioral: "Behavioral",
                technical: "Technical",
                system_design: "System Design",
                case: "Case",
              };
              return (
                <div key={t} style={{ background: c.obsidian, borderRadius: 10, border: `1px solid ${c.border}`, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{typeLabel[t]}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: rec.coveragePct >= 60 ? c.sage : rec.coveragePct >= 30 ? c.gilt : c.stone }}>{rec.coveragePct}% coverage</span>
                  </div>
                  {rec.matched.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.sage, textTransform: "uppercase", letterSpacing: "0.06em" }}>Covered</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                        {rec.matched.slice(0, 6).map(m => (
                          <span key={m} style={{ fontFamily: font.mono, fontSize: 9, color: c.sage, background: "rgba(140,182,144,0.08)", padding: "1px 6px", borderRadius: 3 }}>{m}</span>
                        ))}
                        {rec.matched.length > 6 && (
                          <span style={{ fontFamily: font.mono, fontSize: 9, color: c.stone }}>+{rec.matched.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {rec.topGaps.length > 0 && (
                    <div>
                      <span style={{ fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.ember, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add to strengthen</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                        {rec.topGaps.map(g => (
                          <span key={g} style={{ fontFamily: font.mono, fontSize: 9, color: c.ember, background: "rgba(196,112,90,0.08)", padding: "1px 6px", borderRadius: 3 }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 8, background: "rgba(212,179,127,0.03)", border: `1px solid ${c.border}` }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Your resume is analyzed securely and never shared. Delete anytime.</span>
      </div>
    </div>
  );
}

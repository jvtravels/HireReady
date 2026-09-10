/* HireStepX — /questions/* page components
 *
 * QuestionSetPage  — individual question-set page (/questions/[slug])
 * QuestionsIndexPage — directory listing (/questions)
 *
 * These are SERVER components (no "use client") — they render to static
 * HTML at build time via force-static + generateStaticParams. That means
 * no client-side JS, fast LCP, and max crawlability.
 *
 * Visual language: cream background, coal ink, copper accents, Instrument
 * Serif for display + Satoshi for UI — same token stack as the rest of the
 * marketing site. No raw hex values; all colours from src/auth/_tokens.ts.
 */

import type { CSSProperties } from "react";
import Link from "next/link";
import { tokens as t, fonts } from "../auth/_tokens";
import {
  editorialCSS,
  SectionHead,
  SpecTimeline,
  DarkBand,
  ctaPrimaryStyle,
  edEyebrow,
  ED_PADDING,
} from "./_editorial";
import { COMPANY_LABEL } from "../../data/company-labels";
import { getKnownFacts } from "../../data/company-known-facts";
import type { BankEntry } from "../../data/interview-question-bank";
import { SEO_PAGES } from "../../data/seo-pages";
import type { SeoPage } from "../../data/seo-pages";

/* ─── Shared layout primitives ─────────────────────────────────────────── */

const pageShell: CSSProperties = {
  background: t.cream,
  color: t.coal,
  minHeight: "100dvh",
  fontFamily: fonts.sans,
};

/* ─── Difficulty chip ───────────────────────────────────────────────────── */

const DIFFICULTY_STYLES: Record<string, CSSProperties> = {
  warmup: {
    background: t.success100,
    color: t.success,
    border: "1px solid rgba(21,128,61,0.15)",
  },
  standard: {
    /* t.warning (#A16207) on t.warning100 falls just short of the 4.5:1
       AA floor at this weight/size (~4.4:1) — darkened locally rather
       than touching the shared token, which is used at larger sizes
       elsewhere where it already passes. */
    background: t.warning100,
    color: "#8F5A00",
    border: `1px solid ${t.warningLine}`,
  },
  intense: {
    background: t.error100,
    color: t.error,
    border: "1px solid rgba(185,28,28,0.15)",
  },
};

const DIFFICULTY_LABEL: Record<string, string> = {
  warmup: "Easy",
  standard: "Medium",
  intense: "Hard",
};

function DifficultyChip({ difficulty }: { difficulty?: string }) {
  if (!difficulty) return null;
  const style = DIFFICULTY_STYLES[difficulty] ?? {};
  return (
    <span
      style={{
        ...style,
        fontFamily: fonts.sans,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {DIFFICULTY_LABEL[difficulty] ?? difficulty}
    </span>
  );
}

/* ─── Single question card ──────────────────────────────────────────────── */

interface QuestionCardProps {
  question: BankEntry;
  index: number;
  practiceHref: string;
  showSignupGate: boolean;
}

function QuestionCard({ question, index, practiceHref }: Omit<QuestionCardProps, "showSignupGate">) {
  return (
    <li
      className="ed-row"
      style={{
        position: "relative",
        display: "flex",
        gap: 20,
        padding: "20px 8px",
        margin: "0 -8px",
        borderBottom: `1px solid ${t.line}`,
        overflow: "hidden",
      }}
    >
      {/* Large serif number */}
      <span style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: 400, color: t.copper, lineHeight: 1, flexShrink: 0, minWidth: 38, opacity: 0.55 }}>
        {String(index + 1).padStart(2, "0")}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Difficulty chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <DifficultyChip difficulty={question.difficulty} />
        </div>

        {/* Question text */}
        <p style={{ fontFamily: fonts.sans, fontSize: 16, fontWeight: 500, lineHeight: 1.55, color: t.coal, margin: 0 }}>
          {question.text}
        </p>
      </div>

      {/* Inline practice link */}
      <Link
        href={practiceHref}
        style={{ flexShrink: 0, color: t.copper, textDecoration: "none", fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", padding: "8px 0 8px 12px" }}
      >
        Practice free →
      </Link>
    </li>
  );
}

/* Single paywall gate that overlays the bottom portion of the question list */
function QuestionGate({ practiceHref, hiddenCount }: { practiceHref: string; hiddenCount: number }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "min(520px, 80%)",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {/* Gradient fade from transparent → cream */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(to bottom, transparent 0%, ${t.cream} 42%)`,
      }} />
      {/* CTA panel — sits in the lower half */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 32,
        gap: 14,
        pointerEvents: "auto",
      }}>
        <p style={{ fontFamily: fonts.sans, fontSize: 14, color: t.inkSoft, margin: 0, textAlign: "center" }}>
          {hiddenCount} more question{hiddenCount !== 1 ? "s" : ""}. Sign up to unlock all
        </p>
        <Link
          href={practiceHref}
          className="ed-cta"
          style={{ ...ctaPrimaryStyle("lg"), textDecoration: "none" }}
        >
          Sign up free: unlock all questions <span className="ed-cta-arrow" aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}


/* CompanyContextBox — renders verified company facts (description /
   products / competitors / scale / tech stack) from COMPANY_KNOWN_FACTS.
   `techHints` is factual (public tech-stack signal) so it's safe to show
   candidates directly; `notes`/`themes` are internal LLM-grounding
   directives (can read as internal commentary about the company, e.g.
   "don't reference the exec team: turbulent recently") and stay
   deliberately un-surfaced. Renders nothing when the company has no
   known-facts entry. */
export function CompanyContextBox({ company, companyLabel }: { company: string; companyLabel: string }) {
  /* Fuzzy lookup (not a direct COMPANY_KNOWN_FACTS[company] index) so
     SEO-page company keys that don't exactly match the facts-file key
     still resolve — e.g. page company "samsung" finds the "samsung-india"
     entry. Same helper the LLM grounding pipeline uses. */
  const facts = getKnownFacts(company);
  if (!facts) return null;

  const rows: Array<{ label: string; value: string }> = [];
  if (facts.products?.length) rows.push({ label: "Products", value: facts.products.join(" · ") });
  if (facts.competitors?.length) rows.push({ label: "Competitors", value: facts.competitors.join(" · ") });
  if (facts.scale) rows.push({ label: "Scale", value: facts.scale });
  if (facts.techHints) rows.push({ label: "Tech stack", value: facts.techHints });

  return (
    <section style={{ marginTop: 0, background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 12, padding: "20px 22px" }}>
      <p style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.copper, margin: "0 0 10px" }}>
        About {companyLabel}
      </p>
      <p style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.65, color: t.inkSoft, margin: 0 }}>
        {facts.description}
      </p>
      {rows.length > 0 && (
        <dl style={{ margin: "16px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(({ label, value }) => (
            <div key={label} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <dt style={{ flexShrink: 0, minWidth: 96, fontFamily: fonts.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: t.inkFaint }}>
                {label}
              </dt>
              <dd style={{ flex: 1, minWidth: 200, margin: 0, fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 1.55, color: t.coal }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* ─── QuestionSetPage — the main export for /questions/[slug] ─────────── */

export interface QuestionSetPageProps {
  slug: string;
  page: SeoPage;
  questions: BankEntry[];
  /* false when the question-bank has too few company-specific entries for
     this focus and the list falls back to other companies' questions —
     copy must not claim company attribution it can't back in that case. */
  questionsAreCompanySpecific: boolean;
  companyLabel: string;
  focusLabel: string;
  relatedPages: { slug: string; searchPhrase: string }[];
  relatedBlogPosts?: { slug: string; title: string }[];
  salaryPageSlug?: string;
  /* Real, sourced salary band for this page's role at this company (never
     invented) — pulled from /salary/[company]'s existing data. */
  salaryTeaser?: { roleLabel: string; level: string; levelLabel: string; totalMin: number; totalMax: number } | null;
  /* Visible FAQ content — must mirror the FAQPage JSON-LD schema built in
     the route file so structured data matches what's actually shown. */
  faqs?: { q: string; a: string }[];
}

export function QuestionSetPage({
  slug: _slug,
  page,
  questions,
  questionsAreCompanySpecific,
  companyLabel,
  focusLabel,
  relatedPages,
  relatedBlogPosts = [],
  salaryPageSlug,
  salaryTeaser,
  faqs = [],
}: QuestionSetPageProps) {
  const interviewNext = `/interview${page.roleFamily ? `?role=${encodeURIComponent(page.roleFamily)}` : ""}`;
  const practiceHref = `/signup?source=questions-seo&company=${encodeURIComponent(page.company)}&focus=${encodeURIComponent(page.focus)}${page.roleFamily ? `&role=${encodeURIComponent(page.roleFamily)}` : ""}&next=${encodeURIComponent(interviewNext)}`;

  /* Show first 10 free; gate the rest behind a signup prompt. A 5-question
     free sample bounced most visitors before they'd read enough to see the
     page is worth the signup — 10 gives a real sense of the question bank. */
  const FREE_QUESTION_COUNT = 10;
  const showSignupGate = questions.length > FREE_QUESTION_COUNT;

  /* Difficulty breakdown for the stats sidebar */
  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) {
    if (q.difficulty === "warmup") diffCounts.easy++;
    else if (q.difficulty === "intense") diffCounts.hard++;
    else diffCounts.medium++;
  }
  const roundCount = page.interviewRounds?.length ?? page.recruitmentSteps?.length ?? null;

  /* First sentence of intro — shown in hero, full intro in body */
  const introFirst = (() => {
    const dot = page.intro.indexOf(". ");
    return dot > -1 ? page.intro.slice(0, dot + 1) : page.intro.slice(0, 180);
  })();
  const introRest = page.intro.length > introFirst.length ? page.intro.slice(introFirst.length).trim() : "";

  return (
    <>
      <style>{editorialCSS + `
        @media (max-width: 900px) {
          .qs-body { flex-direction: column !important; }
          .qs-sidebar { position: static !important; width: 100% !important; }
        }
      `}</style>
      <main style={pageShell}>

        {/* ── Hero — two-column split ───────────────────────────────────── */}
        <header style={{ background: t.cream, paddingTop: 80, paddingBottom: 64, borderBottom: `1px solid ${t.line}` }}>
          <div className="ed-container">

            {/* Back link */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
              <Link href="/questions" style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, textDecoration: "none" }}>
                ← All companies
              </Link>
              <span style={{ color: t.line }}>·</span>
              <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: t.coal }}>{companyLabel}</span>
              <span style={{ color: t.line }}>·</span>
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint }}>{focusLabel}</span>
            </div>

            <h1 style={{
              fontFamily: fonts.serif,
              fontSize: "clamp(32px, 4.2vw, 56px)",
              fontWeight: 400, lineHeight: 1.06,
              letterSpacing: "-0.026em",
              color: t.coal, margin: "0 0 22px",
            }}>
              {page.searchPhrase}
            </h1>
            <p style={{ fontFamily: fonts.sans, fontSize: 17, lineHeight: 1.65, color: t.inkSoft, margin: "0 0 36px", maxWidth: "58ch" }}>
              {introFirst}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <Link href={practiceHref} className="ed-cta" style={ctaPrimaryStyle("lg")}>
                Practice with AI voice feedback <span className="ed-cta-arrow" aria-hidden>→</span>
              </Link>
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint }}>
                {questions.length} questions · {focusLabel} · 2 sessions free
              </span>
            </div>
          </div>
        </header>

        {/* ── Two-column body ───────────────────────────────────────────── */}
        <div className="ed-container qs-body" style={{ display: "flex", gap: 48, paddingTop: 48, paddingBottom: 80, alignItems: "flex-start" }}>

          {/* Left: main content */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {introRest && (
              <p style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.7, color: t.inkSoft, margin: "0 0 40px", maxWidth: "68ch" }}>
                {introRest}
              </p>
            )}

            <CompanyContextBox company={page.company} companyLabel={companyLabel} />

            {/* Recruitment process */}
            {page.recruitmentSteps && page.recruitmentSteps.length > 0 && (
              <section className="ed-reveal" style={{ marginTop: 56 }}>
                <SectionHead title={`${companyLabel} recruitment process`} />
                <SpecTimeline items={page.recruitmentSteps.map((step) => ({ label: step }))} />
              </section>
            )}

            {/* Interview rounds */}
            {page.interviewRounds && page.interviewRounds.length > 0 && (
              <section className="ed-reveal" style={{ marginTop: 48 }}>
                <SectionHead title="What to expect in each round" />
                <SpecTimeline
                  items={page.interviewRounds.map((round, i) => {
                    const colonIdx = round.indexOf(":");
                    const title = colonIdx > -1 ? round.slice(0, colonIdx) : `Round ${i + 1}`;
                    const detail = colonIdx > -1 ? round.slice(colonIdx + 1).trim() : round;
                    return { label: title, body: detail };
                  })}
                />
              </section>
            )}

            {/* STAR method — behavioral / HR / campus */}
            {(page.focus === "behavioral" || page.focus === "hr" || page.focus === "campus-placement") && (
              <section className="ed-reveal" style={{ marginTop: 48 }}>
                <SectionHead title="How to structure your answers" />
                <div style={{ background: t.creamSoft, border: `1px solid ${t.copperMid}`, borderRadius: 16, padding: "24px 26px" }}>
                  <p style={{ fontFamily: fonts.sans, fontSize: 14, color: t.inkSoft, margin: "0 0 18px", lineHeight: 1.6 }}>
                    {companyLabel} interviewers score answers on structure and specificity, not just content. Use the STAR method for every behavioural question.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
                    {[
                      { letter: "S", label: "Situation", text: "Set up the context in 1–2 sentences. Give just enough background for the story to make sense." },
                      { letter: "T", label: "Task", text: "State your personal responsibility. What were YOU specifically accountable for, not the team." },
                      { letter: "A", label: "Action", text: "This is the longest part. Describe the specific steps you took. Use 'I' not 'we'." },
                      { letter: "R", label: "Result", text: "Quantify if possible: numbers, percentages, timeline improvement. Then say what you learnt." },
                    ].map(({ letter, label, text }) => (
                      <div key={letter} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontFamily: fonts.serif, fontSize: 30, fontStyle: "italic", fontWeight: 400, color: t.copper, lineHeight: 1 }}>{letter}</span>
                        <span style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 700, color: t.coal, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{label}</span>
                        <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkSoft, lineHeight: 1.55 }}>{text}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: fonts.sans, fontSize: 12, color: t.inkFaint, margin: "20px 0 0", lineHeight: 1.55, borderTop: `1px solid ${t.line}`, paddingTop: 14 }}>
                    <strong style={{ color: t.coal }}>Common mistake:</strong> Saying &quot;we did X&quot; throughout. Interviewers score your individual contribution. If you can&apos;t separate what you did from what the team did, it signals low ownership.
                  </p>
                </div>
                {(page.focus === "campus-placement" || page.focus === "hr") && (
                  <p style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, margin: "16px 0 0", lineHeight: 1.5 }}>
                    Preparing for a campus placement drive?{" "}
                    <Link href="/for-students" style={{ color: t.copper, fontWeight: 500, textDecoration: "none" }}>See the full campus placement guide →</Link>
                  </p>
                )}
              </section>
            )}

            {/* Question list */}
            <section className="ed-reveal" style={{ marginTop: 56 }}>
              <SectionHead
                title={questionsAreCompanySpecific ? `${focusLabel} questions ${companyLabel} asked` : `Common ${focusLabel.toLowerCase()} interview questions`}
                sub={
                  questionsAreCompanySpecific
                    ? "Sourced from 2+ candidate post-mortems. Hit Practice to answer any one with AI voice feedback."
                    : `We don't yet have ${companyLabel}-specific questions for this focus area — these are commonly asked across ${focusLabel.toLowerCase()} interviews. Hit Practice to answer any one with AI voice feedback.`
                }
              />
              <div style={{ position: "relative" }}>
                <ol role="list" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  {questions.map((q, i) => (
                    <QuestionCard key={i} question={q} index={i} practiceHref={practiceHref} />
                  ))}
                </ol>
                {showSignupGate && (
                  <QuestionGate practiceHref={practiceHref} hiddenCount={questions.length - FREE_QUESTION_COUNT} />
                )}
              </div>
            </section>

          </div>

          {/* Right: sticky sidebar */}
          <div className="qs-sidebar" style={{ flexShrink: 0, width: 280, position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Dark CTA card */}
            <div style={{ background: t.coal, borderRadius: 16, padding: "28px 24px" }}>
              <p style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 400, color: t.cream, lineHeight: 1.3, margin: "0 0 18px", letterSpacing: "-0.01em" }}>
                Practice answering these out loud.
              </p>
              <Link href={practiceHref} className="ed-cta" style={{ ...ctaPrimaryStyle("md"), display: "block", textAlign: "center" as const, textDecoration: "none" }}>
                Start free: 2 sessions <span className="ed-cta-arrow" aria-hidden>→</span>
              </Link>
              <p style={{ fontFamily: fonts.sans, fontSize: 12, color: t.inkFaint, margin: "10px 0 0", textAlign: "center" as const }}>
                No credit card required
              </p>
            </div>

            {/* Framework card */}
            <div style={{ background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 16, padding: "22px 22px" }}>
              <div style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: t.inkFaint, marginBottom: 10 }}>
                Answer framework
              </div>
              <div style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: 400, color: t.coal, lineHeight: 1.3, marginBottom: 12 }}>
                {page.framework.name}
              </div>
              <p style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkSoft, lineHeight: 1.6, margin: 0 }}>
                {page.framework.summary.length > 160
                  ? page.framework.summary.slice(0, page.framework.summary.lastIndexOf(" ", 160)) + "…"
                  : page.framework.summary}
              </p>
            </div>

            {/* Stats card — non-hero stats only: interview rounds + difficulty */}
            <div style={{ background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {roundCount && roundCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkSoft }}>Interview rounds</span>
                  <span style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: 400, color: t.coal, letterSpacing: "-0.02em" }}>{roundCount}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: roundCount && roundCount > 0 ? `1px solid ${t.line}` : "none", paddingTop: roundCount && roundCount > 0 ? 14 : 0 }}>
                <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkSoft }}>Difficulty</span>
                {/* Actual counts, not a single "Hard"/"Mixed" label — a
                    rounded-off summary could read as contradicting the
                    per-question chips visible in the list below it. */}
                <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: t.coal }}>
                  {diffCounts.easy}E · {diffCounts.medium}M · {diffCounts.hard}H
                </span>
              </div>
            </div>

            {/* Salary teaser — real band pulled from the linked /salary/[company] page */}
            {salaryTeaser && salaryPageSlug && (
              <Link
                href={`/salary/${salaryPageSlug}`}
                className="ed-link"
                style={{ textDecoration: "none", display: "block", background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 16, padding: "20px 22px" }}
              >
                <div style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: t.inkFaint, marginBottom: 10 }}>
                  {companyLabel} {salaryTeaser.roleLabel} pay
                </div>
                <div style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: 400, color: t.coal, letterSpacing: "-0.02em", marginBottom: 6 }}>
                  ₹{salaryTeaser.totalMin}–{salaryTeaser.totalMax} LPA
                </div>
                <p style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkSoft, margin: 0 }}>
                  {salaryTeaser.levelLabel} level, total comp. Full breakdown by level →
                </p>
              </Link>
            )}

            {/* Related links */}
            {(relatedPages.length > 0 || relatedBlogPosts.length > 0 || salaryPageSlug) && (
              <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 20 }}>
                <div style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: t.inkFaint, marginBottom: 12 }}>
                  Related prep
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {relatedPages.map((p) => (
                    <li key={p.slug}>
                      <Link href={`/questions/${p.slug}`} className="ed-link" style={{ fontFamily: fonts.sans, fontSize: 13, color: t.copper, textDecoration: "none", lineHeight: 1.4, display: "block" }}>
                        {p.searchPhrase}
                      </Link>
                    </li>
                  ))}
                  {relatedBlogPosts.map((post) => (
                    <li key={post.slug}>
                      <Link href={`/blog/${post.slug}`} className="ed-link" style={{ fontFamily: fonts.sans, fontSize: 13, color: t.copper, textDecoration: "none", lineHeight: 1.4, display: "block" }}>
                        {post.title}
                      </Link>
                    </li>
                  ))}
                  {salaryPageSlug && (
                    <li>
                      <Link href={`/salary/${salaryPageSlug}`} className="ed-link" style={{ fontFamily: fonts.sans, fontSize: 13, color: t.copper, textDecoration: "none", lineHeight: 1.4, display: "block" }}>
                        {companyLabel} Salary Guide India 2026 →
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )}

          </div>

        </div>

        {/* FAQ — mirrors the FAQPage JSON-LD schema built in the route file
            (recruitment steps, interview rounds, framework, top questions)
            so the visible page matches what the structured data promises. */}
        {faqs.length > 0 && (
          <section className="ed-container" style={{ paddingTop: 8, paddingBottom: 64 }}>
            <SectionHead
              title={`${companyLabel} ${focusLabel.toLowerCase()} interview FAQ`}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {faqs.map(({ q, a }, i) => (
                <div
                  key={q}
                  style={{ borderTop: `1px solid ${t.line}`, paddingTop: 22, paddingBottom: 22 }}
                >
                  <h3 style={{ fontFamily: fonts.sans, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: t.coal, margin: "0 0 8px" }}>
                    <span style={{ fontFamily: fonts.serif, fontStyle: "italic", color: t.copper, fontSize: 17, marginRight: 8, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {q}
                  </h3>
                  <p style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.7, color: t.inkSoft, margin: 0, maxWidth: "68ch" }}>
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Closing CTA */}
        <DarkBand eyebrow="Reading won't get you hired" title="Stop reading," accent="start answering.">
          <p style={{ fontFamily: fonts.sans, fontSize: 16, color: t.creamMuted, lineHeight: 1.65, maxWidth: "36ch", margin: 0 }}>
            {questionsAreCompanySpecific
              ? `The AI asks ${companyLabel}-style questions, listens to your voice, and scores your answer in two minutes.`
              : `The AI asks ${focusLabel.toLowerCase()} interview questions, listens to your voice, and scores your answer in two minutes.`}
            {" "}2 sessions free, no card.
          </p>
          <Link href={practiceHref} className="ed-cta" style={ctaPrimaryStyle("lg")}>
            Start free practice <span className="ed-cta-arrow" aria-hidden>→</span>
          </Link>
        </DarkBand>

      </main>
    </>
  );
}

/* ─── QuestionsIndexPage — directory listing at /questions ──────────────── */

export interface QuestionsIndexPageProps {
  pages: Array<{
    slug: string;
    searchPhrase: string;
    company: string;
    focus: string;
    intro: string;
    sitemapPriority?: number;
  }>;
  activeFilter?: string;
  page?: number;
}

const QUESTIONS_PER_PAGE = 30;

const FOCUS_DISPLAY: Record<string, string> = {
  behavioral: "Behavioural", technical: "Technical", "system-design": "System Design",
  "case-study": "Case Study", "campus-placement": "Campus Placement",
  hr: "HR Round", "salary-negotiation": "Salary Negotiation",
  leadership: "Leadership", general: "General", management: "Management",
  "government-psu": "Government / PSU", strategic: "Strategic",
};

export function QuestionsIndexPage({ pages, activeFilter, page = 1 }: QuestionsIndexPageProps) {
  /* Stable company-sorted order first, then paginate, then group — so each
     page's headings reflect only the companies actually shown on it. */
  const sorted = [...pages].sort((a, b) => a.company.localeCompare(b.company));
  const totalPages = Math.max(1, Math.ceil(sorted.length / QUESTIONS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginated = sorted.slice(
    (safePage - 1) * QUESTIONS_PER_PAGE,
    safePage * QUESTIONS_PER_PAGE,
  );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (activeFilter) params.set("focus", activeFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/questions${qs ? `?${qs}` : ""}`;
  };

  /* Group by company for a cleaner layout. */
  const grouped = paginated.reduce<Record<string, typeof pages>>((acc, p) => {
    const key = p.company;
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  const companies = Object.keys(grouped);

  return (
    <>
      <style>{editorialCSS}</style>
      <main style={pageShell}>
        {/* ── Hero — single column ──────────────────────────────────── */}
        <header style={{ paddingTop: ED_PADDING.heroTop, paddingBottom: ED_PADDING.heroBottom, borderBottom: `1px solid ${t.line}`, background: t.cream }}>
          <div className="ed-container">
            <p style={{ ...edEyebrow, margin: "0 0 24px" }}>Interview questions · India 2026</p>
            <h1 style={{ fontFamily: fonts.serif, fontSize: "clamp(38px, 4.8vw, 60px)", fontWeight: 400, lineHeight: 1.05, letterSpacing: "-0.028em", color: t.coal, margin: "0 0 24px" }}>
              Real interview questions,{" "}
              <em style={{ fontStyle: "italic", color: t.copper }}>answered out loud.</em>
            </h1>
            <p style={{ fontFamily: fonts.sans, fontSize: 16, lineHeight: 1.65, color: t.inkSoft, margin: "0 0 36px", maxWidth: "52ch" }}>
              Curated questions from 30+ companies. Practice answering with an AI interviewer that scores your answer in two minutes.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <Link href="/signup?source=questions-index" className="ed-cta" style={ctaPrimaryStyle("lg")}>
                Start free practice <span className="ed-cta-arrow" aria-hidden>→</span>
              </Link>
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint }}>
                {pages.length} question sets · 2 sessions free
              </span>
            </div>
          </div>
        </header>

        <div className="ed-container" style={{ paddingTop: 56, paddingBottom: 8 }}>
          {/* Filter chip bar — browse by question type */}
          {(() => {
            /* Count pages per focus across ALL SEO pages (not just filtered set) */
            const focusCounts = SEO_PAGES.reduce<Record<string, number>>((acc, p) => {
              acc[p.focus] = (acc[p.focus] ?? 0) + 1;
              return acc;
            }, {});
            /* Order chips by relevance to Indian freshers */
            const CHIP_ORDER = [
              "campus-placement", "hr", "behavioral", "technical",
              "system-design", "case-study", "salary-negotiation",
            ];
            return (
              <div style={{ marginBottom: 48 }}>
                <p style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.inkFaint, margin: "0 0 14px" }}>
                  Browse by type
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {/* All chip */}
                  <Link
                    href="/questions"
                    className={`ed-cta${!activeFilter ? "" : " ed-tab"}`}
                    style={{
                      fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
                      padding: "6px 14px", borderRadius: 999, textDecoration: "none",
                      border: `1px solid ${!activeFilter ? t.copper : t.line}`,
                      background: !activeFilter ? t.copper : "transparent",
                      color: !activeFilter ? "#fff" : t.inkSoft,
                      whiteSpace: "nowrap",
                    }}
                  >
                    All · {SEO_PAGES.length}
                  </Link>
                  {CHIP_ORDER.filter(f => focusCounts[f]).map(f => {
                    const isActive = activeFilter === f;
                    return (
                      <Link
                        key={f}
                        href={`/questions?focus=${f}`}
                        className={`ed-cta${isActive ? "" : " ed-tab"}`}
                        style={{
                          fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
                          padding: "6px 14px", borderRadius: 999, textDecoration: "none",
                          border: `1px solid ${isActive ? t.copper : t.line}`,
                          background: isActive ? t.copper : "transparent",
                          color: isActive ? "#fff" : t.inkSoft,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {FOCUS_DISPLAY[f] ?? f} · {focusCounts[f]}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Grouped question sets — compact rule-divider per company */}
          {companies.map((company) => (
            <section key={company} className="ed-reveal" style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, paddingTop: 16 }}>
                <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.coal, whiteSpace: "nowrap" }}>
                  {COMPANY_LABEL[company] ?? company.charAt(0).toUpperCase() + company.slice(1)}
                </span>
                <span style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 600, color: t.inkFaint, whiteSpace: "nowrap" }}>
                  · {grouped[company].length} {grouped[company].length === 1 ? "set" : "sets"}
                </span>
                <div style={{ flex: 1, height: 1, background: t.line }} />
              </div>
              <ol role="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {grouped[company].map((p, i) => (
                  <li key={p.slug}>
                    <Link
                      href={`/questions/${p.slug}`}
                      className="ed-cta ed-row"
                      style={{
                        display: "flex",
                        gap: 22,
                        padding: "18px 8px",
                        borderBottom: `1px solid ${t.line}`,
                        textDecoration: "none",
                        alignItems: "flex-start",
                        margin: "0 -8px",
                      }}
                    >
                      <span style={{ fontFamily: fonts.serif, fontSize: 22, fontStyle: "italic", color: t.copper, opacity: 0.5, lineHeight: 1, flexShrink: 0, minWidth: 34 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: fonts.sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.inkFaint }}>
                          {p.focus.replace(/-/g, " ")}
                        </span>
                        <p style={{ fontFamily: fonts.serif, fontSize: 18, lineHeight: 1.32, color: t.coal, margin: "5px 0 0", letterSpacing: "-0.01em" }}>
                          {p.searchPhrase}
                        </p>
                      </div>
                      <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: t.copper, flexShrink: 0, paddingTop: 3, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        View <span className="ed-cta-arrow" aria-hidden>→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {/* Pagination — 30 question sets per page */}
          {totalPages > 1 && (
            <nav
              aria-label="Question set pages"
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 24, marginBottom: 48 }}
            >
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, marginRight: 10, whiteSpace: "nowrap" }}>
                {sorted.length} question sets · page {safePage} of {totalPages}
              </span>

              <Link
                href={pageHref(safePage - 1)}
                aria-disabled={safePage === 1}
                tabIndex={safePage === 1 ? -1 : undefined}
                style={{
                  fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                  padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                  background: safePage === 1 ? t.creamSoft : "#fff",
                  color: safePage === 1 ? t.inkFaint : t.coal,
                  textDecoration: "none",
                  pointerEvents: safePage === 1 ? "none" : "auto",
                  opacity: safePage === 1 ? 0.45 : 1,
                }}
              >
                ← Prev
              </Link>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                .reduce<(number | "…")[]>((acc, n) => {
                  const prev = acc[acc.length - 1];
                  if (typeof prev === "number" && n - prev > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "…" ? (
                    <span key={`e-${i}`} style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, padding: "8px 4px" }}>…</span>
                  ) : (
                    <Link
                      key={n}
                      href={pageHref(n)}
                      aria-current={safePage === n ? "page" : undefined}
                      style={{
                        fontFamily: fonts.sans, fontSize: 13, fontWeight: safePage === n ? 700 : 400,
                        minWidth: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 8, border: `1.5px solid ${safePage === n ? t.copper : t.line}`,
                        background: safePage === n ? t.copper : "#fff",
                        color: safePage === n ? "#fff" : t.coal,
                        textDecoration: "none",
                      }}
                    >
                      {n}
                    </Link>
                  ),
                )}

              <Link
                href={pageHref(safePage + 1)}
                aria-disabled={safePage === totalPages}
                tabIndex={safePage === totalPages ? -1 : undefined}
                style={{
                  fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                  padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                  background: safePage === totalPages ? t.creamSoft : "#fff",
                  color: safePage === totalPages ? t.inkFaint : t.coal,
                  textDecoration: "none",
                  pointerEvents: safePage === totalPages ? "none" : "auto",
                  opacity: safePage === totalPages ? 0.45 : 1,
                }}
              >
                Next →
              </Link>
            </nav>
          )}
        </div>

        {/* Visible FAQ — mirrors the FAQPage JSON-LD schema so Google
            sees substantive Q&A content on the page, not just 232 links. */}
        <style>{`.ed-faq-row { display: grid; grid-template-columns: 1fr 1.6fr; gap: 20px 48px; } @media (max-width: 720px) { .ed-faq-row { grid-template-columns: 1fr !important; } }`}</style>
        <section aria-label="Frequently asked questions" style={{ background: t.creamSoft, borderTop: `1px solid ${t.line}`, paddingTop: 72, paddingBottom: 80 }}>
          <div className="ed-container">
            <p style={{ ...edEyebrow, margin: "0 0 20px" }}>Common questions</p>
            <h2 style={{ fontFamily: fonts.serif, fontSize: "clamp(28px, 3.2vw, 40px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.02em", color: t.coal, margin: "0 0 56px" }}>
              How to prepare for your next{" "}
              <em style={{ fontStyle: "italic", color: t.copper }}>Indian tech interview.</em>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                {
                  q: "How do I prepare for a campus placement interview in India?",
                  a: "Three layers: (1) Online test: aptitude speed, basic coding (arrays, linked lists, sorting), and verbal reasoning. (2) Technical interview: CS fundamentals (OOP, OS, DBMS, networking), one or two DSA problems, and a project you can defend. (3) HR round: clear answers on relocation and shifts, a specific answer to 'why this company', and a 60-second 'why should we hire you' with one measurable proof point. Practice speaking your answers aloud, not just writing them.",
                },
                {
                  q: "Which companies hire the most freshers in India in 2026?",
                  a: "The largest fresher hirers are TCS (NQT/Ninja/Digital), Infosys (SE/SP/PP tracks), Wipro (Elite/Turbo), Cognizant (GenC/GenC Pro), Accenture (ASE), HCL (GET), Capgemini (Analyst), and LTIMindtree. Collectively they hire tens of thousands annually. For higher packages (6.5 to 25 LPA), the next tier includes Zoho, Freshworks, Razorpay, PhonePe, Flipkart, Amazon SDE-1, and FAANG for IIT/NIT candidates.",
                },
                {
                  q: "How do I answer 'tell me about yourself' in a fresher interview?",
                  a: "Run in reverse-chronological order with a forward close: (1) Who you are now, major, graduation year, primary skill. (2) Your strongest proof point: one project, internship, or competition result with a measurable outcome. (3) Connection to the role: one sentence on why this company specifically. (4) Forward close: what you want to contribute or learn in year one. Target 60 to 90 seconds spoken. Never open with 'I was born in...'; begin with who you are today.",
                },
                {
                  q: "What DSA topics should freshers prepare for Indian campus placements?",
                  a: "For TCS, Infosys, Wipro, Cognizant, and Accenture: arrays, linked lists, stacks, queues, basic trees (BST, traversals), and simple sorting. Basic DP (fibonacci, coin change) is tested at Wipro Turbo and Infosys SP/PP. For product companies (Razorpay, Flipkart, PhonePe): graphs (BFS/DFS, shortest path), advanced DP, and binary search on answer. For FAANG: medium-hard LeetCode level, graph traversal, DP with memoisation, sliding window, and two-pointer patterns.",
                },
                {
                  q: "How is AI voice interview practice different from practicing with friends?",
                  a: "Three differences: (1) Speaking versus thinking: knowing an answer and saying it under pressure are different skills. AI voice interviews force you to articulate aloud, which is what live interviews test. (2) Consistent scoring: a friend can't reliably grade your STAR framework across 30 sessions. AI can. (3) Always available: the 72 hours before an interview is when practice matters most, and a partner isn't always free. HireStepX offers 2 free AI practice sessions with no credit card required.",
                },
                {
                  q: "What is the STAR method and how do I use it in behavioral interviews?",
                  a: "STAR stands for Situation, Task, Action, Result. Situation: set the scene in one sentence (team, project, timeline). Task: state your specific responsibility. Action: describe the 2 to 3 concrete steps you personally took; this is the most important part and where most answers collapse. Result: give a measurable outcome (time saved, bugs fixed, score improved, money earned). Interviewers score answers on whether the Action paragraph is specific and personal, not generic. Practice each STAR story until you can tell it in under 2 minutes.",
                },
              ].map(({ q, a }, i) => (
                <div
                  key={q}
                  style={{
                    borderTop: `1px solid ${t.line}`,
                    paddingTop: 28,
                    paddingBottom: 28,
                  }}
                  className="ed-faq-row"
                >
                  <h3 style={{ fontFamily: fonts.sans, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: t.coal, margin: 0 }}>
                    <span style={{ fontFamily: fonts.serif, fontStyle: "italic", color: t.copper, fontSize: 18, marginRight: 10, opacity: 0.6 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {q}
                  </h3>
                  <p style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.7, color: t.inkSoft, margin: 0 }}>
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA — full-bleed coal band */}
        <DarkBand eyebrow="Stop just reading" title="Start" accent="answering.">
          <p style={{ fontFamily: fonts.sans, fontSize: 16, color: t.creamMuted, lineHeight: 1.65, maxWidth: "36ch", margin: 0 }}>
            AI voice interviewer, real-time answer scoring, STAR framework coaching. 2 free sessions, no credit card required.
          </p>
          <Link href="/signup?source=questions-index-bottom" className="ed-cta" style={ctaPrimaryStyle("lg")}>
            Start free practice <span className="ed-cta-arrow" aria-hidden>→</span>
          </Link>
        </DarkBand>
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import {
  getSalaryPage,
  getAllSalarySlugs,
  salaryCompanyLabel,
} from "../../../../data/salary-seo";
import { COMPANY_META } from "../../../../data/company-salary-overrides";
import { COMPANY_KNOWN_FACTS } from "../../../../data/company-known-facts";
import { CALIBRATION_DATE } from "../../../../data/salaries";
import { SalaryCompanyPage } from "@/marketing-v2/SalaryPage";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { BLOG_META } from "@/blog-meta";
import { tokens as t, fonts } from "@/auth/_tokens";
import { SALARY_GROUPS, SLUG_TO_GROUP } from "../../../../data/salary-groups";
import { buildSalaryPageModel, buildRoleSections } from "./_jsonld";

/* /salary/[company] — company-specific salary guide pages.
 *
 * All salary figures are read from COMPANY_SALARY_OVERRIDES which
 * cites its source (predominantly AmbitionBox, with Glassdoor as a
 * secondary cross-check) per entry. No figures are invented here.
 */

/* ─── Salary page groupings for cross-linking ────────────────────────────── */

function relatedSalaryPages(currentSlug: string): Array<{ slug: string; label: string }> {
  const group = SLUG_TO_GROUP[currentSlug];
  if (!group) return [];
  return SALARY_GROUPS[group]
    .filter((s) => s !== currentSlug)
    .slice(0, 5)
    .map((s) => ({ slug: s, label: salaryCompanyLabel(s) }));
}

/* Content is a static data file (data/salary-seo.ts) — it only changes on
   redeploy, which invalidates the ISR cache anyway. A long interval here
   costs nothing in freshness but avoids racking up ISR writes across ~220
   pages every day (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */

export async function generateStaticParams() {
  return getAllSalarySlugs().map((company) => ({ company }));
}

/* Google truncates SERP titles/descriptions around ~60 and ~155 chars
   respectively. The broad-roster title/description below are assembled
   from variable-length parts (company label, role names, CTC ranges) that
   can run well past both limits — this trims to the last full word that
   still fits instead of cutting mid-word or blowing past the limit. */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:/&-]+$/, "");
}

// Most metaDescription entries in data/salary-seo.ts are 2-3 sentences
// (salary bands, then an equity/context aside, then a company blurb) and
// a large share run past the ~155-char SERP budget once the role roster
// grew. truncateAtWord alone lands wherever the Nth word happens to fall,
// which is usually mid-sentence — "Cash-only comp (no RSU at India." reads
// as broken in a search snippet. Prefer ending after the last complete
// sentence that fits: same factual content, always a real full stop, and
// it naturally drops the least-essential trailing color commentary first
// since the salary figures always lead. Falls back to the word-boundary
// cut only when even the first sentence overruns the budget.
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen + 1);
  const lastSentenceEnd = cut.lastIndexOf(". ");
  if (lastSentenceEnd > maxLen * 0.4) {
    return cut.slice(0, lastSentenceEnd + 1);
  }
  return `${truncateAtWord(text, maxLen - 1)}.`;
}

// Some role labels are an either/or pair ("Software Engineer / Analyst",
// "Hardware / Embedded Engineer") — fine as a full label on the page, but
// in a title built up to the 60-char SERP budget the slash can land right
// at the cut point and leave a dangling "... Engineer /". Collapse to
// whichever half reads as a complete role on its own before the title is
// assembled, instead of truncating after the fact.
function roleForTitle(label: string): string {
  if (!label.includes(" / ")) return label;
  const [a, b] = label.split(" / ");
  return a.length >= b.length ? a : b;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ company: string }>;
}): Promise<Metadata> {
  const { company } = await params;
  const page = getSalaryPage(company);
  if (!page) return { title: "Not Found" };

  const label = salaryCompanyLabel(company);
  const roleSections = buildRoleSections(company, page.roles);
  const hasData = roleSections.length > 0;

  // A page with only 1-2 roles and no verified interview notes is little
  // more than the shared template around a couple of salary bands —
  // genuinely thin relative to the 10+ role pages elsewhere in this set.
  // Keep it live (still useful if someone lands directly) but don't ask
  // search/ad crawlers to index it as a standalone page.
  const overrideKey = company.replace(/-/g, " ");
  const knownFacts = COMPANY_KNOWN_FACTS[company] ?? COMPANY_KNOWN_FACTS[overrideKey];
  const isThin = roleSections.length <= 2 && !knownFacts?.notes;

  // Pages with a handful of roles keep their hand-tuned, single-keyword
  // searchPhrase (e.g. "Razorpay Software Engineer Salary India 2026") —
  // that title is deliberately optimized for the highest-search-volume
  // query. Once the CSV-derived role expansion pushed a page well past
  // that scope, an unchanged title/description misrepresents what's on
  // the page to anyone landing via a different role's search query, and
  // undersells the page's coverage in the SERP snippet.
  const isBroadRoster = roleSections.length > 5;
  const firstRole = roleSections[0]?.roleLabel;
  const lastRole = roleSections[roleSections.length - 1]?.roleLabel;
  // GSC shows a consistent pattern: titles that lead with a real ₹ CTC
  // number earn clicks at a given position; generic titles (company +
  // "Salary Guide", no figure) sit at similar or better positions with
  // zero clicks. The old broad-roster title never carried a number at
  // all — pull the flagship role's headline range in so it does.
  const headlineBands = roleSections[0]?.bands ?? [];
  const headlineRange =
    headlineBands.length > 0
      ? `₹${Math.min(...headlineBands.map((b) => b.totalMin))}–${Math.max(...headlineBands.map((b) => b.totalMax))} LPA`
      : undefined;
  const firstRoleTitle = firstRole ? roleForTitle(firstRole) : firstRole;
  const baseTitle = isBroadRoster
    ? headlineRange
      ? `${label} Salary India 2026: ${firstRoleTitle} ${headlineRange} (+${roleSections.length - 1} More Roles)`
      : `${label} Salary Guide India 2026 — ${roleSections.length} Roles (${firstRoleTitle} to ${lastRole})`
    : page.searchPhrase;
  // For a company/role combo with a long name and a wide range (e.g.
  // "Goldman Sachs" + "Software Engineer" + "₹20-110 LPA"), the full
  // broad-roster template can overrun the 60-char budget so far that a
  // word-boundary truncation lands mid-number ("...₹26–117" with no
  // "LPA"). Try progressively shorter, still-complete compositions before
  // falling back to truncation, so the number and its unit stay together.
  const titleCandidates = isBroadRoster
    ? [
        baseTitle,
        headlineRange ? `${label} Salary India 2026: ${firstRoleTitle} ${headlineRange}` : undefined,
        headlineRange ? `${label} Salary India 2026: ${headlineRange}` : undefined,
        `${label} Salary India 2026 (${roleSections.length} Roles)`,
      ].filter((c): c is string => Boolean(c))
    : [baseTitle];
  const fittingTitle = titleCandidates.find((c) => `${c} | HireStepX`.length <= 60);
  const titleWithSuffix = `${fittingTitle ?? baseTitle} | HireStepX`;
  const title =
    titleWithSuffix.length <= 60 ? titleWithSuffix : truncateAtWord(fittingTitle ?? baseTitle, 60);
  // Appending the role-coverage sentence can push an already-complete
  // metaDescription past the SERP budget, and truncating the combined
  // string cuts mid-sentence rather than mid-addition (e.g. "...no RSU at
  // India." instead of "...no RSU at India offices)."). Only append it
  // when it still fits; otherwise show the hand-written description
  // untouched rather than a garbled truncation of it.
  const withRoleCoverage = isBroadRoster
    ? `${page.metaDescription} Covers ${roleSections.length} roles at ${label}, from ${firstRole} to ${lastRole}.`
    : page.metaDescription;
  const baseDescription =
    withRoleCoverage.length <= 155 ? withRoleCoverage : page.metaDescription;
  const description =
    baseDescription.length <= 155 ? baseDescription : truncateAtSentence(baseDescription, 154);

  return {
    title,
    description,
    keywords: [
      `${label} salary India 2026`,
      `${label} software engineer salary`,
      `${label} fresher salary`,
      `${label} CTC India`,
      "salary India 2026",
    ],
    /* No verified salary data yet for this company — don't let a stub
       page ("data not yet available") compete for the query in search.
       Same treatment for pages that technically have data but too little
       of it to stand alone (see isThin above). */
    ...(!hasData || isThin ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: `/salary/${company}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `https://hirestepx.com/salary/${company}`,
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: "https://hirestepx.com/opengraph-image", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["https://hirestepx.com/opengraph-image"],
    },
  };
}

/* ─── Page ─────────────────────────────────────────────────────── */

export default async function SalaryCompanySlugPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;

  const model = buildSalaryPageModel(company);
  if (!model) notFound();
  const { page, label, roles, faqs, jsonLdScripts, peerComparisons, interviewTeaser } = model;

  const overrideKey = company.replace(/-/g, " ");
  const knownFacts = COMPANY_KNOWN_FACTS[company] ?? COMPANY_KNOWN_FACTS[overrideKey];
  const meta = COMPANY_META[company] ?? COMPANY_META[overrideKey];

  /* Matching blog post — links back to the interview guide for this company. */
  const blogPost = BLOG_META.find((p) => p.company.toLowerCase() === company);

  /* Related salary pages in the same company category. */
  const relatedSalary = relatedSalaryPages(company);

  /* Company description: use verified KnownFacts description, or generic fallback */
  const description =
    knownFacts?.description
      ? `${knownFacts.description} `
      : `${label} is a leading employer in India. `;

  return (
    <>
      {/* No CSP nonce here on purpose — a live per-request headers() read
          would force this ISR route fully dynamic (defeating `revalidate`
          and killing cache-control). This JSON-LD is deterministic per
          company, so its CSP allowance comes from a build-time content hash
          instead — see scripts/generate-jsonld-csp-hashes.mts and
          proxy.ts's buildCsp(). */}
      {jsonLdScripts.map((html, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={html} />
      ))}
      <NavV2 />
      <SalaryCompanyPage
        companySlug={company}
        companyLabel={label}
        companyDescription={description}
        roles={roles}
        questionPageSlug={page.questionSlug}
        blogPostSlug={blogPost?.slug}
        noticePeriodDays={meta?.noticePeriodDays}
        bondPenaltyLpa={meta?.bondPenaltyLpa}
        calibrationDate={CALIBRATION_DATE}
        faqs={faqs}
        scale={knownFacts?.scale}
        products={knownFacts?.products}
        interviewNotes={knownFacts?.notes}
        peerComparisons={peerComparisons}
        interviewTeaser={interviewTeaser}
      />
      {relatedSalary.length >= 2 && (
        <section
          aria-label={`Compare ${label} salary with similar companies`}
          style={{ borderTop: `1px solid ${t.line}`, background: t.creamSoft, padding: "40px 24px 48px" }}
        >
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <p style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: t.inkFaint, textTransform: "uppercase", marginBottom: 12 }}>
              {SLUG_TO_GROUP[company]}
            </p>
            <h2 style={{ fontFamily: fonts.sans, fontSize: 20, fontWeight: 700, color: t.coal, margin: "0 0 20px" }}>
              Compare salary with similar companies
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {relatedSalary.map((peer) => (
                <a
                  key={peer.slug}
                  href={`/salary/${peer.slug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    background: t.white,
                    border: `1px solid ${t.line}`,
                    borderRadius: 8,
                    textDecoration: "none",
                    color: t.coal,
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {peer.label} salary
                  <span style={{ color: t.copper, fontSize: 12 }}>→</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810403590527236"
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

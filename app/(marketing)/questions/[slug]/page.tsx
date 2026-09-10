import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { getSeoPageBySlug, getAllSeoSlugs } from "../../../../data/seo-pages";
import { QuestionSetPage } from "@/marketing-v2/QuestionPages";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { buildQuestionsPageModel } from "./_jsonld";

/* /questions/[slug] — static SEO pages for long-tail interview queries.
 *
 * Slug encoding mirrors the existing /companies/[slug] pattern so the two
 * routes can cross-link freely. The same slugs from data/seo-pages.ts power
 * both routes; /questions/<slug> is the canonical URL going forward (shorter,
 * more topically specific), while /companies/<slug> remains live.
 *
 * Strategy: own the "practice" intent layer that AmbitionBox / Glassdoor
 * underserve — those sites list questions; we let candidates practice
 * answering them with an AI that grades them in real time.
 */

/* Content is static data (data/seo-pages.ts) — only changes on redeploy,
   which invalidates the ISR cache anyway. Long interval avoids racking up
   ISR writes every day across ~326 pages (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */

/* GSC Coverage (Sept 2026): "Crawled - currently not indexed", 27 URLs.
 * Of the 14 /questions/[slug] URLs in that report, 11 fall back to the
 * generic focus-only question set (tier 3 in _jsonld.ts's questionsForPage)
 * — byte-identical content shared with dozens of other unrelated-company
 * pages, which is exactly the kind of duplicate content Google declines to
 * index. The other 3 flagged slugs (atlassian-behavioral, swiggy-pm,
 * razorpay-pm) already have genuine company-specific question sets and
 * aren't duplicates, so they're deliberately left indexable here — the
 * "not indexed" status for those has some other cause and noindexing them
 * would just be giving up on real content.
 * Scoped to exactly this list, not all tier-3 pages (269 of 326) — see
 * SEO GSC fix discussion. Revisit per-slug as company-specific question
 * banks are added. */
const NOINDEX_THIN_DUPLICATE_SLUGS = new Set([
  "jane-street-swe-interview-questions",
  "deutsche-bank-system-design-interview-questions",
  "lowes-india-software-engineer-interview-questions",
  "bcg-case-interview-practice",
  "cognizant-genc-interview-questions",
  "jpmorgan-interview-questions-india",
  "ibm-freshers-interview-questions",
  "de-shaw-quant-interview-questions",
  "phonepe-engineering-interview-questions",
  "morgan-stanley-system-design-interview-questions",
  "meesho-pm-interview-questions",
]);

/* ─── generateStaticParams — pre-renders every slug at build time ────────── */

export async function generateStaticParams() {
  return getAllSeoSlugs().map((slug) => ({ slug }));
}

/* ─── generateMetadata ───────────────────────────────────────────────────── */

/* Google truncates SERP titles/descriptions around ~60 and ~155 chars
   respectively. The intro's "first sentence" (naive split on ".") can run
   long when the intro itself contains abbreviations or is simply verbose,
   so this trims to the last full word that still fits instead of cutting
   mid-word or blowing past the limit. */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]$/, "");
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoPageBySlug(slug);
  if (!page) return { title: "Not Found" };

  /* Keep the title under ~60 chars (Google's display window). The brand
     suffix is only worth appending when it still fits — a truncated
     "| HireStepX" is worse than no suffix at all. */
  const withSuffix = `${page.searchPhrase} | HireStepX`;
  const title = withSuffix.length <= 60 ? withSuffix : page.searchPhrase;

  const descSuffix = " Practice with AI voice feedback. 2 free sessions, no credit card.";
  const firstSentence = page.intro.split(". ")[0];
  const body = truncateAtWord(firstSentence, 155 - descSuffix.length - 1);
  const description = `${body}.${descSuffix}`;

  return {
    title,
    description,
    keywords: page.metaKeywords.join(", "),
    alternates: { canonical: `/questions/${slug}` },
    ...(NOINDEX_THIN_DUPLICATE_SLUGS.has(slug) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "article",
      title,
      description,
      url: `https://hirestepx.com/questions/${slug}`,
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function QuestionsSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  /* No CSP nonce here on purpose — a live per-request headers() read would
     force this ISR route fully dynamic (defeating `revalidate` and killing
     cache-control, which is what starved this route of Googlebot crawl
     budget). This JSON-LD content is deterministic per slug, so its CSP
     allowance comes from a build-time content hash instead — see
     scripts/generate-jsonld-csp-hashes.mts and proxy.ts's buildCsp(). */
  const model = buildQuestionsPageModel(slug);
  if (!model) notFound();
  const { page, questions, questionsAreCompanySpecific, companyLabel, focusLabel, visibleFaqs, relatedPages, salaryPage, salaryTeaser, relatedBlogPosts, jsonLdScripts } = model;

  return (
    <>
      {jsonLdScripts.map((html, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={html} />
      ))}

      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810403590527236"
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <NavV2 />
      {/* Page body */}
      <QuestionSetPage
        slug={slug}
        page={page}
        questions={questions}
        questionsAreCompanySpecific={questionsAreCompanySpecific}
        companyLabel={companyLabel}
        focusLabel={focusLabel}
        relatedPages={relatedPages}
        relatedBlogPosts={relatedBlogPosts}
        salaryPageSlug={salaryPage?.slug}
        salaryTeaser={salaryTeaser}
        faqs={visibleFaqs}
      />
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

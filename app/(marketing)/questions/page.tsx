import type { Metadata } from "next";
import Script from "next/script";
import { SEO_PAGES } from "../../../data/seo-pages";
import { QuestionsIndexPage } from "@/marketing-v2/QuestionPages";
import { breadcrumb, ldJson } from "@/marketing-v2/_schema";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";

/* /questions — directory listing of all question sets.
 *
 * One card per (company × focus) combination from SEO_PAGES. Sorted by
 * company so crawlers and users can browse predictably. Internal links to
 * every /questions/[slug] child page — the strongest on-page crawl signal
 * for getting thin long-tail pages indexed quickly.
 */

/* Accessing searchParams makes this page dynamic — intentional. The ?focus=
   filter renders a subset of SEO_PAGES without duplicate-content risk since
   filtered URLs are not in the sitemap and carry rel=canonical pointing here. */

/* GSC (Aug 2026): this page ranked pos ~23 for 672 impressions but drew
   just 1 click — a generic title with no concrete number in a SERP full
   of aggregators (AmbitionBox, Glassdoor, GfG). The salary pages found
   that a real figure up front measurably lifts CTR at the same position
   (see the isBroadRoster comment in salary/[company]/page.tsx) — apply
   the same fix here with the actual indexed question-set count. */
const totalQuestionSets = SEO_PAGES.length;

// ?page=N and ?focus=X render real subsets of SEO_PAGES with their own
// URLs, but alternates.canonical always points back to plain /questions —
// without a matching noindex, Google is free to index those variants
// separately anyway (a self-canonical is a hint, not a directive), which
// is exactly the kind of thin/duplicate paginated URL that shows up as
// "Crawled - currently not indexed". follow keeps link equity flowing to
// the real /questions/[slug] pages.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; page?: string }>;
}): Promise<Metadata> {
  const { focus, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const isCanonicalVariant = pageNum === 1 && !focus;

  return {
    title: `${totalQuestionSets} Real Interview Question Sets: 200+ Companies 2026`,
    description:
      `${totalQuestionSets} question sets covering Google, Amazon, TCS, Razorpay, Flipkart, McKinsey & 200+ more — practice out loud with AI voice feedback and get scored. 2 sessions free.`,
    keywords: [
      "interview questions",
      "company interview questions",
      "tcs interview questions",
      "amazon interview questions",
      "google interview questions",
      "flipkart interview questions",
      "razorpay interview questions",
      "infosys campus interview",
      "ai mock interview",
    ].join(", "),
    alternates: { canonical: "/questions" },
    ...(isCanonicalVariant ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      title: `${totalQuestionSets} Real Interview Question Sets — 200+ Companies`,
      description:
        `${totalQuestionSets} question sets for 200+ companies. Practice answering them out loud with AI voice feedback.`,
      url: "https://hirestepx.com/questions",
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: "https://hirestepx.com/opengraph-image", width: 1200, height: 630, alt: "HireStepX Interview Questions" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${totalQuestionSets} Real Interview Question Sets — 200+ Companies`,
      description: `${totalQuestionSets} question sets for 200+ companies. Practice with AI voice feedback.`,
      images: ["https://hirestepx.com/opengraph-image"],
    },
  };
}

export default async function QuestionsIndexRoute({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; page?: string }>;
}) {
  const { headers } = await import("next/headers");
  const nonce = (await headers()).get("x-nonce") ?? "";
  const { focus, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  /* When a ?focus= param is present, show only matching pages. The full
     ItemList schema always lists all pages so Google indexes the complete
     set regardless of filter state. */
  const filteredPages = focus
    ? SEO_PAGES.filter((p) => p.focus === focus)
    : SEO_PAGES;

  /* FAQPage schema — targets "how to prepare for interview" head terms.
     Answers sourced from established HireStepX preparation methodology. */
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How do I prepare for a campus placement interview in India?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Campus placement preparation in India has three layers: (1) Online test: aptitude speed (TCS/Wipro/Cognizant all use timed aptitude with no negative marking), coding fundamentals (arrays, linked lists, sorting, basic DP), and verbal reasoning. (2) Technical interview: CS fundamentals (OOP, OS, DBMS, networking), 1–2 data structure coding problems, and a project walkthrough you can defend end-to-end. (3) HR round: explicit yes on relocation and shift flexibility, a specific 'why this company' answer citing a real initiative, and a 45–60 second 'why should we hire you' answer with one measurable proof point. Practice speaking your answers aloud, not just writing them.",
        },
      },
      {
        "@type": "Question",
        name: "Which companies hire the most freshers in India in 2026?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The largest fresher hirers in India for 2026 are TCS (NQT/Ninja/Digital tracks), Infosys (SE/SP/PP tracks), Wipro (Elite NTH/Turbo tracks), Cognizant (GenC/GenC Pro), Accenture (ASE), HCL (GET programme), Capgemini (Analyst), and LTIMindtree. These seven companies collectively hire tens of thousands of freshers annually. For higher packages (₹6.5–25 LPA), the next tier includes Zoho, Freshworks, Razorpay, PhonePe, Flipkart, Amazon (SDE-1), and the FAANG companies for candidates from IITs and NITs.",
        },
      },
      {
        "@type": "Question",
        name: "What is the difference between TCS NQT, Ninja, and Digital tracks?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "TCS NQT is the base aptitude test, and all candidates take it. Scoring determines which track you qualify for: NQT Ninja (₹3.36 LPA, moderate coding bar, most seats) or NQT Digital (₹7 LPA, hard coding bar, ~15% of total offers). TCS Prime (₹9 LPA+) is a separate off-campus track for exceptional coders. The technical interview and HR round are identical across tracks; the online test performance is the sole differentiator for track placement.",
        },
      },
      {
        "@type": "Question",
        name: "How do I answer 'tell me about yourself' in a fresher interview?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The correct structure runs in reverse-chronological order with a forward-looking close: (1) Who you are now: your major, graduation year, and primary technical skill. (2) Your strongest proof point: one specific project, internship, or competition result with a measurable outcome. (3) Connection to the role: one sentence on why this company or role specifically. (4) Forward close: what you want to contribute or learn in year one. Target 60–90 seconds spoken. Never start with 'I was born in...' or 'I completed my schooling at...'; begin with who you are today.",
        },
      },
      {
        "@type": "Question",
        name: "What data structures and algorithms should freshers prepare for Indian campus placements?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For TCS, Infosys, Wipro, Cognizant, and Accenture: arrays, linked lists, stacks, queues, basic trees (BST, traversals), and simple sorting algorithms. Basic dynamic programming (fibonacci, coin change) is tested at Wipro Turbo and Infosys SP/PP tracks. For product companies (Razorpay, Flipkart, PhonePe, Meesho): graphs (BFS, DFS, shortest path), advanced DP, and binary search on answer are commonly tested at medium difficulty. For FAANG (Amazon, Google, Meta, Microsoft): medium-hard LeetCode level, including graph traversal, DP with memoisation, sliding window, and two-pointer patterns as the most frequent categories.",
        },
      },
      {
        "@type": "Question",
        name: "How is AI mock interview practice different from practicing with friends or flashcards?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Three key differences: (1) Speaking vs. thinking: knowing the answer and saying it under pressure are different skills. AI voice mock interviews force you to articulate your thinking aloud, which is exactly what a live interview tests. (2) Instant feedback: a human practice partner can't consistently score your STAR framework coverage, communication clarity, or answer completeness across 30 practice sessions. AI can. (3) Available any time: the 72 hours before an interview is when practice matters most, and a practice partner isn't always available then. HireStepX offers 2 free AI practice sessions with no credit card required.",
        },
      },
    ],
  };

  /* ItemList schema — helps Google understand this is a curated collection
     and may generate a sitelinks-style display in the SERP. */
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "HireStepX Interview Question Sets",
    description:
      "Curated interview question sets for top Indian and global companies. Each set includes company-specific questions and AI-powered practice.",
    numberOfItems: SEO_PAGES.length,
    itemListElement: SEO_PAGES.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.searchPhrase,
      url: `https://hirestepx.com/questions/${p.slug}`,
    })),
  };

  return (
    <>
      {/* Structured data */}
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={ldJson(breadcrumb([{ name: "Questions", path: "/questions" }]))}
      />

      <NavV2 />
      {/* Page body */}
      <QuestionsIndexPage
        pages={filteredPages.map((p) => ({
          slug: p.slug,
          searchPhrase: p.searchPhrase,
          company: p.company,
          focus: p.focus,
          intro: p.intro,
          sitemapPriority: p.sitemapPriority,
        }))}
        activeFilter={focus}
        page={pageNum}
      />
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

import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { SEO_PAGES } from "../../../data/seo-pages";
import { COMPANY_LABEL as ALL_LABELS } from "../../../data/company-labels";
import { SALARY_SEO_PAGES, salaryCompanyLabel } from "../../../data/salary-seo";
import { CITY_PAGES } from "../../../data/city-pages";
import { breadcrumb, ldJson } from "@/marketing-v2/_schema";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { tokens as t, fonts } from "@/auth/_tokens";

/* /interview-prep — pillar page targeting broad "interview preparation
 * India" head terms. Acts as the hub for the entire company × focus
 * content tree. Every /companies/[slug] page is linked from here,
 * which is the strongest crawl-budget and topical-authority signal
 * available without off-site link building.
 *
 * Schema: Article + BreadcrumbList + FAQPage
 * Target queries: "interview preparation India 2026", "how to prepare
 *   for job interview India", "interview tips freshers India",
 *   "best mock interview platform India"
 *
 * The 15 industry groups are flattened and paginated at 30 companies per
 * page (mirrors /questions) — the guide content (hero, framework, FAQ,
 * salary/blog links) only renders on page 1 to avoid duplicating it across
 * the directory pages; ?page= is intentionally excluded from the canonical.
 */

export const revalidate = 86400;

// Same self-canonical-but-not-noindexed gap that /questions and /salary
// had: ?page=N renders a distinct, thin card-grid URL (no guide prose —
// that only renders on page 1) while alternates.canonical always points
// back to plain /interview-prep. A self-canonical is a hint, not a
// directive, so Google is free to index those paginated URLs on their own
// merits — which are weak, given the content mismatch with the declared
// title/description. Add the matching noindex so they can't get flagged
// as duplicate/thin ("Crawled - currently not indexed") on their own.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  return {
    title: "Interview Preparation Guide India 2026 | HireStepX",
    description:
      "Interview prep guide for India 2026. AI mock interviews for TCS, Infosys, Google, Amazon, Flipkart, and 200+ companies. All formats covered.",
    keywords: [
      "interview preparation India 2026",
      "how to prepare for job interview India",
      "interview tips freshers India",
      "mock interview practice India",
      "ai mock interview India",
      "campus placement preparation",
      "technical interview preparation",
      "behavioral interview preparation India",
    ].join(", "),
    alternates: { canonical: "/interview-prep" },
    ...(pageNum === 1 ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "article",
      title: "Interview Preparation Guide India 2026 | HireStepX",
      description:
        "Complete interview preparation guide for Indian job seekers. AI mock interviews for 200+ companies, 2 sessions free.",
      url: "https://hirestepx.com/interview-prep",
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: "https://hirestepx.com/opengraph-image", width: 1200, height: 630, alt: "Interview Preparation Guide India 2026 | HireStepX" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Interview Preparation Guide India 2026 | HireStepX",
      description: "Complete guide + AI mock interview practice for 200+ Indian companies.",
      images: ["https://hirestepx.com/opengraph-image"],
    },
  };
}

/* ── Company groupings ──────────────────────────────────────────────── */
const COMPANY_LABEL = ALL_LABELS;

const FOCUS_LABEL: Record<string, string> = {
  behavioral: "Behavioural", technical: "Technical", "system-design": "System Design",
  "case-study": "Case Study", "campus-placement": "Campus Placement",
  hr: "HR Round", "salary-negotiation": "Salary Negotiation",
  management: "Management", "government-psu": "Government / PSU", strategic: "Strategic",
  general: "General", leadership: "Leadership", panel: "Panel", quant: "Quant",
};

const SERVICE_COMPANIES = ["tcs", "infosys", "wipro", "cognizant", "accenture", "ltimindtree", "hcl", "capgemini", "ibm", "techmahindra", "mphasis", "persistent", "ntt-data", "globallogic", "thoughtworks"];
const PRODUCT_COMPANIES = ["flipkart", "razorpay", "swiggy", "zomato", "phonepe", "paytm", "cred", "zerodha", "meesho", "oyo", "freshworks", "zoho", "nykaa", "mamaearth", "myntra", "bigbasket", "blinkit", "makemytrip", "ixigo", "dream11", "lenskart", "boat", "naukri", "sharechat", "truecaller", "groww", "dmart", "wakefit", "zepto", "udaan"];
const FAANG_COMPANIES = ["google", "amazon", "microsoft", "meta", "apple", "netflix", "linkedin", "adobe", "uber", "stripe", "salesforce", "atlassian", "workday", "servicenow", "vmware", "nvidia", "openai", "anthropic", "perplexity", "postman", "chargebee", "clevertap", "moengage", "inmobi", "druva", "browserstack", "darwinbox"];
const CONSULTING_COMPANIES = ["mckinsey", "bcg", "bain", "deloitte", "goldman", "jpmc", "ey", "kpmg", "pwc"];
const FINTECH_COMPANIES = ["bajaj-finance", "fibe", "kreditbee", "moneyview", "rupeek", "fi-money", "niyo", "smallcase", "indmoney", "zeta", "nium", "upstox", "angel-one", "jupiter", "navi", "slice", "cashfree", "juspay", "pine-labs", "bharatpe", "acko", "policybazaar", "icici-lombard", "digit"];
const BANKING_COMPANIES = ["hdfc-bank", "icici", "hdfc", "axis", "kotak", "sbi", "barclays", "hsbc", "citi", "deutsche-bank", "bny-mellon", "standard-chartered", "wells-fargo", "morgan-stanley", "mastercard", "visa-india", "fiserv"];
const SEMICONDUCTOR_COMPANIES = ["intel-india", "qualcomm", "arm-india", "mediatek", "bosch-india", "texas-instruments", "samsung", "samsung-india", "nvidia", "ericsson-india", "nokia-india", "cisco", "oracle", "sap-labs", "siemens-india", "walmart-global-tech", "lowes-india", "target-india"];
const HEALTHCARE_COMPANIES = ["apollo-247", "practo", "medibuddy", "tata-1mg", "dr-lal-pathlabs", "metropolis", "star-health", "curefit"];
const LOGISTICS_COMPANIES = ["delhivery", "shadowfax", "shiprocket", "rapido", "blackbuck", "moglix", "ninjacart"];
const EDTECH_COMPANIES = ["scaler", "vedantu", "unacademy", "byjus", "physicswallah"];
const D2C_COMPANIES = ["godrej", "nestle", "hul", "itc", "p&g", "tata-steel", "purplle", "licious", "rebel-foods"];
const QUANT_COMPANIES = ["optiver", "millennium", "jane-street", "de-shaw", "citadel"];
const SAAS_COMPANIES = ["hasura", "gupshup", "exotel", "plivo", "intuit", "mindtickle", "sigmoid", "tracxn", "khatabook", "krutrim", "sarvam"];
const EV_COMPANIES = ["ola-electric", "ather-energy", "ola", "cars24", "spinny", "tata-motors", "mahindra", "bajaj"];
const CAMPUS_COMPANIES = ["campus"];

function pageGroup(companies: string[]) {
  return SEO_PAGES.filter((p) => companies.includes(p.company));
}

/* All 15 industry groups in display order. Flattened + paginated below so
   the hub never renders more than GROUPS_PER_PAGE company cards at once —
   the same 30-per-page cap used on /questions. */
const GROUPS = [
  { slug: "service-it", heading: "Service IT: Campus & Fresher Guides", description: "The highest-volume hiring segment in India. These companies hire 100,000+ freshers per year combined.", companies: SERVICE_COMPANIES },
  { slug: "product", heading: "Indian Product Companies", description: "Unicorns and fast-scaling startups. Higher pay, harder interviews, more ownership.", companies: PRODUCT_COMPANIES },
  { slug: "faang", heading: "FAANG & Global Tech", description: "The most competitive hiring bar. Long preparation lead time, significant pay premium.", companies: FAANG_COMPANIES },
  { slug: "consulting", heading: "Consulting & Finance", description: "Case-driven hiring with a structured evaluation rubric. Completely different format from tech.", companies: CONSULTING_COMPANIES },
  { slug: "fintech", heading: "Fintech & WealthTech", description: "India's fastest-growing hiring segment. Expect system design at scale, payments APIs, and strong product sense around India-specific financial products.", companies: FINTECH_COMPANIES },
  { slug: "banking", heading: "Banking & Financial Services", description: "Indian private banks, global investment banks, and payments networks. Tech roles need strong distributed systems; business roles need finance domain knowledge.", companies: BANKING_COMPANIES },
  { slug: "semiconductor", heading: "Semiconductor, Hardware & Global Capability Centers", description: "Embedded systems, chip design, and large enterprise tech GCCs. Often overlooked but pay competitively and offer high technical depth with job stability.", companies: SEMICONDUCTOR_COMPANIES },
  { slug: "healthcare", heading: "Healthcare & Diagnostics", description: "Health tech companies building at the intersection of clinical data and software. Strong on product sense, compliance awareness, and user empathy for patients.", companies: HEALTHCARE_COMPANIES },
  { slug: "logistics", heading: "Logistics, Supply Chain & Quick Commerce", description: "India's delivery infrastructure layer. Interviews focus on real-time systems, routing algorithms, warehouse management, and scale-under-constraint engineering.", companies: LOGISTICS_COMPANIES },
  { slug: "edtech", heading: "EdTech & Skilling Platforms", description: "Built for India's 300M+ student population. Product and engineering roles need deep understanding of low-bandwidth delivery, vernacular content, and mobile-first learning.", companies: EDTECH_COMPANIES },
  { slug: "d2c", heading: "D2C, FMCG & Consumer Brands", description: "From century-old FMCG giants to digital-native brands. Tech and analytics roles focus on supply chain, demand forecasting, and digital commerce at Indian scale.", companies: D2C_COMPANIES },
  { slug: "ev", heading: "EV, Automotive & Mobility", description: "India's EV transition is creating strong demand for embedded software, battery management, and platform engineering talent. Niche but high-growth.", companies: EV_COMPANIES },
  { slug: "saas", heading: "B2B SaaS & Developer Tools", description: "Global-from-day-one product companies built out of India. Strong engineering culture, high bar for product thinking, and often the best engineering environments in the country.", companies: SAAS_COMPANIES },
  { slug: "quant", heading: "Quant & Algorithmic Trading", description: "The highest-paying engineering and research roles in finance. Require elite mathematical ability, strong coding, and comfort with probability and statistics under time pressure.", companies: QUANT_COMPANIES },
  { slug: "campus", heading: "Campus Placement Preparation", description: "General campus placement guides covering aptitude, group discussions, and HR rounds that cut across all companies and sectors.", companies: CAMPUS_COMPANIES },
] as const;

const GROUPS_PER_PAGE = 30;

export default async function InterviewPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { headers } = await import("next/headers");
  const nonce = (await headers()).get("x-nonce") ?? "";
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How do I prepare for a job interview in India in 2026?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Start by identifying the company type (service IT, product startup, FAANG, consulting). Each has a distinct format: service companies (TCS, Infosys, Wipro) emphasise aptitude and CS fundamentals; product companies (Flipkart, Razorpay, Swiggy) need DSA + system design; FAANG needs hard DSA + system design + behavioral; consulting needs case studies. Practice out loud with AI mock interviews, not just reading answers.",
        },
      },
      {
        "@type": "Question",
        name: "How many mock interviews should I do before the real one?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "At minimum 3: one baseline session (to identify your weaknesses), one targeted practice session (acting on that feedback), and one full simulation close to the interview date. More is better; most candidates see measurable improvement within 5 practice sessions.",
        },
      },
      {
        "@type": "Question",
        name: "What is the difference between technical and behavioral interview preparation?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Technical preparation focuses on data structures, algorithms, system design, and CS fundamentals: skills you demonstrate by solving problems. Behavioral preparation builds a story bank of 8–10 STAR (Situation, Task, Action, Result) examples from your experience, which you adapt across different questions. Both require practice out loud, not just note-taking.",
        },
      },
      {
        "@type": "Question",
        name: "How long does it take to prepare for campus placements in India?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For service companies (TCS, Infosys, Wipro): 3–4 weeks of focused aptitude + coding practice. For product companies (Flipkart, CRED, Razorpay): 2–3 months of DSA + system design + behavioral preparation. Start early: most candidates underestimate how much practice is needed to answer clearly under pressure.",
        },
      },
      {
        "@type": "Question",
        name: "What is AI mock interview practice and does it actually help?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AI mock interview practice (like HireStepX) simulates real interview conditions: the AI asks questions, listens to your voice answer, and grades your response on structure, specificity, and delivery. It's available 24/7, provides consistent scoring (unlike friends who may be too kind), and tracks improvement across sessions. Studies on deliberate practice consistently show that objective feedback loops accelerate skill acquisition compared to unstructured practice.",
        },
      },
    ],
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Complete Interview Preparation Guide for India 2026",
    description: "Comprehensive guide covering how to prepare for job interviews at service companies, product startups, FAANG, and consulting firms in India, with AI mock interview practice.",
    image: "https://hirestepx.com/opengraph-image",
    author: { "@type": "Organization", name: "HireStepX", url: "https://hirestepx.com" },
    publisher: {
      "@type": "Organization", name: "HireStepX",
      logo: { "@type": "ImageObject", url: "https://hirestepx.com/wordmark.png" },
    },
    datePublished: "2026-01-01",
    dateModified: "2026-07-14",
    inLanguage: "en-IN",
    url: "https://hirestepx.com/interview-prep",
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://hirestepx.com/interview-prep" },
    keywords: "interview preparation India 2026, mock interview India, campus placement preparation, AI mock interview",
    articleSection: "Interview Preparation",
  };

  const s = { fontFamily: fonts.sans };
  const serif = { fontFamily: fonts.serif };
  const mono = { fontFamily: fonts.mono };
  const copper = t.copper;
  const coal = t.coal;
  const sand = t.inkSoft;
  const cream = t.cream;
  const card = { background: t.creamRaised, border: `1px solid ${t.line}`, borderRadius: 10 };

  /* ── Flatten + paginate the 15 industry groups ─────────────────────── */
  const groupsWithPages = GROUPS.map((g) => ({ ...g, pages: pageGroup([...g.companies]) })).filter(
    (g) => g.pages.length > 0,
  );
  const flat = groupsWithPages.flatMap((g) => g.pages.map((p) => ({ p, slug: g.slug })));
  const totalCompanyPages = Math.max(1, Math.ceil(flat.length / GROUPS_PER_PAGE));
  const safePage = Math.min(Math.max(1, pageNum), totalCompanyPages);
  const pageSlice = flat.slice((safePage - 1) * GROUPS_PER_PAGE, safePage * GROUPS_PER_PAGE);

  /* Absolute start index of each group in the flattened list — tells us
     which page a group first appears on (for the jump nav) and whether a
     group rendered on this page is a continuation from a previous one. */
  const groupAbsStart: Record<string, number> = {};
  let cursor = 0;
  for (const g of groupsWithPages) {
    groupAbsStart[g.slug] = cursor;
    cursor += g.pages.length;
  }
  const groupStartPage = (slug: string) => Math.floor(groupAbsStart[slug] / GROUPS_PER_PAGE) + 1;

  const companyPageHref = (p: number, anchor?: string) => {
    const qs = p > 1 ? `?page=${p}` : "";
    return `/interview-prep${qs}${anchor ? `#${anchor}` : ""}`;
  };

  /* Group this page's slice back into contiguous sections, preserving order. */
  const sections: { slug: string; pages: typeof SEO_PAGES }[] = [];
  for (const item of pageSlice) {
    const last = sections[sections.length - 1];
    if (last && last.slug === item.slug) last.pages.push(item.p);
    else sections.push({ slug: item.slug, pages: [item.p] });
  }
  const globalStartOfPage = (safePage - 1) * GROUPS_PER_PAGE;

  return (
    <>
      <script nonce={nonce || undefined} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script nonce={nonce || undefined} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script nonce={nonce || undefined} type="application/ld+json" dangerouslySetInnerHTML={ldJson(breadcrumb([{ name: "Interview Prep", path: "/interview-prep" }]))} />

      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810403590527236"
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <NavV2 />
      <main style={{ background: cream, color: coal, minHeight: "100dvh", padding: "48px 24px 80px", ...s }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {safePage === 1 ? (
            <>
              {/* Eyebrow */}
              <div style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: copper, marginBottom: 12 }}>
                Complete Guide · 2026
              </div>

              {/* H1 */}
              <h1 style={{ ...serif, fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.12, margin: 0, color: coal, textWrap: "balance" }}>
                Interview Preparation Guide for India 2026
              </h1>

              <p style={{ ...s, fontStyle: "italic", fontSize: 19, lineHeight: 1.55, color: sand, marginTop: 20, maxWidth: 680, textWrap: "balance" }}>
                Not all Indian interviews are the same. TCS wants aptitude. Razorpay wants system design.
                McKinsey wants case studies. This guide maps the terrain and links you directly to practice
                for each company.
              </p>

              {/* Primary CTA */}
              <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                <Link href="/signup?source=interview-prep" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: copper, color: cream, textDecoration: "none",
                  padding: "14px 24px", borderRadius: 999, fontSize: 15, fontWeight: 500,
                }}>
                  Start free mock interview → 2 sessions, no card
                </Link>
                <Link href="/questions" style={{
                  display: "inline-flex", alignItems: "center",
                  color: copper, textDecoration: "none", padding: "14px 16px", fontSize: 14, fontWeight: 500,
                }}>
                  Browse all question sets
                </Link>
              </div>

              {/* ── Four interview types ─────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                  The four types of Indian interviews
                </h2>
                <p style={{ fontSize: 14, color: sand, margin: "0 0 24px", lineHeight: 1.6 }}>
                  Preparation differs entirely by company type. Map your target before you prepare.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                  {[
                    {
                      label: "Service IT Companies", companies: "TCS · Infosys · Wipro · Cognizant · Accenture · HCL · Capgemini",
                      format: "Aptitude test → CS fundamentals → HR",
                      tip: "The aptitude round eliminates 60–80% of candidates. Score well on reasoning and coding basics first.",
                      href: "/for-students",
                    },
                    {
                      label: "Indian Product Companies", companies: "Flipkart · Razorpay · Swiggy · CRED · Meesho · Zerodha",
                      format: "DSA (medium–hard) → System Design → Behavioral",
                      tip: "Bar is high. Expect 2 DSA problems in 45 min + a system design round tied to India-scale problems.",
                      href: "/questions/flipkart-sde-interview-questions",
                    },
                    {
                      label: "FAANG & Global Tech", companies: "Google · Amazon · Microsoft · Meta · Netflix · Adobe",
                      format: "Hard DSA → System Design → Behavioral (LP or Googleyness)",
                      tip: "The highest bar. DSA needs competitive-programming speed. Behavioral rounds are as important as coding.",
                      href: "/questions/google-india-engineering-interview-questions",
                    },
                    {
                      label: "Consulting & Finance", companies: "McKinsey · BCG · Deloitte · Goldman · JPMorgan",
                      format: "Case Study → Behavioral (PEI/LP) → Partner round",
                      tip: "Hypothesis-first thinking and structured problem-solving matter more than technical depth.",
                      href: "/questions/mckinsey-case-study-interview-questions",
                    },
                  ].map((type) => (
                    <div key={type.label} style={{ ...card, padding: "20px 22px" }}>
                      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: copper, marginBottom: 6 }}>
                        {type.label}
                      </div>
                      <p style={{ fontSize: 13, color: sand, margin: "0 0 10px", lineHeight: 1.5 }}>{type.companies}</p>
                      <p style={{ fontSize: 14, fontWeight: 500, color: coal, margin: "0 0 8px", lineHeight: 1.4 }}>{type.format}</p>
                      <p style={{ fontSize: 13, color: sand, margin: "0 0 14px", lineHeight: 1.55 }}>{type.tip}</p>
                      <Link href={type.href} style={{ color: copper, textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
                        Practice this type →
                      </Link>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Preparation framework ────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                  A preparation framework that works
                </h2>
                <p style={{ fontSize: 14, color: sand, margin: "0 0 20px", lineHeight: 1.6 }}>
                  Most candidates fail at Step 1: they study what they already know instead of what they don't.
                </p>
                <ol style={{ padding: "0 0 0 0", margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { n: "01", title: "Baseline mock interview first", body: "Do one practice interview before any studying. This is uncomfortable but essential: it shows you exactly where you are, not where you think you are. Most candidates discover their real gap is delivery and structure, not content." },
                    { n: "02", title: "Know your company's format cold", body: "TCS Ninja has 3 NQT rounds. Amazon has 16 Leadership Principles. Google has a 'Googleyness' round. CRED has a take-home assignment. Each format rewards different preparation, so don't use generic content." },
                    { n: "03", title: "Build a story bank (behavioral)", body: "Prepare 8–10 STAR (Situation, Task, Action, Result) stories covering: leadership, conflict, failure, initiative, teamwork, technical problem-solving, and learning something new. These same stories answer 90% of behavioral questions across all companies." },
                    { n: "04", title: "Practice out loud, not on paper", body: "Reading answers and saying them are completely different skills. Record yourself. Count filler words. Time every answer (aim for 90 seconds to 2 minutes). The goal is naturally structured, not scripted." },
                    { n: "05", title: "Company-specific deep dive (last 1 week)", body: "In the final week, simulate the exact interview format: same time limits, same question types, same pressure. Use company-specific question sets and frameworks, not generic prep materials." },
                  ].map((step, i) => (
                    <li key={step.n} style={{
                      display: "flex", gap: 20, padding: "20px 0",
                      borderBottom: i < 4 ? `1px solid ${t.line}` : "none",
                    }}>
                      <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: t.copperBorder, flexShrink: 0, lineHeight: 1 }}>{step.n}</div>
                      <div>
                        <h3 style={{ ...serif, fontSize: 18, fontWeight: 400, margin: "0 0 6px", letterSpacing: "-0.01em" }}>{step.title}</h3>
                        <p style={{ fontSize: 14, lineHeight: 1.65, color: sand, margin: 0 }}>{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* ── Preparation timelines ────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 20px" }}>
                  How long does preparation take?
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {[
                    { company: "TCS / Infosys / Wipro", time: "3–4 weeks", note: "Aptitude + CS fundamentals + HR prep. 2 hours/day." },
                    { company: "Cognizant / Accenture / HCL", time: "3–4 weeks", note: "Same as above + communication practice for Accenture." },
                    { company: "Flipkart / Razorpay / Swiggy", time: "6–10 weeks", note: "Medium–hard DSA + system design + behavioral. 3+ hrs/day." },
                    { company: "Google / Amazon / Meta", time: "3–6 months", note: "Hard DSA, system design depth, 8–10 LP stories. Intensive." },
                    { company: "McKinsey / BCG / Deloitte", time: "6–8 weeks", note: "Case practice daily (out loud), PEI story bank, casing partner." },
                  ].map((row) => (
                    <div key={row.company} style={{ ...card, padding: "16px 18px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: coal, marginBottom: 4 }}>{row.company}</div>
                      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: copper, marginBottom: 6 }}>{row.time}</div>
                      <p style={{ fontSize: 12, color: sand, margin: 0, lineHeight: 1.55 }}>{row.note}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div style={{ paddingTop: 8 }}>
              <div style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: copper, marginBottom: 12 }}>
                Complete Guide · 2026
              </div>
              <h1 style={{ ...serif, fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.15, margin: 0, color: coal }}>
                Company Interview Directory
              </h1>
              <p style={{ fontSize: 14, color: sand, marginTop: 10 }}>
                Page {safePage} of {totalCompanyPages} ·{" "}
                <Link href="/interview-prep" style={{ color: copper, textDecoration: "none", fontWeight: 500 }}>
                  ← Back to the full guide
                </Link>
              </p>
            </div>
          )}

          {/* ── Jump to a category ───────────────────────────────────────── */}
          <nav aria-label="Jump to an industry category" style={{ marginTop: 56, marginBottom: -16 }}>
            <p style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.inkFaint, margin: "0 0 12px" }}>
              Jump to a category
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {groupsWithPages.map((g) => (
                <Link
                  key={g.slug}
                  href={companyPageHref(groupStartPage(g.slug), g.slug)}
                  style={{
                    fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                    padding: "6px 14px", borderRadius: 999, textDecoration: "none",
                    border: `1px solid ${t.line}`, color: t.inkSoft, whiteSpace: "nowrap",
                  }}
                >
                  {g.heading.split(" — ")[0].split(",")[0]} · {g.pages.length}
                </Link>
              ))}
            </div>
          </nav>

          {/* ── Company-specific guides — paginated, 30 per page ─────────── */}
          {sections.map((section) => {
            const meta = groupsWithPages.find((g) => g.slug === section.slug)!;
            const continued = groupAbsStart[section.slug] < globalStartOfPage;
            return (
              <CompanyGroup
                key={section.slug}
                id={continued ? undefined : section.slug}
                heading={continued ? `${meta.heading} (continued)` : meta.heading}
                description={meta.description}
                pages={section.pages}
                companyLabel={COMPANY_LABEL}
                focusLabel={FOCUS_LABEL}
              />
            );
          })}

          {/* ── Pagination — 30 companies per page ───────────────────────── */}
          {totalCompanyPages > 1 && (
            <nav
              aria-label="Company directory pages"
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 24, marginBottom: 48 }}
            >
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, marginRight: 10, whiteSpace: "nowrap" }}>
                {flat.length} companies · page {safePage} of {totalCompanyPages}
              </span>

              <Link
                href={companyPageHref(safePage - 1)}
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

              {Array.from({ length: totalCompanyPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalCompanyPages || Math.abs(n - safePage) <= 1)
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
                      href={companyPageHref(n)}
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
                href={companyPageHref(safePage + 1)}
                aria-disabled={safePage === totalCompanyPages}
                tabIndex={safePage === totalCompanyPages ? -1 : undefined}
                style={{
                  fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                  padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                  background: safePage === totalCompanyPages ? t.creamSoft : "#fff",
                  color: safePage === totalCompanyPages ? t.inkFaint : t.coal,
                  textDecoration: "none",
                  pointerEvents: safePage === totalCompanyPages ? "none" : "auto",
                  opacity: safePage === totalCompanyPages ? 0.45 : 1,
                }}
              >
                Next →
              </Link>
            </nav>
          )}

          {safePage === 1 && (
            <>
              {/* ── Freshers & Campus HR prep ─────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                  Freshers &amp; Campus Placement: HR Prep
                </h2>
                <p style={{ fontSize: 14, color: sand, margin: "0 0 20px", lineHeight: 1.6 }}>
                  Every campus interview ends with an HR round. These guides cover the questions that appear in 90%+ of Indian campus drives, with structured answer frameworks you can practice out loud.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                  {[
                    {
                      title: "Why Should We Hire You?",
                      desc: "The most consequential question in campus interviews. Most freshers waste it with vague claims. Learn the Skills → Proof → Fit structure.",
                      href: "/questions/why-should-we-hire-you-answer-india",
                    },
                    {
                      title: "Tell Me About Yourself",
                      desc: "Opens every interview. The wrong structure is chronological. Learn the Present → Achievement → Future format that interviewers want.",
                      href: "/questions/tell-me-about-yourself-answer-freshers-india",
                    },
                    {
                      title: "Common HR Interview Questions",
                      desc: "10 questions that appear in 95%+ of fresher HR rounds: strength, weakness, 5-year goal, why this company, relocation, and more.",
                      href: "/questions/common-hr-interview-questions-freshers-india",
                    },
                  ].map((item) => (
                    <Link key={item.href} href={item.href} style={{
                      ...card, padding: "20px 22px", textDecoration: "none", color: "inherit", display: "block",
                    }}>
                      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: copper, marginBottom: 8 }}>
                        HR Round · Freshers
                      </div>
                      <h3 style={{ fontFamily: fonts.sans, fontSize: 16, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.005em", color: coal }}>
                        {item.title}
                      </h3>
                      <p style={{ fontSize: 13, color: sand, margin: "0 0 14px", lineHeight: 1.55 }}>{item.desc}</p>
                      <span style={{ color: copper, fontSize: 13, fontWeight: 500 }}>Practice with AI →</span>
                    </Link>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: sand, margin: "16px 0 0", lineHeight: 1.5 }}>
                  Preparing for a campus placement drive?{" "}
                  <Link href="/for-students" style={{ color: copper, fontWeight: 500, textDecoration: "none" }}>
                    See the full campus placement guide →
                  </Link>
                </p>
              </section>

              {/* ── City guides ──────────────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                  Prepare by city
                </h2>
                <p style={{ fontSize: 14, color: sand, margin: "0 0 20px", lineHeight: 1.6 }}>
                  Hiring mix differs by city: a Bengaluru loop skews GCC-heavy, Mumbai skews banking and consulting. See which companies are actually hiring where.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {CITY_PAGES.map((c) => (
                    <Link key={c.slug} href={`/interview-prep/${c.slug}`} style={{
                      padding: "10px 16px", background: t.white, border: `1px solid ${t.line}`,
                      borderRadius: 999, textDecoration: "none", color: coal, fontSize: 13, fontWeight: 500,
                    }}>
                      {c.city}
                    </Link>
                  ))}
                </div>
              </section>

              {/* ── FAQ ──────────────────────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 20px" }}>
                  Frequently asked questions
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {faqSchema.mainEntity.map((faq, i) => (
                    <div key={i} style={{
                      padding: "20px 0",
                      borderBottom: i < faqSchema.mainEntity.length - 1 ? `1px solid ${t.line}` : "none",
                    }}>
                      <h3 style={{ ...serif, fontSize: 17, fontWeight: 400, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                        {faq.name}
                      </h3>
                      <p style={{ fontSize: 14, lineHeight: 1.65, color: sand, margin: 0 }}>
                        {faq.acceptedAnswer.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Related reading — deep-dive company guides ────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ ...serif, fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                  Company interview guides
                </h2>
                <p style={{ fontSize: 14, color: sand, margin: "0 0 20px", lineHeight: 1.6 }}>
                  Each guide covers the full process for that company: rounds, format, what the interviewers evaluate, and what separates shortlisted candidates.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {([
                    ["AI Mock Interview Practice: Free, Voice-Based", "/ai-mock-interview"],
                    ["Freshworks SDE Interview 2026: B2B SaaS & Customer-Success Engineering", "/blog/freshworks-interview-questions-india-2026"],
                    ["PhonePe Engineering Interview 2026: Scale, UPI & Builder Mindset", "/blog/phonepe-interview-questions-india-2026"],
                    ["Meesho Engineering Interview 2026: Social Commerce & Tier-3 India", "/blog/meesho-interview-questions-india-2026"],
                    ["FAANG Interview Preparation India 2026", "/blog/faang-interview-preparation-india-2026"],
                    ["System Design Interview Preparation India", "/blog/system-design-interview-preparation"],
                    ["DSA 60-Day Preparation Plan India 2026", "/blog/dsa-60-day-preparation-plan"],
                    ["Goldman Sachs India Interview Questions 2026", "/blog/goldman-sachs-india-interview-questions"],
                    ["JP Morgan Interview Questions India 2026", "/blog/jp-morgan-interview-questions-india-2026"],
                    ["Software Engineer Interview Checklist 2026", "/blog/software-engineer-interview-checklist-2026"],
                    ["STAR Method Interview Answers India", "/blog/star-method-interview-answers"],
                  ] as [string, string][]).map(([label, href]) => (
                    <Link
                      key={href}
                      href={href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "14px 18px",
                        background: t.white,
                        border: `1px solid ${t.line}`,
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 500,
                        color: coal,
                        textDecoration: "none",
                        gap: 10,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: copper, fontSize: 16, flexShrink: 0 }}>→</span>
                      {label}
                    </Link>
                  ))}
                </div>
              </section>

              {/* ── Salary guides ────────────────────────────────────────── */}
              <section style={{ marginTop: 56 }}>
                <h2 style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 6px" }}>
                  Know your worth before the interview
                </h2>
                <p style={{ fontSize: 14, color: t.inkSoft, margin: "0 0 18px", lineHeight: 1.6 }}>
                  Salary guides for top Indian employers, sourced from AmbitionBox, Glassdoor, and DRHP filings. Know the range before you negotiate.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {SALARY_SEO_PAGES.slice(0, 18).map((salaryPage) => (
                    <li key={salaryPage.slug}>
                      <Link href={`/salary/${salaryPage.slug}`} style={{
                        display: "block", padding: "12px 16px",
                        background: t.creamRaised, border: `1px solid ${t.line}`, borderRadius: 10,
                        textDecoration: "none", color: t.coal,
                      }}>
                        <div style={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.copper, marginBottom: 4 }}>
                          Salary Guide
                        </div>
                        <div style={{ fontFamily: fonts.sans, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: t.coal }}>
                          {salaryCompanyLabel(salaryPage.slug)} India 2026
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: 13, color: t.inkSoft, marginTop: 14 }}>
                  <Link href="/salary" style={{ color: t.copper, textDecoration: "underline" }}>
                    View all salary guides →
                  </Link>
                </p>
              </section>
            </>
          )}

          {/* ── Bottom CTA ───────────────────────────────────────────── */}
          <section style={{
            marginTop: 56, padding: "32px 28px",
            background: t.creamSoft, borderRadius: 16, textAlign: "center",
          }}>
            <h2 style={{ ...serif, fontSize: 26, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>
              Stop reading. Start practicing.
            </h2>
            <p style={{ fontSize: 14, color: sand, margin: "10px 0 20px", lineHeight: 1.5, maxWidth: 480, marginInline: "auto" }}>
              Reading interview tips is not the same as interview practice. The AI interviewer asks
              questions, listens to your voice answer, and grades your structure and delivery, in 2 minutes.
            </p>
            <Link href="/signup?source=interview-prep-cta" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: copper, color: cream, textDecoration: "none",
              padding: "14px 28px", borderRadius: 999, fontSize: 15, fontWeight: 500,
            }}>
              Start free practice → 2 sessions, no card
            </Link>
          </section>

        </div>
      </main>
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

/* Reusable company group section. */
function CompanyGroup({
  id, heading, description, pages, companyLabel, focusLabel,
}: {
  id?: string;
  heading: string;
  description: string;
  pages: typeof SEO_PAGES;
  companyLabel: Record<string, string>;
  focusLabel: Record<string, string>;
}) {
  if (pages.length === 0) return null;
  return (
    <section id={id} style={{ marginTop: 56, scrollMarginTop: 24 }}>
      <h2 style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 6px" }}>
        {heading}
      </h2>
      <p style={{ fontSize: 14, color: t.inkSoft, margin: "0 0 18px", lineHeight: 1.6 }}>{description}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/questions/${p.slug}`} style={{
              display: "block", padding: "14px 16px",
              background: t.creamRaised, border: `1px solid ${t.line}`, borderRadius: 10,
              textDecoration: "none", color: t.coal,
            }}>
              <div style={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.copper, marginBottom: 4 }}>
                {companyLabel[p.company] ?? p.company} · {focusLabel[p.focus] ?? p.focus}
              </div>
              <div style={{ fontFamily: fonts.sans, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: t.coal }}>
                {p.searchPhrase}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { Metadata } from "next";
import Script from "next/script";
import { SALARY_SEO_PAGES, salaryCompanyLabel } from "../../../data/salary-seo";
import { COMPANY_SALARY_OVERRIDES } from "../../../data/company-salary-overrides";
import { SalaryHubPage, type SalaryHubEntry } from "@/marketing-v2/SalaryPage";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { breadcrumb, ldJson } from "@/marketing-v2/_schema";
import { tokens as t, fonts } from "@/auth/_tokens";

/* Accessing searchParams makes this page dynamic — intentional, mirrors
   app/(marketing)/questions/page.tsx. The ?page= param drives real
   crawlable pagination via <Link href="/salary?page=N"> in SalaryHubPage. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const count = SALARY_SEO_PAGES.length;
  /* GSC (Aug 2026): 326 impressions, 0 clicks, avg pos ~24 — same pattern
     as /questions. The old title carried no number at all; the individual
     company pages already lead with a real ₹ CTC figure once they clear
     the isBroadRoster threshold (see salary/[company]/page.tsx) and that
     measurably beats a generic title at the same position. `count` was
     already computed for ogDesc below — put it in the title too. */
  const title = `${count} Company Salary Guides India 2026 | HireStepX`;
  const ogDesc = `Salary ranges for ${count} companies, total CTC sourced from AmbitionBox and Glassdoor.`;

  // Same self-canonical-but-not-noindexed gap as /questions: ?page=N is a
  // real, separately-crawlable URL that only ever points its canonical
  // back to plain /salary — add the matching noindex so Google doesn't
  // treat each page of the directory as its own thin, duplicate result.
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  return {
    title,
    description:
      `${count} companies with real CTC ranges — TCS, Infosys, Razorpay, Google, Amazon, Meta, Goldman Sachs & more. AmbitionBox + Glassdoor sourced, India 2026.`,
    keywords: [
      "software engineer salary India 2026",
      "TCS salary freshers 2026",
      "Razorpay salary India",
      "Infosys salary 2026",
      "Google salary India",
      "Amazon SDE salary India",
      "Meta India salary 2026",
      "Uber India salary 2026",
      "company salary guide India",
    ],
    alternates: { canonical: "/salary" },
    ...(pageNum === 1 ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      title,
      description: ogDesc,
      url: "https://hirestepx.com/salary",
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: "https://hirestepx.com/opengraph-image", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: ogDesc,
      images: ["https://hirestepx.com/opengraph-image"],
    },
  };
}

export default async function SalaryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { headers } = await import("next/headers");
  const nonce = (await headers()).get("x-nonce") ?? "";
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const entries: SalaryHubEntry[] = SALARY_SEO_PAGES.map((page) => {
    const overrides = COMPANY_SALARY_OVERRIDES[page.slug] ?? COMPANY_SALARY_OVERRIDES[page.slug.replace(/-/g, " ")];
    const sweBands = overrides?.["software-engineer"];
    const entryBand = sweBands?.["entry"];

    return {
      slug: page.slug,
      label: salaryCompanyLabel(page.slug),
      hubNote: page.hubNote,
      topRoleLabel: page.roles[0]?.label ?? "Software Engineer",
      entryMin: entryBand?.totalMin,
      entryMax: entryBand?.totalMax,
    };
  });

  const breadcrumbSchema = breadcrumb([{ name: "Salary Guides", path: "/salary" }]);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is a good salary for a software engineer fresher in India in 2026?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For freshers in India in 2026, salary ranges by company tier: Service companies (TCS, Infosys, Wipro, Cognizant): ₹3.5–7 LPA depending on track. Mid-tier product companies (Freshworks, Zoho, LTIMindtree): ₹6–12 LPA. Indian startups and unicorns (Razorpay, PhonePe, Meesho, CRED): ₹15–30 LPA. FAANG India campuses (Google, Amazon, Microsoft, Meta) from IIT/NIT: ₹35–60 LPA all-in. These are total CTC figures including variable pay and benefits.",
        },
      },
      {
        "@type": "Question",
        name: "What components make up a software engineer's CTC in India?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Indian tech CTC typically has 4–6 components: (1) Fixed base salary, the guaranteed monthly component. (2) Variable pay, a performance bonus typically 10–20% of base at service companies and 15–30% at product companies. (3) Joining bonus, a one-time payment common when buying out notice period. (4) ESOPs or RSUs, equity at Series B+ startups and public companies, vesting over 4 years with a 1-year cliff. (5) Employer PF contribution, 12% of basic, excluded from gross CTC at some companies. (6) Other allowances such as HRA, transport, and food. Total CTC is the full cost to company; in-hand salary is significantly lower.",
        },
      },
      {
        "@type": "Question",
        name: "How accurate are AmbitionBox and Glassdoor salary figures for Indian companies?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AmbitionBox and Glassdoor India salary data is directionally accurate but has known biases: (1) Self-reporting bias, where employees who are especially happy or unhappy with their salaries over-represent the dataset. (2) Vintage lag, since salary data can be 1–3 years old in fast-moving markets. (3) Variable exclusion, as many self-reported figures exclude variable pay, ESOPs, and joining bonuses. HireStepX sources primarily from AmbitionBox, with Glassdoor as a secondary cross-check where available, and labels each entry with a verification date.",
        },
      },
      {
        "@type": "Question",
        name: "How much can I negotiate above the initial offer in Indian tech?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For most Indian tech companies, counter-offering 15–25% above the initial offer is the standard negotiation range. Service companies (TCS, Infosys, Wipro) have compressed negotiation room for freshers, typically 5–10%. Product startups and unicorns have more room, 15–25% on base, with additional room on joining bonus, ESOPs, and variable cap. FAANG companies in India have structured bands; negotiation works best by requesting the higher end of the band rather than exceeding it. Knowing your BATNA (Best Alternative To a Negotiated Agreement) before the call is essential.",
        },
      },
    ],
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Company Salary Guides India 2026",
    description:
      `Total CTC ranges for ${entries.length} companies hiring in India, sourced from AmbitionBox and Glassdoor.`,
    numberOfItems: entries.length,
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${e.label} Salary Guide India 2026`,
      url: `https://hirestepx.com/salary/${e.slug}`,
    })),
  };

  return (
    <>
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={ldJson(faqSchema)}
      />
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={ldJson(breadcrumbSchema)}
      />
      <script
        nonce={nonce || undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={ldJson(itemListSchema)}
      />
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810403590527236"
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <NavV2 />
      <div style={{ background: t.copperWash, borderBottom: `1px solid ${t.copperBorder}` }}>
        <a
          href="/salary-report-2026"
          style={{
            display: "block",
            maxWidth: 1080,
            margin: "0 auto",
            padding: "10px 24px",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          <span style={{ fontFamily: fonts.sans, fontSize: 13.5, color: t.coal, lineHeight: 1.5 }}>
            <strong style={{ color: t.copper }}>New for 2026 —</strong> the Indian Startup Engineer Salary Report,
            covering AI startups like Sarvam, Moglix and Navi no one else has data on.
          </span>{" "}
          <span style={{ fontFamily: fonts.sans, fontSize: 13.5, fontWeight: 600, color: t.copper, whiteSpace: "nowrap" }}>
            Read it →
          </span>
        </a>
      </div>
      <SalaryHubPage
        entries={entries}
        faqs={faqSchema.mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))}
        initialPage={pageNum}
      />
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { BLOG_META } from "@/blog-meta";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { SEO_PAGES } from "../../../../../data/seo-pages";
import { SALARY_SEO_PAGES, salaryCompanyLabel } from "../../../../../data/salary-seo";
import { COMPANY_LABEL } from "../../../../../data/company-labels";
import { tokens as t, fonts } from "@/auth/_tokens";
import {
  buildBlogCompanyJsonLd,
  companyToSlug,
  companyKeyFromLabel,
  getAllBlogCompanySlugs,
} from "./_jsonld";

/* /blog/company/[slug] — company-specific blog category pages.
 *
 * One page per company that has at least one post in BLOG_META.
 * Targets queries like "TCS interview questions blog India 2026",
 * "Infosys interview tips", etc.
 *
 * Generated at build time via generateStaticParams.
 * Schema: BreadcrumbList + ItemList
 */

const GENERAL_COMPANIES = new Set([
  "General", "Interview Skills", "Role Guides", "Industry Insights",
  "Career Advice", "Career",
]);

/* Content is static data (BLOG_META) — only changes on redeploy, which
   invalidates the ISR cache anyway. Long interval avoids racking up ISR
   writes every day across every company page (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */

export async function generateStaticParams() {
  return getAllBlogCompanySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_META.find(
    (p) => companyToSlug(p.company) === slug && !GENERAL_COMPANIES.has(p.company),
  );
  if (!post) return { title: "Not Found" };

  const companyKey = companyKeyFromLabel(post.company);
  const displayName = companyKey ? (COMPANY_LABEL[companyKey] ?? post.company) : post.company;

  return {
    title: `${displayName} Interview Questions & Tips 2026 | HireStepX Blog`,
    description: `All ${displayName} interview guides on HireStepX: preparation tips, question breakdowns, and strategy for ${displayName} roles in India 2026.`,
    alternates: { canonical: `/blog/company/${slug}` },
    // Thin list-of-links page: it has no unique content beyond linking out to the
    // real articles/salary/questions pages for this company, so it was competing
    // with (and losing to) those pages for the same query intent — GSC showed
    // all 49 instances stuck at position 40-77 with a 0.6% CTR. noindex stops it
    // from cannibalizing search visibility while `follow` keeps passing link
    // equity to the pages that actually rank.
    robots: { index: false, follow: true },
    openGraph: {
      title: `${displayName} Interview Guides, HireStepX Blog`,
      description: `All ${displayName} interview guides on HireStepX: preparation tips, question breakdowns, and strategy for ${displayName} roles in India 2026.`,
      url: `https://hirestepx.com/blog/company/${slug}`,
      type: "website",
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: "https://hirestepx.com/opengraph-image", width: 1200, height: 630, alt: `${displayName} Interview Guides, HireStepX` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} Interview Guides, HireStepX Blog`,
      description: `All ${displayName} interview preparation articles on HireStepX: tips, question breakdowns, and strategy for India 2026.`,
      images: ["https://hirestepx.com/opengraph-image"],
    },
  };
}

export default async function BlogCompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const posts = BLOG_META.filter(
    (p) => companyToSlug(p.company) === slug && !GENERAL_COMPANIES.has(p.company),
  );
  if (posts.length === 0) notFound();

  const company = posts[0].company;
  const companyKey = companyKeyFromLabel(company);
  const displayName = companyKey ? (COMPANY_LABEL[companyKey] ?? company) : company;

  const questionPages = companyKey
    ? SEO_PAGES.filter((p) => p.company === companyKey).slice(0, 3)
    : [];
  const salaryEntry = companyKey
    ? SALARY_SEO_PAGES.find((s) => s.slug === companyKey) ?? null
    : null;

  /* No CSP nonce here on purpose — a live per-request headers() read would
     force this ISR route fully dynamic (defeating `revalidate` and killing
     cache-control, which is what starved this route of Googlebot crawl
     budget). This JSON-LD content is deterministic per company, so its CSP
     allowance comes from a build-time content hash instead — see
     scripts/generate-jsonld-csp-hashes.mts and proxy.ts's buildCsp(). */
  const jsonLdScripts = buildBlogCompanyJsonLd(slug);
  if (!jsonLdScripts) notFound();

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
      <main style={{ background: "#fdfcf7", minHeight: "60vh" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>

          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ marginBottom: 32 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 11, color: t.inkSoft }}>
              <Link href="/blog" style={{ color: t.copper, textDecoration: "none" }}>Blog</Link>
              {" / "}
              <span>{displayName}</span>
            </span>
          </nav>

          {/* Header */}
          <p style={{ fontFamily: fonts.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: t.inkSoft, textTransform: "uppercase", margin: "0 0 12px" }}>
            {posts.length} {posts.length === 1 ? "guide" : "guides"}
          </p>
          <h1 style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", color: t.coal, margin: "0 0 12px", lineHeight: 1.2 }}>
            {displayName} Interview Questions &amp; Tips
          </h1>
          <p style={{ fontFamily: fonts.serif, fontSize: 16, color: t.inkSoft, margin: "0 0 48px", lineHeight: 1.7 }}>
            All {displayName} interview preparation guides on HireStepX: question breakdowns, preparation strategy, and role-specific tips for Indian candidates in 2026.
          </p>

          {/* Post list */}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 48px", display: "flex", flexDirection: "column", gap: 12 }}>
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  style={{
                    display: "block",
                    padding: "18px 20px",
                    background: "#fff",
                    border: `1px solid ${t.line}`,
                    borderRadius: 12,
                    textDecoration: "none",
                    color: t.coal,
                  }}
                >
                  <div style={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.copper, marginBottom: 6 }}>
                    {post.category} · {post.datePublished}
                  </div>
                  <div style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 1.4, color: t.coal, marginBottom: 6 }}>
                    {post.title}
                  </div>
                  <div style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.5 }}>
                    {post.metaDescription}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Practice CTA */}
          {(questionPages.length > 0 || salaryEntry) && (
            <section style={{ borderTop: `1px solid ${t.line}`, paddingTop: 36 }}>
              <h2 style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: 400, color: t.coal, margin: "0 0 20px", letterSpacing: "-0.01em" }}>
                Practice {displayName} interviews on HireStepX
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {questionPages.map((q) => (
                  <Link
                    key={q.slug}
                    href={`/questions/${q.slug}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", background: "#fff", border: `1px solid ${t.line}`,
                      borderRadius: 10, textDecoration: "none", color: t.coal, fontSize: 14, fontWeight: 500,
                    }}
                  >
                    <span>{q.searchPhrase}</span>
                    <span style={{ color: t.copper, fontSize: 13, marginLeft: 12, whiteSpace: "nowrap" }}>Practice →</span>
                  </Link>
                ))}
                {salaryEntry && (
                  <Link
                    href={`/salary/${salaryEntry.slug}`}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", background: "#fff", border: `1px solid ${t.line}`,
                      borderRadius: 10, textDecoration: "none", color: t.coal, fontSize: 14, fontWeight: 500,
                    }}
                  >
                    <span>{salaryCompanyLabel(salaryEntry.slug)} Salary Guide, India 2026 CTC breakdown</span>
                    <span style={{ color: t.copper, fontSize: 13, marginLeft: 12, whiteSpace: "nowrap" }}>View →</span>
                  </Link>
                )}
              </div>
            </section>
          )}

        </div>
      </main>
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CITY_PAGES, getCityPageBySlug, getAllCitySlugs } from "../../../../data/city-pages";
import { SEO_PAGES } from "../../../../data/seo-pages";
import { COMPANY_LABEL } from "../../../../data/company-labels";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { tokens as t, fonts } from "@/auth/_tokens";
import { buildInterviewPrepCityJsonLd } from "./_jsonld";

/* /interview-prep/[city] — city-specific interview prep landing pages.
 *
 * Targets location-qualified queries ("interview preparation Bengaluru",
 * "mock interview practice Hyderabad") that the company × focus SEO tree
 * (data/seo-pages.ts) doesn't serve, since those pages target a specific
 * employer rather than a candidate searching by city.
 *
 * Company lists in data/city-pages.ts are grounded in real office
 * locations from data/company-known-facts.ts, not invented.
 *
 * Schema: BreadcrumbList + FAQPage
 */

/* Content is static data (data/city-pages.ts) — only changes on redeploy,
   which invalidates the ISR cache anyway. Long interval avoids racking up
   ISR writes every day (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */

export async function generateStaticParams() {
  return getAllCitySlugs().map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const page = getCityPageBySlug(slug);
  if (!page) return { title: "Not Found" };

  const title = `${page.displayName} Interview Prep 2026 | HireStepX`;
  const description = `Prepare for interviews at companies hiring in ${page.city}. Role- and company-specific AI mock interviews, scored feedback, 2 free sessions.`;

  return {
    title,
    description,
    alternates: { canonical: `/interview-prep/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://hirestepx.com/interview-prep/${slug}`,
      type: "website",
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

export default async function CityInterviewPrepPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const page = getCityPageBySlug(slug);
  if (!page) notFound();

  /* No CSP nonce here on purpose — a live per-request headers() read would
     force this ISR route fully dynamic (defeating `revalidate` and killing
     cache-control, which is what starved this route of Googlebot crawl
     budget). This JSON-LD content is deterministic per city, so its CSP
     allowance comes from a build-time content hash instead — see
     scripts/generate-jsonld-csp-hashes.mts and proxy.ts's buildCsp(). */
  const jsonLdScripts = buildInterviewPrepCityJsonLd(slug);
  if (!jsonLdScripts) notFound();

  const companyLinks = page.companies
    .map((key) => {
      const seoPage = SEO_PAGES.find((p) => p.company === key);
      if (!seoPage) return null;
      return { key, label: COMPANY_LABEL[key] ?? key, slug: seoPage.slug };
    })
    .filter((c): c is { key: string; label: string; slug: string } => c !== null);

  const faqs = [
    {
      q: `Which companies hire for tech and business roles in ${page.city}?`,
      a: `${page.hiringContext}`,
    },
    {
      q: `How should I prepare differently for a ${page.city} interview versus another Indian city?`,
      a: `The company mix matters more than the city itself. ${page.city}'s hiring is concentrated in specific sectors (see above), so target your prep at the actual employer and role rather than generic "city interview tips": the format, rubric, and difficulty are set by the company, not the location.`,
    },
    {
      q: `Can I practice interviews for ${page.city} companies with HireStepX?`,
      a: `Yes. HireStepX's question banks are built per company and role, not per city, so you practice the exact interview format used by any company hiring in ${page.city} that HireStepX covers, with scored feedback after every session.`,
    },
  ];

  const s = { fontFamily: fonts.sans };
  const serif = { fontFamily: fonts.serif };
  const mono = { fontFamily: fonts.mono };

  return (
    <>
      {jsonLdScripts.map((html, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={html} />
      ))}
      <NavV2 />
      <main style={{ background: t.cream, color: t.coal, minHeight: "100dvh", padding: "48px 24px 80px", ...s }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>

          <nav aria-label="Breadcrumb" style={{ marginBottom: 24 }}>
            <span style={{ ...mono, fontSize: 11, color: t.inkSoft }}>
              <Link href="/interview-prep" style={{ color: t.copper, textDecoration: "none" }}>Interview Prep</Link>
              {" / "}
              <span>{page.displayName}</span>
            </span>
          </nav>

          <div style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.copper, marginBottom: 12 }}>
            City Guide · 2026
          </div>

          <h1 style={{ ...serif, fontSize: "clamp(28px, 4.5vw, 42px)", fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.15, margin: 0, color: t.coal, textWrap: "balance" }}>
            Interview Preparation in {page.displayName}
          </h1>

          <p style={{ ...s, fontSize: 16, lineHeight: 1.65, color: t.inkSoft, marginTop: 20, maxWidth: 680 }}>
            {page.intro}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <Link href="/signup?source=interview-prep-city" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: t.copper, color: t.cream, textDecoration: "none",
              padding: "14px 24px", borderRadius: 999, fontSize: 15, fontWeight: 500,
            }}>
              Start free mock interview → 2 sessions, no card
            </Link>
          </div>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 12px" }}>
              What hiring in {page.city} actually looks like
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: t.inkSoft, margin: 0 }}>
              {page.hiringContext}
            </p>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
              Companies hiring in {page.city}
            </h2>
            <p style={{ fontSize: 14, color: t.inkSoft, margin: "0 0 20px", lineHeight: 1.6 }}>
              Practice the exact interview format for each company below: question banks are built per company and role, not generic.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {companyLinks.map((c) => (
                <li key={c.key}>
                  <Link href={`/questions/${c.slug}`} style={{
                    display: "block", padding: "14px 16px",
                    background: t.creamRaised, border: `1px solid ${t.line}`, borderRadius: 10,
                    textDecoration: "none", color: t.coal, fontSize: 14, fontWeight: 500,
                  }}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", margin: "0 0 20px" }}>
              Frequently asked questions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {faqs.map((faq, i) => (
                <div key={i} style={{ padding: "18px 0", borderBottom: i < faqs.length - 1 ? `1px solid ${t.line}` : "none" }}>
                  <h3 style={{ ...serif, fontSize: 16, fontWeight: 400, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{faq.q}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.inkSoft, margin: 0 }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ borderTop: `1px solid ${t.line}`, paddingTop: 36, marginTop: 48 }}>
            <h2 style={{ ...serif, fontSize: 20, fontWeight: 400, color: t.coal, margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Other cities
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CITY_PAGES.filter((c) => c.slug !== slug).map((c) => (
                <Link key={c.slug} href={`/interview-prep/${c.slug}`} style={{
                  padding: "10px 16px", background: "#fff", border: `1px solid ${t.line}`,
                  borderRadius: 999, textDecoration: "none", color: t.coal, fontSize: 13, fontWeight: 500,
                }}>
                  {c.city}
                </Link>
              ))}
            </div>
          </section>

          <section style={{
            marginTop: 48, padding: "32px 28px",
            background: t.creamSoft, borderRadius: 16, textAlign: "center",
          }}>
            <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>
              Stop reading. Start practicing.
            </h2>
            <p style={{ fontSize: 14, color: t.inkSoft, margin: "10px 0 20px", lineHeight: 1.5, maxWidth: 480, marginInline: "auto" }}>
              The AI interviewer asks real questions, listens to your voice answer, and grades your structure and delivery.
            </p>
            <Link href="/signup?source=interview-prep-city-cta" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: t.copper, color: t.cream, textDecoration: "none",
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

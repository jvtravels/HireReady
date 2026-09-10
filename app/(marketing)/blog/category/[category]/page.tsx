import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BLOG_META } from "@/blog-meta";
import { CATEGORY_BUCKETS, bucketToSlug, bucketDescription, bucketIntro, categoryBucket } from "@/blog-categories";
import { NavV2, MobileStickyCTA } from "@/marketing-v2/HomepageV2";
import { FooterDome } from "@/marketing-v2/FooterDome";
import { tokens as t, fonts } from "@/auth/_tokens";
import { buildBlogCategoryJsonLd, bucketFromSlug, getAllBlogCategorySlugs } from "./_jsonld";

/* /blog/category/[category] — topic-bucket blog landing pages.
 *
 * One page per user-intent bucket (Company Guides, Freshers, Behavioral,
 * Technical, Career, Strategy — see src/blog-categories.ts). Targets
 * queries like "behavioral interview questions blog India" or "freshers
 * interview prep guides" that a single post can't fully cover.
 *
 * Generated at build time via generateStaticParams.
 * Schema: BreadcrumbList + ItemList
 */

/* Content is static data (BLOG_META buckets) — only changes on redeploy,
   which invalidates the ISR cache anyway. Long interval avoids racking up
   ISR writes every day (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */

export async function generateStaticParams() {
  return getAllBlogCategorySlugs().map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const bucket = bucketFromSlug(slug);
  if (!bucket) return { title: "Not Found" };

  const title = `${bucket} Interview Guides: HireStepX Blog`;
  const description = bucketDescription(bucket);

  return {
    title: `${title} | India 2026`,
    description,
    alternates: { canonical: `/blog/category/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://hirestepx.com/blog/category/${slug}`,
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

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const bucket = bucketFromSlug(slug);
  if (!bucket) notFound();

  const posts = BLOG_META
    .filter((p) => categoryBucket(p.category) === bucket)
    .sort((a, b) => (a.datePublished < b.datePublished ? 1 : -1));
  if (posts.length === 0) notFound();

  /* No CSP nonce here on purpose — a live per-request headers() read would
     force this ISR route fully dynamic (defeating `revalidate` and killing
     cache-control, which is what starved this route of Googlebot crawl
     budget). This JSON-LD content is deterministic per category, so its CSP
     allowance comes from a build-time content hash instead — see
     scripts/generate-jsonld-csp-hashes.mts and proxy.ts's buildCsp(). */
  const jsonLdScripts = buildBlogCategoryJsonLd(slug);
  if (!jsonLdScripts) notFound();

  return (
    <>
      {jsonLdScripts.map((html, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={html} />
      ))}
      <NavV2 />
      <main style={{ background: "#fdfcf7", minHeight: "60vh" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>

          <nav aria-label="Breadcrumb" style={{ marginBottom: 32 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 11, color: t.inkSoft }}>
              <Link href="/blog" style={{ color: t.copper, textDecoration: "none" }}>Blog</Link>
              {" / "}
              <span>{bucket}</span>
            </span>
          </nav>

          <p style={{ fontFamily: fonts.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: t.inkSoft, textTransform: "uppercase", margin: "0 0 12px" }}>
            {posts.length} {posts.length === 1 ? "guide" : "guides"}
          </p>
          <h1 style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", color: t.coal, margin: "0 0 12px", lineHeight: 1.2 }}>
            {bucket} Interview Guides
          </h1>
          <p style={{ fontFamily: fonts.serif, fontSize: 16, color: t.inkSoft, margin: "0 0 48px", lineHeight: 1.7, maxWidth: "68ch" }}>
            {bucketIntro(bucket)}
          </p>

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
                    {post.company} · {post.datePublished}
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

          <section style={{ borderTop: `1px solid ${t.line}`, paddingTop: 36 }}>
            <h2 style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: 400, color: t.coal, margin: "0 0 20px", letterSpacing: "-0.01em" }}>
              Browse other topics
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CATEGORY_BUCKETS.filter((b) => b !== bucket).map((b) => (
                <Link
                  key={b}
                  href={`/blog/category/${bucketToSlug(b)}`}
                  style={{
                    padding: "10px 16px", background: "#fff", border: `1px solid ${t.line}`,
                    borderRadius: 999, textDecoration: "none", color: t.coal, fontSize: 13, fontWeight: 500,
                  }}
                >
                  {b}
                </Link>
              ))}
            </div>
          </section>

        </div>
      </main>
      <FooterDome />
      <MobileStickyCTA />
    </>
  );
}

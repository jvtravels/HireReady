import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import BlogPage from "@/BlogPage";
import { getBlogMetaBySlug, getBlogMetasBySlugs } from "@/blog-meta";
import { getBlogPostBySlug } from "../../../../data/blog-posts";
import { buildBlogJsonLd } from "./_jsonld";

/* /blog/[slug] — per-post route.
 *
 * generateMetadata reads the lightweight server-safe blog-meta.ts registry
 * (not BlogPage.tsx which is "use client") to populate:
 *   - <title> with the real hand-written post title
 *   - meta description with the real metaDescription
 *   - OG image from heroImage
 *   - Article JSON-LD (needed for Google "Top Stories" carousel)
 *   - FAQPage JSON-LD (triggers rich accordion in SERP)
 *
 * If the slug isn't in the registry yet (ISR newcomer), falls back to the
 * slug-derived title so the page never has empty metadata.
 */

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A share of hand-written metaDescription entries in blog-meta.ts run past
// the ~155-char SERP budget once a post covers several sub-topics — sent
// through unmodified, Google truncates them mid-word/mid-sentence. Mirror
// the word-boundary trim already used on /salary/[company].
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:/&-]+$/, "");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = getBlogMetaBySlug(slug);

  const title = meta?.title ?? `${slugToTitle(slug)} | HireStepX Blog`;
  const rawDescription = meta?.metaDescription ??
    `Read "${slugToTitle(slug)}" on the HireStepX blog: interview tips, career advice, and job search strategies for Indian candidates.`;
  const description = truncateAtWord(rawDescription, 155);
  const image = meta?.heroImage ?? "https://hirestepx.com/opengraph-image";

  /* Google truncates SERP titles around ~60 chars. The raw post title is
     already kept under that limit on its own, but appending " | HireStepX"
     pushed most of them back over — only add the suffix when it still fits. */
  const baseTitle = meta ? meta.title : slugToTitle(slug);
  const withSuffix = `${baseTitle} | HireStepX`;
  const pageTitle = withSuffix.length <= 60 ? withSuffix : baseTitle;

  return {
    title: pageTitle,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://hirestepx.com/blog/${slug}`,
      type: "article",
      siteName: "HireStepX",
      locale: "en_IN",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      ...(meta?.datePublished ? { publishedTime: meta.datePublished } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/* ISR: generate paths for known slugs at build time; any new slug
   falls through to ISR on first visit. */
export async function generateStaticParams() {
  const { getAllBlogSlugs } = await import("@/blog-meta");
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

/* Content is a static data file (data/blog-posts.ts) — it only changes on
   redeploy, which invalidates the ISR cache anyway. A long interval here
   costs nothing in freshness but avoids racking up ISR writes on ~1,100
   pages every day (see Vercel Usage: ISR Writes). */
export const revalidate = 2592000; /* 30 days */
export const dynamicParams = true;

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = getBlogMetasBySlugs(post.relatedSlugs);

  /* No CSP nonce here on purpose — a live per-request headers() read would
     force this ISR route fully dynamic (defeating `revalidate` and killing
     cache-control, which is what starved this route of Googlebot crawl
     budget). This JSON-LD content is deterministic per slug, so its CSP
     allowance comes from a build-time content hash instead — see
     scripts/generate-jsonld-csp-hashes.mts and proxy.ts's buildCsp(). */
  const jsonLdScripts = buildBlogJsonLd(slug);

  return (
    <>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810403590527236"
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      {jsonLdScripts.map((html, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={html} />
      ))}
      <BlogPage post={post} related={relatedPosts} />
    </>
  );
}

import type { Metadata } from "next";
import BlogPage from "@/BlogPage";

function formatSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const title = formatSlug(slug);
  return {
    title: `${title} | HireStepX Blog`,
    description: `Read "${title}" on the HireStepX blog — interview tips, career advice, and job search strategies.`,
  };
}

// Each blog post — CDN cached, daily revalidate.
export const dynamic = "force-static";
export const revalidate = 86400;
// Incrementally statically generate slugs on first visit (ISR fallback).
export const dynamicParams = true;

export default function Page() {
  return <BlogPage />;
}

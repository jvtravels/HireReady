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

export default function Page() {
  return <BlogPage />;
}

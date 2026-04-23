import type { Metadata } from "next";
import PlaceholderPage from "@/PlaceholderPage";

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
    title: `${title} | HireStepX`,
    description: `${title} — Learn more on HireStepX.`,
  };
}

export const dynamic = "force-static";
export const revalidate = 86400;

export default function Page() {
  return <PlaceholderPage />;
}

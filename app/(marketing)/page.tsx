import type { Metadata } from "next";
import App from "@/App";

export const metadata: Metadata = {
  title: "HireStepX — AI Mock Interview Practice for Job Seekers",
  description:
    "Practice interviews with AI. Get real-time feedback on communication, structure, and strategy. Land your dream job with HireStepX.",
};

/**
 * Landing page is fully static — the HTML shell is identical for every
 * visitor. Auth-aware bits (CTA text like "Get Started" vs "Dashboard")
 * are rendered client-side after hydration. Marking this static drops
 * TTFB from ~1s (SSR fresh) to ~50ms (CDN cached) on the highest-traffic
 * route. Revalidate hourly so testimonial / pricing edits go live fast.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export default function Page() {
  return <App />;
}

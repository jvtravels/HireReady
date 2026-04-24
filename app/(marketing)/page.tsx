import type { Metadata } from "next";
import App from "@/App";
import ComingSoon from "@/ComingSoon";

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
 *
 * Pre-launch gate: while NEXT_PUBLIC_COMING_SOON="1" is set in Vercel,
 * the root route renders the ComingSoon waitlist page instead of the
 * full app. Flip to "0" (or unset) on launch day — no code change
 * required. Env-gated at build time so the static HTML actually swaps.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

const COMING_SOON = process.env.NEXT_PUBLIC_COMING_SOON === "1";

export default function Page() {
  if (COMING_SOON) return <ComingSoon />;
  return <App />;
}

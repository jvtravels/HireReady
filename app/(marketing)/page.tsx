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
 * Pre-launch gate: defaults to showing ComingSoon. To expose the full
 * landing page (launch day), set NEXT_PUBLIC_COMING_SOON="0" in Vercel
 * and redeploy. Any other value — including unset — keeps the waitlist
 * gate active so we never accidentally leak the app before we're ready.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

// Inverted default: full app only renders when the env var is explicitly
// set to "0". Any other value (unset / "1" / anything) → ComingSoon.
const SHOW_FULL_APP = process.env.NEXT_PUBLIC_COMING_SOON === "0";

export default function Page() {
  if (!SHOW_FULL_APP) return <ComingSoon />;
  return <App />;
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import App from "@/App";
import ComingSoon from "@/ComingSoon";

export const metadata: Metadata = {
  title: "HireStepX — AI Mock Interview Practice for Job Seekers",
  description:
    "Practice interviews with AI. Get real-time feedback on communication, structure, and strategy. Land your dream job with HireStepX.",
};

/**
 * Landing page gating — Coming Soon only renders on the public production
 * apex hosts. Everywhere else (staging, app.*, vercel previews, localhost)
 * shows the real app so the team can keep shipping while the public
 * site is still gated.
 *
 * We render dynamically here (read host header) instead of at build time
 * so a single deploy can serve both staging.hirestepx.com (full app) AND
 * www.hirestepx.com (Coming Soon) without env-var juggling per env.
 *
 * NEXT_PUBLIC_COMING_SOON kept as a manual override:
 *   - Set to "0" → never show Coming Soon (force open everywhere).
 *   - Set to "1" → always show Coming Soon (lock everything down).
 *   - Unset → host-based default below.
 */
export const dynamic = "force-dynamic";

const PRODUCTION_HOSTS = new Set([
  "www.hirestepx.com",
  "hirestepx.com",
]);

export default async function Page() {
  const override = process.env.NEXT_PUBLIC_COMING_SOON;
  if (override === "0") return <App />;
  if (override === "1") return <ComingSoon />;

  // Host-based default. headers() needs await in the Next 15 app router.
  let host = "";
  try {
    const h = await headers();
    host = (h.get("host") || "").toLowerCase().split(":")[0]; // strip port
  } catch { /* SSR-only API; on edge cases default to full app */ }

  if (PRODUCTION_HOSTS.has(host)) return <ComingSoon />;
  return <App />;
}

import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Dashboard | HireStepX",
  description:
    "Your interview practice dashboard. Track progress and start new sessions.",
};

// DashboardHome is a 1500-line client component. Loading it dynamically keeps
// it out of the critical path for auth-gated navigation, letting the route
// show the loading.tsx skeleton while the chunk streams in. This directly
// improves LCP + FCP for /dashboard (currently the worst-RES route at 68).
// Next 16 disallows `ssr: false` in Server Components. DashboardHome already
// has `"use client"`, so SSR of the shell produces a lightweight skeleton and
// the real component hydrates on the client without a wasted server render.
const DashboardHome = dynamic(() => import("@/DashboardHome"), {
  loading: () => (
    <div style={{ padding: 24, fontFamily: "var(--font-ui, system-ui, sans-serif)" }}>
      <div style={{ width: 200, height: 28, background: "#1a1a1a", borderRadius: 6, marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 160, background: "#1a1a1a", borderRadius: 12 }} />
        ))}
      </div>
    </div>
  ),
});

export default function Page() {
  return <DashboardHome />;
}

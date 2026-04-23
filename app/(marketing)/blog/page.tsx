import type { Metadata } from "next";
import BlogPage from "@/BlogPage";

export const metadata: Metadata = {
  title: "Blog | HireStepX",
  description:
    "Interview tips, career advice, and job search strategies from HireStepX.",
};

// Blog index — static CDN cache, 1-hour revalidate so new posts go live fast.
export const dynamic = "force-static";
export const revalidate = 3600;

export default function Page() {
  return <BlogPage />;
}

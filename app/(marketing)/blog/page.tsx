import type { Metadata } from "next";
import BlogPage from "@/BlogPage";

export const metadata: Metadata = {
  title: "Blog | HireStepX",
  description:
    "Interview tips, career advice, and job search strategies from HireStepX.",
};

export default function Page() {
  return <BlogPage />;
}

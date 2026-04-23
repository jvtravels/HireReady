import type { Metadata } from "next";
import StoryNotebookPage from "@/StoryNotebookPage";

export const metadata: Metadata = {
  title: "Story Notebook | HireStepX",
  description:
    "Your saved interview stories, organized for spaced-repetition practice.",
};

export default function Page() {
  return <StoryNotebookPage />;
}

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CoveragePanel from "../resume/CoveragePanel";
import type { ResumeProfile } from "../dashboardData";

const baseProfile: ResumeProfile = {
  headline: "Senior Product Manager",
  summary: "Led roadmap, ran A/B tests, owned OKRs.",
  yearsExperience: 7,
  seniorityLevel: "Senior",
  topSkills: ["Roadmap", "Prioritization"],
  keyAchievements: [],
  industries: [],
  interviewStrengths: [],
  interviewGaps: [],
  careerTrajectory: "",
};

describe("CoveragePanel", () => {
  it("renders the role-specific tile when targetRole is recognised", () => {
    render(<CoveragePanel profile={baseProfile} targetRole="Senior Product Manager" />);
    // Title-cased slug label
    expect(screen.getByText("Product Manager")).toBeTruthy();
    // Role coverage % chip
    expect(screen.getByText(/% coverage$/)).toBeTruthy();
  });

  it("shows the CTA when targetRole is missing", () => {
    render(<CoveragePanel profile={baseProfile} targetRole={null} />);
    expect(screen.getByText(/Set your/i)).toBeTruthy();
    expect(screen.getByText(/target role/i)).toBeTruthy();
  });

  it("does not show the CTA when a recognised role is set", () => {
    render(<CoveragePanel profile={baseProfile} targetRole="Software Engineer" />);
    expect(screen.queryByText(/Set your/)).toBeNull();
  });

  it("always renders the four interview-type tiles", () => {
    render(<CoveragePanel profile={baseProfile} targetRole={null} />);
    expect(screen.getByText("Behavioral")).toBeTruthy();
    expect(screen.getByText("Technical")).toBeTruthy();
    expect(screen.getByText("System Design")).toBeTruthy();
    expect(screen.getByText("Case")).toBeTruthy();
  });
});

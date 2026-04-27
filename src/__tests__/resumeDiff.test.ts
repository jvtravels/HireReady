import { describe, it, expect } from "vitest";
import { computeResumeDiff } from "../resumeDiff";
import type { ResumeProfile } from "../dashboardData";

const base: ResumeProfile = {
  headline: "Software engineer",
  summary: "Builds things",
  yearsExperience: 5,
  seniorityLevel: "Senior",
  topSkills: ["TypeScript", "React"],
  keyAchievements: ["Shipped feature A"],
  industries: ["SaaS"],
  interviewStrengths: [],
  interviewGaps: [],
  careerTrajectory: "",
  resumeScore: 70,
  improvements: [],
};

describe("computeResumeDiff", () => {
  it("flags isUnchanged when both inputs are identical", () => {
    const d = computeResumeDiff(base, base);
    expect(d.isUnchanged).toBe(true);
    expect(d.scoreDelta).toBe(0);
    expect(d.addedSkills).toEqual([]);
    expect(d.removedSkills).toEqual([]);
  });

  it("computes added/removed skills via case-insensitive set diff", () => {
    const next: ResumeProfile = { ...base, topSkills: ["typescript", "Node"] };
    const d = computeResumeDiff(base, next);
    expect(d.addedSkills).toEqual(["Node"]);
    expect(d.removedSkills).toEqual(["React"]);
    expect(d.isUnchanged).toBe(false);
  });

  it("computes score delta", () => {
    const next: ResumeProfile = { ...base, resumeScore: 82 };
    const d = computeResumeDiff(base, next);
    expect(d.scoreDelta).toBe(12);
  });

  it("returns null score delta when either side lacks a score", () => {
    const noScore: ResumeProfile = { ...base, resumeScore: undefined };
    const d = computeResumeDiff(noScore, base);
    expect(d.scoreDelta).toBeNull();
  });

  it("flags headline + summary changes", () => {
    const next: ResumeProfile = { ...base, headline: "Senior engineer", summary: "Now writes things too" };
    const d = computeResumeDiff(base, next);
    expect(d.headlineChanged).toBe(true);
    expect(d.summaryChanged).toBe(true);
  });

  it("tolerates null/undefined inputs", () => {
    const d1 = computeResumeDiff(null, base);
    expect(d1.addedSkills.length).toBeGreaterThan(0);
    const d2 = computeResumeDiff(base, undefined);
    expect(d2.removedSkills.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { computeResumeFitness, computeAllFitness } from "../resumeFitness";
import type { ResumeProfile } from "../dashboardData";

const baseProfile: ResumeProfile = {
  headline: "Software engineer",
  summary: "",
  yearsExperience: 0,
  seniorityLevel: "",
  topSkills: [],
  keyAchievements: [],
  industries: [],
  interviewStrengths: [],
  interviewGaps: [],
  careerTrajectory: "",
};

describe("computeResumeFitness", () => {
  it("scores an empty profile as 'low'", () => {
    const result = computeResumeFitness(baseProfile, "technical");
    expect(result.score).toBeLessThan(40);
    expect(result.band).toBe("low");
  });

  it("rewards technical signal terms for technical interviews", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      topSkills: ["TypeScript", "React", "Node", "AWS", "Kubernetes", "PostgreSQL", "Redis", "GraphQL"],
      yearsExperience: 6,
    };
    const result = computeResumeFitness(profile, "technical");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(["good", "excellent"]).toContain(result.band);
  });

  it("rewards leadership verbs for behavioral interviews", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: "Led cross-functional teams. Mentored junior engineers. Drove stakeholder alignment.",
      keyAchievements: ["Managed 8-person team", "Owned platform delivery", "Influenced roadmap"],
      seniorityLevel: "Staff",
      yearsExperience: 8,
    };
    const result = computeResumeFitness(profile, "behavioral");
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it("rewards quantified achievements", () => {
    const withMetrics: ResumeProfile = {
      ...baseProfile,
      topSkills: ["Python", "AWS"],
      keyAchievements: [
        "Reduced latency by 40%",
        "Scaled to 1M users",
        "Cut infra cost by $200k",
        "10x throughput improvement",
        "Mentored 5 engineers",
      ],
      yearsExperience: 5,
    };
    const withoutMetrics: ResumeProfile = {
      ...withMetrics,
      keyAchievements: ["Reduced latency", "Scaled the system", "Cut cost", "Improved throughput", "Mentored team"],
    };
    const a = computeResumeFitness(withMetrics, "technical").score;
    const b = computeResumeFitness(withoutMetrics, "technical").score;
    expect(a).toBeGreaterThan(b);
  });

  it("does not match partial words (whole-word boundary)", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      // "google" contains "go" and "reactive" contains "react" — neither
      // should count as the technical signals "go" or "react".
      topSkills: ["Google", "Reactive systems"],
    };
    const technical = computeResumeFitness(profile, "technical");
    // Score should be very low — no real technical signal terms
    expect(technical.score).toBeLessThan(20);
  });

  it("clamps score to [0,100]", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: SIGNAL_DENSE_SUMMARY,
      topSkills: ["TypeScript", "React", "Node", "AWS", "Kubernetes", "PostgreSQL", "Redis", "GraphQL", "Docker", "GCP"],
      keyAchievements: [
        "Reduced latency by 40%",
        "Scaled to 1M users",
        "Cut infra cost by $200k",
        "10x throughput improvement",
        "Owned 5 services",
      ],
      seniorityLevel: "Principal",
      yearsExperience: 15,
    };
    const result = computeResumeFitness(profile, "technical");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("includes interview-type label in rationale", () => {
    const result = computeResumeFitness(baseProfile, "system_design");
    expect(result.rationale.toLowerCase()).toContain("system design");
  });
});

describe("computeAllFitness", () => {
  it("returns one score per interview type", () => {
    const all = computeAllFitness(baseProfile);
    expect(Object.keys(all).sort()).toEqual(["behavioral", "case", "system_design", "technical"]);
    for (const key of ["behavioral", "case", "system_design", "technical"] as const) {
      expect(typeof all[key].score).toBe("number");
      expect(typeof all[key].rationale).toBe("string");
    }
  });
});

const SIGNAL_DENSE_SUMMARY =
  "Led architecture for distributed microservices platform. Designed for scalability, " +
  "low latency, and high availability. Built CI/CD pipelines, mentored teams, drove " +
  "delivery across cross-functional stakeholders. TypeScript, Node, Kubernetes, AWS.";

import { describe, it, expect } from "vitest";
import { reconcileResumeAgainstRole, reconcileForTargetRole, labelForRoleSlug } from "../skillReconcile";
import type { ResumeProfile } from "../dashboardData";

const baseProfile: ResumeProfile = {
  headline: "Software engineer",
  summary: "",
  yearsExperience: 5,
  seniorityLevel: "Senior",
  topSkills: [],
  keyAchievements: [],
  industries: [],
  interviewStrengths: [],
  interviewGaps: [],
  careerTrajectory: "",
};

describe("reconcileResumeAgainstRole", () => {
  it("returns empty matched + full missing for an empty profile", () => {
    const r = reconcileResumeAgainstRole(baseProfile, "technical");
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.coveragePct).toBe(0);
    expect(r.topGaps.length).toBeGreaterThan(0);
    expect(r.topGaps.length).toBeLessThanOrEqual(6);
  });

  it("matches whole-word, case-insensitive", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      topSkills: ["TypeScript", "PostgreSQL"],
      summary: "Built REST APIs with Node and Redis caching.",
    };
    const r = reconcileResumeAgainstRole(profile, "technical");
    expect(r.matched).toEqual(expect.arrayContaining(["typescript", "node", "redis", "rest", "postgresql"]));
    // "go" must NOT match because we have whole-word boundaries
    expect(r.matched).not.toContain("go");
  });

  it("computes coveragePct relative to vocab size", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: "Led cross-functional teams. Mentored juniors. Drove delivery.",
    };
    const r = reconcileResumeAgainstRole(profile, "behavioral");
    expect(r.coveragePct).toBeGreaterThan(0);
    expect(r.coveragePct).toBeLessThanOrEqual(100);
  });

  it("reconcileForTargetRole returns null for unknown roles", () => {
    expect(reconcileForTargetRole(baseProfile, null)).toBeNull();
    expect(reconcileForTargetRole(baseProfile, "")).toBeNull();
    expect(reconcileForTargetRole(baseProfile, "Underwater Basket Weaver")).toBeNull();
  });

  it("reconcileForTargetRole maps fuzzy role titles to slugs", () => {
    const r1 = reconcileForTargetRole(baseProfile, "Senior Product Manager");
    expect(r1?.roleSlug).toBe("product-manager");
    const r2 = reconcileForTargetRole(baseProfile, "Software Engineer III");
    expect(r2?.roleSlug).toBe("software-engineer");
    const r3 = reconcileForTargetRole(baseProfile, "UX Designer");
    expect(r3?.roleSlug).toBe("designer");
  });

  it("reconcileForTargetRole computes coverage against role vocab", () => {
    const designer: ResumeProfile = {
      ...baseProfile,
      summary: "Built design systems and ran user research with Figma.",
      topSkills: ["Figma", "Prototyping", "Wireframes"],
    };
    const r = reconcileForTargetRole(designer, "Product Designer");
    expect(r).not.toBeNull();
    expect(r!.result.matched).toEqual(expect.arrayContaining(["figma", "wireframes", "user research"]));
    expect(r!.result.coveragePct).toBeGreaterThan(0);
  });

  it("labelForRoleSlug formats slug into Title Case", () => {
    expect(labelForRoleSlug("product-manager")).toBe("Product Manager");
    expect(labelForRoleSlug("software-engineer")).toBe("Software Engineer");
  });

  it("topGaps are missing terms (not matched)", () => {
    const profile: ResumeProfile = {
      ...baseProfile,
      summary: "Architecture for distributed scalability — kafka queues.",
    };
    const r = reconcileResumeAgainstRole(profile, "system_design");
    for (const gap of r.topGaps) {
      expect(r.matched).not.toContain(gap);
    }
  });
});

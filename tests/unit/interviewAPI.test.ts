import { describe, it, expect } from "vitest";
import { getAdaptiveHints } from "../../src/interviewAPI";

type SessionInput = Parameters<typeof getAdaptiveHints>[0][number];

function makeSession(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    skill_scores: null,
    questions: 3,
    type: "behavioral",
    date: new Date().toISOString(),
    ...overrides,
  };
}

describe("getAdaptiveHints", () => {
  it("returns empty arrays for empty sessions", () => {
    const result = getAdaptiveHints([]);
    expect(result.weakSkills).toEqual([]);
    expect(result.pastTopics).toEqual([]);
    expect(result.suggestedFocus).toBeUndefined();
  });

  it("returns empty arrays for undefined sessions", () => {
    // @ts-expect-error testing undefined input
    const result = getAdaptiveHints(undefined);
    expect(result.weakSkills).toEqual([]);
    expect(result.pastTopics).toEqual([]);
  });

  it("identifies weak skills (avg < 70)", () => {
    const sessions = [
      makeSession({ skill_scores: { communication: 60, leadership: 80 } }),
      makeSession({ skill_scores: { communication: 50, leadership: 75 } }),
    ];
    const result = getAdaptiveHints(sessions);
    expect(result.weakSkills).toContain("communication");
    // leadership avg = 77.5, so it should NOT be weak
    expect(result.weakSkills).not.toContain("leadership");
  });

  it("merges JD missing skills into weak skills", () => {
    const sessions = [
      makeSession({ skill_scores: { communication: 60 } }),
    ];
    const result = getAdaptiveHints(sessions, ["kubernetes", "terraform"]);
    expect(result.weakSkills).toContain("communication");
    expect(result.weakSkills).toContain("kubernetes");
    expect(result.weakSkills).toContain("terraform");
  });

  it("does not duplicate JD missing skills already in weak skills", () => {
    const sessions = [
      makeSession({ skill_scores: { kubernetes: 40 } }),
    ];
    const result = getAdaptiveHints(sessions, ["kubernetes"]);
    const kubernetesCount = result.weakSkills.filter(
      (s) => s === "kubernetes",
    ).length;
    expect(kubernetesCount).toBe(1);
  });

  it("returns past topics from session types", () => {
    const sessions = [
      makeSession({ type: "behavioral" }),
      makeSession({ type: "technical" }),
      makeSession({ type: "behavioral" }),
    ];
    const result = getAdaptiveHints(sessions);
    expect(result.pastTopics).toContain("behavioral");
    expect(result.pastTopics).toContain("technical");
    // No duplicates
    expect(result.pastTopics.length).toBe(2);
  });

  it("handles sessions with null skill_scores", () => {
    const sessions = [
      makeSession({ skill_scores: null }),
      makeSession({ skill_scores: undefined }),
      makeSession({ skill_scores: { leadership: 50 } }),
    ];
    const result = getAdaptiveHints(sessions);
    expect(result.weakSkills).toContain("leadership");
  });

  it("handles nested score objects { score: number }", () => {
    const sessions = [
      makeSession({
        skill_scores: {
          communication: { score: 45 } as unknown,
          leadership: { score: 90 } as unknown,
        },
      }),
    ];
    const result = getAdaptiveHints(sessions);
    expect(result.weakSkills).toContain("communication");
  });

  it("prioritizes stale skills (not tested recently)", () => {
    // Create sessions where skill A appears early (stale) and skill B appears later (recent)
    const sessions: SessionInput[] = [];
    // Index 0 (most recent): only skill B
    sessions.push(makeSession({ skill_scores: { skillB: 65 } }));
    // Indices 1-6: padding sessions with no scores
    for (let i = 0; i < 6; i++) {
      sessions.push(makeSession({ skill_scores: null }));
    }
    // Index 7 (stale): only skill A
    sessions.push(makeSession({ skill_scores: { skillA: 65 } }));

    const result = getAdaptiveHints(sessions);
    // Both are weak (< 70), but skillA is stale (lastSeen = 7 > 5)
    // so it should have higher priority and appear first or at least be present
    expect(result.weakSkills).toContain("skillA");
    expect(result.weakSkills).toContain("skillB");
    // skillA should come before skillB due to recency boost
    const idxA = result.weakSkills.indexOf("skillA");
    const idxB = result.weakSkills.indexOf("skillB");
    expect(idxA).toBeLessThan(idxB);
  });

  it("suggestedFocus returns highest priority weak skill", () => {
    const sessions = [
      makeSession({ skill_scores: { easySkill: 90, hardSkill: 30 } }),
    ];
    const result = getAdaptiveHints(sessions);
    expect(result.suggestedFocus).toBe("hardSkill");
  });

  it("suggestedFocus falls back to first JD missing skill when no weak skills", () => {
    const sessions = [
      makeSession({ skill_scores: { leadership: 95 } }),
    ];
    const result = getAdaptiveHints(sessions, ["docker"]);
    // leadership is strong (95), so no weak skills from sessions
    // suggestedFocus should be undefined or "docker" depending on whether leadership > 70 and lastSeen <= 5
    // leadership avg=95 and lastSeen=0, so it's not weak. suggestedFocus = jdMissingSkills[0] = "docker"
    expect(result.suggestedFocus).toBe("docker");
  });

  it("limits pastTopics to 10", () => {
    const types = Array.from({ length: 15 }, (_, i) => `type-${i}`);
    const sessions = types.map((t) => makeSession({ type: t }));
    const result = getAdaptiveHints(sessions);
    expect(result.pastTopics.length).toBeLessThanOrEqual(10);
  });

  it("only considers the 20 most recent sessions", () => {
    const sessions: SessionInput[] = [];
    // 25 sessions, but only first 20 should be considered
    for (let i = 0; i < 25; i++) {
      sessions.push(
        makeSession({
          skill_scores: { skill: i < 20 ? 80 : 30 },
          type: `type-${i}`,
        }),
      );
    }
    const result = getAdaptiveHints(sessions);
    // Sessions 20-24 (with score 30) are outside the window, so skill avg = 80 (not weak)
    expect(result.weakSkills).not.toContain("skill");
  });
});

import { describe, it, expect } from "vitest";
import { pickNextMove } from "../nextMove";

/**
 * Tests for the Dashboard "Your next move" CTA decision tree. Covers the
 * exact logic users see at the top of /dashboard: which skill to practice,
 * which CTA to show, and which context chips render. Prior to this, the
 * whole tree lived in inline JSX and was untested — a threshold-off-by-one
 * (score < 70 vs <= 70) would have silently changed who sees a weakness nudge.
 */

describe("pickNextMove", () => {
  describe("weakest-skill selection", () => {
    it("picks the lowest-scoring skill below 70 as the practice target", () => {
      const out = pickNextMove({
        skills: [
          { name: "Communication", score: 55 },
          { name: "Structure",     score: 65 },
          { name: "Technical",     score: 80 },
        ],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.weakestSkillName).toBe("Communication");
      expect(out.ctaLabel).toBe("Practice Communication");
      expect(out.ctaHref).toBe("/session/new?focus=Communication");
    });

    it("returns null when every skill is ≥ 70 (user doesn't need weakness nudge)", () => {
      const out = pickNextMove({
        skills: [
          { name: "Communication", score: 80 },
          { name: "Structure",     score: 75 },
        ],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.weakestSkillName).toBe(null);
    });

    it("70 is NOT a weakness (strict less-than) — regression guard for threshold drift", () => {
      const out = pickNextMove({
        skills: [{ name: "Edge", score: 70 }],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.weakestSkillName).toBe(null);
    });

    it("69 IS a weakness", () => {
      const out = pickNextMove({
        skills: [{ name: "Edge", score: 69 }],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.weakestSkillName).toBe("Edge");
    });

    it("empty skills list → no weakness", () => {
      const out = pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 0 });
      expect(out.weakestSkillName).toBe(null);
    });

    it("URL-encodes skill names with spaces or special chars", () => {
      const out = pickNextMove({
        skills: [{ name: "Problem Solving", score: 50 }],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.ctaHref).toBe("/session/new?focus=Problem%20Solving");
    });
  });

  describe("CTA fallback when no weakness", () => {
    it("active streak → 'Keep the streak going'", () => {
      const out = pickNextMove({ skills: [], currentStreak: 5, sessionCredits: 0 });
      expect(out.ctaLabel).toBe("Keep the streak going");
      expect(out.ctaHref).toBe("/session/new");
    });

    it("no streak, no weakness → 'Start a session'", () => {
      const out = pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 0 });
      expect(out.ctaLabel).toBe("Start a session");
    });

    it("weakness wins over streak CTA (weakness is higher-leverage)", () => {
      const out = pickNextMove({
        skills: [{ name: "Communication", score: 40 }],
        currentStreak: 10,
        sessionCredits: 0,
      });
      expect(out.ctaLabel).toBe("Practice Communication");
    });
  });

  describe("streak milestones", () => {
    it("below 7 → next milestone is 7", () => {
      expect(pickNextMove({ skills: [], currentStreak: 3, sessionCredits: 0 }).nextStreakMilestone).toBe(7);
    });

    it("7..13 → next milestone is 14", () => {
      expect(pickNextMove({ skills: [], currentStreak: 7, sessionCredits: 0 }).nextStreakMilestone).toBe(14);
      expect(pickNextMove({ skills: [], currentStreak: 13, sessionCredits: 0 }).nextStreakMilestone).toBe(14);
    });

    it("14..29 → next milestone is 30", () => {
      expect(pickNextMove({ skills: [], currentStreak: 14, sessionCredits: 0 }).nextStreakMilestone).toBe(30);
      expect(pickNextMove({ skills: [], currentStreak: 29, sessionCredits: 0 }).nextStreakMilestone).toBe(30);
    });

    it("≥30 → no next milestone (user is past top tier)", () => {
      expect(pickNextMove({ skills: [], currentStreak: 30, sessionCredits: 0 }).nextStreakMilestone).toBe(null);
      expect(pickNextMove({ skills: [], currentStreak: 100, sessionCredits: 0 }).nextStreakMilestone).toBe(null);
    });
  });

  describe("chips", () => {
    it("no streak, no credits, no schedule → no chips", () => {
      const out = pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 0 });
      expect(out.chips).toEqual([]);
    });

    it("active streak → chip includes days-to-next-milestone", () => {
      const out = pickNextMove({ skills: [], currentStreak: 3, sessionCredits: 0 });
      const streakChip = out.chips.find(c => c.kind === "streak");
      expect(streakChip?.label).toBe("3-day streak · 4 to +1 bonus");
    });

    it("streak past all milestones → chip shows only days, no bonus hint", () => {
      const out = pickNextMove({ skills: [], currentStreak: 45, sessionCredits: 0 });
      const streakChip = out.chips.find(c => c.kind === "streak");
      expect(streakChip?.label).toBe("45-day streak");
    });

    it("credits chip pluralises correctly", () => {
      expect(pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 1 })
        .chips.find(c => c.kind === "credits")?.label)
        .toBe("1 bonus session");
      expect(pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 3 })
        .chips.find(c => c.kind === "credits")?.label)
        .toBe("3 bonus sessions");
    });

    it("zero credits → no credits chip (avoids '0 bonus sessions' clutter)", () => {
      const out = pickNextMove({ skills: [], currentStreak: 0, sessionCredits: 0 });
      expect(out.chips.find(c => c.kind === "credits")).toBeUndefined();
    });

    it("schedule chip renders when smartSchedule is truthy", () => {
      const out = pickNextMove({
        skills: [],
        currentStreak: 0,
        sessionCredits: 0,
        smartSchedule: "You practice best in the morning.",
      });
      expect(out.chips.find(c => c.kind === "schedule")?.label).toBe("You practice best in the morning.");
    });

    it("truncates long schedule labels to fit on one row", () => {
      const long = "This is a very long smart-schedule suggestion that would wrap the card on mobile and ruin the compact look we want";
      const out = pickNextMove({
        skills: [],
        currentStreak: 0,
        sessionCredits: 0,
        smartSchedule: long,
      });
      const chip = out.chips.find(c => c.kind === "schedule")!;
      expect(chip.label.length).toBeLessThanOrEqual(48);
      expect(chip.label.endsWith("…")).toBe(true);
    });

    it("chip order is streak → credits → schedule", () => {
      const out = pickNextMove({
        skills: [],
        currentStreak: 5,
        sessionCredits: 2,
        smartSchedule: "Mornings",
      });
      expect(out.chips.map(c => c.kind)).toEqual(["streak", "credits", "schedule"]);
    });
  });

  describe("headline", () => {
    it("weakness → weakness-specific headline", () => {
      const out = pickNextMove({
        skills: [{ name: "Structure", score: 45 }],
        currentStreak: 0,
        sessionCredits: 0,
      });
      expect(out.headline).toContain("Structure");
      expect(out.headline).toContain("highest-leverage");
    });

    it("no weakness, streak ≥ 3 → streak-specific headline", () => {
      const out = pickNextMove({ skills: [], currentStreak: 5, sessionCredits: 0 });
      expect(out.headline).toContain("5-day streak");
    });

    it("no weakness, streak < 3 → generic welcome-back", () => {
      const out = pickNextMove({ skills: [], currentStreak: 1, sessionCredits: 0 });
      expect(out.headline).toBe("Pick up where you left off.");
    });
  });
});

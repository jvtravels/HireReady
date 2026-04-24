import { describe, it, expect } from "vitest";
import {
  computeCurrentStreak,
  pickStreakMilestone,
} from "../../server-handlers/_streak-reward";

/**
 * Unit tests for the streak-milestone logic in save-session.ts.
 *
 * The math is load-bearing — it determines when free users earn their
 * bonus sessions. A bug here means either missing rewards (user churn)
 * or double-granting (abuse). Both failure modes are invisible because
 * the client only shows a toast; the DB writes happen server-side.
 */

const DAY_MS = 86400000;

function isoOnDay(base: Date, dayOffset: number): string {
  return new Date(base.getTime() - dayOffset * DAY_MS).toISOString();
}

describe("computeCurrentStreak", () => {
  const today = new Date("2026-04-24T14:00:00Z");

  it("empty list → 0", () => {
    expect(computeCurrentStreak([], today)).toBe(0);
  });

  it("single session today → 1", () => {
    expect(computeCurrentStreak([today.toISOString()], today)).toBe(1);
  });

  it("consecutive days 0..6 → streak 7", () => {
    const ts = [0, 1, 2, 3, 4, 5, 6].map(d => isoOnDay(today, d));
    expect(computeCurrentStreak(ts, today)).toBe(7);
  });

  it("gap on day 3 breaks streak at 3", () => {
    // Today, yesterday, 2-days-ago — then day 3 missing.
    const ts = [0, 1, 2, 4, 5].map(d => isoOnDay(today, d));
    expect(computeCurrentStreak(ts, today)).toBe(3);
  });

  it("no session today but yesterday → 0", () => {
    const ts = [isoOnDay(today, 1)];
    expect(computeCurrentStreak(ts, today)).toBe(0);
  });

  it("multiple sessions on the same day count as 1 day", () => {
    const morning = new Date(today.getTime() - 6 * 3600000).toISOString();
    const evening = today.toISOString();
    expect(computeCurrentStreak([morning, evening], today)).toBe(1);
  });

  it("invalid timestamps are ignored, not errors", () => {
    const ts = [today.toISOString(), "not-a-date", "", "2026-13-99"];
    expect(computeCurrentStreak(ts, today)).toBe(1);
  });

  it("stops at 400-day cap even with an infinite run", () => {
    // 405 consecutive days of practice back from today.
    const ts = Array.from({ length: 405 }, (_, i) => isoOnDay(today, i));
    expect(computeCurrentStreak(ts, today)).toBe(400);
  });

  it("handles timestamps out of order", () => {
    const ts = [isoOnDay(today, 2), isoOnDay(today, 0), isoOnDay(today, 1)];
    expect(computeCurrentStreak(ts, today)).toBe(3);
  });
});

describe("pickStreakMilestone", () => {
  it("below 7 days → 0", () => {
    for (let s = 0; s < 7; s++) expect(pickStreakMilestone(s, 0)).toBe(0);
  });

  it("exactly 7 days, never rewarded → 7", () => {
    expect(pickStreakMilestone(7, 0)).toBe(7);
  });

  it("8 days after already rewarded at 7 → 0 (no double-grant)", () => {
    expect(pickStreakMilestone(8, 7)).toBe(0);
  });

  it("14 days after rewarded at 7 → 14 (upgrade tier)", () => {
    expect(pickStreakMilestone(14, 7)).toBe(14);
  });

  it("prefers highest available milestone when multiple unlocked at once", () => {
    // If lastRewardDay is 0 and streak jumps to 30 (fresh account), award
    // 30 directly — we don't replay 7 then 14 then 30.
    expect(pickStreakMilestone(30, 0)).toBe(30);
    expect(pickStreakMilestone(45, 0)).toBe(30);
  });

  it("30 days after 14 → 30", () => {
    expect(pickStreakMilestone(30, 14)).toBe(30);
  });

  it("already at 30 → never rewards again", () => {
    for (let s = 30; s < 400; s++) {
      expect(pickStreakMilestone(s, 30)).toBe(0);
    }
  });

  it("broken-then-rebuilt streak does not re-reward lower tiers", () => {
    // User hit 7-day (rewarded 7), broke streak, rebuilt to 8 days.
    // lastRewardDay=7, streakDays=8 → should NOT re-reward 7.
    expect(pickStreakMilestone(8, 7)).toBe(0);
    // Hits 14 later → reward 14.
    expect(pickStreakMilestone(14, 7)).toBe(14);
  });
});

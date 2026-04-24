/**
 * Streak milestone reward logic. Extracted from save-session.ts so the
 * math is unit-testable without spinning up the full Supabase round-trip.
 *
 * Given the user's full practice_timestamps list (after appending the new
 * session) and the highest milestone they've already been rewarded for,
 * returns the milestone to award now — or 0 if none.
 *
 * Rules:
 * - Streak = count of consecutive days up to and including today that have
 *   at least one practice timestamp.
 * - Eligible milestones: 7, 14, 30 (longest first so we skip-ahead).
 * - A milestone is awarded iff streakDays >= milestone AND lastRewardDay < milestone.
 * - This guarantees a broken-and-rebuilt streak doesn't re-reward the same tier.
 */

/** Compute the current streak length (in consecutive days up through today)
    from a list of ISO-8601 practice timestamps. Invalid timestamps are skipped. */
export function computeCurrentStreak(
  practiceIsoTimestamps: string[],
  now: Date = new Date(),
): number {
  const daySet = new Set<string>();
  for (const iso of practiceIsoTimestamps) {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) continue;
    daySet.add(d.toISOString().slice(0, 10));
  }
  let streakDays = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    if (daySet.has(key)) streakDays++;
    else break;
  }
  return streakDays;
}

/** Given current streak and the highest milestone already rewarded, returns
    the milestone to award now, or 0 if none. */
export function pickStreakMilestone(streakDays: number, lastRewardDay: number): number {
  const milestones = [30, 14, 7];
  for (const m of milestones) {
    if (streakDays >= m && lastRewardDay < m) return m;
  }
  return 0;
}

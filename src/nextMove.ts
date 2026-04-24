/**
 * Pure logic for the Dashboard "Your next move" CTA card (DashboardHome.tsx).
 *
 * Given the user's skills + streak + credits, decide:
 *   - Which skill (if any) is the highest-leverage practice target
 *   - Which headline to show
 *   - Which label + URL to use on the primary CTA
 *   - Which context chips to render
 *
 * Extracted from inline JSX so the decision tree has unit tests. Was
 * previously untested; a typo in the threshold (e.g. <70 vs <= 70) means
 * users with exactly-70 skills would get no weakness-specific nudge.
 */

export interface SkillLike {
  name: string;
  score: number;
}

export interface NextMoveInput {
  skills: SkillLike[];
  currentStreak: number;
  sessionCredits: number;
  smartSchedule?: string | null;
}

export interface NextMoveChip {
  kind: "streak" | "credits" | "schedule";
  label: string;
}

export interface NextMove {
  /** Weakest skill name — null when no skill is below the practice threshold */
  weakestSkillName: string | null;
  /** Hero copy for the card */
  headline: string;
  /** CTA button text */
  ctaLabel: string;
  /** CTA deep link into the session-setup flow */
  ctaHref: string;
  /** Context chips (rendered only when meaningful) */
  chips: NextMoveChip[];
  /** Milestone the user is still chasing, or null when past 30 days */
  nextStreakMilestone: number | null;
}

/** Threshold below which a skill is flagged as the practice target. */
const PRACTICE_THRESHOLD = 70;

/** Cap chip label length for the schedule chip so the card stays single-row on desktop. */
const CHIP_MAX = 48;

export function pickNextMove(input: NextMoveInput): NextMove {
  const { skills, currentStreak, sessionCredits, smartSchedule } = input;

  // Lowest-scoring skill under the threshold is the highest-leverage target.
  // Ties broken by input order (stable sort).
  const weakestSkillName = (() => {
    if (!skills || skills.length === 0) return null;
    const sorted = [...skills].sort((a, b) => a.score - b.score);
    const low = sorted[0];
    return low && low.score < PRACTICE_THRESHOLD ? low.name : null;
  })();

  // Highest unmet milestone among 7/14/30. null once past 30.
  const nextStreakMilestone =
    currentStreak < 7 ? 7 :
    currentStreak < 14 ? 14 :
    currentStreak < 30 ? 30 :
    null;

  const daysToNext = nextStreakMilestone ? nextStreakMilestone - currentStreak : 0;

  const ctaLabel = weakestSkillName
    ? `Practice ${weakestSkillName}`
    : currentStreak > 0
      ? "Keep the streak going"
      : "Start a session";
  const ctaHref = weakestSkillName
    ? `/session/new?focus=${encodeURIComponent(weakestSkillName)}`
    : "/session/new";

  const headline = weakestSkillName
    ? `Your ${weakestSkillName} is the highest-leverage thing to practice today.`
    : currentStreak >= 3
      ? `You're on a ${currentStreak}-day streak — don't break it.`
      : "Pick up where you left off.";

  const chips: NextMoveChip[] = [];
  if (currentStreak > 0) {
    chips.push({
      kind: "streak",
      label: nextStreakMilestone
        ? `${currentStreak}-day streak · ${daysToNext} to +1 bonus`
        : `${currentStreak}-day streak`,
    });
  }
  if (sessionCredits > 0) {
    chips.push({
      kind: "credits",
      label: `${sessionCredits} bonus session${sessionCredits !== 1 ? "s" : ""}`,
    });
  }
  if (smartSchedule) {
    const short = smartSchedule.length > CHIP_MAX ? `${smartSchedule.slice(0, CHIP_MAX - 3)}…` : smartSchedule;
    chips.push({ kind: "schedule", label: short });
  }

  return {
    weakestSkillName,
    headline,
    ctaLabel,
    ctaHref,
    chips,
    nextStreakMilestone,
  };
}

/**
 * Mobile haptic feedback patterns. Thin wrapper around navigator.vibrate
 * so call sites read as intent ("haptic.success()") rather than
 * ("navigator.vibrate?.([50, 10, 50])"). Zero-cost fallback on platforms
 * without the Vibration API (iOS Safari — Apple doesn't expose vibration
 * to web, so these are no-ops there).
 *
 * Respects prefers-reduced-motion — users who turned that on don't want
 * buzzing either.
 */

function canVibrate(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return false;
    }
  } catch { /* noop */ }
  return true;
}

function vibrate(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try { navigator.vibrate(pattern); } catch { /* noop */ }
}

export const haptic = {
  /** 8ms pulse — low-level UI feedback (tap confirmation). */
  tap: () => vibrate(8),

  /** Turn change / phase transition (AI started speaking, user's turn starts). */
  turn: () => vibrate(30),

  /** Session end / submission confirmation. */
  completion: () => vibrate([40, 30, 40]),

  /** Two-pulse success (reward granted, milestone hit). */
  success: () => vibrate([20, 40, 20]),

  /** Long buzz for errors / failures. */
  error: () => vibrate([200]),

  /** Warning pattern — action that needs user attention but isn't an error. */
  warning: () => vibrate([40, 40, 40]),
};

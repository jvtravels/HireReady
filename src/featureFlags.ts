/* ─── Feature Flags / A/B Testing ─── */
/* Lightweight, zero-dependency feature flag system with percentage rollout,
   localStorage overrides for dev/QA, and browser console access via window.__FF */

export interface FeatureFlag {
  /** Flag name */
  name: string;
  /** Is this flag enabled? */
  enabled: boolean;
  /** Optional: percentage rollout (0-100). If set, flag is enabled for this % of users based on userId hash */
  rolloutPercent?: number;
  /** Optional: description for documentation */
  description?: string;
}

/**
 * Runtime feature flags. Register new flags here and check with
 * `isEnabled(flagName, user?.id)` at the call site.
 *
 * Declared flags must have a real consumer — unused entries rot and confuse
 * future readers into thinking a feature exists when it doesn't. Previous
 * entries (RESUME_GAP_COACHING, TRANSCRIPT_EDIT, SUPPORT_WIDGET,
 * DARK_LIGHT_TOGGLE, REFERRAL_DASHBOARD, VIDEO_PLAYBACK) were removed — all
 * six were declared but never checked in any component, so they only served
 * to suggest unreleased features that didn't exist. Re-add when shipping.
 */
export const FLAGS: Record<string, FeatureFlag> = {};

/* ─── Hash for percentage rollout ─── */
/* FNV-1a 32-bit hash mod 100 — fast, well-distributed, deterministic */
function hashPercent(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
  }
  return hash % 100;
}

const LS_PREFIX = "hirestepx_ff_";

/* ─── Helpers ─── */

/**
 * Check if a flag is enabled.
 * Priority: localStorage override > rolloutPercent (if userId provided) > static enabled value.
 */
export function isEnabled(flagName: string, userId?: string): boolean {
  /* localStorage override always wins */
  try {
    const override = localStorage.getItem(`${LS_PREFIX}${flagName}`);
    if (override !== null) return override === "true";
  } catch { /* SSR / restricted context — ignore */ }

  const flag = FLAGS[flagName];
  if (!flag) return false;

  /* Percentage rollout */
  if (flag.rolloutPercent != null && userId) {
    return hashPercent(userId + flagName) < flag.rolloutPercent;
  }

  return flag.enabled;
}

/** Returns names of all currently-enabled flags (no userId context). */
export function getEnabledFlags(): string[] {
  return Object.keys(FLAGS).filter((k) => isEnabled(k));
}

/**
 * Store a flag override in localStorage for dev/QA testing.
 * Overrides always take precedence over static config and rollout.
 */
export function overrideFlag(flagName: string, enabled: boolean): void {
  try {
    localStorage.setItem(`${LS_PREFIX}${flagName}`, String(enabled));
  } catch { /* restricted context */ }
}

/** Remove all localStorage flag overrides. */
export function clearOverrides(): void {
  try {
    Object.keys(FLAGS).forEach((k) => localStorage.removeItem(`${LS_PREFIX}${k}`));
  } catch { /* restricted context */ }
}

/* ─── Browser console access ─── */
/* Devs can open the console and use:
     window.__FF.overrideFlag('EXAMPLE_FLAG', true)
     window.__FF.isEnabled('EXAMPLE_FLAG')
     window.__FF.getEnabledFlags()
     window.__FF.clearOverrides()
     window.__FF.FLAGS                                  */

declare global {
  interface Window {
    __FF?: {
      isEnabled: typeof isEnabled;
      overrideFlag: typeof overrideFlag;
      clearOverrides: typeof clearOverrides;
      getEnabledFlags: typeof getEnabledFlags;
      FLAGS: typeof FLAGS;
    };
  }
}

if (typeof window !== "undefined") {
  window.__FF = { isEnabled, overrideFlag, clearOverrides, getEnabledFlags, FLAGS };
}

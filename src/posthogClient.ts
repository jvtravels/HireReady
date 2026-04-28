/* Client-side PostHog wrapper.
 *
 * - Initialized lazily after cookie consent (see ConsentGatedAnalytics.tsx).
 * - Uses environment vars NEXT_PUBLIC_POSTHOG_KEY + NEXT_PUBLIC_POSTHOG_HOST.
 * - Never throws — analytics must not break the UI.
 * - Exposes capture/identify/reset/getDistinctId/getSessionId helpers used by
 *   AuthContext, signup, interview, and onboarding flows.
 */

import type { PostHog } from "posthog-js";

let _instance: PostHog | null = null;
let _initPromise: Promise<PostHog | null> | null = null;

export function isPostHogReady(): boolean {
  return _instance !== null;
}

export async function initPostHog(): Promise<PostHog | null> {
  if (typeof window === "undefined") return null;
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  const key = (process.env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
  if (!key) return null;

  _initPromise = (async () => {
    try {
      const mod = await import("posthog-js");
      const ph = mod.default;
      ph.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: "history_change",
        capture_exceptions: true,
        person_profiles: "identified_only",
        loaded: () => {
          _instance = ph;
        },
      });
      _instance = ph;
      return ph;
    } catch {
      return null;
    }
  })();

  return _initPromise;
}

type Props = Record<string, string | number | boolean | null | undefined>;

export function captureClientEvent(event: string, properties: Props = {}): void {
  try {
    _instance?.capture(event, properties);
  } catch {
    /* never throw from telemetry */
  }
}

export function identifyClient(distinctId: string, properties: Props = {}): void {
  try {
    _instance?.identify(distinctId, properties);
  } catch {
    /* never throw from telemetry */
  }
}

export function resetClient(): void {
  try {
    _instance?.reset();
  } catch {
    /* never throw from telemetry */
  }
}

export function getDistinctId(): string | undefined {
  try {
    return _instance?.get_distinct_id();
  } catch {
    return undefined;
  }
}

export function getSessionId(): string | undefined {
  try {
    return _instance?.get_session_id?.();
  } catch {
    return undefined;
  }
}

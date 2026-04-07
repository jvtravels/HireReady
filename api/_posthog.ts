/* Shared PostHog Node.js client for Vercel serverless functions */
/* Uses captureImmediate/flush for short-lived serverless environments */

import { PostHog } from "posthog-node";

declare const process: { env: Record<string, string | undefined> };

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || "";
const POSTHOG_HOST = process.env.POSTHOG_HOST || "";

let _client: PostHog | null = null;

export function getPostHog(): PostHog | null {
  if (!POSTHOG_API_KEY) return null;
  if (!_client) {
    try {
      _client = new PostHog(POSTHOG_API_KEY, {
        ...(POSTHOG_HOST ? { host: POSTHOG_HOST } : {}),
        flushAt: 1,
        flushInterval: 0,
      });
    } catch {
      return null;
    }
  }
  return _client;
}

export function captureError(err: unknown, distinctId?: string): void {
  try {
    const ph = getPostHog();
    if (!ph) return;
    ph.capture({
      distinctId: distinctId || "unknown",
      event: "$exception",
      properties: {
        $exception_message: err instanceof Error ? err.message : String(err),
        $exception_stack: err instanceof Error ? err.stack : undefined,
      },
    });
  } catch { /* never crash the caller */ }
}

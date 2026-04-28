/* Server-side PostHog client for Edge + Node serverless handlers.
 *
 * Pattern: singleton instance, immediate-flush mode (flushAt:1, flushInterval:0)
 * because Vercel handlers are short-lived. Every capture should be awaited via
 * captureImmediate / shutdown to ensure the event reaches PostHog before the
 * function exits. Failures are swallowed — analytics must never break a request.
 */

import { PostHog } from "posthog-node";

declare const process: { env: Record<string, string | undefined> };

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (_client) return _client;
  _client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
  return _client;
}

type Props = Record<string, string | number | boolean | null | undefined>;

/** Read a client-side distinct id from request headers, falling back to userId. */
export function distinctIdFrom(req: Request, userId?: string): string {
  const fromHeader = req.headers.get("x-posthog-distinct-id");
  if (fromHeader) return fromHeader;
  if (userId) return userId;
  return "anonymous";
}

/** Capture a server-side event. Fire-and-forget — never throws. */
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Props = {},
  req?: Request
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const sessionId = req?.headers.get("x-posthog-session-id") || undefined;
    await client.captureImmediate({
      distinctId,
      event,
      properties: {
        $session_id: sessionId,
        $process_person_profile: true,
        ...properties,
      },
    });
  } catch {
    /* never throw from telemetry */
  }
}

/** Capture an exception server-side. Fire-and-forget. */
export async function captureServerException(
  err: unknown,
  distinctId: string,
  extra: Props = {}
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.captureExceptionImmediate(err, distinctId, extra);
  } catch {
    /* never throw from telemetry */
  }
}

/** Identify a user with profile properties (server-side). */
export async function identifyServer(
  distinctId: string,
  properties: Props = {}
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.identifyImmediate({ distinctId, properties });
  } catch {
    /* never throw from telemetry */
  }
}

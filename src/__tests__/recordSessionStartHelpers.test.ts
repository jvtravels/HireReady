/* OA-B50: cross-device concurrent session detection.
 *
 * BroadcastChannel only guards same-browser tabs. A user running a session
 * on mobile AND desktop simultaneously consumes double quota with no warning.
 * The server-side guard in record-session-start compares recently-started IDs
 * against the sessions table: any started ID not yet saved AND started
 * recently = in-flight on another device. detectConcurrentSession() is the
 * pure logic for that check.
 *
 * B-EMP1: an unsaved start older than staleAfterMs is treated as abandoned,
 * not concurrent — otherwise a single never-completed session permanently
 * false-flags every later attempt (see production incident, Lean Bogo).
 */
import { describe, it, expect } from "vitest";
import { detectConcurrentSession } from "../../server-handlers/_record-session-start-helpers";

const A = "session-aaa";
const B = "session-bbb";
const C = "session-ccc";

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const RECENT = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5 min ago
const STALE = new Date(NOW - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago

describe("detectConcurrentSession — OA-B50 cross-device guard", () => {
  it("returns false when no prior starts exist", () => {
    expect(detectConcurrentSession({
      existingStarts: [],
      currentSessionId: A,
      savedSessionIds: new Set(),
      now: NOW,
    })).toBe(false);
  });

  it("returns false when all prior starts are already saved", () => {
    expect(detectConcurrentSession({
      existingStarts: [B, C],
      currentSessionId: A,
      savedSessionIds: new Set([B, C]),
      startedAtById: { [B]: RECENT, [C]: RECENT },
      now: NOW,
    })).toBe(false);
  });

  it("OA-B50: returns true when a prior start is recent and not yet saved (in-flight session)", () => {
    // B was started 5 minutes ago but not yet saved — device 2 running in parallel
    expect(detectConcurrentSession({
      existingStarts: [B],
      currentSessionId: A,
      savedSessionIds: new Set(),
      startedAtById: { [B]: RECENT },
      now: NOW,
    })).toBe(true);
  });

  it("B-EMP1: returns false when the only unsaved prior start is stale (abandoned, not concurrent)", () => {
    // B was started 3 hours ago and never saved — abandoned session, not another device
    expect(detectConcurrentSession({
      existingStarts: [B],
      currentSessionId: A,
      savedSessionIds: new Set(),
      startedAtById: { [B]: STALE },
      now: NOW,
    })).toBe(false);
  });

  it("B-EMP1: returns false when an unsaved prior start has no recorded timestamp", () => {
    // Pre-fix data with no startedAtById entry — can't confirm recency, don't false-flag
    expect(detectConcurrentSession({
      existingStarts: [B],
      currentSessionId: A,
      savedSessionIds: new Set(),
      now: NOW,
    })).toBe(false);
  });

  it("mixed — one stale-unsaved, one recent-unsaved → still true", () => {
    expect(detectConcurrentSession({
      existingStarts: [C, B],
      currentSessionId: A,
      savedSessionIds: new Set(),
      startedAtById: { [C]: STALE, [B]: RECENT },
      now: NOW,
    })).toBe(true);
  });

  it("excludes the current sessionId from the in-flight check", () => {
    // A is being started right now; it won't be in savedSessionIds yet.
    // The check must not flag A itself as an in-flight session.
    expect(detectConcurrentSession({
      existingStarts: [A],
      currentSessionId: A,
      savedSessionIds: new Set(),
      startedAtById: { [A]: RECENT },
      now: NOW,
    })).toBe(false);
  });

  it("respects the lookback window — IDs beyond lookback are ignored", () => {
    // existingStarts has 6 items, all unsaved+recent, but lookback=5 so only last 5 checked.
    const starts = ["old-1", "old-2", B, C, "session-d", "session-e"];
    const startedAtById = Object.fromEntries(starts.map(id => [id, RECENT]));
    expect(detectConcurrentSession({
      existingStarts: starts,
      currentSessionId: A,
      savedSessionIds: new Set(["old-1", "old-2"]),
      startedAtById,
      lookback: 5,
      now: NOW,
    })).toBe(true); // B/C/d/e are in-flight
  });

  it("with lookback=5 only the 5 most-recent prior starts are checked", () => {
    // last 5: [B, C, d, e, f] — all saved; the only unsaved one is older (old-1)
    const starts = ["old-1", B, C, "d", "e", "f"];
    const startedAtById = Object.fromEntries(starts.map(id => [id, RECENT]));
    expect(detectConcurrentSession({
      existingStarts: starts,
      currentSessionId: A,
      savedSessionIds: new Set([B, C, "d", "e", "f"]),
      startedAtById,
      lookback: 5,
      now: NOW,
    })).toBe(false);
  });

  it("returns false when existingStarts only contains the current sessionId", () => {
    expect(detectConcurrentSession({
      existingStarts: [A],
      currentSessionId: A,
      savedSessionIds: new Set(),
      now: NOW,
    })).toBe(false);
  });
});

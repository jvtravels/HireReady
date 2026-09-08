/* Pure helpers for record-session-start, extracted for unit-testability.
 * OA-B50: BroadcastChannel only guards same-browser tabs. Cross-device
 * concurrent sessions (mobile + desktop) cannot be detected client-side.
 * The server-side guard compares recently-started session IDs against the
 * sessions table: any started ID not yet saved = an in-flight session on
 * another device.
 *
 * B-EMP1 (2026-08-20): a session that's simply abandoned (tab closed, crash,
 * user gave up) never gets a `sessions` row either — it looked identical to
 * an in-flight cross-device session and stayed flagged as "concurrent"
 * forever once it fell inside the lookback window. Low-frequency users (e.g.
 * 2 lifetime starts, first one abandoned) hit a permanent false positive on
 * every subsequent attempt. Fix: only treat an unsaved start as in-flight if
 * it began recently (staleAfterMs); older unsaved starts are treated as
 * abandoned, not concurrent. Starts with no recorded timestamp (pre-fix
 * data) are treated as not-recent rather than assumed concurrent, since we
 * can't confirm recency for them either way. */

export interface ConcurrentSessionInput {
  /** All session IDs recorded as started for this user, in order. */
  existingStarts: string[];
  /** The session ID being started now (excluded from the in-flight check). */
  currentSessionId: string;
  /** IDs from existingStarts that are already present in the sessions table. */
  savedSessionIds: ReadonlySet<string>;
  /** ISO timestamp each existingStarts entry was recorded, keyed by session id.
   *  Entries with no known timestamp are treated as not-recent. */
  startedAtById?: Readonly<Record<string, string>>;
  /** Current time in ms — pass explicitly in tests; defaults to Date.now(). */
  now?: number;
  /** How long (ms) an unsaved start is still considered in-flight before it's
   *  treated as abandoned. Default 2 hours — comfortably longer than any real
   *  interview session. */
  staleAfterMs?: number;
  /** How many of the most-recent existing starts to check (default: 5). */
  lookback?: number;
}

/**
 * Returns true when at least one recently-started, still-recent session is
 * not yet saved — indicating an in-flight session on another device/browser.
 *
 * Rationale: `existingStarts` holds the last N session IDs written by
 * record-session-start. `savedSessionIds` is the set of IDs already present
 * in the `sessions` table (written by save-session at completion). An ID in
 * existingStarts that is NOT in savedSessionIds AND started within
 * `staleAfterMs` is still in-flight. Older unsaved starts are abandoned
 * sessions, not concurrent ones, and must not be flagged.
 */
export function detectConcurrentSession(input: ConcurrentSessionInput): boolean {
  const {
    existingStarts,
    currentSessionId,
    savedSessionIds,
    startedAtById = {},
    staleAfterMs = 2 * 60 * 60 * 1000,
    lookback = 5,
  } = input;
  const now = input.now ?? Date.now();
  const recent = existingStarts
    .filter(id => id !== currentSessionId)
    .slice(-lookback);
  return recent.some(id => {
    if (savedSessionIds.has(id)) return false;
    const ts = startedAtById[id];
    if (!ts) return false;
    const startedMs = Date.parse(ts);
    if (!Number.isFinite(startedMs)) return false;
    return now - startedMs <= staleAfterMs;
  });
}

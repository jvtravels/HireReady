/**
 * Pure logic extracted from server-handlers/follow-up.ts so the intent
 * detection + salary-number extraction can be unit-tested without
 * spinning up the 697-line handler + LLM mock.
 *
 * These functions run against the raw candidate answer before prompt
 * assembly. A bug here means the salary-negotiation interviewer shows
 * the wrong intent banner ("candidate accepted" when they rejected),
 * which causes catastrophic prompt-level misbehaviour.
 */

export interface CandidateIntent {
  accepted: boolean;
  /** Accepted with a condition/question attached ("I accept but what about equity?") */
  conditionalAccept: boolean;
  rejected: boolean;
  /** Explicitly signalling they're walking away */
  walkAway: boolean;
  /** Deflecting to avoid revealing their number */
  deflected: boolean;
  /** Asking for time / needs to think */
  needsTime: boolean;
  /** Mentioned competing offers */
  mentionedCompeting: boolean;
}

const acceptWords = /\b(i accept|i.?ll accept|accept the offer|sounds good|that works for me|it.?s a deal|i.?m happy with|fine with me|i agree|agreed|let.?s go ahead)\b/i;
const rejectWords = /\b(not acceptable|too low|can.?t accept|absolutely not|not enough|walk away|not interested|i reject|no deal|way too low|that.?s insulting)\b/i;
const hedgeWords = /\b(but|however|only if|unless|provided|on condition|contingent|except|though)\b/i;
const deflectWords = /\b(you first|your offer|what.*you.*offer|tell me.*first|don.?t want to share|prefer not|rather not|you tell me)\b/i;
const thinkWords = /\b(need time|think about|sleep on|let me think|consider|talk to.*(?:family|partner|wife|husband)|get back to you|not ready)\b/i;
const competingWords = /\b(other offer|competing|another company|counter.?offer|multiple offers|also talking|interviewing at|got an offer)\b/i;
const walkAwayWords = /\b(walk away|walking away|i.?m out|not interested|i.?ll pass|no deal|withdraw|decline the offer|i decline|pull out|not worth|won.?t work|isn.?t going to work|move on|take the other|thanks but no|not for me|have to pass)\b/i;
const shortAffirmativeStart = /^(yes|yeah|okay|ok|sure|deal|agreed|accept|sounds good|that works|fine)\b/i;

/** Classify the candidate's answer in a salary negotiation. */
export function detectCandidateIntent(answer: string): CandidateIntent {
  const trimmed = (answer || "").trim();
  if (!trimmed) {
    return { accepted: false, conditionalAccept: false, rejected: false, walkAway: false, deflected: false, needsTime: false, mentionedCompeting: false };
  }

  const isShortAffirmative = trimmed.split(/\s+/).length < 8
    && shortAffirmativeStart.test(trimmed)
    && !hedgeWords.test(trimmed);

  const acceptIdx = trimmed.search(acceptWords);
  const hedgeIdx = trimmed.search(hedgeWords);
  const hasAccept = acceptIdx >= 0;
  const hasHedgeAfterAccept = hasAccept && hedgeIdx > acceptIdx;
  const postHedgeText = hasHedgeAfterAccept ? trimmed.slice(hedgeIdx) : "";
  const hedgeIsRejection = rejectWords.test(postHedgeText);

  const accepted = (hasAccept || isShortAffirmative) && !hedgeIsRejection;
  const conditionalAccept = accepted && hasHedgeAfterAccept && !hedgeIsRejection;
  const rejected = rejectWords.test(trimmed) && !accepted;
  const deflected = deflectWords.test(trimmed);
  const walkAway = walkAwayWords.test(trimmed) && !acceptWords.test(trimmed);

  const candidateNum = extractCandidateSalaryNumber(trimmed);
  // "consider" co-occurring with a number is a counter, not a time request
  const needsTime = thinkWords.test(trimmed) && candidateNum === null;
  const mentionedCompeting = competingWords.test(trimmed);

  return { accepted, conditionalAccept, rejected, walkAway, deflected, needsTime, mentionedCompeting };
}

/**
 * Extract the candidate's target salary number from free-text.
 *
 * Strategy:
 *   1. Find all numbers with LPA/lakh/lakhs/l suffix.
 *   2. If the target-phrase regex matches a number from that list, prefer it.
 *   3. Otherwise, if current-CTC regex matches the first number, use the last
 *      number as the target (e.g. "currently at 20, expecting 30" → 30).
 *   4. Otherwise fall back to the last number in the list.
 *   5. If no LPA-suffixed number found, look for bare numbers prefixed with
 *      ask-intent words, bounded to the salary-plausible range [3, 200].
 *
 * Returns null when no number is found.
 */
export function extractCandidateSalaryNumber(answer: string): string | null {
  if (!answer) return null;

  const salaryNumRe = /₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/gi;
  const currentCtcRe = /(?:currently|current(?:ly)?|earning|getting|drawing|my ctc|i'm at|making|take home|i get|i earn)\s.*?(\d+(?:\.\d+)?)/i;
  const targetRe = /(?:expecting|looking for|want|need|asking|target|hoping|would like|i'd like|i want|i need|looking at|aiming)\s.*?(\d+(?:\.\d+)?)/i;

  const allNums: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = salaryNumRe.exec(answer)) !== null) allNums.push(m[1]);

  // Bare-number fallback when no LPA suffix was found
  if (allNums.length === 0) {
    const bareNumMatch = answer.match(/(?:expecting|want|need|asking|target|hoping|looking for|around|about|at least|minimum)\s+(?:₹?\s*)?(\d+(?:\.\d+)?)\b/i);
    if (bareNumMatch) {
      const v = parseFloat(bareNumMatch[1]);
      if (v >= 3 && v <= 200) allNums.push(bareNumMatch[1]);
    }
  }

  if (allNums.length === 0) return null;

  const targetMatch = targetRe.exec(answer);
  if (targetMatch && allNums.includes(targetMatch[1])) return targetMatch[1];

  const currentMatch = currentCtcRe.exec(answer);
  if (currentMatch && allNums.length > 1 && allNums[0] === currentMatch[1]) {
    return allNums[allNums.length - 1];
  }

  return allNums[allNums.length - 1];
}

/**
 * Truncate conversation history to a character budget, preserving the most
 * recent exchanges. Mirrors the historyCharLimit used in follow-up.ts
 * around line 159.
 */
export function truncateConversationHistory(history: string, budget: number): string {
  if (!history) return "";
  if (history.length <= budget) return history;
  // Keep the tail (most recent turns), prefix with marker.
  return `…[earlier turns truncated]\n${history.slice(-Math.max(budget - 40, 100))}`;
}

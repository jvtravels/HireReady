import { describe, it, expect } from "vitest";
import {
  detectCandidateIntent,
  extractCandidateSalaryNumber,
  truncateConversationHistory,
} from "../../server-handlers/_follow-up-helpers";

/**
 * follow-up.ts is 697 lines and was entirely uncovered. The two highest-
 * risk pieces are intent detection (wrong banner → LLM gets wrong
 * instructions → catastrophic prompt misbehaviour) and salary-number
 * extraction (wrong number mirrored back to candidate → trust collapse).
 *
 * Both are regex-driven and have many edge cases — this test file pins
 * the behaviour so a regex tweak can't silently break the salary-
 * negotiation interview without turning CI red.
 */

describe("detectCandidateIntent", () => {
  it("empty input → all flags false", () => {
    const r = detectCandidateIntent("");
    expect(r).toEqual({
      accepted: false, conditionalAccept: false, rejected: false,
      walkAway: false, deflected: false, needsTime: false, mentionedCompeting: false,
    });
  });

  describe("acceptance", () => {
    it("clear 'I accept' wins", () => {
      expect(detectCandidateIntent("I accept the offer").accepted).toBe(true);
    });

    it("short affirmative ('yes', 'okay', 'sure') counts as acceptance", () => {
      expect(detectCandidateIntent("yes").accepted).toBe(true);
      expect(detectCandidateIntent("okay sounds good").accepted).toBe(true);
      expect(detectCandidateIntent("sure").accepted).toBe(true);
      expect(detectCandidateIntent("deal").accepted).toBe(true);
    });

    it("long answer that happens to start with 'yes' is NOT a short affirmative", () => {
      const r = detectCandidateIntent("yes but I have several concerns about the equity component and the learning budget and also the base salary figure");
      expect(r.accepted).toBe(false);
    });

    it("hedge after accept → conditional acceptance (still accepted=true)", () => {
      const r = detectCandidateIntent("I accept the offer but I'd like to discuss equity");
      expect(r.accepted).toBe(true);
      expect(r.conditionalAccept).toBe(true);
    });

    it("hedge AFTER accept that contains a rejection → rejection wins (accepted=false)", () => {
      const r = detectCandidateIntent("I accept the offer but it's too low to take seriously");
      expect(r.accepted).toBe(false);
      expect(r.rejected).toBe(true);
    });

    it("'that works for me' is acceptance", () => {
      expect(detectCandidateIntent("that works for me").accepted).toBe(true);
    });
  });

  describe("rejection", () => {
    it("'too low' is a rejection", () => {
      const r = detectCandidateIntent("that's too low for my experience level");
      expect(r.rejected).toBe(true);
      expect(r.accepted).toBe(false);
    });

    it("'not acceptable' is a rejection", () => {
      expect(detectCandidateIntent("this offer is not acceptable").rejected).toBe(true);
    });

    it("'can't accept' is a rejection", () => {
      expect(detectCandidateIntent("I can't accept at this number").rejected).toBe(true);
    });

    it("acceptance beats raw rejection keyword absence", () => {
      const r = detectCandidateIntent("I accept, this sounds fair");
      expect(r.accepted).toBe(true);
      expect(r.rejected).toBe(false);
    });
  });

  describe("walkAway", () => {
    it("'walk away' flags walkAway", () => {
      const r = detectCandidateIntent("I need to walk away from this");
      expect(r.walkAway).toBe(true);
    });

    it("'I decline' flags walkAway", () => {
      expect(detectCandidateIntent("I decline the offer at this point").walkAway).toBe(true);
    });

    it("walkAway phrase with explicit acceptance present does NOT flag walkAway", () => {
      // Defensive: "not interested" is also a walkAway phrase, but if they
      // also said "I accept" we treat as accepted.
      const r = detectCandidateIntent("I accept the offer, I'm not interested in negotiating further");
      expect(r.accepted).toBe(true);
      expect(r.walkAway).toBe(false);
    });
  });

  describe("deflection", () => {
    it("'what's your offer' flags deflected", () => {
      expect(detectCandidateIntent("what's your offer first?").deflected).toBe(true);
    });

    it("'you tell me' flags deflected", () => {
      expect(detectCandidateIntent("you tell me what you can do").deflected).toBe(true);
    });

    it("'prefer not to share' flags deflected", () => {
      expect(detectCandidateIntent("I'd prefer not to share a specific number").deflected).toBe(true);
    });
  });

  describe("needsTime", () => {
    it("'need time' flags needsTime", () => {
      expect(detectCandidateIntent("I need time to think this over").needsTime).toBe(true);
    });

    it("'talk to my family' flags needsTime", () => {
      expect(detectCandidateIntent("I'd like to talk to my family first").needsTime).toBe(true);
    });

    it("needsTime is SUPPRESSED when a concrete number is present (that's a counter)", () => {
      // "consider 30 LPA" contains "consider" (a think-word) AND a number
      // — semantically this is a counter, not a time-to-think request.
      const r = detectCandidateIntent("could you consider 30 LPA instead?");
      expect(r.needsTime).toBe(false);
    });
  });

  describe("competingOffers", () => {
    it("'other offer' flags mentionedCompeting", () => {
      // Uses "other offer" as a standalone phrase (not "another" which is
      // a separate word and does not trigger the regex — documented here
      // so a future maintainer doesn't "fix" the regex to match "another"
      // too aggressively).
      expect(detectCandidateIntent("I have an other offer on the table").mentionedCompeting).toBe(true);
      expect(detectCandidateIntent("I got an offer from Google").mentionedCompeting).toBe(true);
    });

    it("'counter-offer' flags mentionedCompeting", () => {
      expect(detectCandidateIntent("I got a counter-offer from my current employer").mentionedCompeting).toBe(true);
    });
  });
});

describe("extractCandidateSalaryNumber", () => {
  it("empty input → null", () => {
    expect(extractCandidateSalaryNumber("")).toBe(null);
    expect(extractCandidateSalaryNumber("   ")).toBe(null);
  });

  it("plain answer with no number → null", () => {
    expect(extractCandidateSalaryNumber("I need to think about it")).toBe(null);
  });

  it("single LPA number → returns it", () => {
    expect(extractCandidateSalaryNumber("I'm expecting 30 LPA")).toBe("30");
    expect(extractCandidateSalaryNumber("looking for 45 lakh")).toBe("45");
    expect(extractCandidateSalaryNumber("targeting 22.5 LPA")).toBe("22.5");
  });

  it("rupee symbol + LPA works", () => {
    expect(extractCandidateSalaryNumber("I want ₹35 LPA")).toBe("35");
  });

  it("target-phrase number wins over plain number list", () => {
    // Two numbers: 20 (CTC) and 35 (target with "expecting"). Should pick 35.
    expect(extractCandidateSalaryNumber("currently 20 LPA, expecting 35 LPA")).toBe("35");
  });

  it("when first number is CTC and multiple numbers exist, use the last", () => {
    // "currently at X" and Y — pick Y as the ask
    expect(extractCandidateSalaryNumber("I'm currently at 25 LPA and want 40 LPA")).toBe("40");
  });

  it("when only one LPA number exists, return it even if a CTC phrase is nearby", () => {
    expect(extractCandidateSalaryNumber("currently drawing 25 LPA")).toBe("25");
  });

  it("bare-number fallback with ask-intent word, within salary-plausible range", () => {
    // No LPA suffix, but "need 30" in context → 30
    expect(extractCandidateSalaryNumber("I need 30")).toBe("30");
    expect(extractCandidateSalaryNumber("looking for around 45")).toBe("45");
  });

  it("bare-number OUTSIDE salary-plausible range (3..200) is ignored", () => {
    // "need 500" — too high to be LPA salary, return null
    expect(extractCandidateSalaryNumber("I need 500 for my car payment")).toBe(null);
    // "need 2" — too low, return null
    expect(extractCandidateSalaryNumber("I need 2 days to decide")).toBe(null);
  });

  it("ignores unrelated numbers not near salary-asking context", () => {
    expect(extractCandidateSalaryNumber("I have 5 years of experience")).toBe(null);
  });

  it("handles multiple LPA numbers and picks the target-tagged one", () => {
    // Three numbers — pick the one with the target phrase
    const r = extractCandidateSalaryNumber("I'm at 20 LPA, friends earn 25 LPA, I'm asking for 35 LPA");
    expect(r).toBe("35");
  });
});

describe("truncateConversationHistory", () => {
  it("empty input → empty string", () => {
    expect(truncateConversationHistory("", 100)).toBe("");
  });

  it("under budget → returns unchanged", () => {
    const short = "A short history";
    expect(truncateConversationHistory(short, 100)).toBe(short);
  });

  it("over budget → truncates with a visible marker", () => {
    const long = "x".repeat(1000);
    const out = truncateConversationHistory(long, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.startsWith("…[earlier turns truncated]")).toBe(true);
  });

  it("preserves the tail (most recent turns) not the head", () => {
    const history = "OLD TURN\n" + "middle ".repeat(100) + "MOST_RECENT_TURN";
    const out = truncateConversationHistory(history, 200);
    expect(out).toContain("MOST_RECENT_TURN");
    expect(out).not.toContain("OLD TURN");
  });
});

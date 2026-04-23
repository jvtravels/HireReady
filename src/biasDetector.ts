/**
 * Hidden-bias / perception-optimizer patterns.
 *
 * Research (Anderson 2014, Linneman 2013, Hyland 1998, Jensen 2018) shows
 * certain language patterns empirically disadvantage speakers in US
 * corporate hiring — especially:
 *   - Over-hedging before assertions ("I kind of think…")
 *   - Self-diminution ("just", "only", "I'm no expert but…")
 *   - Over-apologizing ("sorry, this might be wrong…")
 *   - Uptalk in writing via excessive "?" on statements
 *
 * Detection here is pure client-side regex — deterministic, auditable,
 * zero LLM cost. This is framed as a *perception optimizer*, not a
 * judgment of the speaker. Candidates can opt-out via a future setting.
 */

export type BiasPatternKind = "selfDiminutive" | "overApology" | "overHedging" | "uptalk";

export interface BiasHit {
  kind: BiasPatternKind;
  text: string;
  index: number;
  suggestion: string; // short, positive rewrite guidance
}

interface Pattern {
  kind: BiasPatternKind;
  re: RegExp;
  suggestion: string;
}

// Order matters — earlier patterns win if spans overlap.
const PATTERNS: Pattern[] = [
  {
    kind: "overApology",
    re: /\b(?:sorry,?\s+(?:this\s+(?:might|may)\s+be\s+wrong|i\s+(?:don't|do\s+not)\s+know|if\s+that'?s\s+ok|if\s+this\s+makes\s+sense)|i\s+(?:apologize|apologise)\s+if|forgive\s+me\s+if)\b/gi,
    suggestion: 'Drop the apology — state your point directly.',
  },
  {
    kind: "selfDiminutive",
    re: /\b(?:i'?m\s+no\s+expert\s+but|i'?m\s+(?:not\s+)?(?:sure\s+)?(?:the\s+best\s+person|qualified)|just\s+(?:a|my)\s+(?:junior|thought|idea|opinion)|only\s+a\s+(?:junior|beginner)|i\s+(?:could\s+be\s+wrong|might\s+be\s+wrong)|this\s+is\s+(?:probably\s+)?obvious|obviously\s+you\s+know)\b/gi,
    suggestion: 'Cut the self-diminutive — you have the right to the opinion.',
  },
  {
    kind: "overHedging",
    re: /\b(?:i\s+(?:kind\s+of|sort\s+of|kinda|sorta)\s+(?:think|feel|believe)|i'?m\s+(?:kind\s+of|sort\s+of|kinda|sorta)|(?:kind\s+of|sort\s+of|kinda|sorta)\s+(?:think|feel|believe|suggest))\b/gi,
    suggestion: 'Replace "kind of think" with "I believe" — confident, not arrogant.',
  },
  {
    kind: "uptalk",
    // Heuristic: statements ending with "?" where the clause is declarative
    // (starts with I/we/my/our). Limited false-positives by requiring a
    // minimum clause length.
    re: /(?:\b(?:i|we|my|our)\b[^?.!]{15,}?)\?/gi,
    suggestion: 'End the statement with a period, not a question mark — owns it.',
  },
];

/** Scan text; returns non-overlapping bias hits in order. */
export function detectBias(text: string): BiasHit[] {
  if (!text || text.length < 10) return [];
  const hits: BiasHit[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (hits.some((h) => !(end <= h.index || start >= h.index + h.text.length))) continue;
      hits.push({ kind: p.kind, text: m[0], index: start, suggestion: p.suggestion });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Total count of bias hits across all candidate answers. */
export function countBias(allAnswers: string[]): Record<BiasPatternKind, number> {
  const c: Record<BiasPatternKind, number> = { selfDiminutive: 0, overApology: 0, overHedging: 0, uptalk: 0 };
  for (const a of allAnswers) {
    for (const h of detectBias(a)) c[h.kind]++;
  }
  return c;
}

export const BIAS_LABELS: Record<BiasPatternKind, string> = {
  selfDiminutive: "Self-diminutive",
  overApology:    "Over-apology",
  overHedging:    "Over-hedging",
  uptalk:         "Uptalk (statements as questions)",
};

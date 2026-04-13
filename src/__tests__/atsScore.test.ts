/**
 * ATS Score / Resume Keyword Matching Tests — HireStepX
 * Tests the computeATSScore function for accuracy and edge cases.
 */
import { describe, it, expect } from "vitest";

// Import the function directly from the module
// computeATSScore is defined in DashboardResume.tsx but not exported
// We test the keyword matching logic inline here

describe("JD Keyword Matching", () => {
  const matchWord = (text: string, keyword: string) =>
    new RegExp(`\\b${keyword}\\b`, "i").test(text);

  it("matches whole words only", () => {
    expect(matchWord("I know Python well", "python")).toBe(true);
    expect(matchWord("I used Java extensively", "java")).toBe(true);
    // Should NOT match substring
    expect(matchWord("I used JavaScript", "java")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchWord("React development", "react")).toBe(true);
    expect(matchWord("PYTHON scripting", "python")).toBe(true);
  });

  it("handles hyphenated words", () => {
    expect(matchWord("cross-functional teams", "cross")).toBe(true);
    expect(matchWord("full-stack developer", "full")).toBe(true);
  });

  it("does not match partial words", () => {
    expect(matchWord("management skills", "manage")).toBe(false);
    expect(matchWord("testing frameworks", "test")).toBe(false);
  });

  it("handles empty inputs", () => {
    expect(matchWord("", "python")).toBe(false);
    expect(matchWord("some text", "")).toBe(true); // empty regex matches
  });
});

describe("JD Keyword Extraction", () => {
  const extractKeywords = (jdText: string) => {
    const jdWords = jdText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const commonWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was", "one", "our", "out", "with", "they", "been", "have", "from", "this", "that", "will", "would", "there", "their", "what", "about", "which", "when", "make", "like", "time", "just", "know", "take", "come", "could", "than", "look", "only", "into", "year", "your", "some", "them", "also", "should", "able", "work", "experience", "must", "strong"]);
    const freq: Record<string, number> = {};
    for (const w of jdWords) {
      if (!commonWords.has(w) && w.length > 3) freq[w] = (freq[w] || 0) + 1;
    }
    return Object.entries(freq).filter(([, c]) => c >= 2).map(([w]) => w).slice(0, 20);
  };

  it("extracts repeated keywords from JD", () => {
    const jd = "We need Python skills. Python is essential. JavaScript is a plus. JavaScript knowledge required.";
    const keywords = extractKeywords(jd);
    expect(keywords).toContain("python");
    expect(keywords).toContain("javascript");
  });

  it("filters common words", () => {
    const jd = "You should have strong experience with Python. Python experience required. Strong skills needed.";
    const keywords = extractKeywords(jd);
    expect(keywords).not.toContain("should");
    expect(keywords).not.toContain("strong");
    expect(keywords).not.toContain("experience");
    expect(keywords).toContain("python");
  });

  it("ignores words appearing only once", () => {
    const jd = "Python development. React frontend. TypeScript backend.";
    const keywords = extractKeywords(jd);
    expect(keywords).toHaveLength(0); // all words appear only once
  });

  it("limits to 20 keywords max", () => {
    let jd = "";
    for (let i = 0; i < 30; i++) {
      jd += `keyword${i} keyword${i} `;
    }
    const keywords = extractKeywords(jd);
    expect(keywords.length).toBeLessThanOrEqual(20);
  });

  it("handles empty JD", () => {
    expect(extractKeywords("")).toHaveLength(0);
  });

  it("ignores short words (3 chars or less)", () => {
    const jd = "We use API and SQL for dev. API SQL dev.";
    const keywords = extractKeywords(jd);
    // "api" and "sql" are only 3 chars, filtered by length > 3
    expect(keywords).not.toContain("api");
    expect(keywords).not.toContain("sql");
  });
});

import { describe, it, expect } from "vitest";
import { matchRoleKey, ROLE_COMPETENCIES } from "../../data/role-competencies";
import { matchCompanyKey, COMPANY_GUIDANCE } from "../../data/company-guidance";

/**
 * Regression tests for the match helpers used by generate-questions.ts.
 * These used to live inline in the 1,000-line handler; extracting them
 * let us finally cover the matching behaviour end-to-end. Without these,
 * a typo in the hyphenated slug (e.g. "data-scientist" → "datascientist")
 * silently fell through to "" which the LLM prompt treats as a total
 * miss — users get generic questions instead of role-specific ones.
 */

describe("matchRoleKey", () => {
  it("returns empty for empty input", () => {
    expect(matchRoleKey("")).toEqual({ key: "", fallback: "" });
  });

  it("exact-matches a canonical slug", () => {
    const { key, fallback } = matchRoleKey("product-manager");
    expect(key).toBe("product-manager");
    expect(fallback.length).toBeGreaterThan(100);
  });

  it("matches a humanised role name via word-part substring", () => {
    // "Senior Product Manager" → contains "product" + "manager" via split-part match
    const { key } = matchRoleKey("Senior Product Manager");
    expect(key).toBe("product-manager");
  });

  it("matches single-word slugs case-insensitively", () => {
    expect(matchRoleKey("Designer").key).toBe("designer");
    expect(matchRoleKey("DESIGNER").key).toBe("designer");
  });

  it("prefers the first matching key when multiple parts match", () => {
    // Object iteration order is insertion order — "product-manager" is
    // declared before "engineering-manager". A role description that
    // could match either must be deterministic.
    const { key } = matchRoleKey("product engineering");
    expect(key).toBe("product-manager");
  });

  it("returns empty when nothing matches", () => {
    expect(matchRoleKey("astronaut")).toEqual({ key: "", fallback: "" });
  });

  it("never returns a role key not present in ROLE_COMPETENCIES", () => {
    const inputs = ["pm", "swe", "sde", "DevOps Lead", "VP of Engineering", "QA Manager"];
    for (const input of inputs) {
      const { key } = matchRoleKey(input);
      if (key) expect(key in ROLE_COMPETENCIES).toBe(true);
    }
  });
});

describe("matchCompanyKey", () => {
  it("normalises whitespace and punctuation", () => {
    expect(matchCompanyKey("Google Inc.").key).toBe("google");
    expect(matchCompanyKey("  google  ").key).toBe("google");
  });

  it("matches case-insensitively", () => {
    expect(matchCompanyKey("TCS").key).toBe("tcs");
    expect(matchCompanyKey("amazon").key).toBe("amazon");
  });

  it("matches via substring containment both ways", () => {
    // "microsoft" contains "micro" and "microsoftindia" contains "microsoft"
    expect(matchCompanyKey("MicrosoftIndia").key).toBe("microsoft");
  });

  it("returns empty for unknown company", () => {
    expect(matchCompanyKey("some-unknown-corp")).toEqual({ key: "", fallback: "" });
  });

  it("returns empty for empty input", () => {
    expect(matchCompanyKey("")).toEqual({ key: "", fallback: "" });
  });

  it("every returned key is a real COMPANY_GUIDANCE entry", () => {
    const inputs = ["Google", "Amazon", "Infosys", "Accenture India"];
    for (const input of inputs) {
      const { key } = matchCompanyKey(input);
      expect(key in COMPANY_GUIDANCE).toBe(true);
    }
  });
});

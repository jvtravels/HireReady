import { describe, it, expect } from "vitest";

/**
 * Tests for extractJSON — mirrors the real implementation in api/_llm.ts.
 * Ensures robust JSON extraction from LLM responses that may include
 * markdown fences, prose, or malformed output.
 */

function extractJSON<T = unknown>(text: string): T | null {
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Strip markdown code fences
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try extracting JSON array first (less ambiguous than objects)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  // Extract JSON object — find matching braces instead of greedy regex
  const objStart = cleaned.indexOf("{");
  if (objStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = objStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(objStart, i + 1)); } catch {}
          break;
        }
      }
    }
  }
  return null;
}

describe("extractJSON", () => {
  describe("direct JSON parsing", () => {
    it("parses clean JSON object", () => {
      const result = extractJSON('{"score": 85, "feedback": "Good"}');
      expect(result).toEqual({ score: 85, feedback: "Good" });
    });

    it("parses clean JSON array", () => {
      const result = extractJSON('[{"q": "Q1"}, {"q": "Q2"}]');
      expect(result).toHaveLength(2);
    });
  });

  describe("markdown code fences", () => {
    it("extracts JSON from ```json fences", () => {
      const result = extractJSON('```json\n{"score": 90}\n```');
      expect(result).toEqual({ score: 90 });
    });

    it("extracts JSON from plain ``` fences", () => {
      const result = extractJSON('```\n{"key": "value"}\n```');
      expect(result).toEqual({ key: "value" });
    });

    it("handles fences with extra whitespace", () => {
      const result = extractJSON('```json  \n  {"data": true}  \n```  ');
      expect(result).toEqual({ data: true });
    });
  });

  describe("JSON embedded in prose", () => {
    it("extracts object from surrounding text", () => {
      const result = extractJSON('Here is the evaluation:\n{"score": 75}\nThat concludes the review.');
      expect(result).toEqual({ score: 75 });
    });

    it("extracts array from surrounding text", () => {
      const result = extractJSON('Questions:\n[{"q": "Tell me about yourself"}]\nEnd.');
      expect(result).toEqual([{ q: "Tell me about yourself" }]);
    });
  });

  describe("nested objects", () => {
    it("handles nested braces correctly", () => {
      const result = extractJSON('Result: {"outer": {"inner": {"deep": 1}}, "score": 80}');
      expect(result).toEqual({ outer: { inner: { deep: 1 } }, score: 80 });
    });

    it("handles escaped quotes in strings", () => {
      const result = extractJSON('{"text": "He said \\"hello\\""}');
      expect(result).toEqual({ text: 'He said "hello"' });
    });

    it("handles braces inside strings", () => {
      const result = extractJSON('{"code": "function() { return {}; }"}');
      expect(result).toEqual({ code: "function() { return {}; }" });
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(extractJSON("")).toBeNull();
    });

    it("returns null for plain text with no JSON", () => {
      expect(extractJSON("This is just regular text without any JSON.")).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      expect(extractJSON("{key: value}")).toBeNull();
    });

    it("returns null for incomplete JSON", () => {
      expect(extractJSON('{"score": 85, "feedback":')).toBeNull();
    });

    it("handles JSON with numeric values", () => {
      const result = extractJSON('{"score": 92.5, "count": -3}');
      expect(result).toEqual({ score: 92.5, count: -3 });
    });

    it("handles JSON with boolean and null values", () => {
      const result = extractJSON('{"active": true, "deleted": false, "parent": null}');
      expect(result).toEqual({ active: true, deleted: false, parent: null });
    });
  });
});

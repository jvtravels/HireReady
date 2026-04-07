import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveSessionResult } from "../interviewAPI";
import type { SessionResult } from "../interviewAPI";

// Mock supabase saveSession
vi.mock("../supabase", () => ({
  saveSession: vi.fn(() => Promise.resolve()),
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json" })),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Provide localStorage for non-jsdom environments
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};
try {
  // Only stub if localStorage doesn't exist or doesn't have .clear
  if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
    vi.stubGlobal("localStorage", mockLocalStorage);
  }
} catch {
  vi.stubGlobal("localStorage", mockLocalStorage);
}

const RESULTS_KEY = "hirloop_sessions";

function makeSession(overrides?: Partial<SessionResult>): SessionResult {
  return {
    id: "test123",
    date: new Date().toISOString(),
    type: "behavioral",
    difficulty: "standard",
    focus: "",
    duration: 300,
    score: 75,
    questions: 3,
    transcript: [{ speaker: "ai", text: "Hello", time: "0:00" }],
    ai_feedback: "Good job",
    skill_scores: { communication: 80, structure: 70 },
    ...overrides,
  };
}

describe("interviewAPI", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("saveSessionResult", () => {
    it("saves to localStorage successfully", async () => {
      const session = makeSession();
      const result = await saveSessionResult(session);
      expect(result.localOk).toBe(true);

      const stored = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe("test123");
    });

    it("prepends new session to existing sessions", async () => {
      localStorage.setItem(RESULTS_KEY, JSON.stringify([makeSession({ id: "old1" })]));
      const result = await saveSessionResult(makeSession({ id: "new1" }));
      expect(result.localOk).toBe(true);

      const stored = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      expect(stored.length).toBe(2);
      expect(stored[0].id).toBe("new1");
      expect(stored[1].id).toBe("old1");
    });

    it("saves to Supabase when userId is provided", async () => {
      const { saveSession } = await import("../supabase");
      const session = makeSession();
      const result = await saveSessionResult(session, "user-abc");
      expect(result.cloudOk).toBe(true);
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({
        id: "test123",
        user_id: "user-abc",
      }));
    });

    it("returns cloudOk=true when no userId (local-only)", async () => {
      const result = await saveSessionResult(makeSession());
      expect(result.cloudOk).toBe(true);
    });

    it("handles Supabase failure gracefully", async () => {
      const { saveSession } = await import("../supabase");
      (saveSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));
      const result = await saveSessionResult(makeSession(), "user-abc");
      expect(result.localOk).toBe(true);
      expect(result.cloudOk).toBe(false);
    });

    it("preserves all session fields in localStorage", async () => {
      const session = makeSession({
        score: 92,
        ai_feedback: "Excellent performance",
        skill_scores: { communication: 95, leadership: 88 },
        ideal_answers: [{ question: "Q1", ideal: "A1", candidateSummary: "Summary" }],
      });
      await saveSessionResult(session);

      const stored = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]")[0];
      expect(stored.score).toBe(92);
      expect(stored.ai_feedback).toBe("Excellent performance");
      expect(stored.skill_scores.communication).toBe(95);
      expect(stored.ideal_answers.length).toBe(1);
    });
  });
});

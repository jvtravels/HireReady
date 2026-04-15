import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage before importing modules that use it
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((k: string) => localStorageMock.store[k] || null),
  setItem: vi.fn((k: string, v: string) => {
    localStorageMock.store[k] = v;
  }),
  removeItem: vi.fn((k: string) => {
    delete localStorageMock.store[k];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

import {
  loadState,
  saveState,
  loadRealSessionsLocal,
  scoreLabel,
  STORAGE_KEY,
  RESULTS_KEY,
} from "../../src/dashboardData";

beforeEach(() => {
  localStorageMock.store = {};
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
});

/* ────────────────────────── scoreLabel ────────────────────────── */

describe("scoreLabel", () => {
  it('returns "Strong" for scores >= 85', () => {
    expect(scoreLabel(85)).toBe("Strong");
    expect(scoreLabel(100)).toBe("Strong");
    expect(scoreLabel(90)).toBe("Strong");
  });

  it('returns "Good" for scores >= 75 and < 85', () => {
    expect(scoreLabel(75)).toBe("Good");
    expect(scoreLabel(80)).toBe("Good");
    expect(scoreLabel(84)).toBe("Good");
  });

  it('returns "Needs work" for scores < 75', () => {
    expect(scoreLabel(74)).toBe("Needs work");
    expect(scoreLabel(0)).toBe("Needs work");
    expect(scoreLabel(50)).toBe("Needs work");
  });
});

/* ────────────────────────── loadState ────────────────────────── */

describe("loadState", () => {
  it("returns defaults when localStorage is empty", () => {
    const state = loadState();
    expect(state).toEqual({
      hasCompletedFirstSession: false,
      dismissedNotifs: [],
      userName: "",
      targetRole: "",
      resumeFileName: null,
      interviewDate: "",
    });
  });

  it("returns stored state when present", () => {
    const stored = {
      hasCompletedFirstSession: true,
      dismissedNotifs: [1, 2],
      userName: "Alice",
      targetRole: "PM",
      resumeFileName: "resume.pdf",
      interviewDate: "2026-05-01",
    };
    localStorageMock.store[STORAGE_KEY] = JSON.stringify(stored);
    const state = loadState();
    expect(state).toEqual(stored);
  });

  it("falls back to auth storage when dashboard storage is missing", () => {
    localStorageMock.store["hirestepx_auth"] = JSON.stringify({
      name: "Bob",
      targetRole: "Engineer",
      hasCompletedOnboarding: true,
      resumeFileName: "bob-resume.pdf",
      interviewDate: "2026-06-15",
    });
    const state = loadState();
    expect(state.userName).toBe("Bob");
    expect(state.targetRole).toBe("Engineer");
    expect(state.hasCompletedFirstSession).toBe(true);
    expect(state.resumeFileName).toBe("bob-resume.pdf");
    expect(state.interviewDate).toBe("2026-06-15");
  });

  it("returns defaults when stored JSON is invalid", () => {
    localStorageMock.store[STORAGE_KEY] = "not-valid-json{{{";
    const state = loadState();
    // Should not throw, falls through to defaults
    expect(state).toEqual({
      hasCompletedFirstSession: false,
      dismissedNotifs: [],
      userName: "",
      targetRole: "",
      resumeFileName: null,
      interviewDate: "",
    });
  });
});

/* ────────────────────────── saveState + loadState round-trip ────────────────────────── */

describe("saveState + loadState round-trip", () => {
  it("persists and retrieves state correctly", () => {
    const state = {
      hasCompletedFirstSession: true,
      dismissedNotifs: [3, 7],
      userName: "Carol",
      targetRole: "CTO",
      resumeFileName: "carol-cv.pdf",
      interviewDate: "2026-07-20",
    };
    saveState(state);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(state),
    );
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });
});

/* ────────────────────────── loadRealSessionsLocal ────────────────────────── */

describe("loadRealSessionsLocal", () => {
  it("returns empty array when no data is stored", () => {
    const sessions = loadRealSessionsLocal();
    expect(sessions).toEqual([]);
  });

  it("returns stored sessions", () => {
    const stored = [
      {
        id: "s1",
        date: "2026-04-10",
        type: "behavioral",
        difficulty: "normal",
        focus: "leadership",
        duration: 900,
        score: 82,
        questions: 3,
      },
    ];
    localStorageMock.store[RESULTS_KEY] = JSON.stringify(stored);
    const sessions = loadRealSessionsLocal();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[0].score).toBe(82);
  });

  it("returns empty array for invalid JSON", () => {
    localStorageMock.store[RESULTS_KEY] = "broken-json";
    const sessions = loadRealSessionsLocal();
    expect(sessions).toEqual([]);
  });
});

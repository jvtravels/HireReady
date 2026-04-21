import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "./setup-next-navigation";
import { useParams } from "next/navigation";
import SessionDetail from "../SessionDetail";

// Mock useAuth
vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    isLoggedIn: true,
    loading: false,
  }),
}));

// Mock supabase
vi.mock("../supabase", () => ({
  getSessionById: vi.fn().mockResolvedValue(null),
  getSessionFeedback: vi.fn().mockResolvedValue(null),
  supabaseConfigured: false,
}));

const RESULTS_KEY = "hirestepx_sessions";

// Mock localStorage since jsdom can be unreliable
const localStorageData: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageData[key] || null),
  setItem: vi.fn((key: string, value: string) => { localStorageData[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageData[key]; }),
  clear: vi.fn(() => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); }),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true });

function renderWithRouter(sessionId: string) {
  vi.mocked(useParams).mockReturnValue({ id: sessionId });
  return render(<SessionDetail />);
}

describe("SessionDetail", () => {
  beforeEach(() => {
    Object.keys(localStorageData).forEach(k => delete localStorageData[k]);
    vi.clearAllMocks();
  });

  it("shows not found when session doesn't exist", async () => {
    renderWithRouter("nonexistent");
    const notFound = await screen.findByText("Session not found");
    expect(notFound).toBeInTheDocument();
  });

  it("loads session from localStorage", async () => {
    const sessions = [
      {
        id: "test123",
        date: "2026-04-01T10:00:00.000Z",
        type: "behavioral",
        difficulty: "standard",
        focus: "general",
        duration: 600,
        score: 85,
        questions: 3,
        ai_feedback: "Great session!",
        skill_scores: { communication: 90, structure: 80 },
        transcript: [
          { speaker: "ai", text: "Tell me about yourself", time: "0:00" },
          { speaker: "user", text: "I am a software engineer", time: "0:30" },
        ],
      },
    ];
    localStorageData[RESULTS_KEY] = JSON.stringify(sessions);

    renderWithRouter("test123");

    // Score appears in multiple places (overall circle + breakdown), so use findAllByText
    const scoreElements = await screen.findAllByText("85");
    expect(scoreElements.length).toBeGreaterThan(0);
    expect(screen.getByText("Great session!")).toBeInTheDocument();
  });

  it("shows transcript when available", async () => {
    const sessions = [
      {
        id: "withTranscript",
        date: "2026-04-01T10:00:00.000Z",
        type: "strategic",
        difficulty: "standard",
        focus: "general",
        duration: 900,
        score: 78,
        questions: 2,
        transcript: [
          { speaker: "ai", text: "How do you build roadmaps?", time: "0:00" },
          { speaker: "user", text: "I use OKRs and quarterly planning", time: "0:45" },
        ],
      },
    ];
    localStorageData[RESULTS_KEY] = JSON.stringify(sessions);

    renderWithRouter("withTranscript");

    await screen.findByText("78");
    // Transcript is collapsed by default — expand it
    fireEvent.click(screen.getByText("Full Transcript"));
    expect(screen.getByText("How do you build roadmaps?")).toBeInTheDocument();
    expect(screen.getByText("I use OKRs and quarterly planning")).toBeInTheDocument();
  });
});

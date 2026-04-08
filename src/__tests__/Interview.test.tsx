import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Interview from "../Interview";

// Mock auth
vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Test User", targetRole: "Engineering Manager", practiceTimestamps: [] },
    updateUser: vi.fn(),
  }),
}));

// Mock supabase
vi.mock("../supabase", () => ({
  saveSession: vi.fn(() => Promise.resolve()),
  getAuthToken: vi.fn(() => Promise.resolve("token")),
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json" })),
}));

// Mock TTS
vi.mock("../tts", () => ({
  speak: vi.fn(() => Promise.resolve({ cancel: vi.fn() })),
  prefetchTTS: vi.fn(() => Promise.resolve()),
  getCachedVoices: vi.fn(() => []),
  fetchCartesiaVoices: vi.fn(() => Promise.resolve([])),
  loadTTSSettings: () => ({ provider: "browser", voiceId: "", voiceName: "" }),
  saveTTSSettings: vi.fn(),
}));

// Mock fetch (for LLM endpoints)
const mockFetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
vi.stubGlobal("fetch", mockFetch);

// Mock SpeechRecognition
vi.stubGlobal("SpeechRecognition", undefined);
vi.stubGlobal("webkitSpeechRecognition", undefined);

// Mock navigator.mediaDevices
Object.defineProperty(navigator, "mediaDevices", {
  value: { getUserMedia: vi.fn(() => Promise.reject(new Error("Not available in test"))) },
  writable: true,
});

describe("Interview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as any);
  });

  it("renders interview UI with timer and progress", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral&difficulty=standard"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    // Should show HireStepX branding
    expect(screen.getByText("HireStepX")).toBeInTheDocument();
    // Should show timer starting at 00:00
    expect(screen.getAllByText("00:00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders end interview button", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    const endBtn = screen.getByLabelText("End interview");
    expect(endBtn).toBeInTheDocument();
  });

  it("shows confirmation modal when End is clicked", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    const endBtn = screen.getByLabelText("End interview");
    await act(async () => { fireEvent.click(endBtn); });

    expect(screen.getByText(/End interview early/i)).toBeInTheDocument();
  });

  it("has control buttons for mute and camera", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    expect(screen.getByLabelText("Mute")).toBeInTheDocument();
    expect(screen.getByLabelText("Turn camera off")).toBeInTheDocument();
  });
});

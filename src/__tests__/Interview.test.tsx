import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "./setup-next-navigation";
import Interview from "../Interview";

// Mock auth
vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Test User", targetRole: "Engineering Manager", practiceTimestamps: [] },
    updateUser: vi.fn(),
  }),
  setInterviewInProgress: vi.fn(),
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
  speakAs: vi.fn(() => Promise.resolve({ cancel: vi.fn() })),
  prefetchTTS: vi.fn(() => Promise.resolve()),
  cleanupTTS: vi.fn(),
  getCachedVoices: vi.fn(() => []),
  fetchCartesiaVoices: vi.fn(() => Promise.resolve([])),
  loadTTSSettings: () => ({ provider: "browser", voiceId: "", voiceName: "" }),
  saveTTSSettings: vi.fn(),
  unlockAudio: vi.fn(),
  retryUnlockAudio: vi.fn(),
  isAutoplayBlocked: vi.fn(() => false),
  hardMuteTTS: vi.fn(),
  // These tests exercise the voice interview chrome (mute, mic), so keep
  // voice output "enabled" — otherwise the engine defaults to text mode.
  VOICE_OUTPUT_DISABLED: false,
}));

// Mock fetch (for LLM endpoints)
const mockFetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
vi.stubGlobal("fetch", mockFetch);

/* Step B (2026-05-17) — root-fix the jsdom AggregateError flake.
 * useInterviewEngine dynamic-imports ./apiClient on mount to call
 * /api/record-session-start. apiClient uses raw XMLHttpRequest (so
 * browser-extension fetch wrappers don't stall it in prod), which in
 * jsdom triggers a real HTTP request that fails with AggregateError
 * during cold runs (when the dynamic import resolves only after the
 * test rendered + asserted). Mock the whole module so no XHR is ever
 * constructed. */
vi.mock("../apiClient", () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, status: 200, data: null, error: null, headers: {} })),
}));

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: partial mock of Response
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) } as any);
  });

  it("renders interview UI with timer and progress", async () => {
    await act(async () => {
      render(
        
          <Interview />
        ,
      );
    });

    // Should show HireStepX branding (wordmark uses aria-label since the
    // italic-X is rendered in a separate span for typography)
    expect(screen.getByLabelText("HireStepX")).toBeInTheDocument();
    // Should show timer starting at 00:00
    expect(screen.getAllByText("00:00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders end interview button", async () => {
    await act(async () => {
      render(
        
          <Interview />
        ,
      );
    });

    const endBtn = screen.getByLabelText("End interview");
    expect(endBtn).toBeInTheDocument();
  });

  it("shows confirmation modal when End is clicked", async () => {
    await act(async () => {
      render(
        
          <Interview />
        ,
      );
    });

    const endBtn = screen.getByLabelText("End interview");
    await act(async () => { fireEvent.click(endBtn); });

    expect(screen.getByText(/End the interview/i)).toBeInTheDocument();
  });

  it("has control button for mute", async () => {
    await act(async () => {
      render(

          <Interview />
        ,
      );
    });

    expect(screen.getByLabelText(/^Mute \(Alt\+M\)/)).toBeInTheDocument();
  });

  it("B-EMP2: does not call record-session-start when entering /interview with no start intent and no draft", async () => {
    // mockSearchParams (setup-next-navigation) carries no `new=1`/`resume=true`,
    // and localStorage has no draft — this is the "should bounce to /dashboard"
    // case. Before the fix, record-session-start still fired here and burned a
    // credit for a session the user never saw, even though router.replace was
    // called in the same tick.
    const { apiFetch } = await import("../apiClient");
    await act(async () => {
      render(

          <Interview />
        ,
      );
    });

    expect(apiFetch).not.toHaveBeenCalledWith("/api/record-session-start", expect.anything());
  });
});

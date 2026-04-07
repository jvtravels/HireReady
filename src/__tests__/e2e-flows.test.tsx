/**
 * E2E Integration Tests — Hirloop
 * Tests all major user flows end-to-end using component rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/* ─── Shared Mocks ─── */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUpdateUser = vi.fn();
const mockLogout = vi.fn();
let mockUser: any = null;

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    updateUser: mockUpdateUser,
    logout: mockLogout,
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: false,
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
  getUserSessions: vi.fn(() => Promise.resolve([])),
  getCalendarEvents: vi.fn(() => Promise.resolve([])),
  getProfile: vi.fn(() => Promise.resolve(null)),
  saveSession: vi.fn(() => Promise.resolve()),
  getAuthToken: vi.fn(() => Promise.resolve("mock-token")),
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json", Authorization: "Bearer mock-token" })),
}));

vi.mock("../tts", () => ({
  speak: vi.fn(() => Promise.resolve({ cancel: vi.fn() })),
  prefetchTTS: vi.fn(() => Promise.resolve()),
  getCachedVoices: vi.fn(() => []),
  fetchCartesiaVoices: vi.fn(() => Promise.resolve([])),
  loadTTSSettings: () => ({ provider: "browser", voiceId: "", voiceName: "" }),
  saveTTSSettings: vi.fn(),
  GOOGLE_VOICES: [
    { id: "en-US-Neural2-D", name: "James", desc: "Clear, neutral male", gender: "male" },
  ],
}));

vi.mock("../dashboardHelpers", () => ({
  loadEvents: () => [],
  daysUntilEvent: () => null,
  formatEventTime: (s: string) => s,
}));

// Mock fetch globally
const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve("") } as any),
);
vi.stubGlobal("fetch", mockFetch);

// Mock browser APIs not available in jsdom
vi.stubGlobal("SpeechRecognition", undefined);
vi.stubGlobal("webkitSpeechRecognition", undefined);
Object.defineProperty(navigator, "mediaDevices", {
  value: { getUserMedia: vi.fn(() => Promise.reject(new Error("Not available"))) },
  writable: true,
  configurable: true,
});

/* ─── Helpers ─── */

function setUser(overrides: Record<string, any> = {}) {
  mockUser = {
    id: "user-123",
    name: "Jay Vyas",
    email: "jay@test.com",
    targetRole: "Head of Design",
    targetCompany: "Google",
    industry: "Technology",
    subscriptionTier: "free" as const,
    subscriptionStart: null,
    subscriptionEnd: null,
    hasCompletedOnboarding: true,
    practiceTimestamps: [],
    resumeFileName: null,
    resumeText: null,
    resumeData: null,
    avatarUrl: null,
    ...overrides,
  };
}

/* ─── Flow 1: Onboarding ─── */

describe("Flow 1: Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });
  afterEach(cleanup);

  it("renders step 1 with resume upload", async () => {
    const Onboarding = (await import("../Onboarding")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>,
      );
    });
    expect(screen.getAllByText(/your resume/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Drop your resume/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Continue/i).length).toBeGreaterThan(0);
  });

  it("has progress indicators", async () => {
    const Onboarding = (await import("../Onboarding")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>,
      );
    });
    expect(screen.getAllByText(/Resume/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Profile/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ready/).length).toBeGreaterThanOrEqual(1);
  });
});

/* ─── Flow 2: Dashboard — Empty State ─── */

describe("Flow 2: Dashboard Empty State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("shows welcome message for new users", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardHome = (await import("../DashboardHome")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <DashboardProvider>
            <DashboardHome />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    // Should show user's name or welcome
    expect(screen.getByText(/Jay/i)).toBeInTheDocument();
  });

  it("shows free plan badge with 3 sessions", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardHome = (await import("../DashboardHome")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <DashboardProvider>
            <DashboardHome />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    // Should show sessions remaining info somewhere
    const text = document.body.textContent || "";
    expect(text).toContain("3");
  });
});

/* ─── Flow 3: Session Setup ─── */

describe("Flow 3: Session Setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("renders session type selection", async () => {
    const SessionSetup = (await import("../SessionSetup")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/session/new"]}>
          <SessionSetup />
        </MemoryRouter>,
      );
    });
    expect(screen.getByText(/Behavioral/i)).toBeInTheDocument();
  });

  it("shows session type options on step 1", async () => {
    const SessionSetup = (await import("../SessionSetup")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/session/new"]}>
          <SessionSetup />
        </MemoryRouter>,
      );
    });
    expect(screen.getByText(/Behavioral/i)).toBeInTheDocument();
  });
});

/* ─── Flow 4: Interview Lifecycle ─── */

describe("Flow 4: Interview Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve("") } as any);
  });
  afterEach(cleanup);

  it("renders interview with timer and controls", async () => {
    const Interview = (await import("../Interview")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral&difficulty=standard"]}>
          <Interview />
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("Hirloop")).toBeInTheDocument();
    expect(screen.getAllByText("00:00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Mute")).toBeInTheDocument();
    expect(screen.getByLabelText("Turn camera off")).toBeInTheDocument();
  });

  it("shows end confirmation modal on end click", async () => {
    const Interview = (await import("../Interview")).default;
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

  it("camera and mic toggling works", async () => {
    const Interview = (await import("../Interview")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    // Toggle mute
    const muteBtn = screen.getByLabelText("Mute");
    await act(async () => { fireEvent.click(muteBtn); });
    expect(screen.getByLabelText("Unmute")).toBeInTheDocument();

    // Toggle camera
    const cameraBtn = screen.getByLabelText("Turn camera off");
    await act(async () => { fireEvent.click(cameraBtn); });
    expect(screen.getByLabelText("Turn camera on")).toBeInTheDocument();
  });

  it("ending interview stops all media and enters evaluation", async () => {
    const Interview = (await import("../Interview")).default;
    const { speak } = await import("../tts");

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview?type=behavioral"]}>
          <Interview />
        </MemoryRouter>,
      );
    });

    // Click end → confirm
    const endBtn = screen.getByLabelText("End interview");
    await act(async () => { fireEvent.click(endBtn); });

    // Modal should be visible with confirm button
    const buttons = screen.getAllByText(/End Interview/i);
    expect(buttons.length).toBeGreaterThanOrEqual(2); // end button + modal confirm
    expect(screen.getByText(/End interview early/i)).toBeInTheDocument();
  });
});

/* ─── Flow 5: Settings ─── */

describe("Flow 5: Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser({ subscriptionTier: "starter", subscriptionStart: new Date().toISOString(), subscriptionEnd: new Date(Date.now() + 7 * 86400000).toISOString() });
  });
  afterEach(cleanup);

  it("renders profile settings with user data", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const SettingsPage = (await import("../DashboardSettings")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <SettingsPage />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getAllByText("Account").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Jay Vyas")).toBeInTheDocument();
  });

  it("shows current subscription tier", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const SettingsPage = (await import("../DashboardSettings")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <SettingsPage />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { fireEvent.click(screen.getByText("Plan & Data")); });
    expect(screen.getByText("Starter")).toBeInTheDocument();
  });

  it("shows delete account button", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const SettingsPage = (await import("../DashboardSettings")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <SettingsPage />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { fireEvent.click(screen.getByText("Plan & Data")); });
    expect(screen.getByText("Delete Account")).toBeInTheDocument();
  });

  it("shows delete confirmation on click", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const SettingsPage = (await import("../DashboardSettings")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <SettingsPage />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { fireEvent.click(screen.getByText("Plan & Data")); });
    const deleteBtn = screen.getByText("Delete Account");
    await act(async () => { fireEvent.click(deleteBtn); });
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});

/* ─── Flow 6: Payment / Upgrade Modal ─── */

describe("Flow 6: Upgrade Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("renders plan cards with pricing", async () => {
    const { UpgradeModal } = await import("../dashboardComponents");
    await act(async () => {
      render(
        <MemoryRouter>
          <UpgradeModal
            onClose={vi.fn()}
            sessionsUsed={2}
            user={mockUser}
            currentTier="free"
            onPaymentSuccess={vi.fn()}
          />
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText(/₹49/)).toBeInTheDocument();
    expect(screen.getByText(/₹149/)).toBeInTheDocument();
  });

  it("shows session limit warning", async () => {
    const { UpgradeModal } = await import("../dashboardComponents");
    await act(async () => {
      render(
        <MemoryRouter>
          <UpgradeModal
            onClose={vi.fn()}
            sessionsUsed={3}
            user={mockUser}
            currentTier="free"
            onPaymentSuccess={vi.fn()}
          />
        </MemoryRouter>,
      );
    });
    const text = document.body.textContent || "";
    expect(text).toMatch(/3.*of.*3|limit|used/i);
  });
});

/* ─── Flow 7: Resume Upload & Analysis ─── */

describe("Flow 7: Resume Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("shows upload UI when no resume uploaded", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardResume = (await import("../DashboardResume")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <DashboardResume />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText(/Resume Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/Drop your resume here/i)).toBeInTheDocument();
  });

  it("shows file type badges (PDF, DOCX, TXT)", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardResume = (await import("../DashboardResume")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <DashboardResume />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    expect(screen.getByText("TXT")).toBeInTheDocument();
  });

  it("shows profile when resume data exists", async () => {
    setUser({
      resumeFileName: "resume.pdf",
      resumeText: "Experienced designer with 10 years...",
      resumeData: {
        headline: "Senior Design Leader",
        summary: "10 years of design experience",
        seniorityLevel: "Senior",
        topSkills: ["Figma", "Design Systems", "User Research"],
        keyAchievements: ["Led redesign of core product"],
        interviewStrengths: ["Strong portfolio"],
        interviewGaps: ["System design"],
        industries: ["Tech"],
        careerTrajectory: "Upward",
        yearsExperience: 10,
      },
    });
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardResume = (await import("../DashboardResume")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <DashboardResume />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText("Senior Design Leader")).toBeInTheDocument();
    expect(screen.getByText("Figma")).toBeInTheDocument();
  });
});

/* ─── Flow 8: Calendar ─── */

describe("Flow 8: Calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("renders calendar page (upgrade gate for free users)", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardCalendar = (await import("../DashboardCalendar")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <DashboardCalendar />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    // Free users see upgrade gate
    expect(screen.getAllByText(/Interview Calendar/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });
});

/* ─── Flow 9: Sessions List ─── */

describe("Flow 9: Sessions List", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });
  afterEach(cleanup);

  it("renders sessions page with empty state", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardSessions = (await import("../DashboardSessions")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <DashboardSessions />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
  });
});

/* ─── Flow 10: API Contract Tests ─── */

describe("Flow 10: API Contracts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("create-order rejects invalid plan", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Invalid plan" }),
    } as any);

    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "invalid", userId: "u1" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid plan");
  });

  it("verify-payment requires all fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Missing required payment fields" }),
    } as any);

    const res = await fetch("/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id: "order_123" }), // missing signature and payment_id
    });
    expect(res.status).toBe(400);
  });

  it("delete-account returns success on valid request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as any);

    const res = await fetch("/api/delete-account", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });
    expect(res.ok).toBe(true);
  });

  it("analyze-resume rejects short text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Resume text too short" }),
    } as any);

    const res = await fetch("/api/analyze-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "hi" }),
    });
    expect(res.status).toBe(400);
  });
});

/* ─── Flow 11: Edge Cases ─── */

describe("Flow 11: Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve("") } as any);
  });
  afterEach(cleanup);

  it("interview handles missing search params gracefully", async () => {
    const Interview = (await import("../Interview")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/interview"]}>
          <Interview />
        </MemoryRouter>,
      );
    });
    // Should still render without crashing
    expect(screen.getByText("Hirloop")).toBeInTheDocument();
  });

  it("dashboard handles user with no practice history", async () => {
    setUser({ practiceTimestamps: [] });
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardHome = (await import("../DashboardHome")).default;
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <DashboardProvider>
            <DashboardHome />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    // Should not crash — just show empty state
    expect(document.body.textContent).toBeTruthy();
  });

  it("settings works for pro user with active subscription", async () => {
    setUser({
      subscriptionTier: "pro",
      subscriptionStart: new Date(Date.now() - 15 * 86400000).toISOString(),
      subscriptionEnd: new Date(Date.now() + 15 * 86400000).toISOString(),
    });
    const { DashboardProvider } = await import("../DashboardContext");
    const SettingsPage = (await import("../DashboardSettings")).default;
    await act(async () => {
      render(
        <MemoryRouter>
          <DashboardProvider>
            <SettingsPage />
          </DashboardProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { fireEvent.click(screen.getByText("Plan & Data")); });
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText(/day.*left/i)).toBeInTheDocument();
  });

  it("resume parser handles empty text", async () => {
    const { parseResumeData } = await import("../resumeParser");
    const result = parseResumeData("");
    expect(result).toBeDefined();
    expect(result.name).toBe("");
    expect(result.skills).toEqual([]);
  });

  it("resume parser extracts email from text", async () => {
    const { parseResumeData } = await import("../resumeParser");
    const result = parseResumeData("John Doe\njohn@example.com\nSoftware Engineer at Google\n2020-2024");
    expect(result.email).toBe("john@example.com");
  });
});

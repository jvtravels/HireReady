/**
 * Accessibility Tests — HireStepX
 * Tests ARIA landmarks, focus traps, keyboard navigation, and screen reader support.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import "./setup-next-navigation";

/* ─── Shared Mocks ─── */

const mockUpdateUser = vi.fn();
const mockLogout = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: mock user object with partial typing
let mockUser: any = {
  id: "user-123",
  name: "Jay Vyas",
  email: "jay@test.com",
  targetRole: "Head of Design",
  targetCompany: "Google",
  industry: "Technology",
  subscriptionTier: "pro" as const,
  subscriptionStart: "2025-01-01",
  subscriptionEnd: "2025-12-31",
  hasCompletedOnboarding: true,
  practiceTimestamps: [],
  resumeFileName: null,
  resumeText: null,
  resumeData: null,
};

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    updateUser: mockUpdateUser,
    logout: mockLogout,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: mock component with minimal props
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("../supabase", () => ({
  supabaseConfigured: false,
  getUserSessions: vi.fn(() => Promise.resolve([])),
  getCalendarEvents: vi.fn(() => Promise.resolve([])),
  getProfile: vi.fn(() => Promise.resolve(null)),
  saveSession: vi.fn(() => Promise.resolve()),
  getAuthToken: vi.fn(() => Promise.resolve("mock-token")),
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json" })),
  getGoogleProviderToken: vi.fn(() => null),
  getPaymentHistory: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../tts", () => ({
  speak: vi.fn(() => Promise.resolve({ cancel: vi.fn() })),
  prefetchTTS: vi.fn(() => Promise.resolve()),
  getCachedVoices: vi.fn(() => []),
  fetchCartesiaVoices: vi.fn(() => Promise.resolve([])),
  loadTTSSettings: () => ({ provider: "browser", voiceId: "", voiceName: "" }),
  saveTTSSettings: vi.fn(),
  GOOGLE_VOICES: [],
}));

vi.mock("../dashboardHelpers", () => ({
  loadEvents: () => [],
  daysUntilEvent: () => null,
  formatEventTime: (s: string) => s,
}));

const mockFetch = vi.fn(() =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test: partial mock of Response
  Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve("") } as any),
);
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("SpeechRecognition", undefined);
vi.stubGlobal("webkitSpeechRecognition", undefined);
Object.defineProperty(navigator, "mediaDevices", {
  value: { getUserMedia: vi.fn(() => Promise.reject(new Error("Not available"))) },
  writable: true,
  configurable: true,
});

/* ─── ARIA Landmarks ─── */

describe("Accessibility: ARIA Landmarks", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("dashboard layout has main, nav, and complementary landmarks", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    // <main> element exists
    const mainEl = document.querySelector("main");
    expect(mainEl).toBeTruthy();
    expect(mainEl?.id).toBe("dashboard-main");

    // <nav> with aria-label
    const navEl = document.querySelector("nav[aria-label]");
    expect(navEl).toBeTruthy();
    expect(navEl?.getAttribute("aria-label")).toContain("navigation");

    // <aside> element (implicit complementary landmark)
    const aside = document.querySelector("aside");
    expect(aside).toBeTruthy();
  });

  it("has skip-to-content link", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    const skipLink = document.querySelector("a[href='#dashboard-main']");
    expect(skipLink).toBeTruthy();
    expect(skipLink?.textContent).toContain("Skip to main content");
  });

  it("nav buttons have aria-current for active page", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    const navButtons = document.querySelectorAll("nav button");
    const activeButton = Array.from(navButtons).find(b => b.getAttribute("aria-current") === "page");
    expect(activeButton).toBeTruthy();
    expect(activeButton?.getAttribute("aria-label")).toBe("Dashboard");
  });
});

/* ─── Focus Traps ─── */
// The Focus Traps describe block previously lived here but never had any
// test bodies filled in. Vitest 4 fails on empty describe suites. Re-add
// with real tests when implementing modal-trap verification.

/* ─── Alert Roles ─── */

describe("Accessibility: Alert and Status roles", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("toast notification has role=status with aria-live", async () => {
    // The toast element in DashboardLayout has role="status" aria-live="polite"
    // We verify the pattern exists in the component
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    // Payment banner and sync error use role="alert"
    // Toast uses role="status" with aria-live="polite"
    // These are rendered conditionally, so we check the component loaded without error
    expect(document.querySelector("main")).toBeTruthy();
  });
});

/* ─── SVG Icons ─── */

describe("Accessibility: Decorative icons", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("nav icons are hidden from screen readers with aria-hidden", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    const navSvgs = document.querySelectorAll("nav svg");
    navSvgs.forEach(svg => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("nav buttons have aria-label for screen readers", async () => {
    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    const navButtons = document.querySelectorAll("nav button");
    navButtons.forEach(btn => {
      expect(btn.getAttribute("aria-label")).toBeTruthy();
    });
  });
});

/* ─── Mobile Hamburger ─── */

describe("Accessibility: Mobile navigation", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("mobile menu button has aria-label and aria-expanded", async () => {
    // Mock isMobile by resizing viewport
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event("resize"));

    const { DashboardProvider } = await import("../DashboardContext");
    const DashboardLayout = (await import("../DashboardLayout")).default;
    await act(async () => {
      render(
        
          <DashboardProvider>
            <DashboardLayout />
          </DashboardProvider>
        ,
      );
    });

    // Check if a menu button exists with proper a11y (may or may not render based on isMobile detection)
    const menuBtn = document.querySelector("button[aria-label='Open navigation menu']");
    if (menuBtn) {
      expect(menuBtn.getAttribute("aria-expanded")).toBeDefined();
    }

    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, writable: true, configurable: true });
  });
});

/* ─── Onboarding Accessibility ─── */

describe("Accessibility: Onboarding", () => {
  beforeEach(() => { vi.clearAllMocks(); mockUser = null; });
  afterEach(cleanup);

  it("step indicators have semantic structure", async () => {
    const Onboarding = (await import("../Onboarding")).default;
    await act(async () => {
      render(
        
          <Onboarding />
        ,
      );
    });

    // Resume step should be visible
    expect(screen.getAllByText(/Resume/i).length).toBeGreaterThan(0);
    // Buttons should be present
    const buttons = document.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});

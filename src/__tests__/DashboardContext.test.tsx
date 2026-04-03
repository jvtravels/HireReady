import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardProvider, useDashboard } from "../DashboardContext";

// Mock auth
const mockUser = {
  id: "u1", name: "Test User", email: "test@test.com",
  targetRole: "EM", subscriptionTier: "free" as const,
  resumeFileName: null, hasCompletedOnboarding: true,
  practiceTimestamps: [],
};

vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

// Mock supabase
vi.mock("../supabase", () => ({
  getUserSessions: vi.fn(() => Promise.resolve([])),
  getCalendarEvents: vi.fn(() => Promise.resolve([])),
}));

// Mock dashboard helpers
vi.mock("../dashboardHelpers", () => ({
  loadEvents: () => [],
}));

function TestConsumer() {
  const ctx = useDashboard();
  return (
    <div>
      <span data-testid="isFree">{String(ctx.isFree)}</span>
      <span data-testid="isStarter">{String(ctx.isStarter)}</span>
      <span data-testid="isPro">{String(ctx.isPro)}</span>
      <span data-testid="displayName">{ctx.displayName}</span>
      <span data-testid="sessionsRemaining">{ctx.sessionsRemaining}</span>
      <span data-testid="dataLoading">{String(ctx.dataLoading)}</span>
      <span data-testid="showUpgrade">{String(ctx.showUpgradeModal)}</span>
      <button data-testid="startSession" onClick={ctx.handleStartSession}>Start</button>
      <button data-testid="openUpgrade" onClick={() => ctx.setShowUpgradeModal(true)}>Upgrade</button>
    </div>
  );
}

function renderWithProviders() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardProvider><TestConsumer /></DashboardProvider>
    </MemoryRouter>,
  );
}

describe("DashboardContext", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useDashboard must be used within DashboardProvider");
    spy.mockRestore();
  });

  it("provides subscription state for free user", async () => {
    await act(async () => { renderWithProviders(); });

    expect(screen.getByTestId("isFree").textContent).toBe("true");
    expect(screen.getByTestId("isStarter").textContent).toBe("false");
    expect(screen.getByTestId("isPro").textContent).toBe("false");
  });

  it("provides display name from user", async () => {
    await act(async () => { renderWithProviders(); });
    expect(screen.getByTestId("displayName").textContent).toBe("Test User");
  });

  it("shows 3 sessions remaining for free tier with 0 sessions", async () => {
    await act(async () => { renderWithProviders(); });
    expect(screen.getByTestId("sessionsRemaining").textContent).toBe("3");
  });

  it("can toggle upgrade modal", async () => {
    await act(async () => { renderWithProviders(); });
    expect(screen.getByTestId("showUpgrade").textContent).toBe("false");

    await act(async () => { screen.getByTestId("openUpgrade").click(); });
    expect(screen.getByTestId("showUpgrade").textContent).toBe("true");
  });
});

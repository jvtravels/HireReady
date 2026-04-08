import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeModal } from "../dashboardComponents";
import { ThemeProvider } from "../ThemeContext";

// Mock supabase
vi.mock("../supabase", () => ({
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json" })),
}));

// Mock AuthContext
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

describe("UpgradeModal", () => {
  const defaultProps = {
    onClose: vi.fn(),
    sessionsUsed: 3,
    user: { id: "u1", email: "test@test.com", name: "Test" },
    currentTier: "free",
    onPaymentSuccess: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it("renders all three plan options", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);

    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("shows current plan indicator for free tier", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows session usage in header", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    expect(screen.getByText(/3 of 3 free sessions/)).toBeInTheDocument();
  });

  it("has role=dialog and aria-modal for accessibility", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape key", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes when clicking overlay backdrop", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not close when clicking modal content", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    fireEvent.click(screen.getByText("Choose Your Plan"));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows Get Started and Go Pro buttons for non-current plans", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Go Pro")).toBeInTheDocument();
  });

  it("marks starter as current when user is on starter plan", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} currentTier="starter" /></ThemeProvider>);
    // Should show "Active" on the starter card, "Manage your plan" in header
    expect(screen.getByText(/Manage your plan/)).toBeInTheDocument();
  });

  it("shows Razorpay footer text", () => {
    render(<ThemeProvider><UpgradeModal {...defaultProps} /></ThemeProvider>);
    expect(screen.getByText(/Razorpay/)).toBeInTheDocument();
  });
});

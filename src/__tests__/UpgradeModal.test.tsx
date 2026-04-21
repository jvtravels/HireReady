import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeModal } from "../dashboardComponents";

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
    render(<UpgradeModal {...defaultProps} />);

    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("shows current plan indicator for free tier", () => {
    render(<UpgradeModal {...defaultProps} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows title in header", () => {
    render(<UpgradeModal {...defaultProps} />);
    expect(screen.getByText("Choose Your Plan")).toBeInTheDocument();
  });

  it("has role=dialog and aria-modal for accessibility", () => {
    render(<UpgradeModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape key", () => {
    render(<UpgradeModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("closes when clicking overlay backdrop", () => {
    render(<UpgradeModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not close when clicking modal content", () => {
    render(<UpgradeModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Choose Your Plan"));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("shows Get Started and Go Pro buttons for non-current plans", () => {
    render(<UpgradeModal {...defaultProps} />);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Go Pro")).toBeInTheDocument();
  });

  it("marks starter as current when user is on starter plan", () => {
    render(<UpgradeModal {...defaultProps} currentTier="starter" />);
    // Should show "Active" on the starter card, "Manage your plan" in header
    expect(screen.getByText(/Manage your plan/)).toBeInTheDocument();
  });

  it("shows Razorpay footer text", () => {
    render(<UpgradeModal {...defaultProps} />);
    expect(screen.getByText(/Razorpay/)).toBeInTheDocument();
  });
});

/**
 * Landing Page Tests — HireStepX
 * Tests pricing, testimonials, FAQ, and accessibility of landing components.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "./setup-next-navigation";
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: null, isLoggedIn: false, updateUser: vi.fn() }),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

// Mock IntersectionObserver for useReveal
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
}
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("Landing Data", () => {
  it("has exactly 5 pricing plans", async () => {
    const { plans } = await import("../landingData");
    expect(plans).toHaveLength(5);
  });

  it("plans have correct names", async () => {
    const { plans } = await import("../landingData");
    const names = plans.map(p => p.name);
    expect(names).toEqual(["Free", "Single Session", "Starter", "Pro", "Annual"]);
  });

  it("each plan has required fields", async () => {
    const { plans } = await import("../landingData");
    for (const plan of plans) {
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("price");
      expect(plan).toHaveProperty("features");
      expect(plan).toHaveProperty("cta");
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("Pro plan is featured", async () => {
    const { plans } = await import("../landingData");
    const pro = plans.find(p => p.name === "Pro");
    expect(pro?.featured).toBe(true);
    const others = plans.filter(p => p.name !== "Pro");
    others.forEach(p => expect(p.featured).toBe(false));
  });

  it("Single Session has planId 'single'", async () => {
    const { plans } = await import("../landingData");
    const single = plans.find(p => p.name === "Single Session");
    expect(single?.planId).toBe("single");
  });

  it("has at least 3 testimonials", async () => {
    const { testimonials } = await import("../landingData");
    expect(testimonials.length).toBeGreaterThanOrEqual(3);
    for (const t of testimonials) {
      expect(t.quote).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.image).toContain("unsplash");
    }
  });

  it("has FAQs with Q&A pairs", async () => {
    const { LANDING_FAQS } = await import("../landingData");
    expect(LANDING_FAQS.length).toBeGreaterThanOrEqual(5);
    for (const faq of LANDING_FAQS) {
      expect(faq.question).toBeTruthy();
      expect(faq.answer).toBeTruthy();
    }
  });
});

describe("PricingSection", () => {
  it("renders all plan names", async () => {
    const { PricingSection } = await import("../landing/PricingSection");
    render(
      
        <PricingSection />
      
    );
    expect(screen.getByText("Less than a cup of chai per session.")).toBeInTheDocument();
    expect(screen.getByText("Start Free")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(screen.getByText("Go Pro")).toBeInTheDocument();
  });

  it("has accessible slider for single session", async () => {
    const { PricingSection } = await import("../landing/PricingSection");
    render(
      
        <PricingSection />
      
    );
    const slider = screen.getByLabelText("Number of sessions");
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "10");
  });

  it("has aria-labels on quantity buttons", async () => {
    const { PricingSection } = await import("../landing/PricingSection");
    render(
      
        <PricingSection />
      
    );
    expect(screen.getByLabelText("Decrease session count")).toBeInTheDocument();
    expect(screen.getByLabelText("Increase session count")).toBeInTheDocument();
  });

  it("updates price when quantity changes", async () => {
    const { PricingSection } = await import("../landing/PricingSection");
    render(
      
        <PricingSection />
      
    );
    const plusBtn = screen.getByLabelText("Increase session count");
    fireEvent.click(plusBtn);
    fireEvent.click(plusBtn);
    // After 2 clicks, quantity = 3, price = ₹30
    expect(screen.getByText("₹30")).toBeInTheDocument();
    expect(screen.getByText(/3 sessions/)).toBeInTheDocument();
  });
});

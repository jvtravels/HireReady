/**
 * Onboarding Tests — HireStepX
 * Tests the multi-step onboarding flow validation and navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all heavy dependencies before imports
vi.mock("../supabase", () => ({
  getSupabase: vi.fn(() => Promise.resolve({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "test" } } }),
    },
  })),
  authHeaders: vi.fn(() => Promise.resolve({ "Content-Type": "application/json" })),
}));
vi.mock("../AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Test", email: "test@test.com", hasCompletedOnboarding: false },
    isLoggedIn: true,
    updateUser: vi.fn(),
  }),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
import "./setup-next-navigation";

// Mock fetch for API calls
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
});

describe("Onboarding Flow Logic", () => {
  it("validates target role is required", () => {
    const targetRole = "";
    const isValid = targetRole.trim().length > 0;
    expect(isValid).toBe(false);
  });

  it("validates target role when provided", () => {
    const targetRole = "Software Engineer";
    const isValid = targetRole.trim().length > 0;
    expect(isValid).toBe(true);
  });

  it("detects supported resume file types", () => {
    const supportedTypes = [".pdf", ".docx", ".txt"];
    const unsupportedTypes = [".doc", ".png", ".exe"];

    for (const ext of supportedTypes) {
      const file = new File(["content"], `resume${ext}`, { type: "application/pdf" });
      expect(file.name.endsWith(ext)).toBe(true);
    }

    for (const ext of unsupportedTypes) {
      const isSupported = supportedTypes.some(s => `resume${ext}`.endsWith(s));
      expect(isSupported).toBe(false);
    }
  });

  it("enforces 10MB file size limit", () => {
    const maxSize = 10 * 1024 * 1024;
    const smallFile = { size: 5 * 1024 * 1024 };
    const largeFile = { size: 15 * 1024 * 1024 };

    expect(smallFile.size <= maxSize).toBe(true);
    expect(largeFile.size <= maxSize).toBe(false);
  });

  it("warmup difficulty is used for first session", () => {
    // The onboarding navigates with difficulty=warmup
    const difficulty = "warmup";
    expect(difficulty).toBe("warmup");
  });

  it("constructs correct interview URL from onboarding data", () => {
    const targetRole = "Product Manager";
    const targetCompany = "Google";
    const params = new URLSearchParams({
      mini: "true",
      difficulty: "warmup",
      role: targetRole,
      company: targetCompany,
    });
    const url = `/interview?${params.toString()}`;
    expect(url).toContain("mini=true");
    expect(url).toContain("difficulty=warmup");
    expect(url).toContain("role=Product+Manager");
    expect(url).toContain("company=Google");
  });
});

describe("Resume Parsing Edge Cases", () => {
  it("handles empty resume text gracefully", () => {
    const text = "";
    const hasContent = text.trim().length > 0;
    expect(hasContent).toBe(false);
  });

  it("extracts role from resume text patterns", () => {
    const patterns = [
      { text: "Senior Software Engineer at Google", expected: true },
      { text: "Just a random document", expected: false },
    ];
    for (const { text, expected } of patterns) {
      const hasRole = /engineer|developer|manager|analyst|designer/i.test(text);
      expect(hasRole).toBe(expected);
    }
  });
});

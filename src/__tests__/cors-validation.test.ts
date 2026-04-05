import { describe, it, expect } from "vitest";

/**
 * Tests for CORS origin validation logic (mirrors _shared.ts and create-order.ts).
 * Ensures the tightened CORS policy works correctly.
 */

function getAllowedOrigin(origin: string, allowedOrigins: string[]): string {
  // Explicit allowlist (production domains)
  if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) return origin;
  // Only allow *.vercel.app wildcard when no explicit origins configured
  if (allowedOrigins.length === 0 && origin.endsWith(".vercel.app")) return origin;
  // Allow localhost in development
  if (origin.startsWith("http://localhost:")) return origin;
  return "";
}

describe("CORS Origin Validation", () => {
  describe("Without explicit allowlist (dev/preview mode)", () => {
    const noAllowList: string[] = [];

    it("allows Vercel preview URLs", () => {
      expect(getAllowedOrigin("https://my-app-abc123.vercel.app", noAllowList)).toBe("https://my-app-abc123.vercel.app");
    });

    it("allows localhost", () => {
      expect(getAllowedOrigin("http://localhost:5173", noAllowList)).toBe("http://localhost:5173");
      expect(getAllowedOrigin("http://localhost:3000", noAllowList)).toBe("http://localhost:3000");
    });

    it("blocks unknown origins", () => {
      expect(getAllowedOrigin("https://evil.com", noAllowList)).toBe("");
      expect(getAllowedOrigin("https://attacker.io", noAllowList)).toBe("");
    });

    it("blocks Vercel-looking subdomains on other TLDs", () => {
      expect(getAllowedOrigin("https://fake.vercel.app.evil.com", noAllowList)).toBe("");
    });
  });

  describe("With explicit allowlist (production mode)", () => {
    const allowList = ["https://hirloop.vercel.app", "https://hirloop.com"];

    it("allows listed origins", () => {
      expect(getAllowedOrigin("https://hirloop.vercel.app", allowList)).toBe("https://hirloop.vercel.app");
      expect(getAllowedOrigin("https://hirloop.com", allowList)).toBe("https://hirloop.com");
    });

    it("blocks unlisted Vercel preview URLs when allowlist is set", () => {
      expect(getAllowedOrigin("https://other-preview-abc.vercel.app", allowList)).toBe("");
    });

    it("blocks random origins", () => {
      expect(getAllowedOrigin("https://evil.com", allowList)).toBe("");
    });

    it("still allows localhost for development", () => {
      expect(getAllowedOrigin("http://localhost:5173", allowList)).toBe("http://localhost:5173");
    });
  });

  describe("Edge cases", () => {
    it("empty origin returns empty string", () => {
      expect(getAllowedOrigin("", [])).toBe("");
    });

    it("blocks https://localhost (not http)", () => {
      // Our check is startsWith("http://localhost:")
      expect(getAllowedOrigin("https://localhost:5173", [])).toBe("");
    });

    it("blocks vercel.app without subdomain", () => {
      // "https://vercel.app" does NOT end with ".vercel.app" — it's blocked
      expect(getAllowedOrigin("https://vercel.app", [])).toBe("");
    });

    it("handles origin with trailing path (shouldn't happen but be safe)", () => {
      // Origins don't have paths, but test defensive behavior
      expect(getAllowedOrigin("https://evil.com/vercel.app", [])).toBe("");
    });
  });
});

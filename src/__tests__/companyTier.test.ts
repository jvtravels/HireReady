import { describe, it, expect } from "vitest";
import { classifyCompanyTier, tierPromptSuffix } from "../../server-handlers/_company-tier";

describe("classifyCompanyTier", () => {
  it("classifies tier-1 service companies", () => {
    expect(classifyCompanyTier("TCS")).toBe("service");
    expect(classifyCompanyTier("Tata Consultancy Services")).toBe("service");
    expect(classifyCompanyTier("Infosys Limited")).toBe("service");
    expect(classifyCompanyTier("wipro")).toBe("service");
    expect(classifyCompanyTier("Cognizant Technology")).toBe("service");
  });

  it("classifies Indian product companies", () => {
    expect(classifyCompanyTier("Razorpay")).toBe("product-india");
    expect(classifyCompanyTier("Zerodha Broking")).toBe("product-india");
    expect(classifyCompanyTier("CRED")).toBe("product-india");
    expect(classifyCompanyTier("Flipkart")).toBe("product-india");
    expect(classifyCompanyTier("PhonePe Pvt Ltd")).toBe("product-india");
  });

  it("classifies global product companies", () => {
    expect(classifyCompanyTier("Google")).toBe("product-global");
    expect(classifyCompanyTier("Amazon India")).toBe("product-global");
    expect(classifyCompanyTier("Microsoft Bangalore")).toBe("product-global");
    expect(classifyCompanyTier("Adobe India")).toBe("product-global");
  });

  it("classifies early-stage startups by heuristic", () => {
    expect(classifyCompanyTier("BrightLabs")).toBe("startup");
    expect(classifyCompanyTier("Synaptic.io")).toBe("startup");
    expect(classifyCompanyTier("Stealth mode startup")).toBe("startup");
  });

  it("returns default for unknown / empty companies", () => {
    expect(classifyCompanyTier("")).toBe("default");
    expect(classifyCompanyTier(null)).toBe("default");
    expect(classifyCompanyTier(undefined)).toBe("default");
    expect(classifyCompanyTier("Some Random Pvt Ltd")).toBe("default");
  });

  it("is case- and punctuation-insensitive", () => {
    expect(classifyCompanyTier("RAZORPAY!!")).toBe("product-india");
    expect(classifyCompanyTier("  google  ")).toBe("product-global");
  });
});

describe("tierPromptSuffix", () => {
  it("returns a non-empty suffix for known tiers", () => {
    expect(tierPromptSuffix("service")).toMatch(/services/i);
    expect(tierPromptSuffix("product-india")).toMatch(/founder-mode/i);
    expect(tierPromptSuffix("product-global")).toMatch(/leadership principles/i);
    expect(tierPromptSuffix("startup")).toMatch(/early-stage/i);
  });

  it("returns empty for default tier", () => {
    expect(tierPromptSuffix("default")).toBe("");
  });
});

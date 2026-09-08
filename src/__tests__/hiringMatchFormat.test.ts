import { describe, it, expect } from "vitest";
import { daysAgo, formatComp, formatExperience, WORK_MODE_LABEL } from "../hiringMatchFormat";

describe("daysAgo", () => {
  it("returns 'today' for a timestamp from right now", () => {
    expect(daysAgo(new Date().toISOString())).toBe("today");
  });

  it("returns 'today' for a timestamp in the future", () => {
    expect(daysAgo(new Date(Date.now() + 86_400_000).toISOString())).toBe("today");
  });

  it("returns '1 day ago' for exactly one day back", () => {
    expect(daysAgo(new Date(Date.now() - 86_400_000).toISOString())).toBe("1 day ago");
  });

  it("returns '<n> days ago' for under a month", () => {
    expect(daysAgo(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe("5 days ago");
  });

  it("returns '1 month ago' for exactly 30 days", () => {
    expect(daysAgo(new Date(Date.now() - 30 * 86_400_000).toISOString())).toBe("1 month ago");
  });

  it("returns '<n> months ago' for multiple months", () => {
    expect(daysAgo(new Date(Date.now() - 65 * 86_400_000).toISOString())).toBe("2 months ago");
  });
});

describe("formatComp", () => {
  it("returns null when both bounds are missing", () => {
    expect(formatComp(null, null)).toBeNull();
  });

  it("formats a range when both bounds are present", () => {
    expect(formatComp(10, 15)).toBe("₹10–15L");
  });

  it("formats a single value when only min is present", () => {
    expect(formatComp(12, null)).toBe("₹12L");
  });

  it("formats a single value when only max is present", () => {
    expect(formatComp(null, 18)).toBe("₹18L");
  });
});

describe("formatExperience", () => {
  it("returns null when both bounds are missing", () => {
    expect(formatExperience(null, null)).toBeNull();
  });

  it("formats a range when both bounds are present", () => {
    expect(formatExperience(2, 4)).toBe("2–4 yrs");
  });

  it("formats a floor value when only min is present", () => {
    expect(formatExperience(3, null)).toBe("3+ yrs");
  });

  it("formats a floor value when only max is present", () => {
    expect(formatExperience(null, 6)).toBe("6+ yrs");
  });
});

describe("WORK_MODE_LABEL", () => {
  it("maps known work-mode keys to display labels", () => {
    expect(WORK_MODE_LABEL.remote).toBe("Remote");
    expect(WORK_MODE_LABEL.onsite).toBe("On-site");
    expect(WORK_MODE_LABEL.hybrid).toBe("Hybrid");
  });
});

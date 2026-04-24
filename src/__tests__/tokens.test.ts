import { describe, it, expect } from "vitest";
import { c, font } from "../tokens";

describe("design tokens", () => {
  it("exports all required colors", () => {
    expect(c.obsidian).toBe("#060607");
    expect(c.graphite).toBe("#111113");
    expect(c.ivory).toBe("#F5F2ED");
    expect(c.gilt).toBe("#D4B37F");
    expect(c.sage).toBe("#7A9E7E");
    // Brightened from #C4705A to #D17E68 in commit a6d9b5d for better
    // 6.3:1 contrast on obsidian; test was stale until noUnusedLocals
    // surfaced the drift during a coverage cleanup.
    expect(c.ember).toBe("#D17E68");
  });

  it("exports font families", () => {
    expect(font.display).toContain("Instrument Serif");
    expect(font.ui).toContain("Inter");
    expect(font.mono).toContain("JetBrains Mono");
  });
});

import { describe, it, expect } from "vitest";
import { c, font } from "../tokens";

describe("design tokens", () => {
  it("exports all required colors", () => {
    expect(c.obsidian).toBe("#0A0A0B");
    expect(c.graphite).toBe("#161618");
    expect(c.ivory).toBe("#F0EDE8");
    expect(c.gilt).toBe("#C9A96E");
    expect(c.sage).toBe("#7A9E7E");
    expect(c.ember).toBe("#C4705A");
  });

  it("exports font families", () => {
    expect(font.display).toContain("Instrument Serif");
    expect(font.ui).toContain("Inter");
    expect(font.mono).toContain("JetBrains Mono");
  });
});

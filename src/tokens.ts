/* ─── HireReady Design Tokens ─── */
/* Single source of truth for colors, fonts, and spacing across all screens */

export const c = {
  obsidian: "#0A0A0B",
  graphite: "#161618",
  ivory: "#F0EDE8",
  stone: "#9A9590",      // 5.3:1 on obsidian — WCAG AA compliant
  chalk: "#C5C0BA",
  gilt: "#C9A96E",
  sage: "#7A9E7E",
  ember: "#C4705A",
  slate: "#7E8D98",      // 5.1:1 on obsidian — WCAG AA (was #5B6770 at 3.4:1)
  border: "rgba(240, 237, 232, 0.06)",
  borderHover: "rgba(240, 237, 232, 0.12)",
  glow: "rgba(201, 169, 110, 0.06)",
};

export const font = {
  display: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

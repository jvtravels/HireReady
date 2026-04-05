/* ─── HireReady Design Tokens ─── */
/* Single source of truth for colors, fonts, and spacing across all screens */

export const c = {
  obsidian: "#0A0A0B",
  graphite: "#161618",
  ivory: "#F0EDE8",
  stone: "#9A9590",      // 5.3:1 on obsidian — WCAG AA compliant
  chalk: "#C5C0BA",
  gilt: "#C9A96E",
  giltDark: "#B8923E",   // Darker gilt for gradients and hover states
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

/* ─── Spacing Scale (4px base) ─── */
export const sp = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
  "5xl": 64,
  section: 96,
} as const;

/* ─── Shared Border Radius ─── */
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 14,
  pill: 100,
} as const;

/* ─── Z-Index Scale ─── */
export const z = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 50,
  modal: 90,
  toast: 100,
} as const;

/* ─── Shadows ─── */
export const shadow = {
  sm: "0 1px 3px rgba(0,0,0,0.2)",
  md: "0 4px 16px rgba(0,0,0,0.3)",
  lg: "0 8px 32px rgba(0,0,0,0.4)",
  glow: "0 0 24px rgba(201,169,110,0.08)",
} as const;

/* ─── Animation Durations ─── */
export const duration = {
  fast: "0.15s",
  normal: "0.2s",
  slow: "0.3s",
  enter: "0.25s",
} as const;

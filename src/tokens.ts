/* ─── HireStepX Design Tokens ─── */
/* Premium dark luxury design system */

export const c = {
  /* Surfaces */
  obsidian: "#060607",
  graphite: "#111113",
  carbon: "#191919",       // Elevated surface
  onyx: "#1E1E20",         // Card hover / raised elements

  /* Text */
  ivory: "#F5F2ED",
  chalk: "#CCC7C0",
  stone: "#8E8983",        // 5.3:1 on obsidian — WCAG AA

  /* Brand */
  gilt: "#D4B37F",
  giltDark: "#B8923E",
  giltLight: "#E8D5AE",    // Soft gold for subtle accents

  /* Semantic */
  sage: "#7A9E7E",
  sageLight: "#A3C5A7",
  ember: "#C4705A",
  emberLight: "#E0917B",
  slate: "#7E8D98",
  slateLight: "#A0B0BC",

  /* Borders & effects */
  border: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.10)",
  borderSubtle: "rgba(255, 255, 255, 0.03)",
  glass: "rgba(17, 17, 19, 0.7)",
  glassBright: "rgba(30, 30, 32, 0.8)",
  glow: "rgba(212, 179, 127, 0.06)",
  glowStrong: "rgba(212, 179, 127, 0.12)",
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
  md: 10,
  lg: 14,
  xl: 18,
  "2xl": 24,
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
  sm: "0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)",
  md: "0 4px 12px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)",
  lg: "0 12px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.2)",
  xl: "0 20px 60px rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.25)",
  glow: "0 0 30px rgba(212,179,127,0.08), 0 0 60px rgba(212,179,127,0.04)",
  glowStrong: "0 0 40px rgba(212,179,127,0.15), 0 0 80px rgba(212,179,127,0.06)",
  inner: "inset 0 1px 0 rgba(255,255,255,0.03)",
} as const;

/* ─── Gradients ─── */
export const gradient = {
  giltShine: "linear-gradient(135deg, #D4B37F 0%, #E8D5AE 50%, #D4B37F 100%)",
  giltSubtle: "linear-gradient(135deg, rgba(212,179,127,0.12) 0%, rgba(212,179,127,0.04) 100%)",
  surface: "linear-gradient(180deg, #111113 0%, #0D0D0E 100%)",
  surfaceCard: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)",
  meshBg: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,179,127,0.06) 0%, transparent 60%)",
  sageBg: "radial-gradient(ellipse at center, rgba(122,158,126,0.06) 0%, transparent 70%)",
  emberBg: "radial-gradient(ellipse at center, rgba(196,112,90,0.06) 0%, transparent 70%)",
} as const;

/* ─── Animation Durations ─── */
export const duration = {
  fast: "0.15s",
  normal: "0.2s",
  slow: "0.35s",
  enter: "0.4s",
} as const;

/* ─── Easing ─── */
export const ease = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/* ─── Hirloop Design Tokens ─── */
/* Light & Dark mode design system */

export interface ColorTokens {
  /* Surfaces */
  obsidian: string;
  graphite: string;
  carbon: string;
  onyx: string;

  /* Text */
  ivory: string;
  chalk: string;
  stone: string;

  /* Brand */
  gilt: string;
  giltDark: string;
  giltLight: string;

  /* Semantic */
  sage: string;
  sageLight: string;
  ember: string;
  emberLight: string;
  slate: string;
  slateLight: string;

  /* Borders & effects */
  border: string;
  borderHover: string;
  borderSubtle: string;
  glass: string;
  glassBright: string;
  glow: string;
  glowStrong: string;
}

export interface ShadowTokens {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  glow: string;
  glowStrong: string;
  inner: string;
}

export interface GradientTokens {
  giltShine: string;
  giltSubtle: string;
  surface: string;
  surfaceCard: string;
  meshBg: string;
  sageBg: string;
  emberBg: string;
}

/* ─── Dark Theme ─── */
export const darkColors: ColorTokens = {
  obsidian: "#060607",
  graphite: "#111113",
  carbon: "#191919",
  onyx: "#1E1E20",
  ivory: "#F5F2ED",
  chalk: "#CCC7C0",
  stone: "#8E8983",
  gilt: "#D4B37F",
  giltDark: "#B8923E",
  giltLight: "#E8D5AE",
  sage: "#7A9E7E",
  sageLight: "#A3C5A7",
  ember: "#C4705A",
  emberLight: "#E0917B",
  slate: "#7E8D98",
  slateLight: "#A0B0BC",
  border: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.10)",
  borderSubtle: "rgba(255, 255, 255, 0.03)",
  glass: "rgba(17, 17, 19, 0.7)",
  glassBright: "rgba(30, 30, 32, 0.8)",
  glow: "rgba(212, 179, 127, 0.06)",
  glowStrong: "rgba(212, 179, 127, 0.12)",
};

/* ─── Light Theme ─── */
export const lightColors: ColorTokens = {
  obsidian: "#FAFAF8",
  graphite: "#FFFFFF",
  carbon: "#F5F3EF",
  onyx: "#EFECE6",
  ivory: "#1A1A1A",
  chalk: "#4A4744",
  stone: "#8E8983",
  gilt: "#B8923E",
  giltDark: "#96752E",
  giltLight: "#D4B37F",
  sage: "#2D7A3A",
  sageLight: "#E8F5E9",
  ember: "#C4705A",
  emberLight: "#FFF3F0",
  slate: "#5A6B78",
  slateLight: "#E8ECF0",
  border: "rgba(0, 0, 0, 0.08)",
  borderHover: "rgba(0, 0, 0, 0.14)",
  borderSubtle: "rgba(0, 0, 0, 0.04)",
  glass: "rgba(255, 255, 255, 0.85)",
  glassBright: "rgba(245, 243, 239, 0.9)",
  glow: "rgba(184, 146, 62, 0.06)",
  glowStrong: "rgba(184, 146, 62, 0.12)",
};

export const darkShadow: ShadowTokens = {
  sm: "0 1px 2px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)",
  md: "0 4px 12px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)",
  lg: "0 12px 40px rgba(0,0,0,0.35), 0 4px 12px rgba(0,0,0,0.2)",
  xl: "0 20px 60px rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.25)",
  glow: "0 0 30px rgba(212,179,127,0.08), 0 0 60px rgba(212,179,127,0.04)",
  glowStrong: "0 0 40px rgba(212,179,127,0.15), 0 0 80px rgba(212,179,127,0.06)",
  inner: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

export const lightShadow: ShadowTokens = {
  sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  md: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
  lg: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
  xl: "0 20px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06)",
  glow: "0 0 30px rgba(184,146,62,0.06), 0 0 60px rgba(184,146,62,0.03)",
  glowStrong: "0 0 40px rgba(184,146,62,0.12), 0 0 80px rgba(184,146,62,0.05)",
  inner: "inset 0 1px 0 rgba(0,0,0,0.03)",
};

export const darkGradient: GradientTokens = {
  giltShine: "linear-gradient(135deg, #D4B37F 0%, #E8D5AE 50%, #D4B37F 100%)",
  giltSubtle: "linear-gradient(135deg, rgba(212,179,127,0.12) 0%, rgba(212,179,127,0.04) 100%)",
  surface: "linear-gradient(180deg, #111113 0%, #0D0D0E 100%)",
  surfaceCard: "linear-gradient(180deg, rgba(30,30,32,0.5) 0%, rgba(17,17,19,0.5) 100%)",
  meshBg: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,179,127,0.06) 0%, transparent 60%)",
  sageBg: "radial-gradient(ellipse at center, rgba(122,158,126,0.06) 0%, transparent 70%)",
  emberBg: "radial-gradient(ellipse at center, rgba(196,112,90,0.06) 0%, transparent 70%)",
};

export const lightGradient: GradientTokens = {
  giltShine: "linear-gradient(135deg, #B8923E 0%, #D4B37F 50%, #B8923E 100%)",
  giltSubtle: "linear-gradient(135deg, rgba(184,146,62,0.08) 0%, rgba(184,146,62,0.02) 100%)",
  surface: "linear-gradient(180deg, #FFFFFF 0%, #FAFAF8 100%)",
  surfaceCard: "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(245,243,239,0.8) 100%)",
  meshBg: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(184,146,62,0.05) 0%, transparent 60%)",
  sageBg: "radial-gradient(ellipse at center, rgba(45,122,58,0.05) 0%, transparent 70%)",
  emberBg: "radial-gradient(ellipse at center, rgba(196,112,90,0.05) 0%, transparent 70%)",
};

/** @deprecated Use useTheme() hook instead. Kept for non-component files. */
export const c = darkColors;

/** @deprecated Use useTheme() hook instead. */
export const shadow = darkShadow;

/** @deprecated Use useTheme() hook instead. */
export const gradient = darkGradient;

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

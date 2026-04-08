import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import {
  darkColors, lightColors,
  darkShadow, lightShadow,
  darkGradient, lightGradient,
  type ColorTokens, type ShadowTokens, type GradientTokens,
} from "./tokens";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  c: ColorTokens;
  shadow: ShadowTokens;
  gradient: GradientTokens;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "hirloop_theme";

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return "light";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  const setTheme = (m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch {}
    document.documentElement.dataset.theme = m;
  };

  const toggleTheme = () => setTheme(mode === "dark" ? "light" : "dark");

  // Set data-theme on mount
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    c: mode === "dark" ? darkColors : lightColors,
    shadow: mode === "dark" ? darkShadow : lightShadow,
    gradient: mode === "dark" ? darkGradient : lightGradient,
    isDark: mode === "dark",
    toggleTheme,
    setTheme,
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

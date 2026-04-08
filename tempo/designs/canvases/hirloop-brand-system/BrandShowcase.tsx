import React, { useState } from "react";

/* ═══════════════════════════════════════════════
   HIRLOOP BRAND SYSTEM — Light & Dark Mode
   Premium · Clean · Modern · Interactive
   ═══════════════════════════════════════════════ */

/* ─── Dark Mode Tokens ─── */
const dark = {
  // Surfaces
  bg: "#060607",
  surface: "#111113",
  surfaceRaised: "#191919",
  surfaceHover: "#1E1E20",
  // Text
  text: "#F5F2ED",
  textSecondary: "#CCC7C0",
  textMuted: "#8E8983",
  // Brand
  gold: "#D4B37F",
  goldDark: "#B8923E",
  goldLight: "#E8D5AE",
  // Semantic
  success: "#7A9E7E",
  successLight: "#A3C5A7",
  error: "#C4705A",
  errorLight: "#E0917B",
  info: "#7E8D98",
  // Borders
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.10)",
};

/* ─── Light Mode Tokens ─── */
const light = {
  // Surfaces
  bg: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceRaised: "#F5F3EF",
  surfaceHover: "#EFECE6",
  // Text
  text: "#1A1A1A",
  textSecondary: "#4A4744",
  textMuted: "#8E8983",
  // Brand
  gold: "#B8923E",
  goldDark: "#96752E",
  goldLight: "#D4B37F",
  // Semantic
  success: "#2D7A3A",
  successLight: "#E8F5E9",
  error: "#C4705A",
  errorLight: "#FFF3F0",
  info: "#5A6B78",
  // Borders
  border: "rgba(0,0,0,0.08)",
  borderHover: "rgba(0,0,0,0.14)",
};

const fontDisplay = "'Instrument Serif', Georgia, serif";
const fontUI = "'Inter', -apple-system, sans-serif";
const fontMono = "'JetBrains Mono', monospace";

/* ═══ COLOR PALETTE SHOWCASE ═══ */
export function ColorPalette() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const t = mode === "dark" ? dark : light;

  const swatchGroups = [
    {
      label: "Surfaces",
      colors: [
        { name: "Background", value: mode === "dark" ? "#060607" : "#FAFAF8" },
        { name: "Surface", value: mode === "dark" ? "#111113" : "#FFFFFF" },
        { name: "Raised", value: mode === "dark" ? "#191919" : "#F5F3EF" },
        { name: "Hover", value: mode === "dark" ? "#1E1E20" : "#EFECE6" },
      ],
    },
    {
      label: "Brand Gold",
      colors: [
        { name: "Gold Light", value: mode === "dark" ? "#E8D5AE" : "#D4B37F" },
        { name: "Gold", value: mode === "dark" ? "#D4B37F" : "#B8923E" },
        { name: "Gold Dark", value: mode === "dark" ? "#B8923E" : "#96752E" },
      ],
    },
    {
      label: "Text",
      colors: [
        { name: "Primary", value: mode === "dark" ? "#F5F2ED" : "#1A1A1A" },
        { name: "Secondary", value: mode === "dark" ? "#CCC7C0" : "#4A4744" },
        { name: "Muted", value: mode === "dark" ? "#8E8983" : "#8E8983" },
      ],
    },
    {
      label: "Semantic",
      colors: [
        { name: "Success", value: mode === "dark" ? "#7A9E7E" : "#2D7A3A" },
        { name: "Error", value: mode === "dark" ? "#C4705A" : "#C4705A" },
        { name: "Info", value: mode === "dark" ? "#7E8D98" : "#5A6B78" },
      ],
    },
  ];

  return (
    <div style={{ background: t.bg, padding: 40, borderRadius: 20, fontFamily: fontUI, minHeight: 520, transition: "all 0.4s ease" }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h2 style={{ fontFamily: fontDisplay, fontSize: 24, color: t.text, margin: "0 0 4px", fontWeight: 400 }}>Color Palette</h2>
          <p style={{ fontSize: 12, color: t.textMuted, margin: 0 }}>Hirloop Design System</p>
        </div>
        <div style={{ display: "flex", background: t.surfaceRaised, borderRadius: 10, padding: 3, border: `1px solid ${t.border}` }}>
          {(["dark", "light"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: "none", textTransform: "capitalize", transition: "all 0.2s ease",
                background: mode === m ? t.gold : "transparent",
                color: mode === m ? (m === "dark" ? "#060607" : "#FFFFFF") : t.textMuted,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Swatch groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {swatchGroups.map((group) => (
          <div key={group.label}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 10 }}>
              {group.label}
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              {group.colors.map((color) => (
                <div key={color.name} style={{ flex: 1 }}>
                  <div style={{
                    height: 48, borderRadius: 10, background: color.value,
                    border: `1px solid ${t.border}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }} />
                  <span style={{ fontSize: 10, color: t.textSecondary, display: "block", marginTop: 6 }}>{color.name}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 9, color: t.textMuted }}>{color.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ TYPOGRAPHY SHOWCASE ═══ */
export function Typography() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const t = mode === "dark" ? dark : light;

  return (
    <div style={{ background: t.bg, padding: 40, borderRadius: 20, fontFamily: fontUI, minHeight: 520, transition: "all 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 24, color: t.text, margin: 0, fontWeight: 400 }}>Typography</h2>
        <div style={{ display: "flex", background: t.surfaceRaised, borderRadius: 10, padding: 3, border: `1px solid ${t.border}` }}>
          {(["dark", "light"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "none", textTransform: "capitalize", transition: "all 0.2s ease",
              background: mode === m ? t.gold : "transparent",
              color: mode === m ? (m === "dark" ? "#060607" : "#FFFFFF") : t.textMuted,
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Display */}
        <div style={{ padding: 20, borderRadius: 14, background: t.surface, border: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.gold, display: "block", marginBottom: 8 }}>Display — Instrument Serif</span>
          <p style={{ fontFamily: fontDisplay, fontSize: 36, color: t.text, margin: "0 0 4px", fontWeight: 400, lineHeight: 1.2 }}>
            Analysis Report & Answer Key
          </p>
          <p style={{ fontFamily: fontDisplay, fontSize: 24, color: t.textSecondary, margin: 0, fontWeight: 400 }}>
            Your Interview Performance
          </p>
        </div>

        {/* UI */}
        <div style={{ padding: 20, borderRadius: 14, background: t.surface, border: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.gold, display: "block", marginBottom: 8 }}>UI — Inter</span>
          <p style={{ fontFamily: fontUI, fontSize: 18, fontWeight: 600, color: t.text, margin: "0 0 8px" }}>Section Heading — 18px Semibold</p>
          <p style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 500, color: t.text, margin: "0 0 6px" }}>Body Text — 14px Medium</p>
          <p style={{ fontFamily: fontUI, fontSize: 13, color: t.textSecondary, margin: "0 0 6px", lineHeight: 1.6 }}>
            Secondary body — 13px Regular. Used for descriptions, helper text, and supporting content throughout the interface.
          </p>
          <p style={{ fontFamily: fontUI, fontSize: 11, color: t.textMuted, margin: 0 }}>Caption — 11px Muted</p>
        </div>

        {/* Mono */}
        <div style={{ padding: 20, borderRadius: 14, background: t.surface, border: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.gold, display: "block", marginBottom: 8 }}>Mono — JetBrains Mono</span>
          <p style={{ fontFamily: fontMono, fontSize: 28, fontWeight: 700, color: t.text, margin: "0 0 4px" }}>
            86<span style={{ fontSize: 14, color: t.textMuted }}>/100</span>
          </p>
          <p style={{ fontFamily: fontMono, fontSize: 12, color: t.textSecondary, margin: 0 }}>Scores, metrics, and data values</p>
        </div>
      </div>
    </div>
  );
}

/* ═══ COMPONENT SHOWCASE ═══ */
export function Components() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const t = mode === "dark" ? dark : light;
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div style={{ background: t.bg, padding: 40, borderRadius: 20, fontFamily: fontUI, minHeight: 700, transition: "all 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 24, color: t.text, margin: 0, fontWeight: 400 }}>Components</h2>
        <div style={{ display: "flex", background: t.surfaceRaised, borderRadius: 10, padding: 3, border: `1px solid ${t.border}` }}>
          {(["dark", "light"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "none", textTransform: "capitalize", transition: "all 0.2s ease",
              background: mode === m ? t.gold : "transparent",
              color: mode === m ? (m === "dark" ? "#060607" : "#FFFFFF") : t.textMuted,
            }}>{m}</button>
          ))}
        </div>
      </div>

      {/* ── Buttons ── */}
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 12 }}>Buttons</span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={{
            padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${t.gold}, ${t.goldDark})`,
            color: mode === "dark" ? "#060607" : "#FFFFFF",
            fontSize: 13, fontWeight: 600, fontFamily: fontUI,
            boxShadow: `0 2px 12px ${t.gold}30`,
            transition: "all 0.2s ease",
          }}>Primary Action</button>

          <button style={{
            padding: "10px 24px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: `1px solid ${t.border}`,
            color: t.text, fontSize: 13, fontWeight: 500, fontFamily: fontUI,
            transition: "all 0.2s ease",
          }}>Secondary</button>

          <button style={{
            padding: "10px 24px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: "none",
            color: t.gold, fontSize: 13, fontWeight: 500, fontFamily: fontUI,
            transition: "all 0.2s ease",
          }}>Text Link</button>

          <button style={{
            padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
            background: mode === "dark" ? "rgba(196,112,90,0.12)" : "#FFF3F0",
            color: t.error, fontSize: 13, fontWeight: 600, fontFamily: fontUI,
          }}>Danger</button>
        </div>
      </div>

      {/* ── Badges ── */}
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 12 }}>Badges & Tags</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Strong", color: t.success, bg: mode === "dark" ? "rgba(122,158,126,0.12)" : t.successLight },
            { label: "Good", color: t.gold, bg: mode === "dark" ? "rgba(212,179,127,0.12)" : "#FFF8ED" },
            { label: "Partial", color: "#E89B5A", bg: mode === "dark" ? "rgba(232,155,90,0.12)" : "#FFF5EB" },
            { label: "Weak", color: t.error, bg: mode === "dark" ? "rgba(196,112,90,0.12)" : t.errorLight },
            { label: "STAR Format", color: t.success, bg: mode === "dark" ? "rgba(122,158,126,0.1)" : t.successLight },
            { label: "Behavioral", color: t.gold, bg: mode === "dark" ? "rgba(212,179,127,0.08)" : "#FFF8ED" },
            { label: "Pro", color: t.gold, bg: mode === "dark" ? "rgba(212,179,127,0.08)" : "#FFF8ED" },
          ].map((b) => (
            <span key={b.label} style={{
              fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              color: b.color, background: b.bg,
            }}>{b.label}</span>
          ))}
        </div>
      </div>

      {/* ── Inputs ── */}
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 12 }}>Inputs</span>
        <div style={{ display: "flex", gap: 12 }}>
          <input
            placeholder="Target role..."
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: t.surface, border: `1px solid ${t.border}`, color: t.text,
              fontFamily: fontUI, outline: "none",
            }}
          />
          <select style={{
            padding: "10px 14px", borderRadius: 10, fontSize: 13,
            background: t.surface, border: `1px solid ${t.border}`, color: t.text,
            fontFamily: fontUI, outline: "none", cursor: "pointer",
          }}>
            <option>Behavioral</option>
            <option>Technical</option>
          </select>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 12 }}>Tabs</span>
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${t.border}` }}>
          {["Overview", "Analytics", "Sessions", "Calendar"].map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "10px 20px", fontSize: 13, fontWeight: activeTab === i ? 600 : 400,
                color: activeTab === i ? t.gold : t.textMuted,
                background: "none", border: "none", cursor: "pointer",
                borderBottom: activeTab === i ? `2px solid ${t.gold}` : "2px solid transparent",
                fontFamily: fontUI, transition: "all 0.2s ease",
              }}
            >{tab}</button>
          ))}
        </div>
      </div>

      {/* ── Cards ── */}
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textMuted, display: "block", marginBottom: 12 }}>Cards</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{
            padding: "20px", borderRadius: 14,
            background: t.surface, border: `1px solid ${t.border}`,
            transition: "all 0.2s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: t.gold, background: mode === "dark" ? "rgba(212,179,127,0.08)" : "#FFF8ED", padding: "3px 8px", borderRadius: 4 }}>Behavioral</span>
              <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: t.text }}>86</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: "0 0 4px" }}>Leadership Interview</p>
            <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>Apr 8 · 18 min · Standard</p>
          </div>
          <div style={{
            padding: "20px", borderRadius: 14,
            background: `linear-gradient(135deg, ${mode === "dark" ? "rgba(212,179,127,0.06)" : "rgba(184,146,62,0.04)"} 0%, ${t.surface} 100%)`,
            border: `1px solid ${mode === "dark" ? "rgba(212,179,127,0.12)" : "rgba(184,146,62,0.1)"}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: t.text, margin: "0 0 4px" }}>Upgrade to Pro</p>
            <p style={{ fontSize: 11, color: t.textMuted, margin: "0 0 12px" }}>Unlimited sessions & AI coaching</p>
            <button style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: `linear-gradient(135deg, ${t.gold}, ${t.goldDark})`,
              color: mode === "dark" ? "#060607" : "#FFFFFF",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: fontUI,
            }}>Upgrade Now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ SCORE & METRIC CARDS ═══ */
export function MetricCards() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const t = mode === "dark" ? dark : light;

  return (
    <div style={{ background: t.bg, padding: 40, borderRadius: 20, fontFamily: fontUI, minHeight: 520, transition: "all 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 24, color: t.text, margin: 0, fontWeight: 400 }}>Score & Metrics</h2>
        <div style={{ display: "flex", background: t.surfaceRaised, borderRadius: 10, padding: 3, border: `1px solid ${t.border}` }}>
          {(["dark", "light"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "none", textTransform: "capitalize", transition: "all 0.2s ease",
              background: mode === m ? t.gold : "transparent",
              color: mode === m ? (m === "dark" ? "#060607" : "#FFFFFF") : t.textMuted,
            }}>{m}</button>
          ))}
        </div>
      </div>

      {/* Overall score */}
      <div style={{ display: "flex", gap: 24, marginBottom: 28 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            border: `3px solid ${t.success}`,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 30px ${t.success}20`,
          }}>
            <span style={{ fontFamily: fontMono, fontSize: 32, fontWeight: 700, color: t.text, lineHeight: 1 }}>86</span>
            <span style={{ fontSize: 10, color: t.success, fontWeight: 600 }}>/100</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.success, marginTop: 8, display: "block" }}>Strong</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { name: "Communication", score: 90 },
            { name: "Structure", score: 78 },
            { name: "Technical Depth", score: 85 },
            { name: "Leadership", score: 82 },
          ].map((skill) => (
            <div key={skill.name}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: t.textSecondary }}>{skill.name}</span>
                <span style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 600, color: t.text }}>{skill.score}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", overflow: "hidden" }}>
                <div style={{
                  width: `${skill.score}%`, height: "100%", borderRadius: 3,
                  background: skill.score >= 85 ? `linear-gradient(90deg, ${t.success}, ${t.success}CC)` : `linear-gradient(90deg, ${t.gold}, ${t.goldLight})`,
                  transition: "width 0.6s ease",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Filler Words", sub: "Per Minute", value: "3.2", color: t.gold },
          { label: "Silence Ratio", sub: "Continuity", value: "18%", color: t.success },
          { label: "Energy", sub: "Dynamics", value: "78", color: t.success },
          { label: "Pace", sub: "Speed", value: "142", color: t.success, unit: "wpm" },
        ].map((m) => (
          <div key={m.label} style={{ padding: "14px 16px", borderRadius: 12, background: t.surface, border: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: t.textSecondary, display: "block" }}>{m.label}</span>
            <span style={{ fontSize: 9, color: t.textMuted, display: "block", marginBottom: 8 }}>{m.sub}</span>
            <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700, color: m.color }}>
              {m.value}{m.unit && <span style={{ fontSize: 10, color: t.textMuted }}> {m.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ RESPONSE ANALYSIS CARD ═══ */
export function ResponseCard() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const t = mode === "dark" ? dark : light;

  return (
    <div style={{ background: t.bg, padding: 40, borderRadius: 20, fontFamily: fontUI, transition: "all 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontFamily: fontDisplay, fontSize: 24, color: t.text, margin: 0, fontWeight: 400 }}>Response Analysis</h2>
        <div style={{ display: "flex", background: t.surfaceRaised, borderRadius: 10, padding: 3, border: `1px solid ${t.border}` }}>
          {(["dark", "light"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "none", textTransform: "capitalize", transition: "all 0.2s ease",
              background: mode === m ? t.gold : "transparent",
              color: mode === m ? (m === "dark" ? "#060607" : "#FFFFFF") : t.textMuted,
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.border}`, overflow: "hidden" }}>
        {/* Question */}
        <div style={{ padding: "16px 20px", background: mode === "dark" ? "rgba(212,179,127,0.03)" : "rgba(184,146,62,0.03)", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: mode === "dark" ? "rgba(212,179,127,0.08)" : "#FFF8ED",
            border: `1px solid ${mode === "dark" ? "rgba(212,179,127,0.15)" : "rgba(184,146,62,0.15)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.gold }}>Q1</span>
          </div>
          <div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.gold, display: "block", marginBottom: 4 }}>Interview Question</span>
            <p style={{ fontSize: 14, fontWeight: 500, color: t.text, lineHeight: 1.5, margin: 0 }}>
              Tell me about a time you had to make a difficult technical decision that impacted your team's roadmap.
            </p>
          </div>
        </div>

        {/* Two columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {/* Your answer */}
          <div style={{ padding: "16px 20px", borderRight: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.error }}>Your Answer</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#E89B5A", background: mode === "dark" ? "rgba(232,155,90,0.1)" : "#FFF5EB", padding: "2px 8px", borderRadius: 4 }}>Partial</span>
            </div>
            <div style={{ borderLeft: `2px solid ${t.error}40`, paddingLeft: 14 }}>
              <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
                We had to decide between migrating to microservices or staying with the monolith. I led the discussion and we chose to gradually break things apart.
              </p>
            </div>
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 10, color: t.error, margin: "0 0 4px" }}><strong>Incomplete:</strong> No quantified result or business impact mentioned.</p>
              <p style={{ fontSize: 10, color: t.success, margin: 0 }}><strong>Worked well:</strong> Clear description of the technical context and decision process.</p>
            </div>
          </div>

          {/* Restructured */}
          <div style={{ padding: "16px 20px", background: mode === "dark" ? "rgba(122,158,126,0.02)" : "rgba(45,122,58,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.success }}>Restructured Answer</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: t.success, background: mode === "dark" ? "rgba(122,158,126,0.1)" : t.successLight, padding: "2px 8px", borderRadius: 4 }}>STAR Format</span>
            </div>
            <div style={{ borderLeft: `2px solid ${t.success}40`, paddingLeft: 14 }}>
              <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
                <strong style={{ color: t.text }}>S:</strong> Our monolithic platform was hitting scaling limits at 10K RPM.{" "}
                <strong style={{ color: t.text }}>T:</strong> I was tasked with recommending an architecture path.{" "}
                <strong style={{ color: t.text }}>A:</strong> I ran a 2-week spike comparing 3 approaches, presented trade-offs to leadership.{" "}
                <strong style={{ color: t.text }}>R:</strong> The gradual migration reduced deploy times by 70% and improved uptime to 99.97%.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Level Up Interviews — Design System Tokens & Showcase Components */

import type { ReactNode } from "react";

/* ─── Brand Tokens ─── */

export const colors = {
  // Primary palette
  obsidian: "#0A0A0B",
  graphite: "#161618",
  ivory: "#F0EDE8",
  stone: "#8A8681",
  chalk: "#C5C0BA",

  // Accent
  gilt: "#C9A96E",
  sage: "#7A9E7E",
  ember: "#C4705A",
  slate: "#5B6770",

  // Surface & border
  borderDefault: "rgba(240, 237, 232, 0.08)",
  borderHover: "rgba(240, 237, 232, 0.15)",
  glow: "rgba(201, 169, 110, 0.06)",
  overlay: "rgba(10, 10, 11, 0.7)",
};

export const typography = {
  fontFamily: {
    display: "Georgia, 'Times New Roman', serif",
    ui: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
  },
};

/* ─── Showcase: Color Palette ─── */

function Swatch({ name, hex, dark }: { name: string; hex: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: hex,
          border: `1px solid ${dark ? "rgba(240,237,232,0.12)" : "rgba(10,10,11,0.08)"}`,
          flexShrink: 0,
        }}
      />
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.ivory,
            fontFamily: typography.fontFamily.ui,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.stone,
            fontFamily: typography.fontFamily.mono,
            letterSpacing: "0.02em",
          }}
        >
          {hex}
        </div>
      </div>
    </div>
  );
}

export function ColorPalette() {
  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: colors.gilt,
          marginBottom: 8,
        }}
      >
        Color System
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: colors.ivory,
          letterSpacing: "-0.01em",
          marginBottom: 28,
        }}
      >
        Brand Palette
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        {/* Primary */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.stone,
              marginBottom: 14,
            }}
          >
            Primary
          </div>
          <Swatch name="Obsidian" hex={colors.obsidian} dark />
          <Swatch name="Graphite" hex={colors.graphite} dark />
          <Swatch name="Ivory" hex={colors.ivory} />
          <Swatch name="Chalk" hex={colors.chalk} />
          <Swatch name="Stone" hex={colors.stone} />
        </div>

        {/* Accent */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: colors.stone,
              marginBottom: 14,
            }}
          >
            Accent
          </div>
          <Swatch name="Gilt" hex={colors.gilt} />
          <Swatch name="Sage" hex={colors.sage} />
          <Swatch name="Ember" hex={colors.ember} />
          <Swatch name="Slate" hex={colors.slate} />
        </div>
      </div>
    </div>
  );
}

/* ─── Showcase: Typography Scale ─── */

export function TypographyScale() {
  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: colors.gilt,
          marginBottom: 8,
        }}
      >
        Typography
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: colors.ivory,
          letterSpacing: "-0.01em",
          marginBottom: 32,
        }}
      >
        Type Scale
      </div>

      {/* Display — Serif */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: colors.stone,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          Display — Serif (Landing Only)
        </div>
        <div
          style={{
            fontSize: 56,
            fontFamily: typography.fontFamily.display,
            fontWeight: 400,
            color: colors.ivory,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          Practice for the room
          <br />
          you're walking into.
        </div>
      </div>

      {/* H1 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
          H1 — 36px / 600
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          Your Dashboard
        </div>
      </div>

      {/* H2 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
          H2 — 24px / 600
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
          Session History
        </div>
      </div>

      {/* H3 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
          H3 — 18px / 600
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: colors.ivory, lineHeight: 1.3 }}>
          Communication Score
        </div>
      </div>

      {/* Body */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
          Body — 15px / 400
        </div>
        <div style={{ fontSize: 15, fontWeight: 400, color: colors.chalk, lineHeight: 1.6, maxWidth: 540 }}>
          Your answer undersold your team's revenue impact. Consider quantifying the $12M growth more prominently when discussing cross-functional leadership.
        </div>
      </div>

      {/* Caption + Overline */}
      <div style={{ display: "flex", gap: 40 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
            Caption — 12px / 500
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.stone, lineHeight: 1.4 }}>
            Last active 2 hours ago
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
            Overline — 11px / 600 / Uppercase
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.stone }}>
            Pro Feature
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 6, fontWeight: 600 }}>
            Score — 48px / Mono
          </div>
          <div style={{ fontSize: 48, fontWeight: 600, fontFamily: typography.fontFamily.mono, color: colors.ivory, letterSpacing: "-0.02em", lineHeight: 1 }}>
            87
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Showcase: UI Components ─── */

function BrandButton({
  children,
  variant = "primary",
  size = "default",
}: {
  children: ReactNode;
  variant?: "primary" | "outline" | "gilt" | "ghost";
  size?: "default" | "small" | "large";
}) {
  const sizeStyles = {
    small: { height: 32, padding: "0 12px", fontSize: 12 },
    default: { height: 40, padding: "0 20px", fontSize: 14 },
    large: { height: 48, padding: "0 28px", fontSize: 15 },
  };

  const variantStyles = {
    primary: {
      background: colors.ivory,
      color: colors.obsidian,
      border: "none",
    },
    outline: {
      background: "transparent",
      color: colors.ivory,
      border: `1px solid ${colors.borderHover}`,
    },
    gilt: {
      background: colors.gilt,
      color: colors.obsidian,
      border: "none",
    },
    ghost: {
      background: "transparent",
      color: colors.chalk,
      border: "none",
    },
  };

  return (
    <button
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: typography.fontFamily.ui,
        transition: "opacity 150ms ease",
        letterSpacing: "0.01em",
        ...sizeStyles[size],
        ...variantStyles[variant],
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, variant = "default" }: { children: ReactNode; variant?: "default" | "success" | "warning" | "pro" }) {
  const variantStyles = {
    default: { background: "rgba(240,237,232,0.08)", color: colors.chalk },
    success: { background: "rgba(122,158,126,0.15)", color: colors.sage },
    warning: { background: "rgba(196,112,90,0.15)", color: colors.ember },
    pro: { background: "rgba(201,169,110,0.15)", color: colors.gilt },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        fontFamily: typography.fontFamily.ui,
        ...variantStyles[variant],
      }}
    >
      {children}
    </span>
  );
}

function InputField({ label, placeholder, value }: { label: string; placeholder?: string; value?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: colors.stone,
          marginBottom: 6,
          fontFamily: typography.fontFamily.ui,
        }}
      >
        {label}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        defaultValue={value}
        style={{
          width: "100%",
          height: 40,
          padding: "0 14px",
          borderRadius: 6,
          border: `1px solid ${colors.borderHover}`,
          background: colors.graphite,
          color: colors.ivory,
          fontSize: 14,
          fontFamily: typography.fontFamily.ui,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

export function ComponentShowcase() {
  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.gilt, marginBottom: 8 }}>
        Components
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.01em", marginBottom: 32 }}>
        UI Kit
      </div>

      {/* Buttons */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 14 }}>
          Buttons
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <BrandButton variant="primary" size="large">Start Free Mock Interview</BrandButton>
          <BrandButton variant="gilt" size="large">Get Unlimited Access</BrandButton>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <BrandButton variant="primary">Begin Session</BrandButton>
          <BrandButton variant="outline">See Pro Features</BrandButton>
          <BrandButton variant="ghost">Export My Data</BrandButton>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <BrandButton variant="primary" size="small">Submit</BrandButton>
          <BrandButton variant="outline" size="small">Cancel</BrandButton>
        </div>
      </div>

      {/* Badges */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 14 }}>
          Badges
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Badge>Active</Badge>
          <Badge variant="success">Activated</Badge>
          <Badge variant="warning">Expired</Badge>
          <Badge variant="pro">Pro</Badge>
        </div>
      </div>

      {/* Inputs */}
      <div style={{ marginBottom: 32, maxWidth: 360 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 14 }}>
          Form Inputs
        </div>
        <InputField label="Email address" placeholder="marcus@example.com" />
        <InputField label="Target role" value="VP of Operations" />
      </div>
    </div>
  );
}

/* ─── Showcase: Cards & Surfaces ─── */

export function CardShowcase() {
  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.gilt, marginBottom: 8 }}>
        Surfaces
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.01em", marginBottom: 32 }}>
        Cards & Panels
      </div>

      {/* Session Card */}
      <div
        style={{
          background: colors.graphite,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.ivory, marginBottom: 4 }}>
              VP of Operations — COO Interview
            </div>
            <div style={{ fontSize: 12, color: colors.stone }}>
              March 28, 2026 — 18 min session
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, fontFamily: typography.fontFamily.mono, color: colors.ivory, lineHeight: 1 }}>
            87
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge variant="success">Communication: 92</Badge>
          <Badge>Leadership: 84</Badge>
          <Badge>Strategy: 81</Badge>
        </div>
      </div>

      {/* Feedback Card */}
      <div
        style={{
          background: colors.graphite,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.gilt, marginBottom: 10 }}>
          AI Feedback
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: colors.ivory, marginBottom: 8 }}>
          Quantify your leadership impact
        </div>
        <div style={{ fontSize: 14, color: colors.chalk, lineHeight: 1.6 }}>
          Your answer undersold your team's revenue impact by approximately 40%. When discussing the cross-functional initiative, mention the specific $12M revenue growth and the 23% efficiency improvement your team delivered.
        </div>
      </div>

      {/* Upgrade Banner */}
      <div
        style={{
          background: `linear-gradient(135deg, rgba(201,169,110,0.08) 0%, rgba(201,169,110,0.02) 100%)`,
          border: `1px solid rgba(201,169,110,0.15)`,
          borderRadius: 10,
          padding: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.ivory, marginBottom: 4 }}>
            Unlimited practice. $29 for 7 days.
          </div>
          <div style={{ fontSize: 13, color: colors.chalk }}>
            Every session generates new questions from your resume and target role.
          </div>
        </div>
        <BrandButton variant="gilt">Get Unlimited Access</BrandButton>
      </div>
    </div>
  );
}

/* ─── Showcase: Spacing & Layout ─── */

export function SpacingShowcase() {
  const spacings = [
    { name: "xs", value: 4 },
    { name: "sm", value: 8 },
    { name: "md", value: 16 },
    { name: "lg", value: 24 },
    { name: "xl", value: 40 },
    { name: "2xl", value: 64 },
    { name: "3xl", value: 80 },
  ];

  const radii = [
    { name: "Small (inputs, buttons)", value: 6 },
    { name: "Medium (cards)", value: 10 },
    { name: "Large (modals)", value: 16 },
  ];

  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.gilt, marginBottom: 8 }}>
        Layout
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.01em", marginBottom: 32 }}>
        Spacing & Radius
      </div>

      {/* Spacing */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 14 }}>
          Spacing Scale
        </div>
        {spacings.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <div style={{ width: 48, fontSize: 12, fontFamily: typography.fontFamily.mono, color: colors.stone, textAlign: "right" }}>
              {s.name}
            </div>
            <div
              style={{
                width: s.value,
                height: 20,
                background: colors.gilt,
                borderRadius: 2,
                opacity: 0.6,
              }}
            />
            <div style={{ fontSize: 12, fontFamily: typography.fontFamily.mono, color: colors.chalk }}>
              {s.value}px
            </div>
          </div>
        ))}
      </div>

      {/* Border Radius */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 14 }}>
          Border Radius
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {radii.map((r) => (
            <div key={r.name} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: r.value,
                  border: `1px solid ${colors.borderHover}`,
                  background: colors.graphite,
                  marginBottom: 8,
                }}
              />
              <div style={{ fontSize: 12, fontFamily: typography.fontFamily.mono, color: colors.chalk, marginBottom: 2 }}>
                {r.value}px
              </div>
              <div style={{ fontSize: 11, color: colors.stone, maxWidth: 80 }}>
                {r.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Showcase: Brand Voice ─── */

export function BrandVoiceShowcase() {
  return (
    <div
      style={{
        background: colors.obsidian,
        padding: 32,
        fontFamily: typography.fontFamily.ui,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.gilt, marginBottom: 8 }}>
        Brand Voice
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: colors.ivory, letterSpacing: "-0.01em", marginBottom: 32 }}>
        Tone & Messaging
      </div>

      {/* Do vs Don't */}
      {[
        {
          context: "Feedback",
          doText: "Your answer undersold your team's revenue impact. Quantify the $12M growth more prominently.",
          dontText: "Try to be more specific about your achievements.",
        },
        {
          context: "Upgrade",
          doText: "Unlimited practice. $29 for 7 days.",
          dontText: "Get Started FREE! Limited time offer!",
        },
        {
          context: "Improvement",
          doText: "Communication: up 18% over 5 sessions.",
          dontText: "Congratulations! You're a rockstar! Keep it up!",
        },
        {
          context: "Error",
          doText: "We couldn't connect to your microphone. Allow access in your browser settings.",
          dontText: "Oops! Something went wrong! Please try again later.",
        },
      ].map((item) => (
        <div key={item.context} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.stone, marginBottom: 10 }}>
            {item.context}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {/* Do */}
            <div
              style={{
                flex: 1,
                background: "rgba(122,158,126,0.06)",
                border: "1px solid rgba(122,158,126,0.15)",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.sage, marginBottom: 6, letterSpacing: "0.05em" }}>
                DO
              </div>
              <div style={{ fontSize: 13, color: colors.chalk, lineHeight: 1.5 }}>
                {item.doText}
              </div>
            </div>
            {/* Don't */}
            <div
              style={{
                flex: 1,
                background: "rgba(196,112,90,0.06)",
                border: "1px solid rgba(196,112,90,0.15)",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.ember, marginBottom: 6, letterSpacing: "0.05em" }}>
                DON'T
              </div>
              <div style={{ fontSize: 13, color: colors.chalk, lineHeight: 1.5 }}>
                {item.dontText}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Tagline */}
      <div
        style={{
          marginTop: 12,
          padding: 24,
          background: colors.graphite,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.gilt, marginBottom: 12 }}>
          Primary Tagline
        </div>
        <div
          style={{
            fontSize: 28,
            fontFamily: typography.fontFamily.display,
            fontWeight: 400,
            color: colors.ivory,
            letterSpacing: "-0.02em",
            fontStyle: "italic",
          }}
        >
          "Practice for the room you're walking into."
        </div>
      </div>
    </div>
  );
}

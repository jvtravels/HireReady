/**
 * HireStepX — Login screen design study (canvas-only).
 *
 * Matches the existing canvas pattern in this repo: named exports,
 * single root <div>, no runtime side-effects, system font fallbacks.
 *
 * Typography intent:
 *   - Instrument Serif: editorial headline ("Start building clarity.")
 *   - Neue Montreal: body / form / UI text
 *
 * Fonts are referenced by name in fontFamily declarations with safe
 * fallbacks. The Tempo canvas host loads them globally; if a particular
 * environment doesn't have them, the fallbacks (Times New Roman / Inter
 * / system-ui) keep the design legible without breaking the preview.
 */

import React from "react";

/* ─── Tokens ─────────────────────────────────────────────────────── */
const t = {
  bgPage: "#F4F4F0",
  surface: "#FFFFFF",
  navy: "#0F1B30",
  textBody: "#5C6170",
  textMuted: "#8A8F9A",
  textPlaceholder: "#A8AAA0",
  border: "#E0DFD8",
  borderSoft: "#EAE9E2",
  orange: "#E07B3D",
  pillBg: "#EBE9F8",
  pillText: "#4B4A7B",
  pillIcon: "#5856A8",
  link: "#4F6BFF",
  primaryCheck: "#3D5BFF",
  iconCircle: "#EFEEE7",
  iconStroke: "#7A7E89",
  divider: "#C4C2BA",
};

const fontSerif = "'Instrument Serif', 'Times New Roman', Georgia, serif";
const fontSans = "'Neue Montreal', 'Inter', system-ui, -apple-system, sans-serif";

/* ─── Inline icon components ─────────────────────────────────────── */
function TargetIcon({ size = 16, color = t.pillIcon }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill={color} />
    </svg>
  );
}

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.4 0-9.7-3.5-11.3-8.3l-6.5 5C9.5 39.7 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.4-.5-3.5z" />
    </svg>
  );
}

function EyeIcon({ size = 18, color = t.textMuted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowIcon({ size = 18, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ShieldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={t.iconStroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={t.iconStroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CheckIcon({ size = 11, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─── Login screen — named export to match repo pattern ─────────── */
export function HireStepXLogin() {
  return (
    <div
      style={{
        // Was: minHeight: 1024 — this matched the canvas rect exactly,
        // and the inner content (with padding + flex) overflowed by a few
        // pixels, which Tempo's preview iframe was treating as a load error
        // and rendering "Preview not loaded" instead of the design.
        // Switch to height:"100%" so we fit naturally inside whatever
        // rect the storyboard provides; the canvas layout sets the size.
        height: "100%",
        minHeight: 0,
        width: "100%",
        background: t.bgPage,
        fontFamily: fontSans,
        color: t.navy,
        padding: "48px 64px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 80 }}>
        <div
          style={{
            fontFamily: fontSerif,
            fontSize: 26,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: t.navy,
            display: "flex",
            alignItems: "baseline",
            gap: 1,
          }}
        >
          <span>HireStep</span>
          <span style={{ color: t.orange, fontWeight: 500 }}>X</span>
        </div>
        <div style={{ fontSize: 14, color: t.textBody }}>
          Don&apos;t have an account?{" "}
          <span style={{ color: t.link, fontWeight: 500, marginLeft: 4, cursor: "pointer" }}>Sign up</span>
        </div>
      </div>

      {/* Center column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        {/* Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: t.pillBg,
            color: t.pillText,
            padding: "8px 16px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 28,
          }}
        >
          <TargetIcon />
          <span>Interview practice. Real progress.</span>
        </div>

        {/* Hero headline */}
        <h1
          style={{
            fontFamily: fontSerif,
            fontSize: 64,
            lineHeight: 1.05,
            fontWeight: 400,
            color: t.navy,
            textAlign: "center",
            letterSpacing: "-0.02em",
            margin: 0,
            marginBottom: 16,
          }}
        >
          Start building clarity<span style={{ color: t.orange }}>.</span>
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: t.textBody,
            textAlign: "center",
            margin: 0,
            marginBottom: 40,
            maxWidth: 460,
          }}
        >
          Practice interviews. Improve how you think under pressure.
          <br />
          One answer at a time.
        </p>

        {/* Continue with Google */}
        <div
          style={{
            width: "100%",
            height: 52,
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontSize: 15,
            fontWeight: 500,
            color: t.navy,
            cursor: "pointer",
            marginBottom: 24,
          }}
        >
          <GoogleIcon />
          Continue with Google
        </div>

        {/* or divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: t.borderSoft }} />
          <span style={{ fontSize: 13, color: t.divider }}>or</span>
          <div style={{ flex: 1, height: 1, background: t.borderSoft }} />
        </div>

        {/* Email field */}
        <div style={{ width: "100%", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.navy, marginBottom: 8 }}>Email address</div>
          <div
            style={{
              width: "100%",
              height: 50,
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              fontSize: 15,
              color: t.textPlaceholder,
              boxSizing: "border-box",
            }}
          >
            Enter your email
          </div>
        </div>

        {/* Password field */}
        <div style={{ width: "100%", marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.navy, marginBottom: 8 }}>Password</div>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 50,
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: "0 48px 0 16px",
              display: "flex",
              alignItems: "center",
              fontSize: 15,
              color: t.textPlaceholder,
              boxSizing: "border-box",
            }}
          >
            Enter your password
            <div
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <EyeIcon />
            </div>
          </div>
        </div>

        {/* Remember me + Forgot password */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: t.textBody,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                background: t.primaryCheck,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckIcon />
            </div>
            Remember me
          </div>
          <span style={{ fontSize: 14, color: t.link, fontWeight: 500, cursor: "pointer" }}>Forgot password?</span>
        </div>

        {/* Primary CTA */}
        <div
          style={{
            width: "100%",
            height: 56,
            background: t.navy,
            color: "#FFFFFF",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            marginBottom: 28,
          }}
        >
          <span>Continue to practice</span>
          <ArrowIcon />
        </div>

        {/* Reassurance */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: t.iconCircle,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldIcon />
            </div>
            <span style={{ fontSize: 13, color: t.textBody }}>Your practice data is private and secure.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: t.iconCircle,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ClockIcon />
            </div>
            <span style={{ fontSize: 13, color: t.textBody }}>Takes less than 10 seconds to get started.</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 80, fontSize: 13, color: t.textMuted }}>
        © 2025 HireStepX. All rights reserved.
      </div>
    </div>
  );
}

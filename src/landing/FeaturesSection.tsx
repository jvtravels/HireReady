import { c, font } from "../tokens";
import { useReveal } from "../hooks";
import { features } from "../landingData";

export function FeaturesSection() {
  const ref = useReveal<HTMLElement>();
  return (
    <section id="features" ref={ref} className="reveal landing-section" style={{ padding: "140px 40px 80px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 80 }}>
        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 16 }}>Why HireStepX</p>
        <h2 className="text-glow" style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, letterSpacing: "-0.02em", color: c.ivory, lineHeight: 1.15 }}>
          Not generic tips. Specific, scored practice.
        </h2>
      </div>
      {features.map((f, i) => <FeatureRow key={f.label} feature={f} index={i} />)}
    </section>
  );
}

function FeatureRow({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const ref = useReveal<HTMLDivElement>();
  const isEven = index % 2 === 0;

  return (
    <div ref={ref} className={`reveal reveal-delay-1 feature-row-grid`} style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center",
      marginBottom: 80, direction: isEven ? "ltr" : "rtl",
    }}>
      {/* Text side */}
      <div style={{ direction: "ltr" }}>
        <div className="icon-container" style={{
          width: 52, height: 52, borderRadius: 12, background: `${feature.accent}10`, border: `1px solid ${feature.accent}20`,
          display: "flex", alignItems: "center", justifyContent: "center", color: feature.accent, marginBottom: 24,
          ["--icon-glow" as string]: `${feature.accent}20`,
        }}>{feature.icon}</div>

        <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: feature.accent, marginBottom: 14 }}>{feature.label}</p>
        <h3 style={{ fontFamily: font.ui, fontSize: 26, fontWeight: 600, color: c.ivory, marginBottom: 14, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{feature.title}</h3>
        <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 400, lineHeight: 1.7, color: c.chalk, maxWidth: 400 }}>{feature.description}</p>
      </div>

      {/* Visual side */}
      <div style={{ direction: "ltr" }}>
        <FeatureVisual type={feature.label} accent={feature.accent} />
      </div>
    </div>
  );
}

function FeatureVisual({ type, accent }: { type: string; accent: string }) {
  if (type === "Adaptive") {
    return (
      <div className="gradient-border-card" style={{ padding: "28px 24px", zIndex: 0 }}>
        <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Generated Questions</div>
        {["Walk me through a project where you solved a difficult technical problem.", "How do you prioritize tasks when you have competing deadlines?", "Tell me about a time you disagreed with a teammate. What happened?"].map((q, i) => (
          <div key={i} style={{
            padding: "12px 16px", marginBottom: 8, borderRadius: 8,
            background: i === 0 ? `${accent}08` : c.obsidian,
            border: `1px solid ${i === 0 ? `${accent}20` : c.border}`,
            fontFamily: font.ui, fontSize: 12, color: i === 0 ? c.ivory : c.chalk, lineHeight: 1.5,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: accent, flexShrink: 0, opacity: 0.6 }}>Q{i + 1}</span>
            {q}
          </div>
        ))}
      </div>
    );
  }
  if (type === "Real-Time") {
    return (
      <div className="gradient-border-card" style={{ padding: "24px", zIndex: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>Live Session</span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.sage, animation: "giltPulse 1.5s ease-in-out infinite" }} />
            Active
          </span>
        </div>
        <div style={{ background: `${accent}08`, border: `1px solid ${accent}15`, borderRadius: "10px 10px 10px 2px", padding: "12px 14px", marginBottom: 10 }}>
          <p style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: accent, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>Follow-up</p>
          <p style={{ fontFamily: font.ui, fontSize: 12, lineHeight: 1.5, color: c.ivory }}>You mentioned improving test coverage. Can you walk me through the specific approach and what results you saw?</p>
        </div>
        <div style={{ display: "flex", gap: 2, height: 24, padding: "0 4px" }}>
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.random() * 80 + 20}%`, background: `linear-gradient(180deg, ${accent}, ${c.ember})`, borderRadius: 1, opacity: 0.4, alignSelf: "flex-end" }} />
          ))}
        </div>
      </div>
    );
  }
  if (type === "Precise") {
    return (
      <div className="gradient-border-card" style={{ padding: "24px", zIndex: 0 }}>
        <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 16 }}>Feedback Analysis</div>
        {[
          { label: "Impact & Metrics", score: 42, note: "Missing specific numbers", color: c.ember },
          { label: "STAR Structure", score: 88, note: "Strong framework", color: c.sage },
          { label: "Confidence & Clarity", score: 71, note: "Reduce filler words", color: c.gilt },
        ].map((item) => (
          <div key={item.label} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{item.label}</span>
              <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: item.color }}>{item.score}</span>
            </div>
            <div style={{ height: 3, background: c.border, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${item.score}%`, background: item.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, fontStyle: "italic" }}>{item.note}</span>
          </div>
        ))}
      </div>
    );
  }
  // Privacy
  return (
    <div className="gradient-border-card" style={{ padding: "28px 24px", zIndex: 0 }}>
      <div style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Security & Privacy</div>
      {[
        { icon: "\uD83D\uDD12", label: "Encrypted via Supabase RLS", status: "Active" },
        { icon: "\uD83D\uDDD1\uFE0F", label: "Delete your data anytime", status: "Settings" },
        { icon: "\uD83D\uDE48", label: "Recordings never shared", status: "Policy" },
        { icon: "\uD83D\uDCCA", label: "Minimal analytics only", status: "Vercel" },
      ].map((item) => (
        <div key={item.label} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
          background: c.obsidian, borderRadius: 8, border: `1px solid ${c.border}`, marginBottom: 8,
        }}>
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <span style={{ flex: 1, fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{item.label}</span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, background: `${c.sage}10`, padding: "3px 8px", borderRadius: 4 }}>{item.status}</span>
        </div>
      ))}
    </div>
  );
}

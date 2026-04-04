import { useNavigate, useParams } from "react-router-dom";
import { c, font } from "./tokens";

const pages: Record<string, { title: string; description: string; cta?: { label: string; path: string } }> = {
  about: { title: "About HireReady", description: "We're building the future of interview preparation. Our AI-powered platform helps professionals at every level practice and improve their interview skills with real-time feedback, skill tracking, and personalized coaching.", cta: { label: "Try It Free", path: "/signup" } },
  blog: { title: "Blog", description: "Insights on interview preparation, career growth, and AI-powered coaching. We're working on our first articles — check back soon!", cta: { label: "Start Practicing Instead", path: "/signup" } },
  careers: { title: "Careers at HireReady", description: "We're a small team passionate about helping people land their dream jobs. Interested in joining us? Reach out at careers@hireready.ai" },
  contact: { title: "Contact Us", description: "Have questions, feedback, or partnership inquiries? We'd love to hear from you. Email us at hello@hireready.ai and we'll get back to you within 24 hours.", cta: { label: "Visit Dashboard", path: "/dashboard" } },
  help: { title: "Help Center", description: "Need help using HireReady? Here are the basics:\n\n• Start a mock interview from your dashboard\n• Choose your interview type, difficulty, and target role\n• Answer questions using your microphone or by typing\n• Get AI-powered feedback and skill scores after each session\n\nFor more help, email support@hireready.ai", cta: { label: "Go to Dashboard", path: "/dashboard" } },
};

export default function PlaceholderPage() {
  const nav = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const page = pages[slug || ""] || { title: "Page Not Found", description: "This page doesn't exist yet." };

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "rgba(201,169,110,0.06)", border: "1px solid rgba(201,169,110,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24,
      }}>
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h1 style={{ fontFamily: font.display, fontSize: 32, color: c.ivory, marginBottom: 12, letterSpacing: "-0.02em" }}>{page.title}</h1>
      <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, maxWidth: 480, lineHeight: 1.7, marginBottom: 32, whiteSpace: "pre-line" }}>{page.description}</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => nav(-1)} style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "10px 24px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.chalk, cursor: "pointer" }}>
          Go Back
        </button>
        {page.cta && (
          <button onClick={() => nav(page.cta!.path)} style={{
            fontFamily: font.ui, fontSize: 14, fontWeight: 600, padding: "10px 24px", borderRadius: 8,
            border: "none", background: `linear-gradient(135deg, ${c.gilt}, #B8923E)`, color: c.obsidian, cursor: "pointer",
          }}>{page.cta.label}</button>
        )}
      </div>
    </div>
  );
}

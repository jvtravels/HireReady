import { useNavigate, useParams } from "react-router-dom";
import { c, font } from "./tokens";

const pages: Record<string, { title: string; description: string }> = {
  about: { title: "About HireReady", description: "We're building the future of interview preparation. Our AI-powered platform helps professionals at every level practice and improve their interview skills." },
  blog: { title: "Blog", description: "Insights on interview preparation, career growth, and AI-powered coaching. Coming soon." },
  careers: { title: "Careers", description: "We're growing! Check back soon for open positions." },
  contact: { title: "Contact Us", description: "Have questions or feedback? Reach out to us at hello@hireready.ai" },
  help: { title: "Help Center", description: "Find answers to common questions about using HireReady. Full documentation coming soon." },
};

export default function PlaceholderPage() {
  const nav = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const page = pages[slug || ""] || { title: "Page Not Found", description: "This page doesn't exist yet." };

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
      <h1 style={{ fontFamily: font.display, fontSize: 32, color: c.ivory, marginBottom: 12, letterSpacing: "-0.02em" }}>{page.title}</h1>
      <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, maxWidth: 480, lineHeight: 1.7, marginBottom: 32 }}>{page.description}</p>
      <button onClick={() => nav(-1)} style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, padding: "10px 24px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.chalk, cursor: "pointer" }}>
        Go Back
      </button>
    </div>
  );
}

import { useNavigate, useParams } from "react-router-dom";
import { c, font } from "./tokens";

const pages: Record<string, { title: string; description: string; cta?: { label: string; path: string } }> = {
  about: { title: "About Hirloop", description: "Hirloop is an AI-powered interview preparation platform built by Silva Vitalis LLC. We help professionals at every level — from first-time job seekers to senior leaders — practice and improve their interview skills with real-time AI feedback, skill tracking, and personalized coaching.\n\nOur mission is simple: no one should lose a job opportunity because they didn't practice enough. With adaptive questions generated from your resume, conversational AI that listens and follows up, and precise feedback that tells you exactly what to fix — we make interview prep efficient and effective.\n\nQuestions? Reach out at hello@hirloop.com", cta: { label: "Try It Free", path: "/signup" } },
  blog: { title: "Blog", description: "Interview tips, career advice, and product updates — coming soon.\n\nIn the meantime, the best way to improve is to practice. Start a free mock interview and get AI feedback in minutes.", cta: { label: "Start a Free Interview", path: "/signup" } },
  careers: { title: "Careers at Hirloop", description: "We're a small, focused team passionate about helping people land their dream jobs. We're always interested in hearing from talented people who care about education and AI.\n\nNo open roles right now, but reach out at careers@hirloop.com — we'd love to connect.", cta: { label: "Try the Product", path: "/signup" } },
  contact: { title: "Contact Us", description: "We'd love to hear from you.\n\n• General inquiries: hello@hirloop.com\n• Support: support@hirloop.com\n• Partnerships: hello@hirloop.com\n\nWe typically respond within 24 hours.", cta: { label: "Visit Dashboard", path: "/dashboard" } },
  help: { title: "Help Center", description: "Getting started with Hirloop:\n\n1. Create your free account and upload your resume\n2. Choose your interview type (behavioral, technical, strategic, or case study)\n3. Practice with our AI interviewer — speak naturally or type your answers\n4. Review your scored feedback with specific tips to improve\n\nCommon questions:\n\n• Microphone not working? Try Chrome or Edge — Safari has limited speech recognition support. You can always type your answers instead.\n• Session didn't save? Check your internet connection and refresh. Sessions are backed up locally.\n• Need to cancel your subscription? Go to Dashboard → Settings.\n\nStill need help? Email support@hirloop.com", cta: { label: "Go to Dashboard", path: "/dashboard" } },
};

export default function PlaceholderPage() {
  const nav = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const page = pages[slug || ""] || { title: "Page Not Found", description: "This page doesn't exist yet." };

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.12)",
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
            border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer",
          }}>{page.cta.label}</button>
        )}
      </div>
    </div>
  );
}

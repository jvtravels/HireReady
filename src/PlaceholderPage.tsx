"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { c, font } from "./tokens";
import { useSEO } from "./useSEO";

/* ─── Shared Styles ─── */

const wrap: React.CSSProperties = {
  minHeight: "100vh", background: c.obsidian, color: c.ivory, fontFamily: font.ui,
};
const nav: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px clamp(20px, 5vw, 64px)", borderBottom: `1px solid ${c.border}`,
};
const main: React.CSSProperties = {
  maxWidth: 860, margin: "0 auto", padding: "0 clamp(20px, 5vw, 64px)",
};
const hero: React.CSSProperties = {
  textAlign: "center", padding: "clamp(48px, 8vw, 96px) 0 clamp(32px, 4vw, 48px)",
};
const h1: React.CSSProperties = {
  fontFamily: font.display, fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-0.02em",
  color: c.ivory, marginBottom: 16,
};
const subtitle: React.CSSProperties = {
  fontSize: "clamp(15px, 1.8vw, 18px)", color: c.stone, lineHeight: 1.7, maxWidth: 600, margin: "0 auto",
};
const sectionTitle: React.CSSProperties = {
  fontFamily: font.display, fontSize: "clamp(22px, 3vw, 30px)", color: c.ivory,
  letterSpacing: "-0.01em", marginBottom: 16,
};
const card: React.CSSProperties = {
  background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 14, padding: "clamp(20px, 3vw, 32px)",
};
const ctaBtn: React.CSSProperties = {
  display: "inline-block", fontFamily: font.ui, fontSize: 15, fontWeight: 600,
  padding: "12px 32px", borderRadius: 10, border: "none", textDecoration: "none",
  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, cursor: "pointer",
};
const sectionGap: React.CSSProperties = { marginBottom: "clamp(48px, 6vw, 80px)" };
const grid3: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 20,
};
const footer: React.CSSProperties = {
  textAlign: "center", padding: "32px 20px", borderTop: `1px solid ${c.border}`,
  color: c.stone, fontSize: 13, marginTop: "clamp(48px, 6vw, 80px)",
};
const giltText: React.CSSProperties = { color: c.gilt, fontWeight: 600 };
const bodyText: React.CSSProperties = { color: c.chalk, lineHeight: 1.7, fontSize: "clamp(14px, 1.6vw, 16px)" };
const emailLink: React.CSSProperties = { color: c.gilt, textDecoration: "none" };

/* ─── Nav & Footer ─── */

function Nav() {
  return (
    <nav style={nav}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700, color: c.obsidian, fontFamily: font.ui,
        }}>H</div>
        <span style={{ fontFamily: font.display, fontSize: 20, color: c.ivory }}>HireStepX</span>
      </Link>
      <Link href="/signup" style={{ ...ctaBtn, fontSize: 13, padding: "8px 20px" }}>Get Started</Link>
    </nav>
  );
}

function Footer() {
  return (
    <footer style={footer}>
      <p>&copy; {new Date().getFullYear()} Silva Vitalis LLC. All rights reserved.</p>
      <div style={{ marginTop: 8, display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/page/about" style={{ color: c.stone, textDecoration: "none", fontSize: 13 }}>About</Link>
        <Link href="/page/contact" style={{ color: c.stone, textDecoration: "none", fontSize: 13 }}>Contact</Link>
        <Link href="/page/help" style={{ color: c.stone, textDecoration: "none", fontSize: 13 }}>Help</Link>
        <Link href="/page/careers" style={{ color: c.stone, textDecoration: "none", fontSize: 13 }}>Careers</Link>
      </div>
    </footer>
  );
}

/* ─── Value Card ─── */

function ValueCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 8 }}>{title}</h3>
      <p style={{ ...bodyText, fontSize: 14 }}>{desc}</p>
    </div>
  );
}

/* ─── About Page ─── */

function AboutPage() {
  useSEO({ title: "About HireStepX — AI Interview Prep", description: "Learn about HireStepX, our mission to help every job seeker prepare for interviews with AI-powered practice." });
  const nav = useRouter();
  return (
    <>
      <div style={hero}>
        <h1 style={h1}>About HireStepX</h1>
        <p style={subtitle}>
          An AI-powered interview preparation platform that helps professionals at every level practice,
          improve, and walk into interviews with confidence.
        </p>
      </div>
      <div style={main}>
        <section style={sectionGap}>
          <h2 style={sectionTitle}>Our Mission</h2>
          <p style={bodyText}>
            No one should lose a job opportunity because they didn't practice enough. We built HireStepX
            to make interview preparation efficient, effective, and accessible. With adaptive questions
            generated from your resume, conversational AI that listens and follows up, and precise
            feedback that tells you exactly what to fix — we take the guesswork out of prep.
          </p>
        </section>

        <section style={sectionGap}>
          <h2 style={sectionTitle}>What We Believe</h2>
          <div style={grid3}>
            <ValueCard icon="🎯" title="Practice beats theory" desc="Reading tips helps. Practicing answers under pressure is what actually moves the needle." />
            <ValueCard icon="📝" title="Feedback should be specific" desc="'Be more concise' is useless. We tell you which sentence to cut and why." />
            <ValueCard icon="🔒" title="Privacy is non-negotiable" desc="Your resume and answers stay yours. We never sell your data or share it with employers." />
            <ValueCard icon="💡" title="Affordable for everyone" desc="Core features are free. Premium plans are priced for individuals, not enterprise budgets." />
          </div>
        </section>

        <section style={sectionGap}>
          <h2 style={sectionTitle}>Built by Silva Vitalis LLC</h2>
          <div style={card}>
            <p style={bodyText}>
              Silva Vitalis LLC is a small, independent software company focused on building thoughtful tools
              for career development. HireStepX is our flagship product — born from the belief that the best
              interview prep should feel like practicing with a smart, patient coach, not cramming from a textbook.
            </p>
          </div>
        </section>

        <div style={{ textAlign: "center", ...sectionGap }}>
          <button onClick={() => nav.push("/signup")} style={ctaBtn}>Start practicing free</button>
        </div>
      </div>
    </>
  );
}

/* ─── Contact Page ─── */

function ContactPage() {
  useSEO({ title: "Contact HireStepX", description: "Get in touch with the HireStepX team for support, partnerships, or general inquiries." });
  const nav = useRouter();
  const contacts = [
    { label: "General Inquiries", email: "hello@hirestepx.com", desc: "Questions about the product, pricing, or anything else.", icon: "💬" },
    { label: "Support", email: "support@hirestepx.com", desc: "Technical issues, account help, or bug reports.", icon: "🛠" },
    { label: "Partnerships", email: "hello@hirestepx.com", desc: "Interested in integrating or collaborating? Let's talk.", icon: "🤝" },
  ];
  return (
    <>
      <div style={hero}>
        <h1 style={h1}>Contact Us</h1>
        <p style={subtitle}>We'd love to hear from you. Pick the best channel below.</p>
      </div>
      <div style={main}>
        <section style={sectionGap}>
          <div style={grid3}>
            {contacts.map(ct => (
              <div key={ct.label} style={card}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{ct.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>{ct.label}</h3>
                <a href={`mailto:${ct.email}`} style={{ ...emailLink, fontSize: 14 }}>{ct.email}</a>
                <p style={{ ...bodyText, fontSize: 14, marginTop: 10 }}>{ct.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", color: c.stone, fontSize: 14, marginTop: 24 }}>
            We typically respond within <span style={giltText}>24 hours</span>.
          </p>
        </section>
        <div style={{ textAlign: "center", ...sectionGap }}>
          <button onClick={() => nav.push("/signup")} style={ctaBtn}>Start free — no credit card needed</button>
        </div>
      </div>
    </>
  );
}

/* ─── Careers Page ─── */

function CareersPage() {
  useSEO({ title: "Careers at HireStepX", description: "Join the HireStepX team. See open roles and what we look for in teammates." });
  const nav = useRouter();
  const traits = [
    { icon: "🧠", title: "Deep curiosity", desc: "You dig into problems until you truly understand them." },
    { icon: "✍️", title: "Clear communication", desc: "You write well, explain simply, and ask good questions." },
    { icon: "🚀", title: "Bias toward shipping", desc: "You'd rather ship something good today than something perfect next quarter." },
    { icon: "❤️", title: "Empathy for job seekers", desc: "You remember what it felt like to prepare for a big interview." },
  ];
  return (
    <>
      <div style={hero}>
        <h1 style={h1}>Careers at HireStepX</h1>
        <p style={subtitle}>
          We're a small, focused team passionate about helping people land their dream jobs.
          We build with care and move fast.
        </p>
      </div>
      <div style={main}>
        <section style={{ ...sectionGap, textAlign: "center" }}>
          <div style={{ ...card, maxWidth: 520, margin: "0 auto" }}>
            <h2 style={{ ...sectionTitle, fontSize: "clamp(18px, 2.5vw, 24px)" }}>Open Roles</h2>
            <p style={{ ...bodyText, marginBottom: 12 }}>
              No open positions right now — but we're always interested in hearing from talented people.
            </p>
            <p style={bodyText}>
              Send a note to{" "}
              <a href="mailto:careers@hirestepx.com" style={emailLink}>careers@hirestepx.com</a>
              {" "}and tell us what you'd build.
            </p>
          </div>
        </section>

        <section style={sectionGap}>
          <h2 style={sectionTitle}>What We Look For</h2>
          <div style={grid3}>
            {traits.map(t => <ValueCard key={t.title} icon={t.icon} title={t.title} desc={t.desc} />)}
          </div>
        </section>

        <div style={{ textAlign: "center", ...sectionGap }}>
          <p style={{ ...bodyText, marginBottom: 20 }}>Curious what we've built?</p>
          <button onClick={() => nav.push("/signup")} style={ctaBtn}>Try HireStepX free</button>
        </div>
      </div>
    </>
  );
}

/* ─── Help Page ─── */

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="button" tabIndex={0} style={{ ...card, marginBottom: 12, cursor: "pointer" }} onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: c.ivory }}>{q}</h3>
        <span style={{ color: c.gilt, fontSize: 18, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
      </div>
      {open && <p style={{ ...bodyText, fontSize: 14, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>{a}</p>}
    </div>
  );
}

function HelpPage() {
  useSEO({ title: "Help Center — HireStepX", description: "Get started with HireStepX, troubleshoot common issues, and find answers to frequently asked questions." });
  const nav = useRouter();
  const steps = [
    { n: "1", title: "Create your free account", desc: "Sign up with email — no credit card required." },
    { n: "2", title: "Upload your resume", desc: "We generate questions tailored to your experience and target role." },
    { n: "3", title: "Start a mock interview", desc: "Choose behavioral, technical, strategic, or case study. Speak naturally or type." },
    { n: "4", title: "Review scored feedback", desc: "Get specific tips on what to improve, with scores across key dimensions." },
  ];
  const faqs = [
    { q: "Microphone not working?", a: "Try Chrome or Edge — Safari has limited speech recognition support. Make sure you've granted microphone permission in your browser settings. You can always type your answers instead." },
    { q: "Session didn't save?", a: "Check your internet connection and refresh. Sessions are also backed up locally in your browser, so your progress should be recoverable." },
    { q: "How do I cancel my subscription?", a: "Go to Dashboard → Settings → Billing. You can cancel anytime and retain access through the end of your billing period." },
    { q: "Can I redo an interview session?", a: "Yes. You can practice as many sessions as your plan allows. Each session generates fresh, non-repeating questions based on your resume." },
    { q: "Is my data shared with employers?", a: "Never. Your resume, answers, and scores are private. We do not share or sell your data to any third party." },
  ];
  return (
    <>
      <div style={hero}>
        <h1 style={h1}>Help Center</h1>
        <p style={subtitle}>Everything you need to get started and get the most out of HireStepX.</p>
      </div>
      <div style={main}>
        <section style={sectionGap}>
          <h2 style={sectionTitle}>Getting Started</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16 }}>
            {steps.map(s => (
              <div key={s.n} style={card}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  color: c.obsidian, fontWeight: 700, fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>{s.n}</div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>{s.title}</h3>
                <p style={{ ...bodyText, fontSize: 14 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={sectionGap}>
          <h2 style={sectionTitle}>Troubleshooting</h2>
          {faqs.map(f => <AccordionItem key={f.q} q={f.q} a={f.a} />)}
        </section>

        <section style={{ ...sectionGap, textAlign: "center" }}>
          <div style={{ ...card, maxWidth: 480, margin: "0 auto" }}>
            <h2 style={{ ...sectionTitle, fontSize: "clamp(18px, 2.5vw, 24px)" }}>Still need help?</h2>
            <p style={bodyText}>
              Email us at{" "}
              <a href="mailto:support@hirestepx.com" style={emailLink}>support@hirestepx.com</a>
              {" "}and we'll get back to you within 24 hours.
            </p>
          </div>
        </section>

        <div style={{ textAlign: "center", ...sectionGap }}>
          <button onClick={() => nav.push("/dashboard")} style={ctaBtn}>Go to Dashboard</button>
        </div>
      </div>
    </>
  );
}

/* ─── 404 Page ─── */

function NotFoundPage() {
  useSEO({ title: "Page Not Found — HireStepX", description: "This page doesn't exist." });
  const nav = useRouter();
  return (
    <div style={{ ...hero, padding: "clamp(80px, 15vw, 160px) 20px" }}>
      <h1 style={h1}>Page Not Found</h1>
      <p style={{ ...subtitle, marginBottom: 32 }}>This page doesn't exist or has been moved.</p>
      <button onClick={() => nav.push("/")} style={ctaBtn}>Back to Home</button>
    </div>
  );
}

/* ─── Router ─── */

const pageMap: Record<string, () => React.JSX.Element> = {
  about: AboutPage,
  contact: ContactPage,
  careers: CareersPage,
  help: HelpPage,
};

export default function PlaceholderPage() {
  const { slug } = useParams() as { slug?: string };
  const Page = pageMap[slug || ""] || NotFoundPage;

  return (
    <div style={wrap}>
      <Nav />
      <Page />
      <Footer />
    </div>
  );
}

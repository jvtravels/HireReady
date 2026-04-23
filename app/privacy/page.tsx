import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — HireStepX",
  description: "How HireStepX collects, uses, and protects your personal data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const effective = "April 23, 2026";
  return (
    <main style={{
      minHeight: "100vh", background: "#060607", color: "#F5F2ED",
      fontFamily: "'Inter', system-ui, sans-serif", padding: "80px 24px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, color: "#F5F2ED", textDecoration: "none", letterSpacing: "0.02em" }}>
          HireStepX
        </Link>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 44, fontWeight: 400, color: "#F5F2ED", marginTop: 32, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: "#8E8983", marginBottom: 48 }}>Effective: {effective}</p>

        <Section title="1. Who we are">
          HireStepX is operated by Silva Vitalis LLC (&quot;we&quot;, &quot;our&quot;). Contact us at{" "}
          <a href="mailto:support@hirestepx.com" style={linkStyle}>support@hirestepx.com</a>.
        </Section>

        <Section title="2. What we collect">
          <ul style={listStyle}>
            <li><strong>Account data</strong>: name, email, password hash (via Supabase Auth), email verification status.</li>
            <li><strong>Resume data</strong>: file name, extracted text, parsed skills/experience. Used only to personalize your interview practice.</li>
            <li><strong>Interview data</strong>: session transcripts, AI feedback, scores, practice timestamps.</li>
            <li><strong>Payment data</strong>: transaction IDs, plan, subscription dates. Card details are handled by Razorpay and never stored on our servers.</li>
            <li><strong>Usage data</strong>: login events, device fingerprint (for single-device enforcement), IP (for rate limiting).</li>
            <li><strong>Optional analytics</strong>: Vercel Analytics &amp; Speed Insights — only loaded after you accept the cookie banner.</li>
          </ul>
        </Section>

        <Section title="3. How we use it">
          <ul style={listStyle}>
            <li>Provide and personalize mock interview practice.</li>
            <li>Authenticate you and secure your account (rate limiting, device tokens, session fingerprints).</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Send essential transactional emails (verification, password reset, new-device alerts, account deletion).</li>
            <li>Generate anonymized product analytics (only after your consent).</li>
          </ul>
        </Section>

        <Section title="4. Who we share it with">
          Only these categories of processors, under contract:
          <ul style={listStyle}>
            <li><strong>Supabase</strong> (database, auth)</li>
            <li><strong>Vercel</strong> (hosting, edge functions)</li>
            <li><strong>Groq &amp; Google Gemini</strong> (LLM inference for interview Q&amp;A and resume analysis)</li>
            <li><strong>Cartesia / Deepgram / Azure</strong> (speech synthesis and recognition)</li>
            <li><strong>Razorpay</strong> (payments)</li>
            <li><strong>Resend</strong> (transactional email)</li>
          </ul>
          We do not sell your personal data. We do not share it with advertisers.
        </Section>

        <Section title="5. Your rights">
          You have the right to:
          <ul style={listStyle}>
            <li><strong>Access &amp; portability</strong> — Settings → &quot;Export data&quot; downloads a JSON file with all your data.</li>
            <li><strong>Correction</strong> — update your profile anytime in Settings.</li>
            <li><strong>Erasure</strong> — Settings → &quot;Delete account&quot;. We soft-delete for 7 days (restore by logging in), then hard-delete all rows.</li>
            <li><strong>Withdraw consent</strong> — clear localStorage or click &quot;Essential only&quot; to opt out of analytics.</li>
          </ul>
          To exercise any right, use the in-app control or email{" "}
          <a href="mailto:support@hirestepx.com" style={linkStyle}>support@hirestepx.com</a>.
        </Section>

        <Section title="6. How long we keep it">
          <ul style={listStyle}>
            <li>Profile &amp; resume: until account deletion</li>
            <li>Interview transcripts: up to 180 days</li>
            <li>LLM &amp; service usage logs: 30 days</li>
            <li>Security audit log: 12 months</li>
            <li>Payment records: as required by tax/accounting law (typically 7 years)</li>
          </ul>
        </Section>

        <Section title="7. Security">
          All traffic uses HTTPS. Passwords are hashed by Supabase Auth (bcrypt). Supabase tables are protected by row-level security so one user cannot read another&apos;s data. Service-role access is restricted to server-side edge functions only.
        </Section>

        <Section title="8. International transfers">
          Our infrastructure is hosted in the United States and European Union (Supabase, Vercel). By using HireStepX you agree to data transfer to these regions under standard contractual clauses.
        </Section>

        <Section title="9. Changes">
          We will update the effective date above and email registered users when material changes occur.
        </Section>

        <p style={{ fontSize: 13, color: "#8E8983", marginTop: 48 }}>
          Questions? <a href="mailto:support@hirestepx.com" style={linkStyle}>support@hirestepx.com</a>
          {" · "}<Link href="/terms" style={linkStyle}>Terms of Service</Link>
        </p>
      </div>
    </main>
  );
}

const linkStyle = { color: "#D4B37F", textDecoration: "underline" } as const;
const listStyle = { marginTop: 8, marginLeft: 20, color: "#CCC7C0", fontSize: 15, lineHeight: 1.75 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, fontWeight: 400, color: "#F5F2ED", marginBottom: 12, letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: "#CCC7C0", lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

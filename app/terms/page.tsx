import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — HireStepX",
  description: "Terms governing your use of HireStepX.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: "#8E8983", marginBottom: 48 }}>Effective: {effective}</p>

        <Section title="1. Agreement">
          By creating an account or using HireStepX you agree to these Terms. If you do not agree, do not use the service.
        </Section>

        <Section title="2. Your account">
          You must be 16 or older (or the minimum age of digital consent in your country). You are responsible for keeping your password and device secure. One account per person. Sharing accounts is prohibited.
        </Section>

        <Section title="3. Acceptable use">
          You may not:
          <ul style={listStyle}>
            <li>Reverse-engineer, scrape, or abuse the service.</li>
            <li>Upload illegal, infringing, or malicious content.</li>
            <li>Attempt to jailbreak the AI interviewer via prompt injection.</li>
            <li>Resell, sublicense, or repackage our output without written permission.</li>
            <li>Use the service to harass, defame, or harm others.</li>
          </ul>
        </Section>

        <Section title="4. Subscriptions &amp; billing">
          Free plans include a limited number of practice sessions. Paid plans (Starter, Pro, Team) are billed per the pricing shown at checkout in INR via Razorpay. Plans auto-renew until you cancel in Settings. Cancellations take effect at the end of the current billing period. Refunds are handled case-by-case — email{" "}
          <a href="mailto:support@hirestepx.com" style={linkStyle}>support@hirestepx.com</a>.
        </Section>

        <Section title="5. AI output disclaimer">
          HireStepX uses third-party LLMs (Groq, Google Gemini) to generate interview questions, follow-ups, and feedback. Output may be inaccurate, biased, or incomplete. We make no warranty that the service reflects any specific employer&apos;s interview process. Treat AI feedback as guidance, not professional career advice.
        </Section>

        <Section title="6. Intellectual property">
          We own the HireStepX name, logo, UI, and question bank. You retain ownership of content you upload (resumes, answers, recordings). By uploading you grant us a limited license to process that content solely to provide the service to you.
        </Section>

        <Section title="7. Availability">
          We aim for high availability but provide the service &quot;as is&quot; without uptime guarantees. We may suspend features temporarily for maintenance, security, or upgrades.
        </Section>

        <Section title="8. Termination">
          You may delete your account anytime in Settings. We may suspend or terminate accounts that violate these Terms, abuse the service, or charge back payments. Termination does not refund prepaid plans unless required by law.
        </Section>

        <Section title="9. Limitation of liability">
          To the maximum extent permitted by law, HireStepX and Silva Vitalis LLC are not liable for indirect, incidental, special, or consequential damages, or for any loss of profits, data, or job opportunities. Our aggregate liability is limited to the amount you paid in the preceding 12 months.
        </Section>

        <Section title="10. Changes">
          We may update these Terms. Material changes will be communicated via email at least 14 days before taking effect. Continued use after the effective date constitutes acceptance.
        </Section>

        <Section title="11. Governing law">
          These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws rules. Disputes will be resolved in the courts of Delaware, USA, unless another forum is required by mandatory law in your jurisdiction.
        </Section>

        <p style={{ fontSize: 13, color: "#8E8983", marginTop: 48 }}>
          Questions? <a href="mailto:support@hirestepx.com" style={linkStyle}>support@hirestepx.com</a>
          {" · "}<Link href="/privacy" style={linkStyle}>Privacy Policy</Link>
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

import { c, font } from "./tokens";
import Link from "next/link";

const sections = [
  {
    title: "1. Information We Collect",
    body: `We collect information you provide when you create an account and use HireStepX:

- Account information: name, email address, and authentication credentials.
- Resume data: text content you upload or paste for analysis. We do not store your resume file — only the extracted text used for generating interview questions.
- Interview data: transcripts of your spoken responses, AI-generated questions, evaluation scores, and feedback.
- Preferences: interview type selections, target companies, experience level, and display settings.
- Payment information: transaction IDs and plan details. Card numbers and billing details are handled entirely by Razorpay and are never stored on our servers.`,
  },
  {
    title: "2. How We Use Your Data",
    body: `Your data is used solely to provide and improve the HireStepX service:

- AI evaluation: Resume text and interview transcripts are sent to AI models to generate personalized questions, evaluate your answers, and provide scored feedback.
- Progress tracking: Session scores, streaks, and historical performance are stored so you can track improvement over time.
- Personalization: Your target role, company, and experience level are used to tailor question difficulty and relevance.
- Communication: Your email is used for account verification, password resets, subscription reminders, and occasional product updates. You can opt out of non-essential emails at any time.`,
  },
  {
    title: "3. Third-Party Services",
    body: `We rely on the following third-party services to operate the platform:

- Supabase: Authentication, database storage, and row-level security for your account and session data.
- Groq and Google (Gemini): AI language models used to generate interview questions and evaluate your responses. Data is processed in real-time and is not retained by these providers beyond the request lifecycle.
- Cartesia: Text-to-speech for AI interviewer voice. Transcript text is sent for audio generation only.
- Deepgram: Speech-to-text for converting your spoken answers into text for evaluation.
- Razorpay: Payment processing for subscriptions and session packs. Razorpay handles all payment credentials directly.
- Vercel: Application hosting, serverless functions, and basic web analytics (page views and performance metrics only).

None of these providers receive more data than is necessary to perform their specific function.`,
  },
  {
    title: "4. Data Retention",
    body: `- Account data (name, email, preferences) is retained for as long as your account is active.
- Interview sessions (transcripts, scores, feedback) are kept to enable progress tracking and analytics. You can delete individual sessions from your dashboard.
- Upon account deletion, all personal data is permanently removed within 30 days.
- Anonymous, aggregated usage statistics (e.g., total sessions completed across all users) may be retained indefinitely for service improvement.`,
  },
  {
    title: "5. Your Rights",
    body: `You have the following rights regarding your data:

- Access: View all your stored data through your dashboard and session history.
- Deletion: Delete your entire account and all associated data from the Settings page. You can also delete individual sessions.
- Export: Download your session history and profile data from Settings.
- Correction: Update your profile information at any time from Settings.

To exercise any of these rights, use the in-app tools or email us at support@hirestepx.com.`,
  },
  {
    title: "6. Cookies and Local Storage",
    body: `HireStepX does not use tracking cookies or third-party advertising cookies.

We use browser localStorage to store:
- Authentication session tokens (managed by Supabase).
- UI preferences such as theme and display settings.
- Cached data for faster page loads and offline resilience.

You can clear this data at any time through your browser settings.`,
  },
  {
    title: "7. Security Measures",
    body: `We implement the following security measures to protect your data:

- All data in transit is encrypted via HTTPS/TLS.
- Database access is protected by Supabase row-level security policies — users can only access their own data.
- API keys are scoped to minimum required permissions and are never exposed client-side.
- No raw credentials, passwords, or payment details are stored in client-side storage.
- Rate limiting and input validation are applied to all API endpoints.
- Content Security Policy headers are enforced to prevent cross-site scripting.`,
  },
  {
    title: "8. Children's Privacy",
    body: "HireStepX is not intended for children under 18. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us and we will promptly delete it.",
  },
  {
    title: "9. Changes to This Policy",
    body: "We may update this privacy policy from time to time. When we do, we will update the \"Last updated\" date at the top of this page. Continued use of the service after changes constitutes acceptance of the revised policy.",
  },
  {
    title: "10. Governing Jurisdiction",
    body: "This privacy policy is governed by the laws of India. Any disputes arising from this policy shall be subject to the exclusive jurisdiction of courts in India.",
  },
  {
    title: "11. Contact Us",
    body: "For privacy concerns, data requests, or questions about this policy, contact us at support@hirestepx.com.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, padding: "60px 24px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            fontFamily: font.ui, fontSize: 12, color: c.gilt, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 32,
          }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back to home
        </Link>

        <h1 style={{ fontFamily: font.display, fontSize: 36, color: c.ivory, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Privacy Policy
        </h1>
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 48 }}>
          Last updated: April 2026
        </p>

        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7, marginBottom: 36 }}>
          HireStepX ("we", "our", "the platform") is an AI-powered mock interview practice tool operated by Silva Vitalis LLC. This policy explains what data we collect, how we use it, and your rights.
        </p>

        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 10 }}>
              {section.title}
            </h2>
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>
              {section.body}
            </p>
          </div>
        ))}

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${c.border}`, display: "flex", gap: 20 }}>
          <Link href="/privacy" style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory, textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/terms" style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textDecoration: "none" }}>Terms of Service</Link>
          <Link href="/refund" style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textDecoration: "none" }}>Refund Policy</Link>
        </div>
      </div>
    </div>
  );
}

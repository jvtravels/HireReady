import { c, font } from "./tokens";
import Link from "next/link";

const sections = [
  {
    title: "1. Session Packs",
    body: `If you purchased a session pack and have not used any sessions from it, you may request a full refund within 7 days of purchase.

Once you have used one or more sessions from a pack, the pack is considered partially consumed and is non-refundable.`,
  },
  {
    title: "2. Subscriptions",
    body: `You may cancel your subscription at any time from the Settings page. Upon cancellation:

- You retain access to all paid features until the end of your current billing period.
- No further charges will be made after cancellation.
- We do not offer pro-rata (partial) refunds for the unused portion of a billing period.

If you cancel within 7 days of your first subscription payment and have not used any sessions during that period, you may request a full refund.`,
  },
  {
    title: "3. How to Request a Refund",
    body: `To request a refund, you can:

- Email us at support@hirestepx.com with your registered email address and a brief description of your request.
- Use the in-app account deletion feature in Settings if you also wish to close your account.

Please include your registered email and, if available, the Razorpay transaction ID or order ID.`,
  },
  {
    title: "4. Processing Time",
    body: "Approved refunds are processed within 5 to 7 business days. The actual time for the refund to appear in your account depends on your bank or payment provider.",
  },
  {
    title: "5. Refund Method",
    body: "Refunds are issued to the original payment method used at the time of purchase. We cannot process refunds to a different account or payment method.",
  },
  {
    title: "6. Non-Refundable Situations",
    body: `Refunds will not be issued in the following cases:

- Session packs where one or more sessions have been used.
- Subscription periods that have already ended.
- Refund requests made more than 7 days after purchase (for first-time refund eligibility).
- Accounts terminated for violation of our Terms of Service.`,
  },
  {
    title: "7. Disputes",
    body: "If you believe a charge was made in error or have a billing dispute, please contact us at support@hirestepx.com before initiating a chargeback with your bank. We will work to resolve the issue promptly.",
  },
  {
    title: "8. Changes to This Policy",
    body: "We may update this refund policy from time to time. Changes will be reflected on this page with an updated date. Existing purchases are subject to the refund policy in effect at the time of purchase.",
  },
  {
    title: "9. Contact",
    body: "For refund requests or billing questions, contact us at support@hirestepx.com.",
  },
];

export default function RefundPolicy() {
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
          Refund Policy
        </h1>
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 48 }}>
          Last updated: April 2026
        </p>

        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7, marginBottom: 36 }}>
          This policy explains how refunds work for HireStepX purchases made through Razorpay. All transactions are in Indian Rupees (INR).
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
          <Link href="/refund" style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory, textDecoration: "none" }}>Refund Policy</Link>
          <Link href="/terms" style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textDecoration: "none" }}>Terms of Service</Link>
          <Link href="/privacy" style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, textDecoration: "none" }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

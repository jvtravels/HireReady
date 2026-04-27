import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "../src/index.css";

/* ── Google Fonts via next/font ──
 *
 * Each font has:
 *   - display: "swap" so FCP never blocks on font download
 *   - adjustFontFallback: auto — Next.js generates a size-adjusted fallback
 *     which removes the CLS spike when the real font loads
 *   - preload: true for the two critical (UI + display) fonts; JetBrains Mono
 *     (used only in the Hero metrics + occasional badges) is preload:false
 *     to cut a parallel font download off the critical path.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono",
  display: "swap",
  preload: false,  // Non-critical — used only in metrics/badges below the fold
  fallback: ["SF Mono", "Consolas", "Menlo", "monospace"],
});

/* ── SEO Metadata ── */
export const metadata: Metadata = {
  title: "HireStepX \u2014 AI-Powered Mock Interview Platform",
  description:
    "Practice mock interviews with AI interviewers. Get real-time feedback, STAR analysis, and personalized coaching. 3 free sessions, no credit card required.",
  keywords:
    "mock interview, AI interview practice, interview preparation, STAR method, behavioral interview, technical interview, panel interview, campus placement, HR round, salary negotiation, India",
  authors: [{ name: "HireStepX" }],
  robots: "index, follow",
  metadataBase: new URL("https://hirestepx.com"),
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  icons: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  openGraph: {
    type: "website",
    url: "https://hirestepx.com/",
    title: "HireStepX \u2014 AI Mock Interview Practice",
    description:
      "Practice mock interviews with AI. Get scored on STAR structure, communication, and technical depth. 3 free sessions.",
    images: ["https://hirestepx.com/og-preview.png"],
    siteName: "HireStepX",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "HireStepX \u2014 AI Mock Interview Practice",
    description:
      "Practice mock interviews with AI. Get scored on STAR structure, communication, and technical depth.",
    images: ["https://hirestepx.com/og-preview.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HireStepX",
    // Absolute path — Next's Metadata API accepts string | string[] here.
    // We reuse the 192 SVG; iOS rasterises from the device's preferred size.
    startupImage: ["/icon-512.svg"],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "HireStepX",
    // apple-touch-icon points at the same 512 asset — iOS picks the best
    // size from the 512 SVG. When we ship a rasterised 180×180 PNG later,
    // update this href.
    "apple-touch-icon": "/icon-512.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,   // Allow pinch-zoom up to 5x (WCAG 2.1 SC 1.4.4)
  userScalable: true,
  viewportFit: "cover",
  // Resize layout when the mobile virtual keyboard opens so inputs stay
  // visible instead of being hidden behind the keyboard. Without this,
  // Chrome/Safari default to overlaying the keyboard on top of the
  // content, which pushes forms out of view mid-typing.
  interactiveWidget: "resizes-content",
};

/* ── Structured Data (JSON-LD) ── */
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "HireStepX",
    url: "https://hirestepx.com",
    description:
      "AI-powered mock interview platform with real-time feedback and STAR analysis",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      description: "3 free sessions, no credit card required",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "HireStepX",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description:
      "AI-powered mock interview platform with voice interviews, STAR method scoring, speech analytics, and company-specific question banks for TCS, Infosys, Google, Amazon & more.",
    url: "https://hirestepx.com",
    offers: [
      { "@type": "Offer", price: "0", priceCurrency: "INR", name: "Free", description: "3 practice sessions" },
      { "@type": "Offer", price: "49", priceCurrency: "INR", name: "Starter Weekly", description: "10 sessions per week" },
      { "@type": "Offer", price: "149", priceCurrency: "INR", name: "Pro Monthly", description: "Unlimited sessions" },
      { "@type": "Offer", price: "1430", priceCurrency: "INR", name: "Pro Annual", description: "Unlimited sessions \u2014 save 20%" },
    ],
    applicationSubCategory: "Interview Preparation",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is HireStepX free to use?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Start with 3 full AI mock interviews \u2014 complete with real-time feedback, scores, and detailed performance reports. No credit card required." },
      },
      {
        "@type": "Question",
        name: "How does the AI mock interview work?",
        acceptedAnswer: { "@type": "Answer", text: "Upload your resume, pick your target company and role, and choose from 10 interview types. The AI interviewer asks role-specific questions via voice, listens to your answers, asks follow-up questions, and delivers scored feedback after each session." },
      },
      {
        "@type": "Question",
        name: "What types of interviews can I practice?",
        acceptedAnswer: { "@type": "Answer", text: "10 types: Behavioral, Technical, Strategic, Case Study, Campus Placement, HR Round, Panel, Management, Salary Negotiation, and Government/PSU. Each with 3 difficulty levels and mini or full session options." },
      },
      {
        "@type": "Question",
        name: "Can I practice for specific companies like TCS, Infosys, or Google?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. We support 50+ target companies including Google, Amazon, TCS, Infosys, Flipkart, Razorpay, McKinsey, Deloitte, and more \u2014 each with distinct interview patterns." },
      },
      {
        "@type": "Question",
        name: "How is this different from ChatGPT or practicing with friends?",
        acceptedAnswer: { "@type": "Answer", text: "ChatGPT is text-only with no voice, no scoring, no resume integration, and no progress tracking. HireStepX is a purpose-built interview simulator: voice-based, resume-personalized, with detailed analytics." },
      },
      {
        "@type": "Question",
        name: "Is my interview data private and secure?",
        acceptedAnswer: { "@type": "Answer", text: "Yes. Data is encrypted via Supabase with row-level security. Recordings and transcripts are never shared with employers or third parties. Delete everything anytime from Settings." },
      },
      {
        "@type": "Question",
        name: "Does HireStepX work on mobile?",
        acceptedAnswer: { "@type": "Answer", text: "Yes, on any modern browser. For the best experience during mock interviews, use a laptop or desktop with a microphone." },
      },
      {
        "@type": "Question",
        name: "How much does it cost compared to a career coach?",
        acceptedAnswer: { "@type": "Answer", text: "A single coaching session typically costs \u20b93,000-10,000. HireStepX is \u20b910 per session, or \u20b9149/month for 30 sessions with full AI coaching and analytics \u2014 available 24/7." },
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "HireStepX",
    legalName: "Silva Vitalis LLC",
    url: "https://hirestepx.com",
    logo: "https://hirestepx.com/logo.png",
    description:
      "AI-powered mock interview platform for job seekers in India. Practice for Google, TCS, Flipkart, and 50+ companies.",
    foundingDate: "2026",
    address: {
      "@type": "PostalAddress",
      addressLocality: "San Francisco",
      addressCountry: "US",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@hirestepx.com",
    },
  },
];

/* ── Client helpers (extracted to keep layout a server component) ── */
import { ServiceWorkerRegistrar } from "./ServiceWorkerRegistrar";
import { OfflineBanner } from "./OfflineBanner";
import CookieConsent from "./CookieConsent";
import ConsentGatedAnalytics from "./ConsentGatedAnalytics";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/*
          Critical-path preconnects only. Supabase is hit on every auth-gated
          page load. Removed Cartesia + Deepgram preconnects from the root —
          they were costing an extra TCP+TLS handshake on every page load
          but only the /interview route actually uses those services. We now
          preconnect from Interview.tsx with useEffect-injected links.
        */}
        <link rel="preconnect" href="https://esluwqkqoofmquqdevap.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />

        {/* Structured Data — server-rendered so SEO crawlers see it immediately,
            but moved AFTER preconnects so network scheduling doesn't stall on parsing JSON. */}
        {structuredData.map((data, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
          />
        ))}
      </head>
      <body className="bg-[#060607] text-[#F5F2ED]">
        {/* Skip-to-content link for keyboard / screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-[#D4B37F] focus:px-4 focus:py-2 focus:text-[#060607] focus:outline-none"
        >
          Skip to content
        </a>

        {/* Route change announcer for screen readers */}
        <div
          id="route-announcer"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        />

        <OfflineBanner />

        <div id="main-content" tabIndex={-1} style={{ outline: "none" }}>
          {children}
        </div>

        <ServiceWorkerRegistrar />
        <CookieConsent />
        <ConsentGatedAnalytics />
      </body>
    </html>
  );
}

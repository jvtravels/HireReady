import type { TempoPage, TempoStoryboard } from 'tempo-sdk';
import {
  FullPage,
  NavBar,
  HeroSection,
  LogoTicker,
  MetricsBar,
  ProblemSection,
  HowItWorksSection,
  FeaturesGrid,
  TestimonialsSection,
  PricingSection,
  FAQSection,
  FinalCTA,
  FooterSection,
} from './AnkarLanding';

const page: TempoPage = {
  name: "HireStepX — Ankar Style (Light Only)",
};

export default page;

/* ─── Full Page ─── */
export const Full: TempoStoryboard = {
  name: "Full Landing Page",
  render: () => <FullPage />,
  layout: { x: 0, y: 0, width: 1440, height: 8100 },
};

/* ─── Individual Sections ─── */
export const Nav: TempoStoryboard = {
  name: "Navigation — On Dark Hero",
  render: () => (
    <div style={{ background: "#0A0A0B", position: "relative", height: 64 }}>
      <NavBar />
    </div>
  ),
  layout: { x: 1540, y: 0, width: 1440, height: 80 },
};

export const Hero: TempoStoryboard = {
  name: "Hero — Dark Centered + Aurora",
  render: () => <HeroSection />,
  layout: { x: 1540, y: 130, width: 1440, height: 1100 },
};

export const Logos: TempoStoryboard = {
  name: "Logo Ticker — Continuous Scroll",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <LogoTicker />
    </div>
  ),
  layout: { x: 1540, y: 1280, width: 1440, height: 120 },
};

export const Metrics: TempoStoryboard = {
  name: "Metrics Bar — 4 Column",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <MetricsBar />
    </div>
  ),
  layout: { x: 1540, y: 1450, width: 1440, height: 220 },
};

export const Problem: TempoStoryboard = {
  name: "Problem Statement — Editorial",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <ProblemSection />
    </div>
  ),
  layout: { x: 1540, y: 1720, width: 1440, height: 400 },
};

export const Steps: TempoStoryboard = {
  name: "How It Works — Alternating Layout",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <HowItWorksSection />
    </div>
  ),
  layout: { x: 1540, y: 2170, width: 1440, height: 1400 },
};

export const Features: TempoStoryboard = {
  name: "Features — 3×2 Grid",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <FeaturesGrid />
    </div>
  ),
  layout: { x: 1540, y: 3620, width: 1440, height: 700 },
};

export const Testimonials: TempoStoryboard = {
  name: "Testimonials — Cards + Badges",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <TestimonialsSection />
    </div>
  ),
  layout: { x: 1540, y: 4370, width: 1440, height: 550 },
};

export const Pricing: TempoStoryboard = {
  name: "Pricing — White/Black Contrast",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <PricingSection />
    </div>
  ),
  layout: { x: 1540, y: 4970, width: 1440, height: 780 },
};

export const FAQ: TempoStoryboard = {
  name: "FAQ — Accordion with Circle Toggle",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <FAQSection />
    </div>
  ),
  layout: { x: 1540, y: 5800, width: 1440, height: 600 },
};

export const CTA: TempoStoryboard = {
  name: "Final CTA — Black Card",
  render: () => (
    <div style={{ background: "#FAFAFA", padding: "0 0 32px" }}>
      <FinalCTA />
    </div>
  ),
  layout: { x: 1540, y: 6450, width: 1440, height: 400 },
};

export const Footer: TempoStoryboard = {
  name: "Footer — Minimal",
  render: () => (
    <div style={{ background: "#FAFAFA" }}>
      <FooterSection />
    </div>
  ),
  layout: { x: 1540, y: 6900, width: 1440, height: 80 },
};

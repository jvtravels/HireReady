import type { TempoPage, TempoStoryboard } from 'tempo-sdk';
import {
  FullLandingPage,
  NavBar,
  HeroSection,
  LogoMarquee,
  StatsSection,
  ProblemSection,
  HowItWorksSection,
  FeaturesSection,
  TestimonialsSection,
  PricingSection,
  FAQSection,
  FinalCTASection,
  FooterSection,
} from './ModernLanding';

const page: TempoPage = {
  name: "HireStepX — Modern Landing (Light-Only)",
};

export default page;

/* ─── Full Page Composition ─── */
export const FullPage: TempoStoryboard = {
  name: "Full Landing Page",
  render: () => <FullLandingPage />,
  layout: { x: 0, y: 0, width: 1440, height: 6400 },
};

/* ─── Individual Section Breakdowns ─── */
export const Nav: TempoStoryboard = {
  name: "Navigation — Minimal",
  render: () => <NavBar />,
  layout: { x: 1540, y: 0, width: 1440, height: 80 },
};

export const Hero: TempoStoryboard = {
  name: "Hero — Big Type + Mockup",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <HeroSection />
    </div>
  ),
  layout: { x: 1540, y: 130, width: 1440, height: 900 },
};

export const Logos: TempoStoryboard = {
  name: "Logo Marquee — Continuous Scroll",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <LogoMarquee />
    </div>
  ),
  layout: { x: 1540, y: 1080, width: 1440, height: 120 },
};

export const Stats: TempoStoryboard = {
  name: "Stats — Clean Grid",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <StatsSection />
    </div>
  ),
  layout: { x: 1540, y: 1250, width: 1440, height: 240 },
};

export const Problem: TempoStoryboard = {
  name: "Problem Statement — Editorial",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <ProblemSection />
    </div>
  ),
  layout: { x: 1540, y: 1540, width: 1440, height: 420 },
};

export const HowItWorks: TempoStoryboard = {
  name: "How It Works — Stepped Reveal",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <HowItWorksSection />
    </div>
  ),
  layout: { x: 1540, y: 2010, width: 1440, height: 700 },
};

export const Features: TempoStoryboard = {
  name: "Features — Bento Grid",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <FeaturesSection />
    </div>
  ),
  layout: { x: 1540, y: 2760, width: 1440, height: 700 },
};

export const Testimonials: TempoStoryboard = {
  name: "Testimonials — Clean Cards",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <TestimonialsSection />
    </div>
  ),
  layout: { x: 1540, y: 3510, width: 1440, height: 550 },
};

export const Pricing: TempoStoryboard = {
  name: "Pricing — Light/Dark Contrast",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <PricingSection />
    </div>
  ),
  layout: { x: 1540, y: 4110, width: 1440, height: 750 },
};

export const FAQ: TempoStoryboard = {
  name: "FAQ — Accordion",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <FAQSection />
    </div>
  ),
  layout: { x: 1540, y: 4910, width: 1440, height: 600 },
};

export const FinalCTA: TempoStoryboard = {
  name: "Final CTA — Big Statement",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <FinalCTASection />
    </div>
  ),
  layout: { x: 1540, y: 5560, width: 1440, height: 440 },
};

export const Footer: TempoStoryboard = {
  name: "Footer — Minimal",
  render: () => (
    <div style={{ background: "#FAFAF9" }}>
      <FooterSection />
    </div>
  ),
  layout: { x: 1540, y: 6050, width: 1440, height: 120 },
};

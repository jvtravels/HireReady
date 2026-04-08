import type { TempoPage, TempoStoryboard } from 'tempo-sdk';
import { FullLandingPage, NavBar, HeroSection, StatsSection, HowItWorks, FeaturesSection, TestimonialsSection, PricingSection, FAQSection, FinalCTA, FooterSection } from './LandingPage';

const page: TempoPage = {
  name: "Hirloop Landing Page — Light Mode",
};

export default page;

export const FullPage: TempoStoryboard = {
  name: "Full Landing Page",
  render: () => <FullLandingPage />,
  layout: { x: 0, y: 0, width: 1440, height: 5400 },
};

export const Nav: TempoStoryboard = {
  name: "Navigation Bar",
  render: () => <NavBar />,
  layout: { x: 1490, y: 0, width: 1440, height: 80 },
};

export const Hero: TempoStoryboard = {
  name: "Hero Section",
  render: () => <HeroSection />,
  layout: { x: 1490, y: 130, width: 1440, height: 900 },
};

export const Stats: TempoStoryboard = {
  name: "Stats Bar",
  render: () => <StatsSection />,
  layout: { x: 1490, y: 1080, width: 1440, height: 200 },
};

export const Steps: TempoStoryboard = {
  name: "How It Works",
  render: () => <HowItWorks />,
  layout: { x: 1490, y: 1330, width: 1440, height: 600 },
};

export const Features: TempoStoryboard = {
  name: "Features Grid",
  render: () => <FeaturesSection />,
  layout: { x: 1490, y: 1980, width: 1440, height: 700 },
};

export const Testimonials: TempoStoryboard = {
  name: "Testimonials",
  render: () => <TestimonialsSection />,
  layout: { x: 1490, y: 2730, width: 1440, height: 550 },
};

export const Pricing: TempoStoryboard = {
  name: "Pricing",
  render: () => <PricingSection />,
  layout: { x: 1490, y: 3330, width: 1440, height: 750 },
};

export const FAQ: TempoStoryboard = {
  name: "FAQ",
  render: () => <FAQSection />,
  layout: { x: 1490, y: 4130, width: 1440, height: 600 },
};

export const CTA: TempoStoryboard = {
  name: "Final CTA",
  render: () => <FinalCTA />,
  layout: { x: 1490, y: 4780, width: 1440, height: 280 },
};

export const Footer: TempoStoryboard = {
  name: "Footer",
  render: () => <FooterSection />,
  layout: { x: 1490, y: 5110, width: 1440, height: 300 },
};

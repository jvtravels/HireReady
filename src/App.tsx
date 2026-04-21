"use client";
import { useEffect, useState, lazy, Suspense, useRef } from "react";
import { c } from "./tokens";
import { useSEO, webAppJsonLd, faqJsonLd } from "./useSEO";
import { LANDING_FAQS } from "./landingData";
import {
  Nav, Hero, StickyCTA, LogoMarquee, StatsSection, ProblemSection,
  HowItWorks, FeaturesSection, ScorePreview, ComparisonSection,
} from "./landing";

// Lazy-load below-fold sections to reduce initial bundle and speed up FCP/LCP
const LazyBottomSections = lazy(() => import("./landing/BottomSections").then(m => ({
  default: () => (
    <>
      <m.ForTeamsBanner />
      <m.TrustBadges />
      <m.FAQSection />
      <m.FinalCTA />
      <m.EmailCapture />
    </>
  ),
})));
const LazyTestimonials = lazy(() => import("./landing/Sections").then(m => ({ default: m.TestimonialsSection })));
const LazyPricing = lazy(() => import("./landing/PricingSection").then(m => ({ default: m.PricingSection })));
const LazyFooter = lazy(() => import("./landing/BottomSections").then(m => ({ default: m.Footer })));

export default function App() {


  useSEO({
    title: "HireStepX — AI Mock Interviews & Career Coaching for India",
    description: "Practice mock interviews with AI, get real-time feedback, track your scores, and land your dream job. Free for students and freshers in India.",
    ogType: "website",
    jsonLd: { "@context": "https://schema.org", "@graph": [webAppJsonLd(), faqJsonLd(LANDING_FAQS)] },
  });

  // Trigger lazy sections when user scrolls near them
  // Hooks must be called before any early returns (Rules of Hooks)
  const [showLazy, setShowLazy] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShowLazy(true); observer.disconnect(); }
    }, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, position: "relative", overflow: "hidden" }}>
      <Nav />
      <main id="main-content">
        <Hero />
        <LogoMarquee />
        <StatsSection />
        <ProblemSection />
        <HowItWorks />
        <FeaturesSection />
        <ScorePreview />
        <ComparisonSection />
        <div ref={triggerRef} />
        {showLazy && (
          <Suspense fallback={null}>
            <LazyTestimonials />
            <LazyPricing />
            <LazyBottomSections />
          </Suspense>
        )}
      </main>
      {showLazy ? <Suspense fallback={null}><LazyFooter /></Suspense> : null}
      <StickyCTA />
    </div>
  );
}

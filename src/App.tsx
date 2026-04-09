import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { c } from "./tokens";
import { useAuth, hasStoredSession, getLastRoute } from "./AuthContext";
import { useSEO, webAppJsonLd, faqJsonLd } from "./useSEO";
import { LANDING_FAQS } from "./landingData";
import {
  Nav, Hero, LogoMarquee, StatsSection, ProblemSection,
  HowItWorks, DemoVideoSection, FeaturesSection, ScorePreview,
  TestimonialsSection, PricingSection, ForTeamsBanner, TrustBadges,
  FAQSection, FinalCTA, EmailCapture, Footer,
} from "./landing";

export default function App() {
  const { isLoggedIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [hadStoredSession] = useState(() => hasStoredSession());

  // Redirect logged-in users to their last route, or dashboard/onboarding
  useEffect(() => {
    if (loading || !isLoggedIn) return;
    let lastRoute = getLastRoute();
    // Never restore transient routes — send to dashboard instead
    if (lastRoute?.startsWith("/interview")) lastRoute = null;
    if (user && !user.hasCompletedOnboarding) {
      navigate(lastRoute?.startsWith("/onboarding") ? lastRoute : "/onboarding", { replace: true });
    } else {
      navigate(lastRoute && lastRoute !== "/" ? lastRoute : "/dashboard", { replace: true });
    }
  }, [isLoggedIn, loading, user, navigate]);

  useSEO({
    title: "HireStepX — AI Mock Interviews & Career Coaching for India",
    description: "Practice mock interviews with AI, get real-time feedback, track your scores, and land your dream job. Free for students and freshers in India.",
    ogType: "website",
    jsonLd: { "@context": "https://schema.org", "@graph": [webAppJsonLd(), faqJsonLd(LANDING_FAQS)] },
  });

  // While auth restores for returning users, show a blank screen matching the
  // app background instead of flashing the landing page.
  if (loading && hadStoredSession) {
    return <div style={{ minHeight: "100vh", background: c.obsidian }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian, color: c.ivory, position: "relative", overflow: "hidden" }}>
      <Nav />
      <main id="main-content">
        <Hero />
        <LogoMarquee />
        <StatsSection />
        <ProblemSection />
        <HowItWorks />
        <DemoVideoSection />
        <FeaturesSection />
        <ScorePreview />
        <TestimonialsSection />
        <PricingSection />
        <ForTeamsBanner />
        <TrustBadges />
        <FAQSection />
        <FinalCTA />
        <EmailCapture />
      </main>
      <Footer />
    </div>
  );
}

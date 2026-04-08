import "./index.css";
import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./AuthContext";
import { DashboardProvider } from "./DashboardContext";
import { ThemeProvider } from "./ThemeContext";
import { ToastProvider } from "./Toast";
import NotFound from "./NotFound";
import ErrorBoundary, { RouteErrorBoundary } from "./ErrorBoundary";

// Lazy-load non-critical modules
const App = lazy(() => import("./App"));
const Analytics = lazy(() => import("@vercel/analytics/react").then(m => ({ default: m.Analytics })));
const SpeedInsights = lazy(() => import("@vercel/speed-insights/react").then(m => ({ default: m.SpeedInsights })));

// Defer error reporter + PostHog init to after first paint
if (typeof requestIdleCallback !== "undefined") {
  requestIdleCallback(() => {
    import("./errorReporter").then(m => m.initErrorReporter());
    import("./analytics").then(m => m.initPosthog());
  });
} else {
  setTimeout(() => {
    import("./errorReporter").then(m => m.initErrorReporter());
    import("./analytics").then(m => m.initPosthog());
  }, 100);
}

const TempoHost = lazy(() => {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/tempo-host")) {
    const base = "..";
    const path = ".tempo/tempo-host";
    return import(/* @vite-ignore */ `${base}/${path}`).catch(() => ({ default: () => null as any }));
  }
  return Promise.resolve({ default: () => null as any });
});
const LegalPage = lazy(() => import("./LegalPage"));
const SignUp = lazy(() => import("./SignUp"));
const Onboarding = lazy(() => import("./Onboarding"));
const OnboardingComplete = lazy(() => import("./OnboardingComplete"));
const DashboardLayout = lazy(() => import("./DashboardLayout"));
const DashboardHome = lazy(() => import("./DashboardHome"));
// Prefetch dashboard chunks for returning users (stored auth session)
try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
      import("./DashboardLayout");
      import("./DashboardHome");
      break;
    }
  }
} catch {}
const DashboardSessions = lazy(() => import("./DashboardSessions"));
const DashboardCalendar = lazy(() => import("./DashboardCalendar"));
const DashboardAnalytics = lazy(() => import("./DashboardAnalytics"));
const DashboardResume = lazy(() => import("./DashboardResume"));
const DashboardSettings = lazy(() => import("./DashboardSettings"));
const Interview = lazy(() => import("./Interview"));
const SessionSetup = lazy(() => import("./SessionSetup"));
const ResetPassword = lazy(() => import("./ResetPassword"));
const SessionDetail = lazy(() => import("./SessionDetail"));
const PlaceholderPage = lazy(() => import("./PlaceholderPage"));
const BlogPage = lazy(() => import("./BlogPage"));

function LoadingFallback() {
  return <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: "100vh", background: "var(--color-bg)" }}><span className="sr-only">Loading…</span></div>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const ROUTE_TITLES: Record<string, string> = {
  "/": "Hirloop — AI Mock Interviews",
  "/signup": "Sign Up — Hirloop",
  "/login": "Log In — Hirloop",
  "/onboarding": "Get Started — Hirloop",
  "/onboarding/complete": "You're Ready — Hirloop",
  "/dashboard": "Dashboard — Hirloop",
  "/sessions": "Sessions — Hirloop",
  "/calendar": "Calendar — Hirloop",
  "/analytics": "Analytics — Hirloop",
  "/resume": "Resume — Hirloop",
  "/settings": "Settings — Hirloop",
  "/session/new": "New Session — Hirloop",
  "/interview": "Interview — Hirloop",
  "/reset-password": "Reset Password — Hirloop",
  "/terms": "Terms of Service — Hirloop",
  "/privacy": "Privacy Policy — Hirloop",
  "/blog": "Blog — Hirloop",
};

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = ROUTE_TITLES[pathname] || (pathname.startsWith("/session/") ? "Session Details — Hirloop" : pathname.startsWith("/blog/") ? "Blog — Hirloop" : "Hirloop");
    document.title = title;
  }, [pathname]);
  return null;
}

const isTempoHostRoute = window.location.pathname.startsWith("/tempo-host");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isTempoHostRoute ? (
      <Suspense fallback={<LoadingFallback />}><TempoHost /></Suspense>
    ) : (
      <ErrorBoundary>
      <ThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <DocumentTitle />
        <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<div className="page-enter"><App /></div>} />
              <Route path="/signup" element={<div className="page-enter"><SignUp /></div>} />
              <Route path="/login" element={<div className="page-enter"><SignUp isLogin /></div>} />
              <Route path="/onboarding" element={<RequireAuth><div className="page-enter"><Onboarding /></div></RequireAuth>} />
              <Route path="/onboarding/complete" element={<RequireAuth><div className="page-enter"><OnboardingComplete /></div></RequireAuth>} />
              <Route element={<RequireAuth><DashboardProvider><div className="page-enter"><DashboardLayout /></div></DashboardProvider></RequireAuth>}>
                <Route path="/dashboard" element={<RouteErrorBoundary><DashboardHome /></RouteErrorBoundary>} />
                <Route path="/sessions" element={<RouteErrorBoundary><DashboardSessions /></RouteErrorBoundary>} />
                <Route path="/calendar" element={<RouteErrorBoundary><DashboardCalendar /></RouteErrorBoundary>} />
                <Route path="/analytics" element={<RouteErrorBoundary><DashboardAnalytics /></RouteErrorBoundary>} />
                <Route path="/resume" element={<RouteErrorBoundary><DashboardResume /></RouteErrorBoundary>} />
                <Route path="/settings" element={<RouteErrorBoundary><DashboardSettings /></RouteErrorBoundary>} />
              </Route>
              <Route path="/session/new" element={<RequireAuth><div className="page-enter"><SessionSetup /></div></RequireAuth>} />
              <Route path="/interview" element={<RequireAuth><RouteErrorBoundary><Interview /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/reset-password" element={<div className="page-enter"><ResetPassword /></div>} />
              <Route path="/terms" element={<div className="page-enter"><LegalPage type="terms" /></div>} />
              <Route path="/privacy" element={<div className="page-enter"><LegalPage type="privacy" /></div>} />
              <Route path="/session/:id" element={<RequireAuth><div className="page-enter"><RouteErrorBoundary><SessionDetail /></RouteErrorBoundary></div></RequireAuth>} />
              <Route path="/blog" element={<div className="page-enter"><BlogPage /></div>} />
              <Route path="/blog/:slug" element={<div className="page-enter"><BlogPage /></div>} />
              <Route path="/page/:slug" element={<div className="page-enter"><PlaceholderPage /></div>} />
              <Route path="*" element={<div className="page-enter"><NotFound /></div>} />
            </Routes>
          </Suspense>
        </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
      </ThemeProvider>
      </ErrorBoundary>
    )}
    <Suspense fallback={null}><Analytics /></Suspense>
    <Suspense fallback={null}><SpeedInsights /></Suspense>
  </StrictMode>,
);

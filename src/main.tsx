import "./index.css";
import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./AuthContext";
import { DashboardProvider } from "./DashboardContext";
import { ToastProvider } from "./Toast";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { initErrorReporter } from "./errorReporter";
import App from "./App";
import NotFound from "./NotFound";
import ErrorBoundary, { RouteErrorBoundary } from "./ErrorBoundary";

initErrorReporter();

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

function LoadingFallback() {
  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0B", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(201,169,110,0.08)", border: "1px solid rgba(201,169,110,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, border: "2px solid rgba(201,169,110,0.3)", borderTopColor: "#C9A96E", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#9A9590" }}>Loading...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const isTempoHostRoute = window.location.pathname.startsWith("/tempo-host");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isTempoHostRoute ? (
      <Suspense fallback={<LoadingFallback />}><TempoHost /></Suspense>
    ) : (
      <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<div className="page-enter"><App /></div>} />
              <Route path="/signup" element={<div className="page-enter"><SignUp /></div>} />
              <Route path="/login" element={<div className="page-enter"><SignUp isLogin /></div>} />
              <Route path="/onboarding" element={<RequireAuth><div className="page-enter"><Onboarding /></div></RequireAuth>} />
              <Route path="/onboarding/complete" element={<RequireAuth><div className="page-enter"><OnboardingComplete /></div></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><DashboardProvider><div className="page-enter"><DashboardLayout /></div></DashboardProvider></RequireAuth>}>
                <Route index element={<RouteErrorBoundary><DashboardHome /></RouteErrorBoundary>} />
                <Route path="sessions" element={<RouteErrorBoundary><DashboardSessions /></RouteErrorBoundary>} />
                <Route path="calendar" element={<RouteErrorBoundary><DashboardCalendar /></RouteErrorBoundary>} />
                <Route path="analytics" element={<RouteErrorBoundary><DashboardAnalytics /></RouteErrorBoundary>} />
                <Route path="resume" element={<RouteErrorBoundary><DashboardResume /></RouteErrorBoundary>} />
                <Route path="settings" element={<RouteErrorBoundary><DashboardSettings /></RouteErrorBoundary>} />
              </Route>
              <Route path="/session/new" element={<RequireAuth><div className="page-enter"><SessionSetup /></div></RequireAuth>} />
              <Route path="/interview" element={<RequireAuth><RouteErrorBoundary><Interview /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/reset-password" element={<div className="page-enter"><ResetPassword /></div>} />
              <Route path="/terms" element={<div className="page-enter"><LegalPage type="terms" /></div>} />
              <Route path="/privacy" element={<div className="page-enter"><LegalPage type="privacy" /></div>} />
              <Route path="/session/:id" element={<RequireAuth><div className="page-enter"><RouteErrorBoundary><SessionDetail /></RouteErrorBoundary></div></RequireAuth>} />
              <Route path="/page/:slug" element={<div className="page-enter"><PlaceholderPage /></div>} />
              <Route path="*" element={<div className="page-enter"><NotFound /></div>} />
            </Routes>
          </Suspense>
        </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    )}
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);

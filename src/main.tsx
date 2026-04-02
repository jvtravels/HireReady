import "./index.css";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./AuthContext";
import App from "./App";
import NotFound from "./NotFound";
import ErrorBoundary from "./ErrorBoundary";
import TempoHost from "../.tempo/tempo-host";

const LegalPage = lazy(() => import("./LegalPage"));
const SignUp = lazy(() => import("./SignUp"));
const Onboarding = lazy(() => import("./Onboarding"));
const Dashboard = lazy(() => import("./Dashboard"));
const Interview = lazy(() => import("./Interview"));
const SessionSetup = lazy(() => import("./SessionSetup"));
const ResetPassword = lazy(() => import("./ResetPassword"));
const SessionDetail = lazy(() => import("./SessionDetail"));

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

const isTempoHostRoute = window.location.pathname.startsWith("/tempo-host");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isTempoHostRoute ? (
      <TempoHost />
    ) : (
      <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<div className="page-enter"><App /></div>} />
              <Route path="/signup" element={<div className="page-enter"><SignUp /></div>} />
              <Route path="/login" element={<div className="page-enter"><SignUp isLogin /></div>} />
              <Route path="/onboarding" element={<RequireAuth><div className="page-enter"><Onboarding /></div></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><div className="page-enter"><Dashboard /></div></RequireAuth>} />
              <Route path="/session/new" element={<RequireAuth><div className="page-enter"><SessionSetup /></div></RequireAuth>} />
              <Route path="/interview" element={<RequireAuth><Interview /></RequireAuth>} />
              <Route path="/reset-password" element={<div className="page-enter"><ResetPassword /></div>} />
              <Route path="/terms" element={<div className="page-enter"><LegalPage type="terms" /></div>} />
              <Route path="/privacy" element={<div className="page-enter"><LegalPage type="privacy" /></div>} />
              <Route path="/session/:id" element={<RequireAuth><div className="page-enter"><SessionDetail /></div></RequireAuth>} />
              <Route path="*" element={<div className="page-enter"><NotFound /></div>} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    )}
  </StrictMode>,
);

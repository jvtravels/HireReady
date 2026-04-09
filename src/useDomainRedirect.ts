/* Domain-based redirect for SPA navigation.
 * When on hirestepx.com and navigating to an app path (or vice versa),
 * this hook performs a full-page redirect to the correct domain.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const APP_HOST = "app.hirestepx.com";
const MARKETING_HOST = "hirestepx.com";

const MARKETING_PATHS = new Set(["/", "/blog", "/terms", "/privacy"]);
const MARKETING_PREFIXES = ["/blog/", "/page/"];

const APP_PREFIXES = [
  "/dashboard", "/sessions", "/calendar", "/analytics", "/resume", "/settings",
  "/session/", "/interview", "/onboarding", "/signup", "/login", "/reset-password",
];

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.has(pathname)) return true;
  return MARKETING_PREFIXES.some(p => pathname.startsWith(p));
}

function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some(p => pathname.startsWith(p));
}

export function useDomainRedirect() {
  const { pathname, search, hash } = useLocation();
  const hostname = window.location.hostname;

  useEffect(() => {
    // Skip in development
    if (hostname === "localhost" || hostname === "127.0.0.1") return;

    // On marketing domain, redirect app paths
    if (hostname === MARKETING_HOST || hostname === `www.${MARKETING_HOST}`) {
      if (isAppPath(pathname)) {
        window.location.href = `https://${APP_HOST}${pathname}${search}${hash}`;
      }
    }

    // On app subdomain, redirect marketing paths
    if (hostname === APP_HOST) {
      if (isMarketingPath(pathname)) {
        window.location.href = `https://${MARKETING_HOST}${pathname}${search}${hash}`;
      }
    }
  }, [pathname, search, hash, hostname]);
}

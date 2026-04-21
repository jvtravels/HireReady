/* Next.js Edge Middleware — Domain-based routing
 *
 * hirestepx.com         → marketing pages (/, /blog, /terms, /privacy, /page/*)
 * app.hirestepx.com     → product pages (auth, dashboard, interview, etc.)
 *
 * Cross-domain requests are redirected to the correct domain.
 * API routes and static assets are passed through on both domains.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOST = "app.hirestepx.com";
const MARKETING_HOST = "hirestepx.com";

const MARKETING_PATHS = new Set(["/", "/blog", "/terms", "/privacy", "/refund"]);
const MARKETING_PREFIXES = ["/blog/", "/page/", "/profile/"];

const APP_PREFIXES = [
  "/dashboard", "/sessions", "/calendar", "/analytics", "/resume", "/settings",
  "/session/", "/interview", "/onboarding", "/signup", "/login", "/reset-password",
  "/auth/callback",
];

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.has(pathname)) return true;
  return MARKETING_PREFIXES.some(p => pathname.startsWith(p));
}

function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some(p => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;

  // Skip in development
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return NextResponse.next();
  }

  // On marketing domain → redirect app paths to app subdomain
  if (hostname === MARKETING_HOST || hostname === `www.${MARKETING_HOST}`) {
    if (isAppPath(pathname)) {
      const url = request.nextUrl.clone();
      url.hostname = APP_HOST;
      url.port = "";
      return NextResponse.redirect(url, 307);
    }
  }

  // On app subdomain → redirect marketing paths to root domain
  if (hostname === APP_HOST) {
    if (isMarketingPath(pathname)) {
      const url = request.nextUrl.clone();
      url.hostname = MARKETING_HOST;
      url.port = "";
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};

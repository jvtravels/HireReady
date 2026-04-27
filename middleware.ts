/* Next.js Edge Middleware — Domain-based routing + pre-launch gate
 *
 * hirestepx.com         → marketing pages (/, /blog, /terms, /privacy, /page/*)
 * www.hirestepx.com     → marketing pages (currently pre-launch gated)
 * app.hirestepx.com     → product pages (currently pre-launch gated — same as www)
 * staging.hirestepx.com → full app (team / pre-prod, never gated)
 * admin.hirestepx.com   → admin panel
 *
 * Pre-launch behavior: PRE_LAUNCH_HOSTS get every non-allowed path rewritten
 * to / (Coming Soon). API routes, static assets, and a small allowlist of
 * legal/marketing pages still pass through.
 *
 * To launch publicly: clear PRE_LAUNCH_HOSTS (or set NEXT_PUBLIC_COMING_SOON=0
 * which the marketing page handler also respects).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOST = "app.hirestepx.com";
const MARKETING_HOST = "hirestepx.com";
const ADMIN_HOST = "admin.hirestepx.com";

const MARKETING_PATHS = new Set(["/", "/blog", "/terms", "/privacy", "/refund"]);
const MARKETING_PREFIXES = ["/blog/", "/page/", "/profile/"];

const APP_PREFIXES = [
  "/dashboard", "/sessions", "/calendar", "/analytics", "/resume", "/settings",
  "/session/", "/interview", "/onboarding", "/signup", "/login", "/reset-password",
  "/auth/callback",
  "/notebook",

];

/**
 * Hosts that show ONLY the Coming Soon shell + a tiny allowlist below.
 * Everything else gets rewritten to `/` so the gate can't be bypassed by
 * typing /dashboard, /login, /admin, etc. directly.
 *
 * staging.hirestepx.com is intentionally EXCLUDED so the team can keep
 * working with the full app while www. is still gated.
 */
const PRE_LAUNCH_HOSTS = new Set<string>([
  "hirestepx.com",
  "www.hirestepx.com",
  "app.hirestepx.com",
]);

/**
 * Paths still accessible on a gated host. Everything else rewrites to `/`.
 * - "/" → renders Coming Soon page
 * - "/blog", "/terms", "/privacy", "/refund" → public marketing/legal
 * - "/api/" → waitlist + analytics endpoints stay reachable
 * - "/_next/", "/favicon", "/robots", "/sitemap" → static + crawler stuff
 *   (covered by the matcher config but listed for clarity)
 */
const GATE_ALLOWLIST_PATHS = new Set(["/", "/blog", "/terms", "/privacy", "/refund"]);
const GATE_ALLOWLIST_PREFIXES = ["/blog/", "/api/", "/_next/", "/page/", "/profile/", "/report/share/"];

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.has(pathname)) return true;
  return MARKETING_PREFIXES.some(p => pathname.startsWith(p));
}

function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some(p => pathname.startsWith(p));
}

function isAllowedOnGate(pathname: string): boolean {
  if (GATE_ALLOWLIST_PATHS.has(pathname)) return true;
  return GATE_ALLOWLIST_PREFIXES.some(p => pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.nextUrl.hostname;

  // Skip in development
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return NextResponse.next();
  }

  // ─── Pre-launch gate ─────────────────────────────────────────────
  // Manual override: NEXT_PUBLIC_COMING_SOON=0 disables the gate everywhere
  // so the team can do a public launch by flipping a single env var.
  const gateDisabled = process.env.NEXT_PUBLIC_COMING_SOON === "0";
  if (!gateDisabled && PRE_LAUNCH_HOSTS.has(hostname) && !isAllowedOnGate(pathname)) {
    // Rewrite (not redirect) so the URL stays clean and the user lands on
    // the Coming Soon page rendered by app/(marketing)/page.tsx.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.rewrite(url);
  }

  // Admin subdomain — rewrite all requests to /admin path
  if (hostname === ADMIN_HOST) {
    // Allow API routes and auth callback through (admin needs auth + admin-data API)
    if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) {
      return NextResponse.next();
    }
    // Rewrite root and all paths to /admin
    if (pathname === "/" || !pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.rewrite(url);
    }
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
    // Redirect /admin to admin subdomain
    if (pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.hostname = ADMIN_HOST;
      url.pathname = "/";
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
    // Redirect /admin to admin subdomain
    if (pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.hostname = ADMIN_HOST;
      url.pathname = "/";
      url.port = "";
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};

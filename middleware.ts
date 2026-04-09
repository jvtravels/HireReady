/* Vercel Edge Middleware — Domain-based routing
 *
 * hirestepx.com         → marketing pages (/, /blog, /terms, /privacy, /page/*)
 * app.hirestepx.com     → product pages (auth, dashboard, interview, etc.)
 *
 * Cross-domain requests are redirected to the correct domain.
 * API routes and static assets are passed through on both domains.
 */

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

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const { pathname } = url;
  const hostname = url.hostname;

  // Skip API routes, static files, and assets
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/tempo") ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.\w{2,5}$/.test(pathname) // files with extensions (.js, .css, .png, etc.)
  ) {
    return;
  }

  // Skip in development
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return;
  }

  // On marketing domain → redirect app paths to app subdomain
  if (hostname === MARKETING_HOST || hostname === `www.${MARKETING_HOST}`) {
    if (isAppPath(pathname)) {
      url.hostname = APP_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 307);
    }
  }

  // On app subdomain → redirect marketing paths to root domain
  if (hostname === APP_HOST) {
    if (isMarketingPath(pathname)) {
      url.hostname = MARKETING_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 307);
    }
  }

  // Pass through
  return;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

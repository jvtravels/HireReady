/* ─── Lightweight Error Reporter ─── */
/* Captures unhandled errors and promise rejections, sends to /api/log-error */
/* Also forwards to Sentry if NEXT_PUBLIC_SENTRY_DSN is configured. */
/* Falls back silently if neither endpoint is available */

const MAX_ERRORS_PER_SESSION = 20;
let errorCount = 0;
const SENTRY_DSN = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SENTRY_DSN) || "";
interface SentryLike {
  init(opts: Record<string, unknown>): void;
  captureException(err: unknown): void;
  captureMessage(msg: string, ctx?: { level?: string; extra?: Record<string, unknown> }): void;
}
let _sentryLoaded = false;
let _sentry: SentryLike | null = null;

async function ensureSentry(): Promise<SentryLike | null> {
  if (!SENTRY_DSN) return null;
  if (_sentryLoaded) return _sentry;
  _sentryLoaded = true;
  try {
    // Dynamic import — only loaded if DSN is set AND package is installed.
    // Package is optional so the app builds without it.
    const Sentry = (await import(/* @vite-ignore */ /* webpackIgnore: true */ "@sentry/browser" as string).catch(() => null)) as SentryLike | null;
    if (!Sentry) return null;
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0.1,
    });
    _sentry = Sentry;
    return Sentry;
  } catch {
    return null;
  }
}

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
  sessionId?: string;
}

function getSessionId(): string | undefined {
  try {
    return localStorage.getItem("hirestepx_session_id") ?? undefined;
  } catch {
    return undefined;
  }
}

function sendError(report: ErrorReport, originalError?: Error | unknown) {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  errorCount++;

  // 1. First-party endpoint (always)
  const payload = JSON.stringify(report);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/log-error", payload);
  } else {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(err => {
      // Don't create a feedback loop — console only
      if (typeof console !== "undefined") {
        console.warn("[errorReporter] log endpoint failed:", err?.message || err);
      }
    });
  }

  // 2. Sentry (optional, opt-in via NEXT_PUBLIC_SENTRY_DSN)
  if (SENTRY_DSN) {
    ensureSentry().then(Sentry => {
      if (!Sentry) return;
      if (originalError instanceof Error) {
        Sentry.captureException(originalError);
      } else {
        Sentry.captureMessage(report.message, { level: "error", extra: report as unknown as Record<string, unknown> });
      }
    });
  }
}

function buildReport(message: string, stack?: string): ErrorReport {
  return {
    message: message.slice(0, 500),
    stack: stack?.slice(0, 2000),
    url: window.location.href,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    sessionId: getSessionId(),
  };
}

let _initialized = false;
export function initErrorReporter() {
  if (_initialized) return;
  _initialized = true;
  // Unhandled errors
  window.addEventListener("error", (event) => {
    sendError(buildReport(
      event.message || "Unknown error",
      event.error?.stack,
    ), event.error);
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    // Don't report aborted fetches or common non-errors
    if (message.includes("AbortError") || message.includes("Failed to fetch")) return;
    const stack = reason instanceof Error ? reason.stack : undefined;
    sendError(buildReport(`Unhandled rejection: ${message.slice(0, 200)}`, stack), reason);
  });
}

/* ─── Lightweight Error Reporter ─── */
/* Captures unhandled errors and promise rejections, sends to /api/log-error */
/* Falls back silently if the endpoint is unavailable */

const MAX_ERRORS_PER_SESSION = 20;
let errorCount = 0;

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
    return localStorage.getItem("hirloop_session_id") ?? undefined;
  } catch {
    return undefined;
  }
}

function sendError(report: ErrorReport) {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  errorCount++;

  // Use sendBeacon for reliability (fires even during page unload)
  const payload = JSON.stringify(report);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/log-error", payload);
  } else {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
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

export function initErrorReporter() {
  // Unhandled errors
  window.addEventListener("error", (event) => {
    sendError(buildReport(
      event.message || "Unknown error",
      event.error?.stack,
    ));
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    sendError(buildReport(message, stack));
  });
}

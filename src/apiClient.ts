/**
 * Authenticated API client for the app's own `/api/*` endpoints.
 *
 * Uses XMLHttpRequest instead of fetch for one specific reason: a material
 * fraction of real-world users run browser extensions (Loom Screen Recorder,
 * Jam.dev, Hotjar, session-replay tools, etc.) that install a wrapper around
 * window.fetch to capture every request for telemetry. Several of those
 * wrappers hang on authenticated POSTs above a small body-size threshold and
 * never resolve, which in turn stalls every user action built on `fetch`.
 * XHR is untouched by those extensions, so routing our mutations through it
 * is the most reliable transport we can offer without asking users to
 * uninstall extensions.
 *
 * This is the ONLY place in the app that does extension-avoidance; every
 * mutation endpoint goes through apiFetch so we have a single audit surface.
 */

import { authHeaders } from "./supabase";
import { getDistinctId, getSessionId } from "./posthogClient";

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  headers: Record<string, string>;
}

/**
 * POST JSON to `/api/...` with the current user's bearer token attached.
 * Resolves on network failure — callers read `ok` / `status` to branch.
 */
export async function apiFetch<T = unknown>(
  path: string,
  body: unknown,
  opts: { signal?: AbortSignal; method?: "POST" | "PUT" | "PATCH" | "DELETE" } = {},
): Promise<ApiResponse<T>> {
  const headers = await authHeaders();
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let abortListener: (() => void) | null = null;

    const settle = (response: ApiResponse<T>) => {
      if (settled) return;
      settled = true;
      if (abortListener && opts.signal) opts.signal.removeEventListener("abort", abortListener);
      resolve(response);
    };

    // If the caller passed an already-aborted signal we must resolve without
    // ever sending the request. xhr.abort() on an unsent XHR is a no-op and
    // won't fire onabort, which would leave the promise hanging.
    if (opts.signal?.aborted) {
      settle({ ok: false, status: 0, data: null, error: "aborted", headers: {} });
      return;
    }

    xhr.open(opts.method || "POST", path, true);
    xhr.responseType = "text";
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    // Forward PostHog correlation ids so server-side events join the same person/session
    try {
      const did = getDistinctId();
      const sid = getSessionId();
      if (did) xhr.setRequestHeader("X-PostHog-Distinct-Id", did);
      if (sid) xhr.setRequestHeader("X-PostHog-Session-Id", sid);
    } catch { /* never break a request on telemetry header injection */ }

    xhr.onload = () => {
      const headerMap: Record<string, string> = {};
      const raw = xhr.getAllResponseHeaders() || "";
      raw.trim().split(/[\r\n]+/).forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) headerMap[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
      });
      const ok = xhr.status >= 200 && xhr.status < 300;
      const rawText = xhr.responseText || "";
      let parsed: unknown = null;
      let parseFailed = false;
      if (rawText) {
        try { parsed = JSON.parse(rawText); } catch { parseFailed = true; }
      }
      const errBody = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
      settle({
        ok,
        status: xhr.status,
        // If body isn't JSON (e.g. 502 HTML error page) but the status is 2xx,
        // expose the raw text so callers can see what they actually got.
        data: ok ? (parseFailed ? (rawText as unknown as T) : (parsed as T)) : null,
        error: ok
          ? null
          : (typeof errBody.error === "string"
              ? errBody.error
              : (parseFailed && rawText ? rawText.slice(0, 200) : `HTTP ${xhr.status}`)),
        headers: headerMap,
      });
    };
    xhr.onerror = () => settle({ ok: false, status: 0, data: null, error: "Network error", headers: {} });
    xhr.onabort = () => settle({ ok: false, status: 0, data: null, error: "aborted", headers: {} });

    if (opts.signal) {
      abortListener = () => xhr.abort();
      opts.signal.addEventListener("abort", abortListener, { once: true });
    }

    xhr.send(body == null ? null : typeof body === "string" ? body : JSON.stringify(body));
  });
}

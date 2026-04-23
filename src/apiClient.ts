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
    xhr.open(opts.method || "POST", path, true);
    xhr.responseType = "text";
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

    xhr.onload = () => {
      const headerMap: Record<string, string> = {};
      const raw = xhr.getAllResponseHeaders() || "";
      raw.trim().split(/[\r\n]+/).forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) headerMap[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
      });
      let parsed: unknown = null;
      try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { parsed = null; }
      const body = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
      const ok = xhr.status >= 200 && xhr.status < 300;
      resolve({
        ok,
        status: xhr.status,
        data: ok ? (parsed as T) : null,
        error: ok ? null : (typeof body.error === "string" ? body.error : `HTTP ${xhr.status}`),
        headers: headerMap,
      });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, data: null, error: "Network error", headers: {} });
    xhr.onabort = () => resolve({ ok: false, status: 0, data: null, error: "aborted", headers: {} });

    if (opts.signal) {
      if (opts.signal.aborted) { xhr.abort(); return; }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(body == null ? null : typeof body === "string" ? body : JSON.stringify(body));
  });
}

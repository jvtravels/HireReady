/**
 * Adapter that converts Next.js Route Handler Request/Response
 * to Vercel's VercelRequest/VercelResponse interface.
 *
 * This allows existing Node.js serverless functions to work with
 * Next.js App Router without rewriting every handler.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { IncomingHttpHeaders } from "http";

/**
 * Convert a Web Request to a VercelRequest-like object and
 * capture the response via a VercelResponse-like proxy.
 */
export async function adaptHandler(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: VercelRequest, res: VercelResponse) => any,
): Promise<Response> {
  // Parse body
  let body: unknown = undefined;
  const contentType = req.headers.get("content-type") || "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      if (contentType.includes("application/json")) {
        body = await req.json();
      } else {
        body = await req.text();
      }
    } catch {
      body = undefined;
    }
  }

  // Convert Web Headers to Node.js-style headers object
  const headers: IncomingHttpHeaders = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Build VercelRequest-like object
  const fakeReq = {
    method: req.method,
    url: new URL(req.url).pathname + new URL(req.url).search,
    headers,
    body,
    query: Object.fromEntries(new URL(req.url).searchParams),
    cookies: {},
  } as unknown as VercelRequest;

  // Build VercelResponse-like proxy that captures the response
  let responseStatus = 200;
  const responseHeaders: Record<string, string> = {};
  let responseBody: unknown = undefined;
  let resolved = false;

  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });

  const fakeRes = {
    status(code: number) {
      responseStatus = code;
      return fakeRes;
    },
    json(data: unknown) {
      if (resolved) return fakeRes;
      resolved = true;
      responseHeaders["content-type"] = "application/json";
      responseBody = JSON.stringify(data);
      resolve(
        new Response(responseBody as string, {
          status: responseStatus,
          headers: responseHeaders,
        }),
      );
      return fakeRes;
    },
    send(data: unknown) {
      if (resolved) return fakeRes;
      resolved = true;
      const bodyStr = typeof data === "string" ? data : JSON.stringify(data);
      if (!responseHeaders["content-type"]) {
        responseHeaders["content-type"] = typeof data === "string" ? "text/plain" : "application/json";
      }
      resolve(
        new Response(bodyStr, {
          status: responseStatus,
          headers: responseHeaders,
        }),
      );
      return fakeRes;
    },
    end(data?: unknown) {
      if (resolved) return fakeRes;
      resolved = true;
      resolve(
        new Response(data ? String(data) : null, {
          status: responseStatus,
          headers: responseHeaders,
        }),
      );
      return fakeRes;
    },
    setHeader(key: string, value: string | string[]) {
      responseHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
      return fakeRes;
    },
    getHeader(key: string) {
      return responseHeaders[key.toLowerCase()];
    },
    removeHeader(key: string) {
      delete responseHeaders[key.toLowerCase()];
      return fakeRes;
    },
    redirect(urlOrStatus: string | number, url?: string) {
      if (resolved) return fakeRes;
      resolved = true;
      const status = typeof urlOrStatus === "number" ? urlOrStatus : 302;
      const location = typeof urlOrStatus === "string" ? urlOrStatus : url || "/";
      resolve(
        new Response(null, {
          status,
          headers: { ...responseHeaders, location },
        }),
      );
      return fakeRes;
    },
  } as unknown as VercelResponse;

  // Call the handler
  try {
    await handler(fakeReq, fakeRes);
  } catch (err) {
    if (!resolved) {
      resolved = true;
      resolve(
        new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );
    }
  }

  // If handler didn't send a response (shouldn't happen but safety net)
  if (!resolved) {
    resolved = true;
    resolve(
      new Response(null, { status: 204, headers: responseHeaders }),
    );
  }

  return promise;
}

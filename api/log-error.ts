/* Vercel Edge Function — Client Error Logger */
/* Receives error reports from the browser and logs them to Vercel's function logs */
/* These are visible in Vercel Dashboard → Logs, searchable and filterable */

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();

    // Validate basic shape
    if (!body.message || typeof body.message !== "string") {
      return new Response("Bad request", { status: 400 });
    }

    // Log to Vercel function logs (visible in dashboard)
    console.error(JSON.stringify({
      level: "error",
      source: "client",
      message: body.message?.slice(0, 500),
      stack: body.stack?.slice(0, 2000),
      url: body.url?.slice(0, 500),
      timestamp: body.timestamp,
      userAgent: body.userAgent?.slice(0, 300),
    }));

    return new Response("ok", { status: 200 });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}

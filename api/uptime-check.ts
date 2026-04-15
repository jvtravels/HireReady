/* Vercel Cron — Uptime Monitor */
/* Runs every 15 minutes, hits /api/health, logs degraded status */
/* Visible in Vercel Dashboard → Logs for alerting */

export const config = { runtime: "edge" };

declare const process: { env: Record<string, string | undefined> };

export default async function handler(req: Request): Promise<Response> {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://hirestepx.vercel.app";

  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    if (data.status !== "healthy") {
      // Log as error so it's easy to filter in Vercel logs
      console.error(JSON.stringify({
        level: "alert",
        source: "uptime-check",
        status: data.status,
        services: data.services,
        timestamp: new Date().toISOString(),
      }));

      // If Resend is configured, send alert email
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const degradedServices = Object.entries(data.services as Record<string, string>)
          .filter(([, v]) => v !== "ok")
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HireStepX Alerts <alerts@hirestepx.com>",
            to: ["support@hirestepx.com"],
            subject: `[ALERT] HireStepX services degraded: ${degradedServices}`,
            text: `Health check at ${data.timestamp} returned status: ${data.status}\n\nServices:\n${JSON.stringify(data.services, null, 2)}\n\nCheck: ${baseUrl}/api/health`,
          }),
        }).catch((err) => {
          console.error("Failed to send alert email:", err);
        });
      }

      return new Response(JSON.stringify({ alert: true, ...data }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.warn(JSON.stringify({
      level: "info",
      source: "uptime-check",
      status: "healthy",
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify({ alert: false, ...data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "alert",
      source: "uptime-check",
      error: "Health check request failed",
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify({ alert: true, error: "Health check unreachable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

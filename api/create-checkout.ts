/* Vercel Edge Function — Stripe Checkout Session */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

const PRICE_MAP: Record<string, { amount: number; name: string; interval: string }> = {
  weekly: { amount: 2900, name: "Level Up Pro \u2014 Weekly", interval: "week" },
  quarterly: { amount: 19900, name: "Level Up Pro \u2014 Quarterly", interval: "quarter" },
};

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = corsHeaders(req);

  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Payments not configured" }), { status: 503, headers });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip, "checkout", 5, 60_000)) {
    return rateLimitResponse(headers);
  }

  try {
    const { plan, userId, email } = await req.json();
    const price = PRICE_MAP[plan];

    if (!price) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), { status: 400, headers });
    }

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("success_url", `${new URL(req.url).origin}/dashboard?payment=success`);
    params.append("cancel_url", `${new URL(req.url).origin}/dashboard?payment=cancelled`);
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", price.name);
    params.append("line_items[0][price_data][unit_amount]", price.amount.toString());
    params.append("line_items[0][price_data][recurring][interval]", price.interval === "quarter" ? "month" : price.interval);
    if (price.interval === "quarter") {
      params.append("line_items[0][price_data][recurring][interval_count]", "3");
    }
    params.append("line_items[0][quantity]", "1");
    if (email) params.append("customer_email", email);
    if (userId) params.append("client_reference_id", userId);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Stripe error:", res.status, errText);
      return new Response(JSON.stringify({ error: "Payment session creation failed" }), { status: 502, headers });
    }

    const session = await res.json();
    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers });
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
}

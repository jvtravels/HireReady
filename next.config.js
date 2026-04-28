/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      canvas: "./lib/empty-canvas.js",
    },
  },

  // Ignore the canvas module that pdfjs-dist tries to require in Node.js
  serverExternalPackages: ["canvas"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    return config;
  },

  images: {
    remotePatterns: [
      { hostname: "images.unsplash.com" },
      { hostname: "*.supabase.co" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://checkout.razorpay.com https://*.razorpay.com https://va.vercel-scripts.com https://*.vercel-scripts.com; script-src-elem 'self' 'unsafe-inline' blob: https://checkout.razorpay.com https://*.razorpay.com https://va.vercel-scripts.com https://*.vercel-scripts.com https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.razorpay.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co https://*.razorpay.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://generativelanguage.googleapis.com https://www.googleapis.com https://*.razorpay.com https://lumberjack.razorpay.com https://*.upstash.io https://vitals.vercel-insights.com https://va.vercel-scripts.com wss://api.cartesia.ai https://api.cartesia.ai wss://api.deepgram.com https://api.deepgram.com wss://api.sarvam.ai https://api.sarvam.ai https://*.tts.speech.microsoft.com https://api.resend.com https://*.sentry.io https://us.i.posthog.com https://us-assets.i.posthog.com https://*.i.posthog.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; media-src 'self' blob: data:; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

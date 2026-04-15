/**
 * Post-build prerender script.
 * Serves the built dist/, visits each route with Playwright,
 * and saves the fully-rendered HTML so crawlers get static content.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = 4173;

const ROUTES = [
  "/",
  "/blog",
  "/signup",
  "/login",
  "/terms",
  "/privacy",
  "/blog/top-10-google-interview-questions",
  "/blog/flipkart-interview-prep-guide",
  "/blog/behavioral-interview-questions-freshers",
  "/blog/razorpay-interview-experience",
  "/blog/ace-case-study-interviews",
  "/blog/tcs-interview-questions-freshers-2025",
  "/blog/infosys-interview-questions-2025",
  "/blog/how-to-introduce-yourself-in-interview",
  "/blog/tell-me-about-yourself-best-answer",
  "/blog/wipro-interview-questions-answers",
  "/blog/hr-interview-questions-answers-india",
  "/blog/amazon-leadership-principles-interview",
  "/blog/system-design-interview-preparation",
  "/blog/salary-negotiation-tips-india",
  "/blog/campus-placement-interview-tips",
  "/blog/mock-interview-practice-guide",
  "/blog/star-method-interview-answers",
  "/page/about",
  "/page/contact",
  "/page/careers",
  "/page/help",
];

// Simple static file server for the dist directory
function createStaticServer() {
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  return createServer((req, res) => {
    let filePath = join(DIST, req.url === "/" ? "index.html" : req.url);
    try {
      const data = readFileSync(filePath);
      const ext = filePath.substring(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
      res.end(data);
    } catch {
      // SPA fallback — serve index.html for all routes
      const html = readFileSync(join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  });
}

async function prerender() {
  // Dynamic import — Playwright is a dev dependency
  const { chromium } = await import("playwright");

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`[prerender] Static server on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: true });

  let rendered = 0;
  for (const route of ROUTES) {
    const page = await context.newPage();
    const url = `http://localhost:${PORT}${route}`;

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      // Wait for React to render content
      await page.waitForSelector("h1, h2, article, main", { timeout: 5000 }).catch(() => {});

      let html = await page.content();

      // Remove scripts that will re-hydrate (keep the app functional for JS users)
      // but add a noscript fallback message
      // Actually, keep scripts so the page becomes interactive after load.
      // Just save the full rendered HTML.

      const outPath = route === "/"
        ? join(DIST, "index.html")
        : join(DIST, route, "index.html");

      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html, "utf-8");
      rendered++;
      console.log(`[prerender] ✓ ${route}`);
    } catch (err) {
      console.error(`[prerender] ✗ ${route}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log(`[prerender] Done — ${rendered}/${ROUTES.length} routes rendered`);
}

prerender().catch((err) => {
  console.error("[prerender] Fatal:", err);
  process.exit(1);
});

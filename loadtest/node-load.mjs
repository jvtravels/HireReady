#!/usr/bin/env node
/* HireStepX Node load test — no dependencies beyond built-in fetch.
 *
 * Usage:
 *   node loadtest/node-load.mjs --url https://hirestepx.com --vus 20 --duration 30
 *   node loadtest/node-load.mjs --url http://localhost:3000 --vus 5 --duration 10
 *
 * Scenarios are chosen based on what's publicly reachable without auth:
 *   - GET /                       (landing page)
 *   - GET /api/health             (health check)
 *   - GET /privacy, /terms        (legal pages)
 *   - POST /api/stt-token         (rate-limited, returns 401/429 without auth — valid signal)
 *   - POST /api/tts-token         (same)
 *   - POST /api/send-welcome      (rate-limit probe, action=check)
 *
 * Output: percentile latency, error rate, throughput, per-endpoint breakdown.
 */

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith("--")) acc.push([v.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const BASE_URL = (args.url || "https://hirestepx.com").replace(/\/$/, "");
const VUS = parseInt(args.vus || "10", 10);
const DURATION_S = parseInt(args.duration || "30", 10);
const QUIET = !!args.quiet;

const SCENARIOS = [
  { name: "landing",       method: "GET",  path: "/",                       weight: 4 },
  { name: "health",        method: "GET",  path: "/api/health",             weight: 2 },
  { name: "privacy",       method: "GET",  path: "/privacy",                weight: 1 },
  { name: "terms",         method: "GET",  path: "/terms",                  weight: 1 },
  { name: "stt-token",     method: "POST", path: "/api/stt-token",          body: "{}", weight: 2 },
  { name: "tts-token",     method: "POST", path: "/api/tts-token",          body: "{}", weight: 2 },
  {
    name: "rate-limit-probe",
    method: "POST",
    path: "/api/send-welcome",
    body: JSON.stringify({ action: "check", email: `loadtest+${Date.now()}@example.invalid` }),
    weight: 1,
  },
];

// Pick scenario weighted-randomly
function pickScenario() {
  const total = SCENARIOS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of SCENARIOS) { r -= s.weight; if (r <= 0) return s; }
  return SCENARIOS[0];
}

// Store samples per endpoint
const samples = new Map();
function record(endpoint, duration, status) {
  if (!samples.has(endpoint)) samples.set(endpoint, { durations: [], statusCounts: new Map(), errors: 0 });
  const bucket = samples.get(endpoint);
  bucket.durations.push(duration);
  bucket.statusCounts.set(status, (bucket.statusCounts.get(status) || 0) + 1);
  if (status >= 500 || status === 0) bucket.errors++;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function runRequest() {
  const s = pickScenario();
  const url = `${BASE_URL}${s.path}`;
  const baseHeaders = {
    "User-Agent": BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };
  const init = {
    method: s.method,
    headers: s.body
      ? { ...baseHeaders, "Content-Type": "application/json", "Origin": BASE_URL, "Referer": BASE_URL + "/" }
      : baseHeaders,
    body: s.body,
  };
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(url, init);
    status = res.status;
    // Consume body so connection is freed
    await res.arrayBuffer().catch(() => {});
  } catch {
    status = 0; // network error
  }
  const dt = performance.now() - t0;
  record(s.name, dt, status);
}

async function worker(endTs) {
  while (performance.now() < endTs) {
    await runRequest();
    // Tiny jitter to avoid lock-step
    await new Promise(r => setTimeout(r, Math.random() * 50));
  }
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

function fmt(n) { return n.toFixed(1).padStart(8); }

async function main() {
  if (!QUIET) {
    console.log(`── HireStepX load test ──`);
    console.log(`  target:   ${BASE_URL}`);
    console.log(`  VUs:      ${VUS}`);
    console.log(`  duration: ${DURATION_S}s`);
    console.log(`  scenarios: ${SCENARIOS.map(s => s.name).join(", ")}`);
    console.log(``);
  }
  const start = performance.now();
  const endTs = start + DURATION_S * 1000;
  const workers = Array.from({ length: VUS }, () => worker(endTs));
  await Promise.all(workers);
  const elapsed = (performance.now() - start) / 1000;

  // Aggregate
  let totalRequests = 0, totalErrors = 0;
  const rows = [];
  for (const [name, b] of samples.entries()) {
    const sorted = [...b.durations].sort((a, z) => a - z);
    const total = sorted.length;
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const p99 = percentile(sorted, 0.99);
    const max = sorted[sorted.length - 1] || 0;
    const mean = sorted.reduce((s, x) => s + x, 0) / (sorted.length || 1);
    const counts = [...b.statusCounts.entries()].sort((a, z) => a[0] - z[0])
      .map(([s, c]) => `${s}:${c}`).join(" ");
    totalRequests += total;
    totalErrors += b.errors;
    rows.push({ name, total, errors: b.errors, mean, p50, p95, p99, max, counts });
  }

  console.log("─".repeat(110));
  console.log("endpoint           n      err   mean(ms)  p50(ms)  p95(ms)  p99(ms)  max(ms)   status codes");
  console.log("─".repeat(110));
  for (const r of rows.sort((a, z) => z.total - a.total)) {
    console.log(
      `${r.name.padEnd(18)} ${String(r.total).padStart(5)} ${String(r.errors).padStart(4)}   ${fmt(r.mean)}  ${fmt(r.p50)}  ${fmt(r.p95)}  ${fmt(r.p99)}  ${fmt(r.max)}   ${r.counts}`
    );
  }
  console.log("─".repeat(110));
  const rps = totalRequests / elapsed;
  const errPct = totalErrors / (totalRequests || 1) * 100;
  console.log(`\nTOTAL  ${totalRequests} requests  ·  ${totalErrors} 5xx/network errors (${errPct.toFixed(2)}%)  ·  ${rps.toFixed(1)} req/s  ·  elapsed ${elapsed.toFixed(1)}s`);
  console.log(``);

  // Verdict
  const anyP95Over5s = rows.some(r => r.p95 > 5000);
  const tooManyErrors = errPct > 2;
  const landingSlow = rows.find(r => r.name === "landing")?.p95 > 3000;

  const verdicts = [];
  if (!anyP95Over5s && !tooManyErrors && !landingSlow) verdicts.push("✓ all thresholds met");
  if (anyP95Over5s) verdicts.push("✗ some endpoints have p95 > 5000ms");
  if (tooManyErrors) verdicts.push(`✗ error rate ${errPct.toFixed(2)}% exceeds 2%`);
  if (landingSlow) verdicts.push("✗ landing p95 > 3000ms (poor LCP under load)");
  console.log(verdicts.join("\n"));

  // Persist JSON report
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const today = new Date().toISOString().slice(0, 10);
    const path = join(dir, "results", `node-report-${today}.json`);
    writeFileSync(path, JSON.stringify({
      target: BASE_URL, vus: VUS, durationSec: DURATION_S,
      elapsedSec: elapsed, totalRequests, totalErrors, rps, errPct,
      rows,
    }, null, 2));
    console.log(`\nreport saved: ${path}`);
  } catch (err) {
    console.warn("\nreport save failed:", err instanceof Error ? err.message : err);
  }

  process.exit(anyP95Over5s || tooManyErrors ? 1 : 0);
}

main().catch(err => { console.error("Load test failed:", err); process.exit(2); });

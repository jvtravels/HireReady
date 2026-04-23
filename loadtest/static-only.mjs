#!/usr/bin/env node
/* Focused static-content load test — hits only public pages. */
import { performance } from "node:perf_hooks";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a; }, []));
const BASE = (args.url || "http://localhost:3030").replace(/\/$/, "");
const VUS = parseInt(args.vus || "50", 10);
const DURATION = parseInt(args.duration || "20", 10);

const PATHS = ["/", "/privacy", "/terms"];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

const durations = { "/": [], "/privacy": [], "/terms": [] };
const statusCounts = new Map();
let totalBytes = 0;

async function work(endTs) {
  while (performance.now() < endTs) {
    const path = PATHS[Math.floor(Math.random() * PATHS.length)];
    const t0 = performance.now();
    let status = 0, bytes = 0;
    try {
      const r = await fetch(BASE + path, { headers: { "User-Agent": UA } });
      status = r.status;
      const b = await r.arrayBuffer();
      bytes = b.byteLength;
    } catch { /* network err */ }
    const dt = performance.now() - t0;
    durations[path].push(dt);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    totalBytes += bytes;
  }
}

function p(sorted, pct) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.floor(pct * sorted.length))]; }

(async () => {
  console.log(`── static-content load ─ ${BASE} · ${VUS} VUs · ${DURATION}s\n`);
  const start = performance.now();
  const endTs = start + DURATION * 1000;
  await Promise.all(Array.from({ length: VUS }, () => work(endTs)));
  const elapsed = (performance.now() - start) / 1000;

  let total = 0;
  console.log("path        n      mean   p50    p95    p99    max");
  for (const path of PATHS) {
    const s = [...durations[path]].sort((a, b) => a - b);
    total += s.length;
    if (!s.length) { console.log(`${path.padEnd(12)}${"—".padStart(5)}`); continue; }
    const mean = s.reduce((x, y) => x + y, 0) / s.length;
    console.log(
      `${path.padEnd(12)}${String(s.length).padStart(5)}  ${mean.toFixed(1).padStart(5)}  ${p(s, 0.5).toFixed(1).padStart(5)}  ${p(s, 0.95).toFixed(1).padStart(5)}  ${p(s, 0.99).toFixed(1).padStart(5)}  ${s[s.length - 1].toFixed(1).padStart(5)}`
    );
  }
  console.log();
  console.log(`status codes: ${[...statusCounts.entries()].sort((a, b) => a[0] - b[0]).map(([s, c]) => `${s}:${c}`).join("  ")}`);
  console.log(`throughput:   ${(total / elapsed).toFixed(1)} req/s`);
  console.log(`bandwidth:    ${(totalBytes / elapsed / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`errors:       ${((statusCounts.get(0) || 0) + [...statusCounts.entries()].filter(([s]) => s >= 500).reduce((x, [, c]) => x + c, 0)) / total * 100 || 0}%`);
})();

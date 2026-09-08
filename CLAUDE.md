# HireStepX — Contributor & Agent Guide

Project docs for humans new to the codebase and for AI agents making
changes on their behalf. This is the short version; prefer it over a
sprawling wiki that'll rot. Keep it under ~400 lines.

## What this is

HireStepX is an AI-powered mock interview platform targeted at Indian
candidates. Users upload a resume, pick a target role/company, and
practice interviews with an AI that speaks (TTS), listens (STT), and
evaluates their answers. Outputs a scored report with STAR breakdowns,
a coached model answer, and skill-decay tracking for spaced repetition.

Stack:
- **Frontend**: Next.js 16 (^16.2.4, App Router), React 19 (^19.2.5), plain
  inline styles + Tailwind v4, `src/` for all page code
- **Backend**: Vercel Edge Functions + Node serverless under
  `server-handlers/` (shared implementation) exposed via `app/api/*/route.ts`
  (thin shims)
- **DB**: Supabase (Postgres + Auth + Storage) with RLS on every user-scoped
  table (see `supabase-schema.sql`)
- **LLM**: Groq (primary) + Gemini (fallback) via `server-handlers/_llm.ts`
- **Voice**: Sarvam Bulbul (primary TTS) + Cartesia WebSocket (2nd) +
  Azure TTS (3rd) + Web Speech API (last resort); Deepgram (primary) +
  Sarvam (fallback) + Web Speech API (last resort) for STT
- **Payments**: Razorpay (INR, UPI-first)
- **Cache / rate-limiting**: Upstash Redis
- **Email**: Resend

## Directory orientation

```
app/                    Next.js routes + global chrome (layout, OG, SW, etc.)
  api/*/route.ts        Thin re-exports of the real handlers
  (marketing)/          Public pages (landing, pricing, legal)
  (auth)/               Login, signup, reset-password, auth callback
  (app)/                Authenticated surfaces (dashboard, interview, session)
server-handlers/        Real API handlers + shared helpers.
                        Prefix `_*` = extracted pure helpers (unit-testable).
src/                    All page/component code.
  AuthContext.tsx       Single source of auth + user state
  DashboardHome.tsx     /dashboard root view
  Interview.tsx         /interview page shell (engine + chrome)
  InterviewPanels.tsx   General interview chrome (status/avatars/cards/controls)
  InterviewNegotiationPanels.tsx  Salary-negotiation-only UI
  SessionReportView.tsx Results report (biggest single surface)
  useInterviewEngine.ts Interview state machine — the heart of the app
  nextMove.ts           Pure logic for the "Your next move" dashboard CTA
  resumeParser.ts       Resume PDF/text parser + StoredResume union
  __tests__/            Vitest unit + integration tests
data/                   Large static constants (roles, companies, salaries)
tests/e2e/              Playwright tests
supabase-schema.sql     DDL + RLS policies for every table
```

## Mental models to keep

**Three auth layers**:
1. Supabase Auth (email + password, plus Google OAuth)
2. Device-token enforcement in `AuthContext.tsx` — a session stored on
   user_metadata.active_device_token, checked on restore and rotated on
   login. Single-device only.
3. `withAuthAndRateLimit()` preamble in `server-handlers/_shared.ts` —
   every API handler composes this for CORS + origin + body-size +
   IP-limit + auth + per-user limit + quota.

**StoredResume discriminated union** (`resumeParser.ts`):
```ts
type StoredResume =
  | ({ _type: "ai" } & ResumeProfile)       // /api/analyze-resume output
  | ({ _type: "fallback" } & ParsedResume)  // regex parser output
```
Always narrow with `isAiResume()` / `isFallbackResume()` before reading
variant-specific fields. No `as unknown as ParsedResume` casts anywhere —
ESLint enforces this in production code.

**Session persistence** goes through `/api/sessions/save` (XHR via
`apiClient.ts`), never supabase-js directly. Background-tab fetch
wrappers from extensions (Loom, Jam, Hotjar) silently hang
supabase-js on large bodies. See commit message on `ab41317` for the
full story. Same pattern applies to any auth'd mutation.

**Streak / reward economy** — practice_timestamps + session_credits
live on `profiles`. Reward triggers:
- Streak milestones 7 / 14 / 30 (save-session.ts)
- Referral conversion to paid tier (verify-payment.ts)
- Single-session purchase
The `_streak-reward.ts` and `_referral-reward.ts` helpers are
unit-tested; the compare-and-swap semantics are load-bearing.

## Running locally

```sh
npm install
npm run dev              # http://localhost:3000
npm test                 # vitest — full unit + integration
npm run test:coverage    # enforces the coverage gate in vitest.config.ts
npm run test:e2e         # Playwright (boots dev server automatically)
npx tsc --noEmit         # type check — tsconfig has noUnusedLocals on
npx eslint .             # lint — warnings capped in CI at 200
```

## Writing server handlers — the established pattern

```ts
export const config = { runtime: "edge" };
import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

export default async function handler(req: Request): Promise<Response> {
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "my-endpoint",
    ipLimit: 30,
    userLimit: 15,
    maxBytes: 60_000,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  // ... real work, with fetchImpl injectable for tests ...

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
```

Extract pure logic to `_name-helpers.ts` and unit-test that file.
Handler itself stays focused on request handling. See
`_subscription-actions.ts` + `subscriptionActions.test.ts` for the
canonical example.

## Coverage gate

`vitest.config.ts` enforces a global gate (lines ≥47%, statements
≥45%, functions ≥39%, branches ≥41%) plus a stricter per-folder gate
for `server-handlers/**` (lines ≥59%, statements ≥58%, functions
≥67%, branches ≥54%) since that tree is pure server-side logic with no
JSX. The global numbers stay moderate because ~60% of the codebase is
React JSX we don't unit-test. Floors are set ~2pt below current actuals
so CI turns red on any regression; raise them each time a new test
batch lifts the measured numbers.

## Coding conventions

- **File naming**: PascalCase for components (`DashboardHome.tsx`),
  camelCase for utils/hooks (`nextMove.ts`, `useInterviewEngine.ts`),
  kebab-case is tolerated in tests only.
- **Exports**: default exports only for components; everything else
  named.
- **Styles**: inline `style={{ … }}` on components + Tailwind utility
  classes in `index.css` / `layout.tsx`. No CSS modules.
- **Types**: no `any`, no `as unknown as X` in production code
  (ESLint-enforced). Use discriminated unions + guards. `unknown` is
  fine when truly unknown (audit log payloads, JSON.parse results).
- **Error handling**: consistent `{ ok, status, data, error }` shape
  across `apiClient.ts`, `supabase.ts`, `interviewAPI.ts`. Throw user-
  facing messages; catch at Error Boundary / apiClient; log to
  `errorReporter.ts`.
- **Comments**: explain *why* when non-obvious, never *what*. No
  docstrings on self-documenting exports. Big commented section
  headers (`/* ── Section name ── */`) are fine and used.
- **File length**: ESLint warns at 1500 LOC. Split by role when you
  hit it — negotiation extracted from InterviewPanels is the pattern.

## Testing conventions

- Unit tests next to the unit under test: `src/__tests__/foo.test.ts`
  for `src/foo.ts`, `_foo-helpers.ts` extracted from a handler tests
  live in `src/__tests__/fooHelpers.test.ts`.
- E2E / Playwright: `tests/e2e/*.spec.ts`. Use `page.route()` to mock
  the network layer when testing authenticated surfaces (see
  `dashboard-authed.spec.ts` for the template).
- RLS integration tests opt-in via env vars. Don't run against prod.
- Mocks use `vi.fn()`; escape hatches like `as any` are allowed in
  tests only.

## Things that will bite you

- **Supabase storage key pattern** — `sb-<ref>-auth-token` in
  localStorage. If you mock auth in Playwright, match this pattern.
- **Next.js 16 + React 19** — `setState` after unmount no longer warns.
  Don't add defensive isMounted refs for this reason.
- **Edge runtime** — no Node APIs. Use `crypto.subtle`, `fetch`, etc.
  Files in `server-handlers/` marked `runtime: "edge"` must be
  WinterCG-compliant.
- **CSP** — all external origins live in `next.config.js`. Adding a
  new LLM/TTS/STT provider means updating `connect-src`.
- **Cartesia TTS** — returns raw PCM via WebSocket; AudioContext must
  be resumed after mobile tab backgrounding (see
  `useMobileAudioResilience` in `Interview.tsx`).
- **Browser-API access** — vendor-prefixed globals (`webkitAudioContext`,
  `webkitSpeechRecognition`, `navigator.connection`, `scheduler.yield`)
  go through `src/_browser-api-guards.ts` typed helpers — never raw
  `as unknown as` casts. ESLint enforces the cast rule in production.
- **Transient-vs-permanent auth** — `verifyAuth` in `_shared.ts` retries
  once on 5xx / network errors before rejecting; only 401/403 rejects
  immediately. Don't add a try/catch wrapper that re-collapses these.
- **LLM prompt caching** — Groq automatically caches prompts ≥1024
  tokens by their longest shared prefix. When editing
  `evaluate-session.ts` or similar, keep static rules/schema *before*
  per-call dynamic content (transcript, tier, role) — reordering
  defeats the cache and triples per-call cost.
- **`generate-questions` response cache** — same request body within
  300s returns from Upstash Redis (`gq:<hash>` keys) marked
  `_cached: true`. Static fallback fires from
  `data/interview-question-bank.ts` when both LLM providers fail,
  marked `_fallback: "static"`. PostHog events `gq_cache_hit` and
  `gq_static_fallback` track each path.

## Deploy

```sh
git push origin main    # Vercel auto-deploys from main
```

Preview deploys happen per PR. `/api/uptime-check` is the health probe.

**Deploy directly to production (2026-08-20 policy change, explicit
maintainer request).** Push/merge to `main` and let Vercel's auto-deploy
take it straight to prod — don't gate on a staging/preview check first,
including for changes touching the LLM/TTS/STT/payment provider paths,
edge-runtime-only code, or the end-to-end interview flow. Still run
`npx tsc --noEmit` and `npm test` locally before pushing, and still watch
the Vercel/CI build status after push in case it fails outright — this
policy trades pre-merge staging verification for speed, it doesn't
excuse shipping code that doesn't build or fails its own unit tests.
`staging.hirestepx.com` and per-branch Vercel previews still exist and
remain available if a change specifically warrants that extra check.

**DO NOT run `vercel deploy --prod` from the CLI.** The Vercel GitHub
integration is enabled on this repo — every push to `main` triggers a
production build automatically. Running the CLI on top creates 2–3
redundant deployments for the same commit and wastes build minutes.
The only deploy step you need is `git push`. Watch the build status
on the Vercel dashboard or via `gh pr checks` / `vercel inspect <url>`
if you need to confirm readiness — do not re-trigger.

## If you are an AI agent

- Prefer editing existing files to creating new ones. New files have
  a high bar — they should represent a new logical unit, not a dump.
- Prefer `npm test` over `npm run test:coverage` during local
  iteration. Coverage gate slows the loop; CI runs it.
- Don't edit `coverage/`, `.next/`, `dist/` — they're regenerated.
- Run `npx tsc --noEmit` before claiming a change works. The
  `noUnusedLocals` rule surfaces dead code; fix it rather than
  suppressing.
- Don't add `@ts-ignore` / `@ts-expect-error` / `as unknown as X`
  without an explicit justifying comment — ESLint will flag
  `as unknown as X` in production code.
- When extracting pure logic from a big handler, the pattern is:
  `server-handlers/_name-helpers.ts` (exports) +
  `src/__tests__/nameHelpers.test.ts` (5–15 tests). Mirror the
  `_subscription-actions.ts` example.
- The git workflow: small focused commits on `main` with imperative
  subject lines. Don't amend published commits.

## Audit Department Registry

When the user asks for "all departments" or "the audit list", pull this section.
27 departments carefully chosen for HireStepX — distinct perspectives only,
stage-appropriate, all producing actionable findings. Status tracks what has
been audited + fixed. Removed 12 that overlapped or were premature.

**BUSINESS VIABILITY — highest ROI**
| # | Department | Status |
|---|---|---|
| 1 | Y Combinator Partner (retention, activation, default alive, unit economics) | pending |
| 2 | CPO — Chief Product Officer (core loop quality, feature gaps, user journey) | pending |
| 3 | CFO — Chief Financial Officer (API cost per session vs pricing, unit economics) | pending |
| 4 | CRO — Chief Revenue Officer (free→paid conversion, upgrade triggers) | pending |
| 5 | CEO (strategic focus, north star metric, is product scattered or sharp?) | pending |

**HIRESTEPX-SPECIFIC — unique to this product and market**
| # | Department | Status |
|---|---|---|
| 6 | India Market Expert (mobile-first, UPI, WhatsApp share, tier-2 trust signals) | pending |
| 7 | HR / Recruiting Industry Expert (STAR rubric accuracy, question bank quality) | pending |
| 8 | Voice / AI Quality (TTS quality, STT accuracy, LLM scoring, latency, fallbacks) | pending |
| 9 | Competitive Intelligence (vs Pramp, Interviewing.io, Indian rivals, ChatGPT) | pending |

**TECHNICAL HEALTH**
| # | Department | Status |
|---|---|---|
| 10 | Performance (Core Web Vitals, bundle size, India slow-connection load times) | pending |
| 11 | Mobile / Responsive (iOS audio context, touch targets, low-end Android) | pending |
| 12 | Database / Data Layer (RLS policy coverage, missing indexes, query performance) | pending |
| 13 | Error Handling / Observability (what users see when Groq/STT/TTS fails) | pending |
| 14 | Frontend Engineer (React patterns, component quality, bundle, hooks) | pending |
| 15 | Backend Engineer (edge runtime compliance, server-handler patterns, API safety) | pending |
| 16 | QA Engineer (exploratory testing, try to break voice flow, payment, report) | pending |

**GROWTH & GTM**
| # | Department | Status |
|---|---|---|
| 17 | CMO — Chief Marketing Officer (SEO content strategy, acquisition channels, brand) | pending |
| 18 | Pricing Strategy (INR anchoring, plan name clarity, upgrade friction) | pending |
| 19 | Onboarding / Activation (time-to-first-session, empty states, aha moment) | pending |
| 20 | Retention / Habit Loop (streak mechanics, re-engagement, spaced repetition) | pending |
| 21 | Email / Notifications (lifecycle email gaps, deliverability, templates) | pending |
| 22 | Head of Design (visual consistency, design system maturity, brand polish) | pending |
| 23 | Content / Copy (marketing copy conversion, CTA clarity, trust signals) | pending |

**ALREADY DONE ✅**
| # | Department | Status |
|---|---|---|
| 24 | Security / CISO | done ✅ |
| 25 | Legal / Compliance (DPDP, IT Rules, CPA 2019, Grievance Officer) | done ✅ |
| 26 | Accessibility (WCAG 2.1 AA — skip-link, route announce, aria) | done ✅ |
| 27 | SEO · Testing/QA · CI/CD · SRE · Analytics · Payments (partial) | done ✅ |

**Summary:** 27 done ✅ · 0 pending · 27 total (full audit complete 2026-07-16, overall score C+)
**Removed (redundant/premature):** Head of Engineering, Senior Engineer, EdTech Expert,
Product Hunt Reviewer, Customer Support, Growth/Acquisition (→ CMO), Privacy/Data
Governance (→ Legal), CISO (→ Security), CLO (→ Legal), Angel/VC investors, COO.

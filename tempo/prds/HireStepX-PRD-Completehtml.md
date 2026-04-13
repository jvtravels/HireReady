# HireStepX — Product Requirements Document

**Product:** HireStepX (formerly Level Up Interviews / HireReady) | **Date:** April 2026 | **Status:** Live (Production) | **Version:** 2.1

---

## TL;DR

HireStepX is a premium-positioned web platform that lets experienced professionals practice realistic, AI-driven mock interviews with instant scored feedback. It targets **B2C individual professionals** preparing for senior-level interviews. Users configure their interview type, difficulty, and target role, then engage in a real-time conversational mock interview with an AI interviewer that speaks questions aloud. After completion, they receive detailed scoring, skill breakdowns, ideal answer comparisons, and actionable coaching feedback — personalized against their uploaded resume. Monetized via Razorpay subscriptions with weekly (₹49) and monthly (₹149) auto-renewing plans.

---

## Background

Job interview preparation for senior professionals is underserved. Existing tools are either too generic (question banks), too informal (peer practice), or too expensive (1:1 human coaching at $200+/session). HireStepX combines AI-driven question generation, real-time conversational simulation with text-to-speech, speech recognition for candidate responses, resume-aware personalization, and role-specific scoring into a single platform.

### Market Context

- **Human coaching:** $200–400/session, requires scheduling, not on-demand
- **Generic prep tools:** Question banks (Glassdoor, LeetCode) — no personalization, no simulation
- **AI competitors:** Emerging but lack luxury positioning and role-specific depth for senior professionals

**Differentiation:** Luxury-grade dark-theme design (Instrument Serif headings, gilt accents), adaptive AI that tailors questions to resume and role, Google Cloud Neural2 TTS voices, resume-integrated evaluation, Google Calendar sync, and Indian market pricing via Razorpay subscriptions.

---

## Target Users

### Individual Professionals (B2C)

- **Who:** Senior professionals preparing for leadership, PM, engineering, or strategic roles. Recently laid off, transitioning, or upskilling.
- **Pain point:** No way to practice realistic, personalized interviews on-demand without scheduling a human coach.
- **Impact:** Users gain confidence, receive structured feedback on communication, structure, leadership, and problem-solving skills — calibrated against their actual resume and career trajectory.

---

## Product Overview (As Built)

### Live Features

#### Landing Page (`/`)

- Cinematic dark-theme landing with particle canvas hero animation
- Parallax scroll effects, animated typography, mouse-tracking gradient
- Value proposition sections with feature grid and "How It Works" flow
- Pricing cards with inline Razorpay subscription checkout
- FAQ accordion, social proof section, Unsplash background imagery
- "Start Free" CTA — no credit card required
- Blog section with interview preparation content
- SEO-optimized meta tags via `useSEO` hook

#### Authentication (`/login`, `/signup`)

- Email/password signup and login via Supabase Auth
- Google OAuth (Sign in with Google)
- Password reset flow (`/reset-password`)
- Email confirmation with spam folder guidance
- Session persistence via Supabase localStorage tokens
- Auto-redirect to onboarding for new users

#### Onboarding (`/onboarding`)

- Multi-step flow: name → target role → interview types → resume upload (optional)
- Resume parsing via PDF.js (client-side text extraction)
- AI resume analysis via Groq LLM (skills, achievements, career trajectory, interview strengths/gaps)
- `.doc` format blocked with clear error messaging (PDF/DOCX only)
- Interview date and target company fields
- Learning style preference (direct / encouraging)
- Preferred session length (10 / 15 / 25 minutes)
- Completion celebration screen (`/onboarding/complete`)

#### Dashboard (`/dashboard`)

- **Home** — Session history with score trends, readiness score, streak tracking, AI insights, smart scheduling suggestions, upcoming goals, prep plan, week activity heatmap, notifications, resume insights widget (circular arc score, top skills, focus areas)
- **Sessions** (`/dashboard/sessions`) — Filterable/searchable session list with type, score, date, duration. Links to session detail pages
- **Calendar** (`/dashboard/calendar`) — Interview scheduling with event CRUD, one-way Google Calendar sync (keyword-filtered import: interview, round, screen, onsite, recruiter, hiring, placement, assessment, walkthrough), ICS export
- **Analytics** (`/dashboard/analytics`) — Score trend chart with hover tooltips, skill radar with side-by-side legend (55/45 layout), KPI tiles, session type breakdown, resume skills vs interview performance bridge (green=strength, red=gap pills)
- **Resume** (`/dashboard/resume`) — Resume intelligence: AI-analyzed profile with headline, skills, achievements, career trajectory, interview strengths/gaps. Resume Quality score bar with numbered improvement tips. Version history tracking (last 10 uploads with scores). Re-analysis and delete with confirmation. AI vs fallback profile discrimination (`_type: "ai"` | `_type: "fallback"`)
- **Settings** (`/dashboard/settings`) — Profile editing (name, role, interview date), interview preferences (default difficulty), subscription management (upgrade, pause, resume, cancel, reactivate with confirmation flows), "Paused" and "Cancelling" status badges, progress bar with days remaining, AI voice selection (8 Neural2 voices), notification toggles, billing history table, payment method management link, data export (CSV), account deletion
- **Command Palette** — Keyboard shortcut (Cmd+K) for quick navigation across dashboard sections

#### Session Setup (`/session/new`)

- Interview type selection: Behavioral, Strategic, Technical Leadership, Case Study
- Adaptive difficulty: Warm-up, Standard, Intense (auto-suggested based on past scores)
- Focus area customization
- Resume toggle — opt in/out of resume-personalized questions
- Session preview with estimated duration and question count

#### Live Interview (`/interview`)

- Real-time conversational AI interview with 7-step structure (intro → questions → follow-ups → closing)
- LLM-generated questions personalized to role, company, industry, and resume
- Dynamic follow-up questions based on candidate answers (4s timeout, non-blocking)
- Google Cloud Neural2 TTS — AI speaks questions aloud (8 selectable voices)
- Browser Speech Recognition API for candidate responses
- Manual text input fallback when mic unavailable
- Real-time waveform visualization during AI speech
- Live recording indicator badge during speech recognition
- Transcript displayed in real-time chat bubbles with dynamic interviewer name
- Per-question 2-minute countdown timer across all phases
- Session progress indicator in header
- Network connectivity indicator
- Exit guard (unsaved changes warning on navigation)
- Skip question button
- Draft auto-save to localStorage + IndexedDB backup
- Microphone error handling with user-visible feedback
- Next-question debounce (500ms) to prevent double-advance
- Offline evaluation queuing with automatic retry on reconnection

#### Evaluation & Results

- AI evaluation via Groq LLM (llama-3.3-70b-versatile model)
- Resume-aware evaluation — feedback personalized against candidate's resume when available
- 35-second timeout with AbortController
- Progress bar during evaluation
- Overall score (0–100) with qualitative label (Developing / Good / Strong)
- Skill breakdown scores: Communication, Structure, Technical Depth, Leadership, Problem Solving
- Strengths and improvement areas (3 each)
- Ideal answer comparisons (per-question ideal vs candidate summary)
- Detailed AI coaching feedback with specific transcript references
- Results saved to Supabase + localStorage
- Offline fallback: estimated scoring with IndexedDB queued retry

#### Session Detail (`/session/:id`)

- Full transcript with chat-bubble UI (interviewer vs candidate)
- Score circle with skill breakdown bars
- AI Coach Summary section
- Ideal answers section (collapsible per-question comparison)
- Copy report to clipboard (with toast feedback)
- Download as .txt file
- Score tooltips explaining what each level means

#### Subscription & Payments

- **Free tier:** 3 total sessions, behavioral questions only, basic feedback
- **Starter (₹49/week):** 10 sessions/week, all question types, detailed feedback, resume analysis, PDF export. Auto-renewing weekly via Razorpay subscription.
- **Pro (₹149/month):** Unlimited sessions, full AI coaching, performance analytics, interview calendar, export (PDF, CSV, JSON). Auto-renewing monthly via Razorpay subscription.
- Razorpay subscription checkout integration (UPI, Cards, Netbanking)
- Fallback to one-time order when subscription plans not configured
- Server-side HMAC-SHA256 signature verification (dual-mode: order-based and subscription-based)
- Subscription ID stored in profile for lifecycle management
- Mid-cycle upgrade proration (remaining Starter days credited proportionally to Pro)
- Subscription pause / resume via Razorpay API
- Cancel at period end (keeps benefits until expiry) with reactivate option
- Razorpay webhook handler for server-side activation, renewal, halt, cancel, pause, resume
- Payment confirmation emails via Resend (with retry + failure logging)
- Cancellation confirmation emails with reactivate link
- Pause/resume confirmation emails
- Renewal confirmation emails via webhook
- Invoice/receipt URL retrieval (customer-facing `short_url`)
- Subscription auto-downgrade on expiry (60-second client polling + server-side check)
- Billing history table in settings with plan, amount, period, status

#### Blog (`/blog`)

- Interview preparation content and tips
- SEO-optimized blog pages

#### Legal

- Privacy Policy and Terms of Service pages (`/privacy`, `/terms`)

#### 404 Page

- Custom not-found page with navigation back to home

#### PWA Support

- Service worker for offline caching
- Web app manifest for installability
- Stale chunk error prevention via HTML cache disabling

### Security (As Implemented)

- **Authentication:** Supabase JWT-based auth on all API endpoints. Auth bypass only in local dev when Supabase unconfigured.
- **CORS:** Strict origin allowlist via `ALLOWED_ORIGINS` env var. No wildcard fallbacks. Localhost allowed for development.
- **CSRF:** Origin header validation on all state-changing POST endpoints.
- **Rate Limiting:** Per-IP rate limiting via Upstash Redis. Separate buckets per endpoint. Warning logged when Redis not configured (no unsafe in-memory fallback).
- **IP Security:** Uses Vercel's `x-real-ip` header (not spoofable) with `x-forwarded-for` fallback.
- **Payment Security:** Dual-mode HMAC-SHA256 signature verification (order + subscription), server-side amount validation against Razorpay API, subscription status verification, duplicate payment protection (payments table + profile checks), specific error codes (`SIGNATURE_MISMATCH`, `AMOUNT_MISMATCH`, `INVALID_PLAN`, etc.), Razorpay ID format validation (regex).
- **Webhook Security:** HMAC-SHA256 webhook signature verification, 8-second global processing timeout, idempotency checks on all payment events.
- **Prompt Injection:** Multi-layer sanitization — strips role markers, LLM tokens (`<|im_start|>`), code blocks, JSON role injection, "ignore previous instructions" patterns, control characters. Input length caps per field.
- **Session Limits:** Server-side enforcement — checks subscription tier from DB on each API call (not trusting client state).
- **Headers:** CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS, Referrer-Policy, Permissions-Policy.
- **Cron Protection:** `CRON_SECRET` required (fails closed when not set).
- **Error Logging:** Sensitive data (userId, amounts) truncated in server logs. Client-side error reporter for uncaught exceptions.
- **Body Size Limits:** 1MB max on payment endpoints.

---

## Tech Stack (As Built)

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | React 18 + Vite 7 + TypeScript | SPA with client-side routing |
| Routing | react-router-dom v7 | Route-based code splitting with lazy imports |
| Database | Supabase Postgres | Profiles, sessions, calendar events, payments, feedback tables |
| Authentication | Supabase Auth | Email/password, Google OAuth, JWT tokens |
| Payments | Razorpay | INR pricing, UPI/Cards/Netbanking, subscriptions + one-time orders |
| AI / LLM | Groq API (llama-3.3-70b-versatile) | Question generation, evaluation, follow-ups, resume analysis, insights |
| TTS | Google Cloud Text-to-Speech API | Neural2 voices (8 options), Edge Function proxy |
| Speech Input | Browser Speech Recognition API | With manual text input fallback |
| Hosting | Vercel | Edge Functions (LLM endpoints) + Serverless Functions (payment, cron) |
| Rate Limiting | Upstash Redis | Per-endpoint buckets, no in-memory fallback |
| Emails | Resend API | Payment, cancellation, pause, renewal, reminder emails |
| Styling | Inline styles + design tokens | Dark luxury theme, custom `tokens.ts` color/font/shadow/gradient system |
| Analytics | Vercel Analytics + Speed Insights | Bundled with deployment |
| Testing | Vitest + Testing Library | 24 test files, 319 tests |
| Offline Storage | IndexedDB | Draft auto-save, evaluation retry queue |

### Application Architecture

```
src/
  main.tsx                  — App entry, router setup, lazy imports
  App.tsx                   — Landing page (particle canvas, parallax, pricing)
  AuthContext.tsx            — Auth state, login/signup/logout, subscription management
  DashboardContext.tsx       — Dashboard data provider (sessions, analytics, events)
  Interview.tsx             — Live interview player (TTS, speech recognition, transcript)
  InterviewComponents.tsx   — Extracted interview UI components
  SessionSetup.tsx          — Interview configuration (type, difficulty, focus, resume toggle)
  SessionDetail.tsx         — Post-session review (transcript, scores, ideal answers, export)
  SignUp.tsx                — Login/signup/password reset forms
  Onboarding.tsx            — Multi-step new user setup
  OnboardingComplete.tsx    — Onboarding celebration screen
  ResetPassword.tsx         — Password reset flow
  BlogPage.tsx              — Blog content pages
  CommandPalette.tsx        — Cmd+K quick navigation
  DashboardHome.tsx         — Dashboard overview (stats, insights, resume widget, sessions)
  DashboardSessions.tsx     — Session history list
  DashboardCalendar.tsx     — Interview calendar with Google Calendar sync
  DashboardAnalytics.tsx    — Performance analytics (charts, radar, resume bridge)
  DashboardCharts.tsx       — SVG chart components (ScoreTrendChart, SkillRadar)
  DashboardResume.tsx       — Resume intelligence + version history
  DashboardSettings.tsx     — Settings, subscription management, voice selection
  DashboardLayout.tsx       — Sidebar navigation layout
  dashboardComponents.tsx   — Shared components (upgrade modal, skeleton, pro gate)
  dashboardData.ts          — Data loading, session helpers, analytics computation
  dashboardHelpers.ts       — Utility functions for dashboard
  dashboardTypes.ts         — Shared TypeScript interfaces
  supabase.ts               — Supabase client, auth helpers, CRUD, Google Calendar sync
  interviewAPI.ts           — Interview API client (questions, evaluation, follow-up, retry)
  interviewScripts.ts       — Fallback interview question scripts
  interviewIDB.ts           — IndexedDB helpers for offline drafts
  speechRecognition.ts      — Speech recognition abstraction
  deepgramSTT.ts            — Deepgram STT integration
  tts.ts                    — TTS settings, voice config, speech synthesis
  tokens.ts                 — Design tokens (colors, fonts, shadows, gradients)
  resumeParser.ts           — PDF.js resume text extraction
  rateLimit.ts              — Client-side rate limiting utility
  errorReporter.ts          — Client error reporting
  hooks.ts                  — Shared React hooks (useReveal, etc.)
  useDocTitle.ts            — Document title hook
  useSEO.ts                 — SEO meta tags hook
  landingData.tsx           — Landing page content data
  onboardingData.ts         — Onboarding step definitions
  Toast.tsx                 — Toast notification component
  ErrorBoundary.tsx         — React error boundary
  NotFound.tsx              — 404 page
  LegalPage.tsx             — Privacy/terms pages
  PlaceholderPage.tsx       — Placeholder for future pages
  landing/
    Hero.tsx                — Landing hero section
    Nav.tsx                 — Landing navigation
    FeaturesSection.tsx     — Features grid
    HowItWorks.tsx          — How it works flow
    PricingSection.tsx      — Pricing cards with Razorpay checkout
    Sections.tsx            — Additional landing sections
    BottomSections.tsx      — Footer sections
    index.ts                — Landing barrel export
  __tests__/                — 24 test files, 319 tests
```

`api/`\
`_shared.ts — CORS, auth, rate limiting, CSRF, subscription checks`\
`_llm.ts — LLM client configuration`\
`generate-questions.ts — Edge: Groq LLM question generation (resume-aware)`\
`evaluate.ts — Edge: Groq LLM answer evaluation (resume-aware)`\
`follow-up.ts — Edge: Dynamic follow-up question generation`\
`generate-insights.ts — Edge: AI-generated practice insights`\
`analyze-resume.ts — Edge: Groq LLM resume analysis`\
`tts.ts — Edge: Google Cloud TTS proxy`\
`tts-token.ts — Edge: TTS authentication token`\
`stt-token.ts — Edge: STT authentication token`\
`voices.ts — Edge: Available TTS voices list`\
`create-order.ts — Serverless: Razorpay one-time order creation`\
`create-subscription.ts — Serverless: Razorpay subscription creation`\
`verify-payment.ts — Serverless: Payment verification + subscription activation`\
`cancel-subscription.ts — Serverless: Subscription cancellation + confirmation email`\
`reactivate-subscription.ts — Serverless: Undo cancellation (Razorpay status check)`\
`pause-subscription.ts — Serverless: Pause/resume subscription (Razorpay API)`\
`razorpay-webhook.ts — Serverless: Razorpay webhook handler (8 event types)`\
`send-renewal-reminders.ts — Cron: Daily renewal reminder emails`\
`reset-expired-subscriptions.ts — Cron: Auto-downgrade expired subscriptions`\
`delete-account.ts — Serverless: Account deletion`\
`health.ts — Serverless: Health check endpoint`\
`uptime-check.ts — Serverless: Uptime monitoring`\
`log-error.ts — Serverless: Client error logging`

### Data Model (Supabase)

```
profiles
  id                      uuid    PK (matches Supabase Auth user ID)
  name                    text
  email                   text
  target_role             text
  target_company          text
  industry                text
  interview_date          text
  experience_level        text
  learning_style          text    (direct | encouraging)
  preferred_session_length int
  interview_types         jsonb   (array of selected types)
  resume_file_name        text
  resume_text             text
  resume_data             jsonb   (AI-analyzed profile with _type discriminator)
  practice_timestamps     jsonb   (array of ISO date strings)
  avatar_url              text
  subscription_tier       text    (free | starter | pro)
  subscription_start      timestamptz
  subscription_end        timestamptz
  cancel_at_period_end    boolean (default false)
  subscription_paused     boolean (default false)
  razorpay_payment_id     text
  razorpay_subscription_id text
  has_completed_onboarding boolean
  created_at              timestamptz
```

`sessions`\
`id text PK`\
`user_id uuid FK → profiles`\
`date timestamptz`\
`type text (behavioral | strategic | technical | case-study)`\
`difficulty text (warmup | standard | intense)`\
`focus text`\
`duration int (seconds)`\
`score int (0-100)`\
`questions int`\
`transcript jsonb [{speaker, text, time}]`\
`ai_feedback text`\
`skill_scores jsonb {skill: score}`\
`created_at timestamptz`

`calendar_events`\
`id text PK`\
`user_id uuid FK → profiles`\
`title text`\
`company text`\
`date text`\
`time text`\
`type text (interview | prep | other)`\
`notes text`\
`created_at timestamptz`

`feedback`\
`id uuid PK`\
`user_id uuid FK → profiles`\
`session_id text FK → sessions`\
`rating text (helpful | too_harsh | too_generous | inaccurate)`\
`comment text`\
`session_score int`\
`session_type text`\
`created_at timestamptz`

`payments`\
`id uuid PK`\
`user_id uuid FK → profiles`\
`razorpay_payment_id text UNIQUE`\
`razorpay_order_id text`\
`plan text (weekly | monthly)`\
`tier text (starter | pro)`\
`amount int (paise)`\
`currency text (INR)`\
`status text (completed)`\
`subscription_start timestamptz`\
`subscription_end timestamptz`\
`created_at timestamptz`

### API Endpoints

| Endpoint | Runtime | Method | Purpose | Auth |
| --- | --- | --- | --- | --- |
| `/api/generate-questions` | Edge | POST | Generate 7-step interview script via Groq (resume-aware) | JWT + session limit |
| `/api/evaluate` | Edge | POST | Score transcript and generate feedback via Groq (resume-aware) | JWT + session limit |
| `/api/follow-up` | Edge | POST | Generate dynamic follow-up question based on answer | JWT |
| `/api/generate-insights` | Edge | POST | AI-generated practice insights and recommendations | JWT |
| `/api/analyze-resume` | Edge | POST | AI resume analysis via Groq | JWT |
| `/api/tts` | Edge | POST | Google Cloud Neural2 TTS proxy | JWT |
| `/api/tts-token` | Edge | POST | TTS authentication token | JWT |
| `/api/stt-token` | Edge | POST | STT authentication token | JWT |
| `/api/voices` | Edge | GET | List available TTS voices | — |
| `/api/create-order` | Serverless | POST | Create Razorpay one-time payment order | JWT |
| `/api/create-subscription` | Serverless | POST | Create Razorpay auto-renewing subscription | JWT |
| `/api/verify-payment` | Serverless | POST | Verify signature, activate subscription, send email, return receipt | JWT |
| `/api/cancel-subscription` | Serverless | POST | Cancel at period end + send confirmation email | JWT |
| `/api/reactivate-subscription` | Serverless | POST | Undo cancellation, check Razorpay status | JWT |
| `/api/pause-subscription` | Serverless | POST | Pause or resume subscription via Razorpay API | JWT |
| `/api/razorpay-webhook` | Serverless | POST | Handle 8 Razorpay event types (activated, charged, halted, cancelled, completed, paused, resumed, payment.captured) | Webhook signature |
| `/api/delete-account` | Serverless | POST | Delete user account and all data | JWT |
| `/api/send-renewal-reminders` | Serverless | GET | Cron: email users expiring in 1–3 days | CRON_SECRET |
| `/api/reset-expired-subscriptions` | Serverless | GET | Cron: auto-downgrade expired subscriptions | CRON_SECRET |
| `/api/health` | Serverless | GET | Health check | — |
| `/api/uptime-check` | Serverless | GET | Uptime monitoring | — |
| `/api/log-error` | Serverless | POST | Client error logging | — |

### Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (client + server) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server only) |
| `GROQ_API_KEY` | Yes | Groq LLM API key |
| `GCP_TTS_API_KEY` | Yes | Google Cloud TTS API key |
| `RAZORPAY_KEY_ID` | Yes | Razorpay public key ID |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay secret key (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Razorpay webhook signature secret |
| `RAZORPAY_PLAN_WEEKLY` | Yes | Razorpay plan ID for weekly subscription |
| `RAZORPAY_PLAN_MONTHLY` | Yes | Razorpay plan ID for monthly subscription |
| `RESEND_API_KEY` | Optional | Resend email API key (for all transactional emails) |
| `FROM_EMAIL` | Optional | Sender email address (defaults to `onboarding@resend.dev`) |
| `APP_URL` | Optional | Application URL for email links (defaults to `https://hirestepx.vercel.app`) |
| `UPSTASH_REDIS_REST_URL` | Recommended | Upstash Redis for persistent rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Upstash Redis token |
| `CRON_SECRET` | Required | Protects cron endpoints (renewal reminders, expiry reset) |
| `ALLOWED_ORIGINS` | Required (prod) | Comma-separated production domain allowlist for CORS |

---

## Subscription Tiers

| Plan | Price | Duration | Limits | Features |
| --- | --- | --- | --- | --- |
| Free | ₹0 | Unlimited | 3 sessions total | Behavioral questions, basic score & feedback |
| Starter | ₹49/week | 7 days (auto-renew) | 10 sessions/week | All question types, detailed feedback & skill scores, resume analysis, PDF export |
| Pro | ₹149/month | 30 days (auto-renew) | Unlimited | Full AI coaching feedback, ideal answer comparisons, performance analytics & trends, interview calendar, Google Calendar sync, export (PDF, CSV, JSON) |

### Subscription Lifecycle

```
Purchase → Verify → Activate → [Pause ↔ Resume] → [Cancel → Reactivate] → Renew (webhook) → [Halt → Downgrade to Free]
```

- **Purchase:** Razorpay subscription created via `/api/create-subscription` (fallback: one-time order via `/api/create-order`)
- **Verify:** Client sends payment response to `/api/verify-payment` — dual-mode HMAC verification (order or subscription), amount/status validation, subscription ID storage
- **Proration:** Mid-cycle upgrade (Starter → Pro) credits remaining days proportionally as bonus days on new plan
- **Pause:** User can pause auto-renewal via settings → `/api/pause-subscription` → Razorpay API
- **Cancel:** Cancels at period end (keeps benefits) → `/api/cancel-subscription` → Razorpay API
- **Reactivate:** Undo cancel before expiry → `/api/reactivate-subscription` → checks Razorpay subscription status
- **Webhook:** `/api/razorpay-webhook` handles 8 event types for server-side consistency
- **Expiry:** Cron job `/api/reset-expired-subscriptions` auto-downgrades + client-side 60s polling

### Tier Enforcement

- **Client-side:** `subscriptionTier` in AuthContext, checked before rendering Pro-gated features (calendar, analytics)
- **Server-side:** `checkSessionLimit()` queries DB on every LLM API call — verifies tier and session count, auto-downgrades expired subscriptions
- **Auto-downgrade:** 60-second polling interval on client; server-side expiry check on every request; daily cron for stragglers

### Transactional Emails

| Trigger | Recipient | Content |
| --- | --- | --- |
| Payment verified | Buyer | Branded HTML: plan, amount, dates, payment ID, CTA |
| Subscription renewed (webhook) | Subscriber | Plan renewed, new end date, CTA |
| Subscription cancelled | Subscriber | Plan name, access-until date, reactivate link |
| Subscription paused | Subscriber | Pause confirmation, resume link |
| Subscription resumed | Subscriber | Resume confirmation, dashboard link |
| Renewal reminder (cron) | Expiring in 1–3 days | Renewal reminder with upgrade CTA |

---

## Testing

| Category | Files | Tests | Coverage |
| --- | --- | --- | --- |
| Auth & Context | 2 | \~30 | AuthContext, DashboardContext |
| Interview Flow | 3 | \~40 | Interview, InterviewComponents, interviewAPI |
| Payment & Subscriptions | 3 | \~35 | payment-verification, paymentFlow, subscription-expiry |
| Security | 4 | \~50 | CORS validation, input sanitization, session limits, API shared |
| Components | 4 | \~40 | SessionDetail, UpgradeModal, ErrorBoundary, accessibility |
| Utilities | 6 | \~60 | tokens, TTS, supabase, dashboardHelpers, resumeParser, extractJSON, interviewScripts |
| Integration | 2 | \~30 | e2e-flows (synthetic), accessibility |
| **Total** | **24** | **319** | Unit + integration |

---

## Known Limitations & Future Work

### Not Built (From Original PRD)

- B2B admin dashboard, coach workflows, client management
- Multi-org / team features
- Clerk auth (replaced with Supabase Auth)
- Stripe payments (replaced with Razorpay)
- Next.js App Router (replaced with React + Vite SPA)
- Prisma ORM (replaced with Supabase client)
- shadcn/ui component library (replaced with custom inline styles)
- TanStack Table (replaced with custom list components)
- Audio file upload to object storage
- GDPR data retention policy configuration
- AuditLog for destructive actions
- Enterprise SSO, 2FA
- Demo video on landing page

### Known Issues

- **Resend emails:** Free tier `onboarding@resend.dev` sender can only deliver to the Resend account owner's email. Custom domain verification required for production emails.
- **No E2E tests:** 24 unit/integration test files (319 tests) but no Playwright/Cypress for critical flows.
- **Large components:** `Interview.tsx` and `App.tsx` are 1500+ lines — partially mitigated by `InterviewComponents.tsx` extraction.
- **Inline styles:** Tailwind is a dependency but unused; all styling is inline objects.
- `verifyAuth()` **dev bypass:** Returns `authenticated: true` when Supabase not configured — safe in production but a footgun if deployed without Supabase.

### Potential Improvements

- E2E test suite for payment, interview, and auth flows (Playwright)
- Component splitting for remaining large files
- Migrate inline styles to Tailwind utility classes
- Verified Resend domain for production email delivery
- WebSocket-based real-time interview (replace polling)
- Audio recording upload for playback review
- PDF export for session reports
- Mobile-optimized interview experience
- Two-way Google Calendar sync (currently one-way import only)
- Webhook retry/dead-letter queue for failed processing
- Admin dashboard for monitoring payments and subscriptions

---

## Design System

### Color Palette (tokens.ts)

| Token | Value | Usage |
| --- | --- | --- |
| `obsidian` | `#0A0A0B` | Page backgrounds |
| `graphite` | `#141416` | Card surfaces |
| `ivory` | `#F0EDE8` | Primary text |
| `chalk` | `#D4CFC8` | Secondary text |
| `stone` | `#9A9590` | Muted text, labels |
| `gilt` | `#C9A96E` | Accent, CTAs, highlights |
| `giltDark` | `#B8923E` | Gradient endpoints |
| `sage` | `#7A9E7E` | Success, strong scores |
| `ember` | `#C4705A` | Error, destructive actions |
| `border` | `#2A2A2C` | Card borders, dividers |

### Typography

| Element | Font | Details |
| --- | --- | --- |
| Display / Headings | `Instrument Serif` | Serif, elegant section headings |
| UI text | `Inter` | Sans-serif, all interface text |
| Monospace | `JetBrains Mono` | Scores, code, data values |

### Design Principles

1. **Dark luxury** — Obsidian backgrounds, gilt accents, minimal chrome
2. **First impression matters** — Cinematic landing with particle effects, parallax, animated typography
3. **Clean product interior** — Post-login interface is minimal and functional
4. **Data-forward** — Scores, trends, and analytics are primary UI elements
5. **Resume-aware** — Interview questions, evaluation, and insights personalized to user's career

---

## Appendix: Related Documents

| Document | Location | Purpose |
| --- | --- | --- |
| Product Roadmap | [roadmap.md](./roadmap.md) | Phase-by-phase implementation plan |
| User Personas | [user-personas.md](./user-personas.md) | Full persona profiles |
| Competitor Analysis | [competitor-analysis.md](./competitor-analysis.md) | 10 competitor profiles, feature matrix |
| User Journeys & IA | [user-journey-and-ia.md](./user-journey-and-ia.md) | Sitemap, navigation model, user journeys |
| Brand Strategy | [branding-guide.md](./branding-guide.md) | Positioning, voice & tone, visual identity |

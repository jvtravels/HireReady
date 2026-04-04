# HireReady — Product Requirements Document

**Product:** HireReady (formerly Level Up Interviews) | **Date:** April 2026 | **Status:** Live (Production)

---

## TL;DR

HireReady is a premium-positioned web platform that lets experienced professionals practice realistic, AI-driven mock interviews with instant scored feedback. It targets **B2C individual professionals** preparing for senior-level interviews. Users configure their interview type, difficulty, and target role, then engage in a real-time conversational mock interview with an AI interviewer that speaks questions aloud. After completion, they receive detailed scoring, skill breakdowns, and actionable coaching feedback. Monetized via Razorpay with weekly (₹49) and monthly (₹149) plans.

---

## Background

Job interview preparation for senior professionals is underserved. Existing tools are either too generic (question banks), too informal (peer practice), or too expensive (1:1 human coaching at $200+/session). HireReady combines AI-driven question generation, real-time conversational simulation with text-to-speech, speech recognition for candidate responses, and role-specific scoring into a single platform.

### Market Context

- **Human coaching:** $200–400/session, requires scheduling, not on-demand
- **Generic prep tools:** Question banks (Glassdoor, LeetCode) — no personalization, no simulation
- **AI competitors:** Emerging but lack luxury positioning and role-specific depth for senior professionals

**Differentiation:** Luxury-grade dark-theme design, adaptive AI that tailors questions to resume and role, Google Cloud Neural2 TTS voices, and Indian market pricing via Razorpay.

---

## Target Users

### Individual Professionals (B2C)

- **Who:** Senior professionals preparing for leadership, PM, engineering, or strategic roles. Recently laid off, transitioning, or upskilling.
- **Pain point:** No way to practice realistic, personalized interviews on-demand without scheduling a human coach.
- **Impact:** Users gain confidence, receive structured feedback on communication, structure, leadership, and problem-solving skills.

---

## Product Overview (As Built)

### Live Features

#### Landing Page (`/`)

- Cinematic dark-theme landing with particle canvas hero animation
- Parallax scroll effects, animated typography, mouse-tracking gradient
- Value proposition sections, feature grid, pricing cards, FAQ accordion
- Social proof section, Unsplash background imagery
- "Start Free" CTA — no credit card required
- Inline Razorpay checkout for upgrading from landing page

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
- AI resume analysis via Groq LLM (skills, achievements, career trajectory)
- Interview date and target company fields
- Learning style preference (direct / encouraging)
- Preferred session length (10 / 15 / 25 minutes)

#### Dashboard (`/dashboard`)

- **Home** — Session history with score trends, readiness score, streak tracking, AI insights, smart scheduling suggestions, upcoming goals, prep plan, week activity heatmap, notifications
- **Sessions** (`/dashboard/sessions`) — Filterable/searchable session list with type, score, date, duration. Links to session detail pages
- **Calendar** (`/dashboard/calendar`) — Interview scheduling with event CRUD, reminders, export to ICS. Pro-only feature
- **Analytics** (`/dashboard/analytics`) — Score trends, skill breakdowns, improvement tracking. Pro-only feature
- **Resume** (`/dashboard/resume`) — Resume intelligence: AI-analyzed profile with headline, skills, achievements, career trajectory, interview strengths/gaps. Re-analysis and delete with confirmation
- **Settings** (`/dashboard/settings`) — Profile editing (name, role, interview date), interview preferences (default difficulty), subscription management (cancel with confirmation), AI voice selection (8 Neural2 voices), notification toggles, data export (CSV)

#### Session Setup (`/session-setup`)

- Interview type selection: Behavioral, Strategic, Technical Leadership, Case Study
- Adaptive difficulty: Warm-up, Standard, Intense (auto-suggested based on past scores)
- Focus area customization
- Session preview with estimated duration and question count

#### Live Interview (`/interview`)

- Real-time conversational AI interview with 7-step structure (intro → questions → follow-ups → closing)
- Google Cloud Neural2 TTS — AI speaks questions aloud (8 selectable voices)
- Browser Speech Recognition API for candidate responses
- Manual text input fallback when mic unavailable
- Visual waveform/pulse animation during AI speech
- Transcript displayed in real-time chat bubbles
- Timer with session duration tracking
- Draft auto-save to localStorage + IndexedDB backup
- Microphone error handling with user-visible feedback
- Next-question debounce (500ms) to prevent double-advance

#### Evaluation & Results

- AI evaluation via Groq LLM (llama-3.3-70b-versatile model)
- 35-second timeout with AbortController
- Progress bar during evaluation
- Overall score (0–100) with qualitative label (Developing / Good / Strong)
- Skill breakdown scores: Communication, Structure, Technical Depth, Leadership, Problem Solving
- Strengths and improvement areas (3 each)
- Detailed AI coaching feedback with specific transcript references
- Results saved to Supabase + localStorage

#### Session Detail (`/session/:id`)

- Full transcript with chat-bubble UI (interviewer vs candidate)
- Score circle with skill breakdown bars
- AI Coach Summary section
- Copy report to clipboard (with visual feedback)
- Download as .txt file
- Score tooltips explaining what each level means

#### Subscription & Payments

- **Free tier:** 3 total sessions, behavioral questions only, basic feedback
- **Starter (₹49/week):** 10 sessions/week, all question types, detailed feedback, resume analysis, PDF export
- **Pro (₹149/month):** Unlimited sessions, full AI coaching, performance analytics, interview calendar, export (PDF, CSV, JSON)
- Razorpay checkout integration (UPI, Cards, Netbanking)
- Server-side HMAC-SHA256 signature verification
- Payment confirmation emails via Resend
- Subscription auto-downgrade on expiry (60-second client polling + server-side check)
- Cancel subscription with confirmation flow
- Renewal reminder emails (daily cron, 3 days before expiry)

#### Legal

- Privacy Policy and Terms of Service pages (`/privacy`, `/terms`)

#### 404 Page

- Custom not-found page with navigation back to home

### Security (As Implemented)

- **Authentication:** Supabase JWT-based auth on all API endpoints. Auth bypass only in local dev when Supabase unconfigured.
- **CORS:** Origin allowlist with Vercel preview wildcard. All endpoints validate origin.
- **CSRF:** Origin header validation on all state-changing POST endpoints (evaluate, generate-questions, create-order, verify-payment, cancel-subscription).
- **Rate Limiting:** Per-IP rate limiting via Upstash Redis (with in-memory fallback). Separate buckets per endpoint.
- **IP Security:** Uses Vercel's `x-real-ip` header (not spoofable) with `x-forwarded-for` fallback.
- **Payment Security:** HMAC-SHA256 signature verification, server-side amount validation against Razorpay API, duplicate payment protection (profile + payments table checks), subscription tier checks.
- **Prompt Injection:** Multi-layer sanitization — strips role markers, LLM tokens (`<|im_start|>`), code blocks, JSON role injection, "ignore previous instructions" patterns, control characters. Input length caps per field.
- **Session Limits:** Server-side enforcement — checks subscription tier from DB on each API call (not trusting client state).
- **Headers:** CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS, Referrer-Policy, Permissions-Policy.
- **Cron Protection:** `CRON_SECRET` required (fails closed when not set).
- **Error Logging:** Sensitive data (userId, amounts) redacted from server logs.

---

## Tech Stack (As Built)

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | React 18 + Vite 7 + TypeScript | SPA with client-side routing |
| Routing | react-router-dom v7 | Route-based code splitting with lazy imports |
| Database | Supabase Postgres | Profiles, sessions, calendar events, payments tables |
| Authentication | Supabase Auth | Email/password, Google OAuth, JWT tokens |
| Payments | Razorpay | INR pricing, UPI/Cards/Netbanking, server-side verification |
| AI / LLM | Groq API (llama-3.3-70b-versatile) | Question generation, evaluation, resume analysis |
| TTS | Google Cloud Text-to-Speech API | Neural2 voices (8 options), Edge Function proxy |
| Speech Input | Browser Speech Recognition API | With manual text input fallback |
| Hosting | Vercel | Edge Functions (LLM endpoints) + Serverless Functions (payment, cron) |
| Rate Limiting | Upstash Redis | With in-memory fallback for local dev |
| Emails | Resend API | Payment confirmation + renewal reminders |
| Styling | Inline styles + design tokens | Dark luxury theme, custom `tokens.ts` color/font system |
| Analytics | Vercel Analytics + Speed Insights | Bundled with deployment |
| Testing | Vitest + Testing Library | 18 test files, 150+ tests |

### Application Architecture

```
src/
  main.tsx                  — App entry, router setup, lazy imports
  App.tsx                   — Landing page (particle canvas, parallax, pricing)
  AuthContext.tsx            — Auth state, login/signup/logout, subscription management
  DashboardContext.tsx       — Dashboard data provider (sessions, analytics, events)
  Interview.tsx             — Live interview player (TTS, speech recognition, transcript)
  SessionSetup.tsx          — Interview configuration (type, difficulty, focus)
  SessionDetail.tsx         — Post-session review (transcript, scores, export)
  SignUp.tsx                — Login/signup/password reset forms
  Onboarding.tsx            — Multi-step new user setup
  ResetPassword.tsx         — Password reset flow
  DashboardHome.tsx         — Dashboard overview (stats, insights, sessions)
  DashboardSessions.tsx     — Session history list
  DashboardCalendar.tsx     — Interview calendar (Pro only)
  DashboardAnalytics.tsx    — Performance analytics (Pro only)
  DashboardResume.tsx       — Resume intelligence
  DashboardSettings.tsx     — Settings, subscription, voice selection
  DashboardLayout.tsx       — Sidebar navigation layout
  dashboardComponents.tsx   — Shared components (upgrade modal, skeleton, pro gate)
  dashboardData.ts          — Data loading, session helpers, analytics computation
  dashboardTypes.ts         — Shared TypeScript interfaces
  supabase.ts               — Supabase client, auth helpers, CRUD functions
  tts.ts                    — TTS settings, voice config, speech synthesis
  tokens.ts                 — Design tokens (colors, fonts)
  resumeParser.ts           — PDF.js resume text extraction
  NotFound.tsx              — 404 page
  LegalPage.tsx             — Privacy/terms pages
  __tests__/                — 18 test files (auth, dashboard, interview, API, etc.)

api/
  _shared.ts                — CORS, auth, rate limiting, CSRF, subscription checks
  generate-questions.ts     — Edge Function: Groq LLM question generation
  evaluate.ts               — Edge Function: Groq LLM answer evaluation
  analyze-resume.ts         — Edge Function: Groq LLM resume analysis
  tts.ts                    — Edge Function: Google Cloud TTS proxy
  create-order.ts           — Serverless: Razorpay order creation
  verify-payment.ts         — Serverless: Payment verification + subscription activation
  cancel-subscription.ts    — Serverless: Subscription cancellation
  send-renewal-reminders.ts — Cron: Daily renewal reminder emails
```

### Data Model (Supabase)

```
profiles
  id                    uuid    PK (matches Supabase Auth user ID)
  name                  text
  email                 text
  target_role           text
  target_company        text
  industry              text
  interview_date        text
  learning_style        text
  preferred_session_length  int
  interview_types       text[]
  resume_file_name      text
  resume_text           text
  resume_data           jsonb
  practice_timestamps   text[]
  avatar_url            text
  subscription_tier     text    (free | starter | pro | team)
  subscription_start    timestamptz
  subscription_end      timestamptz
  razorpay_payment_id   text
  created_at            timestamptz

sessions
  id          text    PK
  user_id     uuid    FK → profiles
  date        text
  type        text
  difficulty  text
  focus       text
  duration    int     (seconds)
  score       int     (0-100)
  questions   int
  transcript  jsonb   [{speaker, text, time}]
  ai_feedback text
  skill_scores jsonb  {skill: score}
  created_at  timestamptz

calendar_events
  id          text    PK
  user_id     uuid    FK → profiles
  title       text
  company     text
  date        text
  time        text
  type        text
  notes       text
  created_at  timestamptz

payments
  id                    text    PK
  user_id               uuid    FK → profiles
  razorpay_payment_id   text
  razorpay_order_id     text
  plan                  text
  tier                  text
  amount                int     (paise)
  currency              text
  status                text
  subscription_start    timestamptz
  subscription_end      timestamptz
```

### API Endpoints

| Endpoint | Runtime | Method | Purpose | Auth |
| --- | --- | --- | --- | --- |
| `/api/generate-questions` | Edge | POST | Generate 7-step interview script via Groq | JWT + session limit |
| `/api/evaluate` | Edge | POST | Score transcript and generate feedback via Groq | JWT + session limit |
| `/api/analyze-resume` | Edge | POST | AI resume analysis via Groq | JWT |
| `/api/tts` | Edge | POST | Google Cloud Neural2 TTS proxy | JWT |
| `/api/create-order` | Serverless | POST | Create Razorpay payment order | JWT |
| `/api/verify-payment` | Serverless | POST | Verify signature, activate subscription, send email | JWT |
| `/api/cancel-subscription` | Serverless | POST | Downgrade to free tier | JWT |
| `/api/send-renewal-reminders` | Serverless | GET | Cron: email users expiring in 1–3 days | CRON_SECRET |

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
| `RESEND_API_KEY` | Optional | Resend email API key (for payment/renewal emails) |
| `FROM_EMAIL` | Optional | Sender email address (defaults to `onboarding@resend.dev`) |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis for persistent rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis token |
| `CRON_SECRET` | Required | Protects the renewal reminder cron endpoint |
| `ALLOWED_ORIGINS` | Optional | Comma-separated production domain allowlist for CORS |

---

## Subscription Tiers

| Plan | Price | Duration | Limits | Features |
| --- | --- | --- | --- | --- |
| Free | ₹0 | Unlimited | 3 sessions total | Behavioral questions, basic score & feedback |
| Starter | ₹49/week | 7 days | 10 sessions/week | All question types, detailed feedback & skill scores, resume analysis, PDF export |
| Pro | ₹149/month | 30 days | Unlimited | Full AI coaching feedback, performance analytics & trends, interview calendar, export (PDF, CSV, JSON) |

### Tier Enforcement

- **Client-side:** `subscriptionTier` in AuthContext, checked before rendering Pro-gated features (calendar, analytics)
- **Server-side:** `checkSessionLimit()` queries DB on every LLM API call — verifies tier and session count, auto-downgrades expired subscriptions
- **Auto-downgrade:** 60-second polling interval on client; server-side expiry check on every request

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
- **No E2E tests:** 18 unit test files (150+ tests) but no Playwright/Cypress for critical flows.
- **Large components:** `Interview.tsx` is 1578 lines, `App.tsx` is 1600+ lines — could benefit from splitting.
- **Inline styles:** Tailwind is a dependency but unused; all styling is inline objects.
- **No offline indicator:** App silently fails when network drops mid-interview.
- `verifyAuth()` **dev bypass:** Returns `authenticated: true` when Supabase not configured — safe in production but a footgun if deployed without Supabase.

### Potential Improvements

- E2E test suite for payment, interview, and auth flows
- Component splitting for Interview.tsx and App.tsx
- Migrate inline styles to Tailwind utility classes
- Add offline detection with reconnection banner
- Verified Resend domain for production email delivery
- WebSocket-based real-time interview (replace polling)
- Audio recording upload for playback review
- PDF export for session reports
- Mobile-optimized interview experience

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
| `sage` | `#7A9E7E` | Success, strong scores |
| `ember` | `#C4705A` | Error, destructive actions |
| `border` | `#2A2A2C` | Card borders, dividers |

### Typography

| Element | Font | Details |
| --- | --- | --- |
| UI text | `Inter` | Sans-serif, all interface text |
| Monospace | `JetBrains Mono` | Scores, code, data values |

### Design Principles

1. **Dark luxury** — Obsidian backgrounds, gilt accents, minimal chrome
2. **First impression matters** — Cinematic landing with particle effects, parallax, animated typography
3. **Clean product interior** — Post-login interface is minimal and functional
4. **Data-forward** — Scores, trends, and analytics are primary UI elements

---

## Appendix: Related Documents

| Document | Location | Purpose |
| --- | --- | --- |
| Product Roadmap | [roadmap.md](./roadmap.md) | Phase-by-phase implementation plan |
| User Personas | [user-personas.md](./user-personas.md) | Full persona profiles |
| Competitor Analysis | [competitor-analysis.md](./competitor-analysis.md) | 10 competitor profiles, feature matrix |
| User Journeys & IA | [user-journey-and-ia.md](./user-journey-and-ia.md) | Sitemap, navigation model, user journeys |
| Brand Strategy | [branding-guide.md](./branding-guide.md) | Positioning, voice & tone, visual identity |

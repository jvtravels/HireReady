# Level Up Interviews — Product Roadmap

**Client:** Silva Vitalis LLC | **Timeline:** 10 Weeks | **Start:** Week of April 7, 2026

---

## Executive Summary

Level Up Interviews is a greenfield MVP web platform enabling AI-driven mock interview practice for two audiences: **B2C** (individual professionals, self-serve weekly/quarterly plans) and **B2B** (coaching firms, annual licenses with bulk client management). The product emphasizes a luxury-grade first-touch experience, WCAG 2.1 AA accessibility, and GDPR-compliant data controls.

---

## Current State

The repo currently contains a basic Vite + React scaffold. **The first major task is migrating to the target stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui.**

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript |
| Database | Supabase Postgres |
| ORM | Prisma |
| Auth | Clerk (SOC2-ready, 2FA, SSO) |
| Payments | Stripe (Checkout + Webhooks) |
| Hosting | Vercel |
| UI | shadcn/ui + Tailwind CSS |
| Forms | react-hook-form + zod |
| Tables | TanStack Table (react-table) |
| Dates | date-fns |
| File Storage | Supabase Storage (audio, 20MB limit) |

---

## Phase-by-Phase Roadmap

### Phase 0 — Kickoff & Foundation (Week 1)

**Goal:** Dev environment is fully operational. Database schema exists. First design is already approved.

#### Frontend (Tempo)

- [ ] Migrate repo from Vite to **Next.js 14 App Router** with TypeScript

- [ ] Install and configure: Tailwind CSS, shadcn/ui, react-hook-form, zod, date-fns

- [ ] Set up Clerk authentication (provider, middleware, env vars)

- [ ] Configure Vercel project + preview deployments

- [ ] Set up Stripe sandbox (test keys, product/price IDs for B2C $29/week, $199/3mo, B2B annual)

- [ ] Establish project folder structure:

  ```
  src/app/
    (public)/          — landing, login, signup, privacy, terms
    (dashboard)/       — B2C authenticated routes
    (admin)/           — B2B admin routes
    api/               — API route handlers
  src/components/
    ui/                — shadcn/ui primitives
    shared/            — shared components (nav, sidebar, modals)
    interview/         — interview player, recorder, feedback
    admin/             — admin-specific components
  prisma/
    schema.prisma
    seed.ts
  ```

#### Backend (Client)

- [ ] Set up Supabase project (Postgres, Storage bucket for audio)

- [ ] Define Prisma schema with all 7 entities: User, Organization, MockSession, Invite, Payment, AuditLog, DataRetentionPolicy

- [ ] Run initial migration

- [ ] Write seed script: 2 B2B orgs, 1 B2C user, 5 mock sessions with sample feedback JSON

- [ ] Configure Supabase Storage bucket with 20MB file size limit

#### Designer (Tempo)

- [ ] Landing page design already approved pre-kickoff

- [ ] Continue delivering: signup, login screens

#### Milestone M1 — Dev Starts Day 1

> Repo scaffolded, environments live, DB schema + seed data operational on Day 1.

---

### Phase 1 — Public Pages & Auth (Weeks 2–3)

**Goal:** Landing, signup, login, and legal pages are built and deployed to staging with Clerk auth fully wired.

#### Frontend

- [ ] `/landing` — Luxury first-touch experience:

  - Hero section with motion/micro-interactions, elevated typography
  - Value proposition for B2C ("Start Free Mock Interview") and B2B ("Get Team Pilot")
  - Pricing summary (B2C: $29/week trial, $199/3mo Pro | B2B: 1-month free pilot → annual license)
  - Demo video embed, FAQ accordion, privacy/terms links
  - Responsive at 375px; sidebar collapses to hamburger on mobile

- [ ] `/signup` — Multi-step form:

  - Step 1: Email + password
  - Step 2: Plan selection (B2C individual vs. B2B team)
  - Step 3: Privacy consent checkbox + terms acknowledgment
  - react-hook-form + zod validation, auto-save progress, ADA-compliant

- [ ] `/login` — Clerk-powered:

  - Standard email/password login
  - SSO option
  - Optional 2FA toggle

- [ ] `/privacy` and `/terms` — Static compliance pages

- [ ] **Navigation structure:**

  - Top nav (public): Pricing, Login/Signup, Legal links
  - Sidebar (authenticated): Dashboard, Reports, Team/Users, Settings

- [ ] Implement auth middleware: protect `/dashboard/*` and `/admin/*` routes; redirect logic (logged-in B2C → dashboard, logged-in B2B admin → admin dashboard)

#### Backend

- [ ] `/api/auth/*` — Clerk webhook integration for user creation/sync with Prisma

- [ ] Finalize User + Organization models, ensure Clerk user ID maps to Prisma User record

- [ ] Email invite confirmation: console.log stub for MVP

#### Designer

- [ ] Deliver B2C dashboard, interview player, and feedback panel designs

- [ ] Design QA on landing/signup/login implementations

#### Milestone M2 — Auth & Scaffold Live (End of Week 3)

> /landing, /login, /signup live on staging with Clerk auth. DB schema and seed data complete.

---

### Phase 2 — B2C Core: Interview Flow (Weeks 4–5)

**Goal:** Full B2C user journey works end-to-end — trial mock interview, AI feedback, Stripe upgrade.

#### Frontend

- [ ] `/dashboard` (B2C):

  - First-visit: "Start Your Free Mock Interview" CTA
  - Resume/job-context input form (text + optional file upload)
  - Session history list with feedback summaries
  - Post-trial: upgrade prompt banner ("Get unlimited practice for $29/week")
  - Post-payment: unlocked state, unlimited access indicator

- [ ] `/interview/:sessionId` — Interview Player:

  - Browser microphone access request (MediaRecorder API)
  - Audio recording with visual waveform/progress indicator
  - Display AI-generated questions one at a time
  - Submit/complete states with loading feedback
  - Audio upload to Supabase Storage (progress bar, 20MB limit enforcement)
  - Accessibility: keyboard navigation, screen reader cues, visual status indicators

- [ ] **Feedback Review Panel:**

  - Role-specific scorecards (overall score + category breakdowns)
  - Expandable AI suggestion cards
  - Download buttons: PDF report, CSV data export
  - "Next steps" improvement tips

- [ ] **Stripe Checkout integration (B2C):**

  - $29/week plan — no auto-upgrade, one-time purchase for 7-day access
  - $199/3-month Pro plan with $29 credit if converting
  - Success/cancel redirect pages
  - Dashboard state updates immediately on payment success

#### Backend

- [ ] `/api/mock/create` — Create MockSession, accept resume_data + job_context JSON

- [ ] `/api/mock/:id/complete` — Finalize session, trigger AI processing

- [ ] `/api/feedback/:sessionId` — Return AI analysis, scores, suggestions

- [ ] AI integration: stub AI question generation + scoring service (hardcoded responses for Phase 2, real integration by Phase 3)

- [ ] Supabase Storage: audio upload signed URL generation, file validation

- [ ] `/api/payment/checkout` — Create Stripe Checkout session for B2C plans

- [ ] Stripe webhook handler (synchronous for MVP): update user trial_status on successful payment

#### Designer

- [ ] Design QA on B2C dashboard + interview player implementations

- [ ] Deliver B2B admin dashboard, client table, and reports screen designs

#### Milestone M3 — B2C Flow Complete (End of Week 5)

> Full B2C trial → interview → feedback → Stripe upgrade functional on staging.

---

### Phase 3 — B2B Admin & Team Management (Weeks 6–7)

**Goal:** B2B pilot onboarding, client invites, admin dashboard, and annual license payment are functional.

#### Frontend

- [ ] `/admin/dashboard` — B2B Admin Dashboard:

  - Pilot status banner with trial countdown (days remaining)
  - Team management overview (active clients, pending invites)
  - "Invite Client" button → email invite modal
  - Usage counters (mocks completed, active users)
  - Upgrade prompt: "Upgrade to keep clients' progress and unlock unlimited slots"
  - License management wizard (current plan, seat count, renewal date)

- [ ] `/admin/clients` — Client Table:

  - TanStack Table with sorting, filtering, search
  - Columns: Name, Email, Status (pending/active), Mocks Completed, Last Active
  - In-row actions: resend invite, remove client
  - Bulk invite (CSV upload or multi-email input)

- [ ] `/admin/reports` — Summary Analytics:

  - Active users count, total sessions, average scores
  - Coach engagement summary (per-client breakdown)
  - Keep simple — no heavy charting libraries

- [ ] **Stripe integration (B2B):**

  - Annual license checkout
  - License upgrade flow within admin dashboard
  - Real-time payment status display

#### Backend

- [ ] `/api/invite/create` — Create invite record, send email (console.log for MVP)

- [ ] `/api/invite/accept` — Validate invite token, create/link user account, update invite status

- [ ] `/api/org/license` — GET license status, POST to upgrade

- [ ] Org management APIs: add/remove users from org, update org settings

- [ ] Stripe B2B: annual license product/price, invoice generation

- [ ] Real AI service integration (replace stubs from Phase 2): connect OpenAI/Anthropic for question generation + response scoring

- [ ] Trial expiry logic: auto-flag orgs past 30-day pilot

#### Designer

- [ ] Design QA on B2B admin screens

#### Milestone M4 — B2B Flow Complete (End of Week 7)

> B2B pilot onboarding, invite system, admin dashboard, Stripe annual license functional.

---

### Phase 4 — Compliance & Account Management (Week 8)

**Goal:** Data privacy controls, account settings, and accessibility audit complete.

#### Frontend + Backend

- [ ] **Account Settings page:**

  - Profile editing (name, email, password via Clerk)
  - "Export Data" button → triggers download of user's complete data (JSON/CSV)
  - "Delete Account" button → confirmation modal with retention period selector (30/90/180 days)
  - Clear, accessible language for destructive actions

- [ ] `/api/data/export` — Aggregate all user data (profile, sessions, feedback) into downloadable file

- [ ] `/api/data/delete` — Soft-delete with configurable retention window, erasure confirmation

- [ ] **B2B Data Retention Policy:**

  - Admin settings: "Manage Data Retention Policy" with 30/90/180-day selector for all org users
  - `/api/org/retention` — CRUD for retention policy
  - Compliance advisory text displayed alongside controls

- [ ] **AuditLog implementation:**

  - Log all destructive/privileged actions (account deletion, data export, role changes, payment events)
  - Backend middleware to auto-capture audit events

- [ ] `/privacy` and `/terms` — Final content review and formatting

- [ ] **Accessibility audit (WCAG 2.1 AA):**

  - Keyboard navigation on all interactive elements
  - Screen reader testing (VoiceOver, NVDA)
  - Color contrast verification
  - Focus management on modals and multi-step forms
  - ARIA labels on interview player controls

- [ ] **Responsive QA** — All pages verified at 375px width

#### Milestone M5 — Compliance Pass (End of Week 8)

> Data export/delete, retention policy, WCAG 2.1 AA audit complete.

---

### Phase 5 — Integration Testing & UAT (Weeks 9–10, first half)

**Goal:** End-to-end testing of all 4 core user journeys. Client UAT begins.

#### All Team

- [ ] **End-to-end test: B2C Free Trial → Upgrade**

  1. Land on /landing → click "Start Free Mock Interview"
  2. Complete signup with privacy consent
  3. Run 1 mock interview with audio recording
  4. View AI feedback and scores
  5. Upgrade via Stripe ($29/week) → verify dashboard unlocks immediately
  6. Verify &lt; 10 minutes total flow time

- [ ] **End-to-end test: B2B Pilot Onboarding**

  1. Admin creates account via "Get Team Pilot"
  2. System starts 1-month no-payment trial
  3. Admin invites 2 clients via email
  4. Clients activate accounts and run mock interviews
  5. Admin views usage in /admin/dashboard
  6. Admin upgrades via Stripe annual license → bulk invite unlocked

- [ ] **End-to-end test: Mock Interview & Feedback**

  1. User provides resume + job context
  2. AI generates tailored questions
  3. User records audio responses
  4. AI processes and returns role-specific scores + feedback
  5. User exports results as PDF/CSV

- [ ] **End-to-end test: Data & Account Control**

  1. User exports data → file downloads
  2. User deletes account → retention period enforced
  3. B2B admin configures retention policy → reflected in dashboard

- [ ] Bug triage: categorize P1 (blocker), P2 (major), P3 (minor)

- [ ] Performance testing: page load times, audio upload speed

- [ ] Mobile QA: all flows tested on real devices at 375px

- [ ] Cross-browser testing: Chrome, Safari, Firefox

#### Milestone M6 — UAT Signoff (End of Week 9)

> Client UAT passed, all P1/P2 bugs resolved.

---

### Phase 6 — Polish & Production Launch (Week 10)

**Goal:** Ship to production.

#### All Team

- [ ] Fix remaining P2/P3 bugs from UAT

- [ ] Final design QA pass — pixel-level review of all screens

- [ ] Landing page animation/interaction polish

- [ ] **Production deployment:**

  - [ ] Vercel production environment configured

  - [ ] Stripe live keys swapped in (replace sandbox)

  - [ ] Supabase production database provisioned

  - [ ] Clerk production instance configured

  - [ ] Environment variables secured

  - [ ] Domain/DNS configured

- [ ] **Monitoring setup:**

  - [ ] Vercel Analytics enabled

  - [ ] Error tracking (Sentry or similar)

  - [ ] Uptime monitoring

- [ ] Seed data removed from production

- [ ] Final security review: API routes protected, auth middleware verified, no exposed secrets

- [ ] PM: Launch sign-off with Silva Vitalis

#### Milestone M7 — Production Launch (End of Week 10)

> Live on Vercel with Stripe live keys, monitoring active.

---

## Data Model

```
User
  id: uuid (PK)
  email: string (unique)
  hashed_password: string
  role: enum [admin, coach, end_user]
  org_id: uuid (FK → Organization, nullable)
  stripe_id: string
  trial_status: enum [active, expired, paid]
  privacy_accepted: boolean
  created_at: timestamp
  last_active: timestamp

Organization
  id: uuid (PK)
  name: string
  admin_id: uuid (FK → User)
  license_type: enum [solo, team]
  pilot_start: timestamp
  pilot_end: timestamp
  current_license_status: enum [trial, active, expired]

MockSession
  id: uuid (PK)
  user_id: uuid (FK → User)
  org_id: uuid (FK → Organization, nullable)
  created_at: timestamp
  resume_data: json
  job_context: json
  audio_url: string
  feedback: json
  score: int

Invite
  id: uuid (PK)
  org_id: uuid (FK → Organization)
  email: string
  status: enum [pending, activated]
  sent_at: timestamp
  expires_at: timestamp

Payment
  id: uuid (PK)
  user_id: uuid (FK → User, nullable)
  org_id: uuid (FK → Organization, nullable)
  stripe_charge_id: string
  amount: int (cents)
  period: string
  status: enum [pending, succeeded, failed]
  created_at: timestamp

AuditLog
  id: uuid (PK)
  user_id: uuid (FK → User)
  action: string
  timestamp: timestamp
  target_id: uuid
  details: json

DataRetentionPolicy
  org_id: uuid (FK → Organization, PK)
  user_retention_days: int
  admin_id: uuid (FK → User)
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/*` | Various | Signup, login, 2FA via Clerk |
| `/api/mock/create` | POST | Start new interview session |
| `/api/mock/:id/complete` | POST | Submit and finalize session |
| `/api/feedback/:sessionId` | GET | Fetch AI analysis and scoring |
| `/api/invite/create` | POST | Create client email invite |
| `/api/invite/accept` | POST | Accept invite, activate account |
| `/api/org/license` | GET/POST | License status and upgrade |
| `/api/org/retention` | GET/PUT | Data retention policy CRUD |
| `/api/data/export` | POST | Export user data file |
| `/api/data/delete` | POST | Initiate account deletion |
| `/api/payment/checkout` | POST | Stripe Checkout session |

---

## Pricing Model

| Plan | Audience | Price | Duration | Trial |
| --- | --- | --- | --- | --- |
| Free Trial | B2C | $0 | 1 mock | No card required |
| Weekly Unlimited | B2C | $29 | 7 days | After free mock |
| Pro | B2C | $199 | 3 months | $29 credit if upgrading |
| Team Pilot | B2B | $0 | 1 month, 2 clients | No card required |
| Annual License | B2B | TBD | 12 months, unlimited clients | After pilot |

---

## Key Risks

| Risk | Mitigation |
| --- | --- |
| AI integration latency/quality | Stub in Phase 2, real service by Phase 3; agree on provider at kickoff |
| Client feedback delay (&gt;2 days) | PM sets 48hr SLA; async Loom walkthroughs |
| Scope creep | PRD is north star; formal change request process |
| Browser audio/mic compatibility | Test Chrome/Safari/Firefox in Phase 2; fallback to file upload |
| Design falling behind dev | First design approved pre-kickoff; designer stays one phase ahead |

---

## Immediate Next Steps (This Week)

1. **Migrate from Vite to Next.js 14** — the current scaffold needs to be replaced
2. **Install core dependencies** — Tailwind, shadcn/ui, Clerk, Stripe, Prisma, react-hook-form, zod
3. **Set up Prisma schema** with all 7 entities
4. **Configure Clerk** with auth middleware
5. **Set up Vercel** project for preview deployments
6. **Confirm AI provider** (OpenAI or Anthropic) with Silva Vitalis
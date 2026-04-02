# Level Up Interviews — Product Requirements Document

**Client:** Silva Vitalis LLC | **Prepared by:** Tempo | **Date:** April 2026 **Build type:** Greenfield MVP | **Timeline:** 10 Weeks

---

## TL;DR

Level Up Interviews is a luxury-positioned web platform that lets experienced professionals practice realistic, AI-driven mock interviews with instant scored feedback. It serves two audiences: **B2C individuals** buying self-serve weekly/quarterly plans, and **B2B coaching firms** purchasing per-seat annual licenses to onboard clients in bulk. The MVP delivers the full purchase-to-practice loop for both audiences, with WCAG 2.1 AA accessibility and GDPR-compliant data controls, in a 10-week build.

---

## Background

Job interview preparation for senior professionals is underserved. Existing tools are either too generic (question banks with no personalization), too informal (peer practice), or too expensive (1:1 human coaching at $200+/session). Coaching firms lack a scalable way to provide structured, measurable practice to cohorts of clients — they rely on manual scheduling and subjective assessments.

Silva Vitalis LLC identified an opportunity to combine AI-driven question generation, real-time conversational interview simulation, and role-specific scoring into a single platform that works for both self-serve individuals and managed coaching engagements.

No existing codebase or product exists. This is a greenfield build.

### Market Context

- **Human coaching:** $200–400/session, requires scheduling weeks out, not scalable for firms
- **Generic prep tools:** Question banks (Glassdoor, LeetCode for tech) — no personalization, no real-time simulation, designed for junior candidates
- **Peer practice:** Unreliable feedback, no scoring, no privacy, not available on-demand
- **AI competitors:** Emerging but lack luxury positioning, B2B coach workflows, and role-specific depth for senior professionals

**Differentiation:** Level Up competes on three axes — (1) luxury-grade design that signals professional quality, (2) AI that adapts to senior-level roles in real-time, and (3) a dual B2C/B2B model that serves both individuals and the coaches who manage them.

---

## Problem & Target Users

### B2C — Individual Professionals

- **Who:** Senior professionals who are recently laid off, transitioning roles, or upskilling. They value discretion, privacy, and professional-grade tools.
- **Pain point:** No way to practice realistic, personalized interviews on-demand without scheduling a human coach. Generic question lists don't replicate real pressure or provide actionable feedback.
- **Impact:** Users lose confidence, underperform in real interviews, and extend their job search timeline unnecessarily.

### B2B — Career Coaches & Outplacement Firms

- **Who:** Professional coaches, consultants, and outplacement agencies managing cohorts of 5–50+ clients through career transitions.
- **Pain point:** Manual interview prep is unscalable. Coaches can't objectively measure client progress, compare cohort performance, or provide unlimited practice without 1:1 time investment.
- **Impact:** Firms cap their client capacity, lack data to demonstrate ROI to corporate buyers, and lose clients to self-serve tools.

---

## User Personas

Five core personas drive all product decisions. Full persona documentation with bios, behaviors, quotes, and design implications is available in [user-personas.md](./user-personas.md). Summary below:

### B2C Personas

**Marcus Chen — "The Displaced Executive"**

- 48, former VP of Operations, Chicago. 16 years at one company, now job-hunting for the first time in a decade.
- Needs: executive-level questions, private practice, data-driven feedback on blind spots
- Behavior: discovers via LinkedIn/Google, evaluates quality in one session, pays fast if impressed, uses intensively for 2–4 weeks
- Critical features: luxury landing (equates design quality with product quality), no-card trial, role-specific AI, privacy controls
- Device: desktop-primary

> "If this looks like it was designed for interns, I'm closing the tab in 3 seconds."

**Priya Sharma — "The Strategic Climber"**

- 34, Senior PM at a Series C startup, Austin. Preparing for Director promotion interview and exploring external offers.
- Needs: quantified improvement tracking, PM-specific questions, practice at 10pm after kids are in bed
- Behavior: methodical researcher, upgrades to Pro on Day 1, uses 2–3x/week for 6+ weeks, shares with peers
- Critical features: Pro analytics, practice challenges, improvement trends, mobile/tablet experience
- Device: MacBook + iPad

> "I don't just want to practice — I want to measure my improvement week over week."

### B2B Personas

**Dana Whitfield — "The Solo Coach"**

- 41, solo career coach, Denver. Manages 8–12 clients, charges $5K–$8K per package.
- Needs: scale interview prep without burning billable hours, demonstrate measurable ROI, simple admin
- Behavior: evaluates by testing herself first, then 1–2 clients; spends max 5 min/day on admin; price-sensitive on per-seat
- Critical features: frictionless pilot onboarding, per-client progress view, professional-quality AI (reflects on her brand)

> "My clients are paying me $8,000. If I send them to a tool that looks cheap, it undermines everything."

**James Okafor — "The Firm Operator"**

- 52, Managing Director of a 14-person outplacement firm, Atlanta. Serves 200+ candidates/year.
- Needs: scale capacity without hiring, provide corporate clients with engagement data, standardize quality
- Behavior: evaluates on ROI/scalability, pilots with small cohort, expects vendor support, pays via invoice, negotiates volume pricing
- Critical features: bulk invite (CSV), robust client table, exportable reports for corporate clients, priority support

> "Show me the data. If I can't prove ROI to my corporate clients, this doesn't matter."

**Aaliyah Torres — "The Coached Client"**

- 39, former Regional Sales Director, Miami. Laid off via restructuring, assigned Level Up by her outplacement coach.
- Needs: get interview-ready in 2 weeks, specific and actionable feedback, no learning curve
- Behavior: skeptical (didn't choose the tool), uses on mobile between appointments, decides in 5 minutes if it's worth her time
- Critical features: frictionless invite acceptance, mobile-first experience, encouraging tone, immediate value

> "I don't have time to figure out how this works. If it's not obvious in 30 seconds, I'm closing it."

### Persona-to-Feature Priority Matrix

| Feature | Marcus (Exec) | Priya (Climber) | Dana (Coach) | James (Firm) | Aaliyah (Client) |
| --- | --- | --- | --- | --- | --- |
| Luxury landing | Critical | Important | Important | Neutral | N/A (invited) |
| Free trial (no card) | Critical | Important | Critical | Important | N/A |
| Real-time AI interview | Critical | Critical | Important | Important | Critical |
| Role-specific questions | Critical | Critical | Important | Important | Critical |
| TTS (spoken questions) | Nice-to-have | Nice-to-have | Neutral | Neutral | Nice-to-have |
| Score & feedback | Critical | Critical | Important | Critical | Critical |
| Improvement analytics | Important | Critical | Important | Critical | Neutral |
| PDF/CSV/JSON export | Important | Critical | Neutral | Critical | Neutral |
| Practice challenges (Pro) | Neutral | Critical | Neutral | Neutral | Neutral |
| Admin dashboard | N/A | N/A | Critical | Critical | N/A |
| Bulk invite (CSV) | N/A | N/A | Neutral | Critical | N/A |
| Client progress table | N/A | N/A | Critical | Critical | N/A |
| Data export (GDPR) | Critical | Important | Important | Critical | Neutral |
| Mobile responsiveness | Important | Critical | Neutral | Neutral | Critical |

### Usage Patterns

| Dimension | Marcus | Priya | Dana | James | Aaliyah |
| --- | --- | --- | --- | --- | --- |
| Discovery | LinkedIn, Google | Slack, peers | Coaching community | Operations team | Coach email invite |
| Device | Desktop | MacBook + iPad | Desktop | Desktop | Mobile (primary) |
| Frequency | 4–5x/week (intensive) | 2–3x/week (steady) | Daily admin (5 min) | Weekly review | 3–4x over 2 weeks |
| Lifecycle | 2–4 weeks | 6+ weeks | Continuous | Continuous | 2–3 weeks |
| Payment | Weekly → Pro | Pro from Day 1 | Annual per-seat | Annual (volume) | N/A (firm pays) |
| Churn trigger | Lands job | Lands promotion | Clients don't use it | Poor ROI data | Lands job |

---

## Goals & Success Metrics

### Primary Goals

1. Deliver a complete B2C trial → paid conversion loop that a user can complete in under 10 minutes
2. Deliver a complete B2B pilot → annual license upgrade loop with multi-client management
3. Create a first-touch experience (landing + sign-in) that feels unmistakably premium — not generic SaaS
4. Ensure full accessibility (WCAG 2.1 AA) and GDPR compliance from Day 1

### Success Metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| B2C trial → paid conversion | &gt;15% within first month | Stripe payment events / signup count |
| B2C time-to-first-interview | &lt;10 minutes from landing | Session timestamp delta |
| B2B pilot → annual conversion | &gt;30% within 45 days of pilot end | License upgrade events / pilot starts |
| Interview completion rate | &gt;70% of started sessions | MockSession complete / create ratio |
| Accessibility compliance | Zero P1 WCAG violations | Automated + manual audit |
| Mobile usability | All flows functional at 375px | QA pass on real devices |

---

## Solution Overview

### Platform Structure

A web application with two distinct but connected experiences:

- **Public-facing pages:** Luxury-grade landing (B2C + separate B2B landing), signup, login, and legal pages. The landing experience is the primary brand differentiator — blending cinematic typography, parallax motion, subtle 3D elements, and scroll-triggered animations to create an intentionally premium first impression.

- **B2C product:** Self-serve dashboard where individuals upload their resume, specify target roles, and enter real-time conversational mock interviews with an AI interviewer (powered by Anthropic Claude). The AI asks questions one at a time, listens to the user's spoken response, dynamically generates follow-up questions, and delivers scored feedback with actionable improvement tips after each session.

- **B2B admin product:** A coach-facing dashboard for managing client cohorts — inviting clients via email, tracking individual and aggregate interview performance, managing licenses, and controlling data retention policies.

### AI Interview Engine (Anthropic Claude)

- **Question generation:** Tailored to the user's resume, target role, and job context. Questions adapt in real-time based on responses.
- **Delivery mode:** User-configurable — AI questions can be delivered via text-to-speech (spoken aloud) or displayed as text. Users toggle between modes in session settings.
- **Scoring:** Role-specific scorecards with category breakdowns (communication, technical depth, leadership, etc.). Scores are numeric with qualitative explanations.
- **Feedback:** Expandable suggestion cards with specific improvement tips and recommended focus areas.

### Monetization

| Plan | Audience | Price | Duration | Trial |
| --- | --- | --- | --- | --- |
| Free Trial | B2C | $0 | 1 mock interview | No card required |
| Weekly Unlimited | B2C | $29/week | 7 days, optional auto-renew | After free mock |
| Pro | B2C | $199/quarter | 3 months | $29 credit if upgrading from Weekly |
| Team Pilot | B2B | $0 | 1 month, up to 2 clients | No card required |
| Annual License | B2B | Per-seat (price TBD) | 12 months, unlimited clients | After pilot |

- B2C Weekly plan defaults to no auto-renew. Users can opt in to weekly recurring billing.
- B2C Pro tier unlocks additional features: deeper analytics, advanced report history, priority support, and practice challenges (e.g., "Ready for a C-level mock?").
- B2B annual pricing is per-seat, scaling with the number of clients the coach manages.

---

## User Experience

### Flow 1: B2C Free Trial → Upgrade

1. **Landing & Discovery**

   - User arrives at the B2C landing page (from LinkedIn, Google, or referral)
   - Sees cinematic hero with value proposition, animated typography, and parallax scroll
   - Clear "Start Free Mock Interview" CTA — no credit card required
   - Pricing summary, demo video, FAQ section, privacy/terms links visible on scroll

2. **Signup (Multi-Step)**

   - Step 1: Email + password (or SSO via Clerk)
   - Step 2: Plan selection (defaults to Free Trial)
   - Step 3: Privacy consent checkbox + terms acknowledgment
   - Form auto-saves progress; fully keyboard navigable

3. **First Interview**

   - User lands on `/dashboard` with prominent "Start Your Free Mock Interview" CTA
   - Inputs resume text and/or uploads resume file, specifies target job role and context
   - System creates a session and navigates to the interview player
   - AI interviewer greets user, asks first tailored question (text or spoken, user's choice)
   - User responds via browser microphone; AI listens, processes, asks dynamic follow-up
   - Conversation continues for \~15–25 minutes (configurable by session type)
   - User submits session; loading state while AI processes all responses

4. **Feedback & Scoring**

   - Role-specific scorecard: overall score + category breakdowns (communication, technical, leadership, etc.)
   - Expandable AI suggestion cards with specific improvement tips
   - "Next steps" section with recommended focus areas
   - Download options: PDF report, CSV data, or JSON export (user chooses format)

5. **Upgrade Prompt**

   - After free mock completes, dashboard shows upgrade banner: "Get unlimited practice for $29/week"
   - Stripe Checkout for Weekly ($29) or Pro ($199/quarter) plan
   - Dashboard state updates immediately on payment success — no page reload needed
   - Pro tier unlocks: deeper analytics, advanced report history, priority support, practice challenges

6. **Ongoing Use**

   - Weekly plan: optional auto-renew toggle in account settings (default off)
   - After 7 days without renewal: access expires, nudge to upgrade to Pro
   - Dashboard tracks improvement over time, session history, and recommended focus areas
   - Pro users receive practice challenges ("Ready for a C-level mock?")

### Flow 2: B2B Pilot Onboarding → Annual License

1. **Discovery**

   - Coach arrives at dedicated B2B landing page (`/for-teams`)
   - Value proposition: "Supercharge your interview coaching — unlimited data-driven practice for your clients"
   - CTA: "Start Free Team Pilot" — no credit card required
   - Can also request a live/recorded demo

2. **Admin Account Creation**

   - Coach enters company email, creates admin account
   - System starts 1-month no-payment trial with pilot banner visible at all times
   - Coach lands on `/admin/dashboard` with onboarding guidance

3. **Client Onboarding (Trial: 2 Clients)**

   - Admin clicks "Invite Client" → enters client email(s)
   - System sends invite emails (console-logged for MVP, real email post-launch)
   - Clients receive custom invite link, create their own accounts, confirm email
   - Client accounts are linked to the coach's organization
   - Admin sees client activation status in real-time

4. **Trial Monitoring**

   - Admin dashboard shows: active clients, pending invites, mocks completed, usage counters
   - Trial countdown banner with days remaining
   - Automated upgrade reminders as trial nears expiration
   - Summary report generated as trial approaches end

5. **Upgrade to Annual License**

   - Admin sees: "Upgrade to keep clients' progress and open unlimited slots"
   - Stripe Checkout for per-seat annual license
   - On payment: bulk invite unlocked, advanced reporting enabled, team permissioning active
   - Admin can add/remove clients, export group reports, view comparative analytics

6. **Ongoing Management**

   - License renewals, team expansion, seat management
   - Toggle between individual client dashboards and aggregate stats
   - Data retention policy configuration (30/90/180 days) with compliance advisory
   - Export or permanently erase client data as needed

### Flow 3: B2B Client Removal

When an admin removes a client from their organization:

- Admin sees a modal with two options:
  - **Remove access only** — client loses org access but retains their personal account and interview history as a standalone user
  - **Remove access + delete data** — client loses access and their data is scheduled for deletion per the org's retention policy (30/90/180 days)
- Both actions are logged in the AuditLog

### Flow 4: Data & Account Control

1. Any user navigates to Account Settings
2. **Export Data** — modal offers format choice: JSON (full data), CSV (tabular), or PDF (human-readable summary). Download triggers immediately.
3. **Delete Account** — confirmation modal with retention period selector (30/90/180 days). Clear, accessible language explains what happens and when data is permanently erased.
4. B2B admins see additional "Manage Data Retention Policy" control — sets default retention for all org users. Dashboard reflects changes with compliance advisory text.

### User Journey Touchpoints

| Touchpoint | User Type | Page | Action | State Change |
| --- | --- | --- | --- | --- |
| Landing hero | B2C/B2B | `/landing` or `/for-teams` | View value prop, CTA click | → Signup |
| Signup form | B2C/B2B | `/signup` | Complete email, plan, consent | → Dashboard or Admin |
| Login | Returning | `/login` | Email/password, SSO, 2FA | → Dashboard/Admin |
| Dashboard home (first visit) | B2C | `/dashboard` | "Start Free Mock" CTA | → Resume input |
| Resume/context input | B2C | `/dashboard` | Text + optional file upload | → Session created |
| Interview player | B2C/Client | `/interview/:sessionId` | Mic access, record, respond | → Feedback view |
| Feedback review | B2C/Client | Post-session | View scores, download | → Upgrade prompt |
| Stripe Checkout | B2C | Embedded | Select plan, pay | → Access unlocked |
| Admin dashboard | B2B Admin | `/admin/dashboard` | View pilot status, usage | → Invite or upgrade |
| Invite modal | B2B Admin | `/admin/dashboard` | Enter client email(s) | → Invite sent |
| Client table | B2B Admin | `/admin/clients` | Sort, filter, manage | → Client updated |
| Reports | B2B Admin | `/admin/reports` | View analytics | → Insights |
| Account settings | All | `/settings` | Edit, export, delete | → Data action |

### Key UX Differences: B2C vs. B2B

| Feature | B2C (Individuals) | B2B (Coaches/Firms) |
| --- | --- | --- |
| Entry path | Public landing, one-click trial | Dedicated `/for-teams` landing |
| First action | Self-serve interview | Set up dashboard, add clients |
| Trial structure | 1 free mock, self-onboarding | 1 month, up to 2 clients per org |
| Payment/Upgrade | Immediate; optional auto-renew | Manual admin upgrade, annual per-seat |
| Dashboard | Personal history/performance | Multi-client admin, bulk reports |
| Feedback/Analytics | Personal role-level feedback | Client-by-client + cohort analytics |
| Privacy & Access | User controls own data, export | Firm controls client data, export |
| Support | Standard/self-serve | Priority or account-managed |

---

## Requirements

### Landing & Public Pages

- [ ] B2C landing page (`/landing`) with luxury first-touch: cinematic animated typography, parallax scroll layers, subtle 3D/WebGL hero element, scroll-triggered fade-ins and reveals

- [ ] Separate B2B landing page (`/for-teams`) with coach-focused value proposition, pilot CTA, and demo request option

- [ ] Both landings include: pricing summary, demo video embed, FAQ accordion, privacy/terms links

- [ ] Multi-step signup form with auto-save, full keyboard accessibility, and zod validation

- [ ] Login with email/password, SSO, and optional 2FA (via Clerk)

- [ ] Static `/privacy` and `/terms` pages

- [ ] Logged-in routing: B2C users → `/dashboard`, B2B admins → `/admin/dashboard`

- [ ] All public pages responsive at 375px mobile width

- [ ] Once user enters the core product, design returns to clean/minimal — "wow factor" is concentrated on first-touch pages

### B2C Dashboard & Interview

- [ ] Dashboard shows: first-mock CTA (trial users), resume/job-context input, session history with feedback summaries, upgrade prompts (post-trial)

- [ ] Real-time conversational interview player:

  - Browser microphone access (MediaRecorder API)
  - AI asks questions one at a time; dynamically generates follow-ups based on user responses
  - User-configurable question delivery: text-to-speech (spoken) or text display — toggle available in session settings
  - Visual progress indicator, waveform display during recording
  - Submit/complete states with loading feedback
  - Audio upload to object storage (20MB limit, progress bar)
  - Full keyboard navigation and screen reader cues

- [ ] AI feedback review panel: role-specific scorecards, category breakdowns, expandable suggestion cards, improvement tips

- [ ] Download/export: user chooses format (PDF, CSV, or JSON) via modal

- [ ] Stripe Checkout for Weekly ($29, optional auto-renew) and Pro ($199/quarter with $29 credit)

- [ ] Dashboard reflects unlocked access immediately after payment — no reload

### B2B Admin Dashboard

- [ ] Pilot status banner with trial countdown (days remaining)

- [ ] Team overview: active clients, pending invites, total mocks, usage counters

- [ ] "Invite Client" action → email invite modal (single or bulk via CSV/multi-email)

- [ ] Client table: sortable/filterable with columns for name, email, status, mocks completed, last active. In-row actions: resend invite, remove client

- [ ] Client removal modal with two options: remove access only, or remove access + delete data

- [ ] Reports page: active users, session counts, average scores, per-client breakdown (keep simple — no heavy charting libraries)

- [ ] License management wizard: current plan, seat count, renewal date, Stripe upgrade flow

- [ ] Upgrade prompt visible throughout trial

### Pro Tier Features (B2C $199/quarter)

- [ ] Deeper analytics: trend charts showing score improvement over time

- [ ] Advanced report history: access to all past session details and feedback

- [ ] Practice challenges: system-generated prompts ("Ready for a C-level mock?", "Try a behavioral round")

- [ ] Priority support indicator in account settings

### Account & Compliance

- [ ] Account settings: profile editing (via Clerk), auto-renew toggle (B2C Weekly)

- [ ] Data export: modal with format choice (JSON, CSV, PDF). Download triggers immediately.

- [ ] Account deletion: confirmation modal, retention period selector (30/90/180 days), clear language

- [ ] B2B admin: data retention policy management per org with compliance advisory

- [ ] AuditLog captures: account deletion, data export, role changes, client removal, payment events, retention policy changes

- [ ] WCAG 2.1 AA compliance: keyboard navigation, screen reader support (VoiceOver, NVDA), 4.5:1 color contrast, ARIA labels, focus management on modals

- [ ] All pages render correctly at 375px mobile width; sidebar collapses to hamburger menu

### Navigation

- [ ] Public top nav: Pricing, Login/Signup, Legal links

- [ ] Authenticated sidebar: Dashboard, Reports, Team/Users, Settings

- [ ] Sidebar collapses to menu icon on mobile

- [ ] All dashboard, admin, and interview pages require authentication

- [ ] All invite recipients must confirm email before accessing sessions

---

## Design & Visual Direction

### Design Philosophy

The product must convey **luxury, innovation, and exclusiveness** — especially during the first-touch experience. The general design system stays minimal and highly usable, but the very first interaction should feel "intentionally different" from generic SaaS, blending professionalism and a subtle sense of futuristic design.

This distinction is a direct conversion lever: Marcus (B2C executive) equates design quality with product quality. Dana (B2B coach) won't recommend a tool to $8K clients if it looks cheap. The luxury landing isn't vanity — it's a trust signal for a premium-positioned product.

### First-Touch (Landing + Sign-In)

The aesthetic references:

- Modern luxury car dashboard interfaces
- Boutique hotel booking experiences
- High-design tech showcases (e.g., Apple product pages)

**Animation approach — a blend of all three motion styles:**

- **Cinematic typography** — large-scale animated text with staggered reveals, letter/word-by-word transitions. Primary hero treatment.
- **Subtle parallax + fade-ins** — smooth scroll-triggered animations, layered depth on scroll sections (pricing, FAQ, testimonials).
- **3D/WebGL hero element** — abstract sculptural or particle-based element in the hero for high wow-factor. Lightweight enough to maintain fast load times.

### Design System & Tokens

**Color Palette:**

| Token | Value | Usage |
| --- | --- | --- |
| Background primary | `#111` / `#0E0E0E` | Page backgrounds |
| Background secondary | `#191919` / `#141418` | Cards, component surfaces |
| Text primary | `#F5F5F5` | Headings, body text |
| Text secondary | `rgba(255, 255, 255, 0.5)` | Subtext, descriptions |
| Text muted | `rgba(255, 255, 255, 0.25–0.4)` | Labels, captions |
| Border | `rgba(255, 255, 255, 0.08)` | Card borders, dividers (0.5px) |
| Border hover | `rgba(255, 255, 255, 0.15)` | Interactive element hover |
| Glow | `rgba(255, 255, 255, 0.06)` | Radial gradients for depth |
| Interactive hover bg | `#E8E8E8` | Button hover (primary variant) |

No bright or playful colors. Dark, muted, sophisticated. Error/success/warning semantic colors to be defined during implementation.

**Typography:**

| Element | Size | Weight | Details |
| --- | --- | --- | --- |
| H1 (Hero) | 40px | 700 | line-height 1.15, letter-spacing -0.02em |
| Overline/Label | 11px | 600 | uppercase, letter-spacing 0.08–0.1em |
| Body | 15px | 400–600 | line-height 1.6 |
| Small/Caption | 13px | 500 | Metadata, timestamps |
| Font family | `"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |  | Anti-aliased rendering |

**Spacing & Layout:**

- Content max-width: 960px, centered
- Horizontal gutter: 40px
- Vertical rhythm: 16px / 24px (component), 64px / 80px (section)
- Component gap: 12px / 16px
- Border radius: 8px (buttons), 12px (cards)
- Transitions: 150ms ease (opacity, hover states)

**Responsive:**

- Primary breakpoint: 375px (mobile-first QA target)
- Sidebar collapses to hamburger at mobile widths
- Feature grid: 3-column → 1-column on mobile (16px gap)

### Component Library

Built on **shadcn/ui + Tailwind CSS**, extending with these product-specific components:

| Component | Purpose | Notes |
| --- | --- | --- |
| Button | Primary (solid light bg, dark text), Outline (transparent, light border) | 36px height, 16px horizontal padding |
| Card | Feature cards, session cards, feedback cards | Optional label + title + body, 24px padding |
| Multi-step Form | Signup, onboarding | Step indicators, auto-save, ADA-compliant |
| Data Table | Admin client list, session history | TanStack Table — sort, filter, search, inline actions |
| Interview Player | Audio recording interface | Waveform, progress indicator, question display |
| Scorecard | Feedback results | Overall score + category breakdowns |
| Suggestion Card | AI feedback | Expandable, actionable tips |
| Modal | Invites, data export, deletion confirmation | Dismissable, focus-trapped |
| Sidebar Nav | Authenticated navigation | Collapsible on mobile |
| Status Badge | Invite/trial/license status | pending/active/expired states |
| Banner | Pilot countdown, upgrade prompts, trial status | Persistent, dismissable |
| Progress Bar | Audio upload, form steps | Determinate with percentage |
| Toast | Success/error notifications | Auto-dismiss, accessible |

### Core Product (Post-Login)

Once inside the product, the interface returns to **clean, unobtrusive, thoughtful** design:

- Minimal chrome, generous whitespace
- Clear information hierarchy
- Consistent component patterns (shadcn/ui)
- Motion limited to functional micro-interactions (hover states, loading indicators, transitions)
- Dark theme maintained throughout — consistent with landing aesthetic but without the theatrical motion

### Design Principles (Derived from Persona Research)

1. **Quality signals trust.** Marcus and Dana equate design quality with product quality. The luxury first-touch isn't vanity — it's a conversion lever.
2. **Prove value in the first session.** Aaliyah didn't choose this tool. Priya is evaluating alternatives. The free trial must deliver undeniably specific feedback on the very first mock.
3. **Respect time fragmentation.** Sessions should feel complete in 15–20 minutes. UI loads fast on any device.
4. **Data is currency.** Scoring and analytics aren't nice-to-haves — they're why personas pay.
5. **Privacy isn't a checkbox.** Data export, deletion, and retention controls must feel trustworthy and be genuinely functional.

---

## Technical Architecture

### Tech Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Framework | Next.js 14 (App Router) + TypeScript | Server components, API routes, Vercel-optimized |
| Database | Supabase Postgres | Managed Postgres with built-in auth hooks and storage |
| ORM | Prisma | Type-safe database access, migrations, seeding |
| Authentication | Clerk (SOC2-ready) | 2FA, SSO, robust session management, Vercel integration |
| Payments | Stripe (Checkout + Webhooks) | Industry standard, B2C subscriptions + B2B invoicing |
| Hosting | Vercel | Edge deployment, preview deployments, Next.js native |
| UI Library | shadcn/ui + Tailwind CSS | Accessible primitives, utility-first styling, dark theme |
| Forms | react-hook-form + zod | Performant forms with schema validation |
| Tables | TanStack Table (react-table) | Sorting, filtering, pagination for admin views |
| Dates | date-fns | Lightweight date formatting and manipulation |
| File Storage | Supabase Storage | Audio files, 20MB limit per session |
| AI Engine | Anthropic Claude API | Question generation, response scoring, conversational follow-up |

### Application Architecture

```
src/app/
  (public)/                — Landing pages, login, signup, privacy, terms
    landing/               — B2C landing (luxury first-touch)
    for-teams/             — B2B landing (coach-focused)
    login/                 — Clerk-powered login + SSO + 2FA
    signup/                — Multi-step onboarding form
    privacy/               — Static compliance page
    terms/                 — Static compliance page
  (dashboard)/             — B2C authenticated routes
    dashboard/             — Session history, resume input, trial/upgrade state
    interview/[sessionId]/ — Real-time interview player
    settings/              — Account, billing, data controls
  (admin)/                 — B2B admin authenticated routes
    admin/dashboard/       — Pilot status, team overview, license management
    admin/clients/         — Client table with invite management
    admin/reports/         — Usage analytics and engagement summary
    admin/settings/        — Org settings, data retention policy
  api/                     — API route handlers
    auth/                  — Clerk webhook sync
    mock/                  — Session create/complete
    feedback/              — AI scoring retrieval
    invite/                — Create/accept invites
    org/                   — License and retention management
    data/                  — Export and deletion
    payment/               — Stripe checkout
src/components/
  ui/                      — shadcn/ui primitives (Button, Card, Input, Modal, etc.)
  shared/                  — TopNav, Sidebar, Footer, Layout wrappers
  interview/               — InterviewPlayer, AudioRecorder, FeedbackPanel, Scorecard
  admin/                   — ClientTable, InviteModal, LicenseWizard, ReportsView
  onboarding/              — MultiStepForm, PlanSelector, PrivacyConsent
prisma/
  schema.prisma            — 7 entities
  seed.ts                  — Test data for acceptance testing
lib/
  ai/                      — Anthropic Claude integration (question gen, scoring)
  stripe/                  — Checkout session creation, webhook handling
  supabase/                — Storage client, signed URL generation
  auth/                    — Clerk middleware, role-based access helpers
```

### Data Model

7 entities with the following relationships:

- Users belong to Organizations (optional for B2C)
- Organizations have many Users, Invites, Payments, and one DataRetentionPolicy
- Each MockSession links to a User and optionally an Organization
- Audio files stored in Supabase Storage, referenced by URL in MockSession

```
User
  id              uuid        PK
  email           string      unique
  hashed_password string
  role            enum        [admin, coach, end_user]
  org_id          uuid?       FK → Organization (nullable for B2C)
  stripe_id       string
  trial_status    enum        [active, expired, paid]
  privacy_accepted boolean
  created_at      timestamp
  last_active     timestamp

Organization
  id                      uuid    PK
  name                    string
  admin_id                uuid    FK → User
  license_type            enum    [solo, team]
  pilot_start             timestamp
  pilot_end               timestamp
  current_license_status  enum    [trial, active, expired]

MockSession
  id              uuid    PK
  user_id         uuid    FK → User
  org_id          uuid?   FK → Organization (nullable)
  created_at      timestamp
  resume_data     json    — parsed resume content
  job_context     json    — target role, company, level
  audio_url       string  — Supabase Storage reference
  feedback        json    — AI-generated scoring and suggestions
  score           int     — overall score (0–100)

Invite
  id              uuid    PK
  org_id          uuid    FK → Organization
  email           string
  status          enum    [pending, activated]
  sent_at         timestamp
  expires_at      timestamp

Payment
  id              uuid    PK
  user_id         uuid?   FK → User (nullable)
  org_id          uuid?   FK → Organization (nullable)
  stripe_charge_id string
  amount          int     — cents
  period          string  — "weekly", "quarterly", "annual"
  status          enum    [pending, succeeded, failed]
  created_at      timestamp

AuditLog
  id              uuid    PK
  user_id         uuid    FK → User
  action          string  — "account_deleted", "data_exported", "client_removed", etc.
  timestamp       timestamp
  target_id       uuid    — entity being acted upon
  details         json    — additional context

DataRetentionPolicy
  org_id                  uuid    PK, FK → Organization
  user_retention_days     int     — 30, 90, or 180
  admin_id                uuid    FK → User
```

**Seed data:** 2 B2B test organizations, 1 B2C test account, 5 mock interview sessions with sample feedback JSON for acceptance testing.

### API Endpoints

| Endpoint | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/auth/*` | Various | Signup, login, 2FA via Clerk webhooks | Public/Clerk |
| `/api/mock/create` | POST | Start new interview session with resume + job context | User |
| `/api/mock/:id/complete` | POST | Submit session, trigger AI processing | User |
| `/api/feedback/:sessionId` | GET | Fetch AI analysis, scores, suggestions | User |
| `/api/invite/create` | POST | Create client email invite(s) | Admin |
| `/api/invite/accept` | POST | Accept invite, activate account, link to org | Public (token) |
| `/api/org/license` | GET/POST | License status check and upgrade trigger | Admin |
| `/api/org/retention` | GET/PUT | Data retention policy CRUD | Admin |
| `/api/data/export` | POST | Export user data in chosen format (JSON/CSV/PDF) | User |
| `/api/data/delete` | POST | Initiate account deletion with retention window | User |
| `/api/payment/checkout` | POST | Create Stripe Checkout session (B2C or B2B) | User/Admin |

### Authentication & Authorization

- **Clerk** manages all identity, session, and 2FA flows
- Clerk webhook syncs user creation to Prisma User table
- Next.js middleware protects authenticated routes:
  - `/dashboard/*` — requires authenticated user with role `end_user` or `coach`
  - `/admin/*` — requires authenticated user with role `admin`
  - `/interview/*` — requires authenticated user with active trial or paid plan
- Invite acceptance requires email confirmation before session access
- Role-based routing: B2C users → `/dashboard`, B2B admins → `/admin/dashboard`

### External Service Dependencies

| Service | Purpose | MVP Approach |
| --- | --- | --- |
| Anthropic Claude API | Question generation + scoring | Stubbed in Phase 2, real in Phase 3 |
| Stripe | Payment processing | Sandbox in dev, live keys at launch |
| Supabase Storage | Audio file storage | 20MB limit, signed URLs |
| Clerk | Authentication | SOC2-ready, production instance at launch |
| Vercel | Hosting | Preview deploys in dev, production at launch |
| Email provider | Invite/notification delivery | Console.log for MVP; provider TBD post-launch |
| TTS provider | Spoken question delivery | TBD — browser native, ElevenLabs, or OpenAI TTS |

---

## Team & Roles

| Role | Responsibilities | Tools |
| --- | --- | --- |
| Designer (Tempo) | Full design system from scratch; first design approved pre-kickoff, remaining screens delivered one phase ahead of dev | Tempo |
| Frontend / Full-stack Dev (Tempo) | Next.js app, Clerk auth, UI implementation, Stripe frontend, Vercel deployment | VS Code, Vercel, GitHub |
| Backend Dev (Client) | Supabase/Prisma schema, API endpoints, AI integration, data/compliance logic | VS Code, Supabase, GitHub |

- 3-person Tempo team + 1 full-time client-side backend developer
- Designer stays one phase ahead of development throughout
- Client backend resource is experienced; no ramp-up time assumed
- PM manages UAT, feedback triage, and change requests

---

## Out of Scope (MVP)

- Native mobile applications (iOS/Android) — web-only, responsive
- SMS or push notifications — text alerts and console-logged emails only
- Webhook queuing infrastructure — Stripe/AI webhooks handled synchronously
- Enterprise SSO or white-labeling
- Deep cohort analytics or advanced charting (beyond simple summary stats)
- Real email delivery — invites and confirmations are console-logged for MVP; production email provider selected post-launch
- Video recording — audio only for MVP interview sessions
- Multi-language support
- Custom branding for B2B firms

---

## Open Questions

1. **B2B per-seat pricing:** Exact price per seat per year is TBD. Needs market validation or client input before Stripe products are configured. What is the target range?
2. **Interview session length:** The PRD assumes \~15–25 minutes for a conversational interview. Should this be configurable by the user, fixed, or role-dependent?
3. **AI scoring categories:** The specific scoring dimensions (communication, technical depth, leadership, etc.) need to be defined with the AI prompt engineering. Are there required categories from the client?
4. **TTS provider:** For spoken question delivery, which text-to-speech service should be used? (Browser native, ElevenLabs, OpenAI TTS, etc.)
5. **Demo video:** The landing page specs call for a demo video embed. Does this exist yet, or does it need to be produced?
6. **B2B branded invites:** The source doc mentions clients receive "custom invites (branded if desired)" — is any level of branding in scope for MVP, or is this post-launch?
7. **Resume parsing:** Should the system extract structured data from uploaded resume files (PDF parsing), or is manual text input sufficient for MVP?
8. **Concurrent session limits:** Can a user have multiple interview sessions open simultaneously, or one at a time?

---

## Assumptions

| Assumption | Confidence |
| --- | --- |
| First design (landing page) is approved and available before development starts | High — confirmed in source docs |
| Client backend developer is full-time and experienced; no ramp-up needed | High — stated in PRD |
| Anthropic Claude API is accessible and performant enough for real-time conversational interviews | Medium — needs validation in Phase 2 |
| Browser MediaRecorder API works reliably across Chrome, Safari, and Firefox for audio capture | Medium — Safari support has known quirks |
| 20MB audio file size limit is sufficient for a 15–25 minute interview session | Medium — depends on codec/bitrate |
| Console-logged emails are acceptable for MVP invite/notification flows | High — explicitly stated |
| Per-seat B2B pricing will be determined before Phase 3 Stripe configuration | Medium — needs client input |
| Users are comfortable with AI-conducted interviews (no human interviewer option needed for MVP) | Medium — assumption from market research |

---

## Project Phases & Milestones

| Phase | Deliverables | Duration |
| --- | --- | --- |
| **Phase 0** | Next.js migration, Prisma schema, Clerk/Stripe/Vercel setup, seed data | Week 1 |
| **Phase 1** | B2C landing, B2B landing, signup, login, legal pages, Clerk auth wired | Weeks 2–3 |
| **Phase 2** | B2C dashboard, real-time interview player, audio capture, AI feedback (stubbed), Stripe B2C | Weeks 4–5 |
| **Phase 3** | B2B admin dashboard, client table, invite system, reports, Stripe B2B annual, real AI integration | Weeks 6–7 |
| **Phase 4** | Account settings, data export/delete, retention policy, AuditLog, accessibility audit, responsive QA | Week 8 |
| **Phase 5** | End-to-end integration testing, UAT with Silva Vitalis, bug triage, mobile + cross-browser QA | Weeks 9–10 |
| **Phase 6** | Bug fixes, polish, Vercel production deployment, Stripe live keys, monitoring, launch sign-off | Week 10 |

| Milestone | Definition of Done |
| --- | --- |
| **M1 — Dev Starts** | Repo scaffolded, environments live, DB schema + seed data operational (Week 1) |
| **M2 — Auth & Scaffold** | /landing, /for-teams, /login, /signup on staging with Clerk auth (Week 3) |
| **M3 — B2C Complete** | Full B2C trial → interview → feedback → Stripe upgrade on staging (Week 5) |
| **M4 — B2B Complete** | B2B pilot → invite → admin dashboard → Stripe annual license on staging (Week 7) |
| **M5 — Compliance Pass** | Data export/delete, retention, WCAG 2.1 AA audit complete (Week 8) |
| **M6 — UAT Signoff** | Client UAT passed, all P1/P2 bugs resolved (Week 9–10) |
| **M7 — Production Launch** | Live on Vercel, Stripe live keys, monitoring active (Week 10) |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| AI latency makes real-time conversation feel sluggish | Medium | High | Stub AI in Phase 2; validate Anthropic Claude response times; design loading states that feel intentional |
| Browser audio/mic incompatibility (especially Safari) | Low | High | Test across Chrome/Safari/Firefox in Phase 2; build file-upload fallback |
| Scope creep beyond MVP boundaries | High | High | This PRD is the north star; formal change request process for any additions |
| Client feedback delay (&gt;48 hours during UAT) | Medium | Medium | PM sets 48hr SLA at kickoff; async Loom walkthroughs reduce sync overhead |
| Design delivery falls behind dev pace | Medium | Medium | First design approved pre-kickoff; designer stays one phase ahead |
| TTS quality doesn't meet luxury brand expectations | Medium | Medium | Offer text-only as default; TTS as opt-in enhancement; evaluate providers early |
| 20MB audio limit insufficient for longer sessions | Low | Medium | Test with real recordings; adjust limit or implement compression if needed |

---

## Acceptance Criteria

### B2C Flow

- User can sign up, complete 1 free mock interview with real-time AI conversation, see scored feedback, and upgrade to Weekly plan via Stripe — all in under 10 minutes
- Interview supports both text and spoken (TTS) question delivery, togglable by user
- Dashboard reflects unlocked access immediately after payment
- Pro tier unlocks deeper analytics, report history, practice challenges
- All steps accessible via keyboard; screen-reader tested

### B2B Flow

- Admin can create account on B2B landing, start 1-month pilot, invite 2 clients, track activation status and usage in `/admin/dashboard`
- Client removal offers choice: access-only removal or access + data deletion
- Payment upgrades license and unlocks bulk invite + reporting immediately
- Data retention policy configurable (30/90/180 days) with compliance advisory

### Technical

- All pages render correctly at 375px mobile width
- Audio upload completes within 20MB limit with progress feedback
- Zero P1 accessibility violations (WCAG 2.1 AA) on core flows
- Data export available in JSON, CSV, and PDF formats
- All destructive actions logged in AuditLog
- Staging seed data passes all acceptance test scenarios

---

## Accessibility Requirements (WCAG 2.1 AA)

Accessibility is a first-class requirement, not a polish pass. All core flows must meet WCAG 2.1 AA before UAT.

| Requirement | Standard | Validation |
| --- | --- | --- |
| Keyboard navigation | All interactive elements reachable and operable via keyboard | Manual testing on all pages |
| Screen reader support | Semantic HTML, ARIA labels, live regions for dynamic content | VoiceOver (macOS/iOS) + NVDA (Windows) |
| Color contrast | Minimum 4.5:1 for normal text, 3:1 for large text | Automated audit (axe-core or Lighthouse) |
| Focus management | Visible focus indicators, focus trapped in modals, returned on close | Manual testing |
| Form accessibility | Labels linked to inputs, error messages announced, auto-save state communicated | Screen reader testing |
| Interview player | Audio controls labeled, recording state announced, question text always available as alternative to TTS | Manual testing |
| Motion sensitivity | Respect `prefers-reduced-motion` — disable parallax, 3D, and cinematic animations | CSS media query |
| Touch targets | Minimum 44x44px for all interactive elements on mobile | Responsive QA at 375px |

---

## Change Management

Any request to add, remove, or substantially alter scope after kickoff requires a **written change request** reviewed by the PM. The PM will assess timeline and cost impact and present options within 2 business days. Approved changes are tracked with updated milestone dates communicated to all stakeholders.

This PRD is the north star for the 10-week build. All work should trace back to a requirement documented here.

---

## Appendix: Related Documents

| Document | Location | Purpose |
| --- | --- | --- |
| Product Roadmap | [roadmap.md](./roadmap.md) | Phase-by-phase implementation plan with task checklists |
| User Personas | [user-personas.md](./user-personas.md) | Full persona profiles with bios, behaviors, quotes, and design implications |
| Competitor Analysis | [competitor-analysis.md](./competitor-analysis.md) | 10 competitor profiles, feature matrix, 12 UX gaps, strategic positioning |
| User Journeys & IA | [user-journey-and-ia.md](./user-journey-and-ia.md) | Sitemap, navigation model, 7 user journeys, state machines, page inventory |
| Brand Strategy & Identity | [branding-guide.md](./branding-guide.md) | Positioning, voice & tone, visual identity, color system, typography, motion, messaging |
| Source PRD (Contractor) | External PDF | Original product definition from Silva Vitalis LLC |
| Source PRD (Tempo) | External PDF | Formal PRD with timeline, milestones, and acceptance criteria |

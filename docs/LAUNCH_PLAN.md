# HireStepX — Public Launch Plan

> Created: 2026-04-28 Owner: Founder Status: Draft — review before T-21 day mark Current launch readiness: \~75% Estimated time to launch-ready: 2-3 weeks of focused work (\~25-30 hours of P0 fixes)

This is the master launch plan. Pre-launch, launch day, post-launch tasks prioritized and grounded in the current state of the codebase.

For the audit findings this plan is based on, see the conversation history that produced it (or re-run the audit prompt in `Notes / Audit Methodology`at the bottom).

---

## 🚨 Launch-Blocking Issues (Must fix before going public)

| \# | Issue | Severity | Effort | Status |
| --- | --- | --- | --- | --- |
| 1 | No 3rd LLM fallback (Groq+Gemini outage = app down) | 🔴 Critical | 4 hrs | TODO |
| 2 | No error tracking (Sentry missing) | 🔴 Critical | 2 hrs | TODO |
| 3 | Sitemap has only 3 pages (terrible for SEO) | 🔴 Critical | 1 hr | TODO |
| 4 | No JSON-LD structured data | 🟡 High | 2 hrs | TODO |
| 5 | Zero blog posts (organic traffic engine empty) | 🟡 High | 10 hrs | TODO |
| 6 | Auth device fingerprint not enforced | 🟡 High | 3 hrs | TODO |
| 7 | No status page | 🟡 High | 1 hr | TODO |
| 8 | Refund flow is manual only | 🟢 Med | 4 hrs | TODO |

---

## 🟧 PRE-LAUNCH (T-21 to T-1 days)

### Week 3 Out (T-21 to T-15) — Fix Critical Blockers

#### Reliability

- [ ] Add 3rd LLM fallback (Groq → Gemini → Claude or OpenAI). File: `server-handlers/_llm.ts`

- [ ] Verify Azure TTS is the active fallback chain for Cartesia

- [ ] Install Sentry (free tier covers 5K events/month). Wire into `errorReporter.ts` and `api/log-error.ts`

- [ ] Document Supabase backup policy — confirm point-in-time recovery enabled. Write down RTO/RPO

- [ ] Enforce auth device fingerprint (`SESSION_FP_KEY` exists but isn't validated)

- [ ] Load testing — k6 or Artillery against staging. Target: 100 concurrent interviews without errors

#### SEO

- [ ] Regenerate `public/sitemap.xml` with all marketing pages: `/pricing`, `/blog`, `/blog/*`, `/page/about`, `/page/contact`, `/page/help`, role/company landing variants. Aim for 50+ URLs

- [ ] Add JSON-LD structured data: `Organization`, `WebApplication`, `FAQPage`, `BreadcrumbList`, `Product`, `Article`

- [ ] Verify OG images render correctly on Twitter/LinkedIn/WhatsApp shares

#### Content

- [ ] Publish 5 blog posts before launch:

  1. "How to crack TCS NQT interview in 2026"
  2. "Top 50 behavioral interview questions for Indian freshers"
  3. "Salary negotiation script for ₹15 LPA offer in India"
  4. "Google interview prep for Indian software engineers"
  5. "Campus placement interview guide — top 30 companies"

- [ ] Write FAQ page (`/page/help` is empty placeholder). Cover: pricing, refunds, voice issues, mobile support, data privacy, interview retries

### Week 2 Out (T-14 to T-8) — Polish + Marketing Prep

#### Pricing & Payments

- [ ] Test all 6 Razorpay plans end-to-end with real ₹10 transaction

- [ ] Verify GST invoice URL renders for B2B customers

- [ ] Test refund flow manually

- [ ] Test payment failure scenarios (declined card, network timeout, duplicate submission)

- [ ] Test annual subscription renewal cron (`reset-expired-subscriptions`)

#### Email Deliverability

- [ ] Verify SPF/DKIM/DMARC records via mxtoolbox.com

- [ ] Test welcome email lands in Gmail/Outlook primary inbox via mail-tester.com

- [ ] Test all 5 email templates (welcome, payment, renewal, abandonment, weekly summary)

- [ ] Add unsubscribe link in marketing emails (legal requirement)

#### Marketing Assets

- [ ] Create launch landing page variant for ProductHunt

- [ ] Record 60-second product demo video (Loom)

- [ ] Create 5 testimonial graphics for social media

- [ ] Prepare launch tweet thread (10-12 tweets)

- [ ] Prepare LinkedIn announcement post

- [ ] Prepare WhatsApp launch message for personal network

- [ ] Submit to: ProductHunt, BetaList, Indie Hackers, r/developersIndia, Hacker News

#### Operations

- [ ] Set up status page at status.hirestepx.com — Instatus free tier

- [ ] Create incident response runbook

- [ ] Add `support@hirestepx.com` autoresponder

- [ ] Confirm support email forwards to a human inbox

### Week 1 Out (T-7 to T-1) — Final Polish

#### Analytics & Funnels

- [ ] Set up conversion funnel events: `landing_view` → `signup_start` → `signup_complete` → `onboarding_complete` → `interview_start` → `interview_complete` → `payment_view` → `payment_complete`

- [ ] Set up PostHog or GA4 for deeper analytics

- [ ] Add UTM parameter tracking for launch campaigns

#### QA Pass

- [ ] Mobile QA on real Android device (Chrome): full signup → interview → payment flow

- [ ] Mobile QA on real iPhone (Safari): same flow — Safari TTS quirks are the #1 risk

- [ ] Test on slow 3G (Chrome DevTools throttling)

- [ ] Test with screen reader (VoiceOver/NVDA)

- [ ] Test with adblockers enabled (uBlock, Brave shields)

- [ ] Verify all CTAs work (no dead buttons)

#### Final Checks

- [ ] Verify all environment variables set in Vercel (Razorpay LIVE keys, not test keys!)

- [ ] Verify Razorpay is in live mode

- [ ] Verify Supabase RLS policies enforced (test with two test accounts)

- [ ] Run full Playwright E2E suite against production

- [ ] Review CSP headers — no `unsafe-eval` in prod

- [ ] Verify `robots.txt` doesn't block Google

- [ ] Submit sitemap to Google Search Console + Bing Webmaster Tools

---

## 🟢 LAUNCH DAY (T-0)

### Morning (Pre-Launch — 6 AM IST)

- [ ] Smoke test — Run a real interview end-to-end. Pay ₹10. Cancel subscription. Verify email

- [ ] Verify status page is green

- [ ] Pre-warm caches — hit landing, pricing, blog from your phone

- [ ] Open monitoring dashboards — Vercel logs, Supabase logs, Razorpay dashboard, Sentry, PostHog

### Launch (10 AM IST — peak Indian engagement window)

- [ ] Post launch tweet thread

- [ ] Post LinkedIn announcement

- [ ] Post on r/developersIndia, r/india, r/cscareerquestionsindia

- [ ] Post on Hacker News (Show HN: HireStepX — AI mock interviews for ₹10)

- [ ] Submit to ProductHunt (schedule for 12:01 AM PST = 12:31 PM IST)

- [ ] Send WhatsApp message to personal network (highest conversion channel for early users)

- [ ] Email any waitlist

### Throughout the Day

- [ ] Respond to every comment within 30 minutes (HN/PH algorithms reward this)

- [ ] Monitor error rate every 15 minutes

- [ ] Monitor signup → interview conversion (target: &gt;30%)

- [ ] Monitor payment success rate (target: &gt;85%)

- [ ] Have hotfix branch ready

### Evening Wrap-Up

- [ ] Post day-1 numbers publicly (transparency builds trust)

- [ ] Thank top supporters individually

- [ ] Note common feedback themes

- [ ] Brief "what worked / what didn't" doc

---

## 🔵 POST-LAUNCH (T+1 to T+90 days)

### Week 1 (T+1 to T+7) — Stabilize

#### Immediate Iteration

- [ ] Fix top 3 bugs found by real users in first 24h

- [ ] Fix top 3 confusing UX moments (track via session recordings)

- [ ] Watch payment failures hourly

- [ ] Reply to every support email within 4 hours

#### Metrics to Watch Daily

| Metric | Target |
| --- | --- |
| Signup → onboarding completion rate | &gt;70% |
| Onboarding → first interview rate | &gt;60% |
| Free → paid conversion rate (week 1) | &gt;5% |
| Interview completion rate | &gt;80% |
| Day-1 retention | &gt;40% |
| STT/TTS error rate | &lt;2% |
| LLM error rate | &lt;1% |

#### Customer Listening

- [ ] Post-interview NPS survey (single question: "How likely to recommend?" 0-10)

- [ ] Schedule 5 user interviews (30 min calls with engaged free users)

- [ ] Set up #feedback Slack/Discord channel for users

### Week 2-4 (T+8 to T+30) — Iterate

#### Product Improvements (data-driven)

- [ ] Ship the top 5 most-requested features from week 1 feedback

- [ ] A/B test pricing page copy (use existing feature flags in `src/featureFlags.ts`)

- [ ] A/B test landing hero (vs. company-specific landing variants)

- [ ] Improve weakest funnel step (biggest drop-off)

- [ ] Add session playback if users keep asking for it

#### Marketing Loop

- [ ] Publish 2-3 new blog posts per week

- [ ] Collect testimonials systematically (post-payment email asking for review)

- [ ] Launch referral program UI (backend already exists)

- [ ] Reach out to 10 micro-influencers in Indian career/tech space

- [ ] Pitch to 3 Indian tech publications (YourStory, Inc42, ETtech)

- [ ] Consider Google Ads on high-intent keywords ("TCS interview prep", "Infosys interview questions")

#### Operations

- [ ] Set up cost monitoring — Groq, Cartesia, Deepgram, OpenAI bills. Set budget alerts

- [ ] Monitor unit economics — cost per interview vs. revenue per user

- [ ] If cost per interview &gt; ₹3, optimize (cache common questions, batch LLM calls, cheaper models for simple steps)

### Month 2-3 (T+31 to T+90) — Grow

#### Product

- [ ] Launch mobile-optimized interview UI (currently desktop-first)

- [ ] Launch session video playback (recording exists, playback doesn't)

- [ ] Launch referral dashboard (backend ready, no UI)

- [ ] Add B2B/team plan if 3+ inbound team requests

- [ ] Launch Hindi/regional language support if 10%+ users request it

- [ ] Launch resume gap coaching (feature flag already exists)

#### Growth

- [ ] Launch referral campaign with INR rewards (₹50 credit per converted referral)

- [ ] Partner with 1-2 Indian colleges for placement training (B2B revenue)

- [ ] Launch on Twitter Spaces / LinkedIn Live ("How I built HireStepX" — founder story)

- [ ] Submit to "best of 2026" lists in Indian tech publications

- [ ] SEO: target 50 long-tail keywords with dedicated landing pages

#### Retention

- [ ] Re-engagement email cron is already running — verify open rates &gt;25%

- [ ] Add weekly digest email ("Your interview readiness this week")

- [ ] Add streak gamification push (already in dashboard — push to email)

- [ ] Add "interview is in 7 days" reminder cron

#### Financial

- [ ] Reconcile Razorpay payouts vs. Supabase records weekly

- [ ] Calculate MRR, ARR, CAC, LTV monthly

- [ ] If MRR &gt; ₹50K/mo, consider raising prices on premium tier

- [ ] Plan Q2 fundraising if MRR &gt; ₹2L/mo (otherwise stay bootstrapped)

---

## 📊 Launch Success Metrics

| Metric | Day 1 | Week 1 | Month 1 | Month 3 |
| --- | --- | --- | --- | --- |
| Signups | 100 | 500 | 2,000 | 10,000 |
| Activated users (completed first interview) | 40 | 250 | 1,200 | 6,500 |
| Paying users | 5 | 30 | 150 | 800 |
| MRR | ₹500 | ₹3K | ₹15K | ₹80K |
| Day-1 Retention | — | 40% | 45% | 50% |
| NPS | — | — | 30+ | 40+ |
| Uptime | 99.5% | 99.5% | 99.7% | 99.9% |

These are realistic targets for an Indian SaaS launching in the career/edtech space. Hitting Month 3 numbers = product-market-fit signal.

---

## 💡 Key Decisions Needed

1. **Launch channel priority** — ProductHunt? Hacker News? LinkedIn? All three?
2. **Initial pricing** — Stick with current ₹10/session and ₹149/mo, or test launch promo (50% off month 1)?
3. **Geography** — India-only at launch or accept international users? (UPI is India-only)
4. **Launch timing** — March is competitive (placement season ends). May-June is ideal (campus placements + appraisal hike season)
5. **Founder commitment** — Are you available 14 hours/day for the first 7 days post-launch?

---

## ✅ Current State Summary (as of 2026-04-28)

### GREEN (production-ready)

- Razorpay payments (HMAC verification, dedup, prorated upgrades, GST invoicing)
- Email infrastructure (Resend, templated, logged)
- CI/CD (TypeScript check, ESLint, vitest coverage gates, Playwright E2E, bundle size cap)
- Service Worker (smart caching, offline support for interviews)
- Pricing & legal pages (Terms 692 words, Privacy 682 words, Refund 66 words)
- Uptime monitoring cron (every 6 hours)
- 7 production crons configured (renewal reminders, expiry resets, re-engagement, cleanup, abandonment, weekly summary, uptime)
- Feature flag system (`src/featureFlags.ts`) — ready for A/B testing
- IDB cleanup (auto-runs on startup via `cleanupStaleIDB`)
- Support widget in dashboard
- TTS-caption sync (Azure → Cartesia WS → Cartesia REST → Browser)

### YELLOW (works but incomplete)

- Monitoring (uptime check only, no error tracking)
- SEO (3-page sitemap, no JSON-LD)
- Auth (fingerprint exists but not enforced)
- Refund flow (manual via Razorpay dashboard)
- STT accuracy (Indian accents — Deepgram → Sarvam → Web Speech fallback exists; transcript edit UI added)

### RED (must fix before launch)

- LLM fallbacks: only 2-tier (Groq → Gemini) — need 3rd
- Sitemap (3 pages, must be 50+)
- Blog (zero posts)
- No status page
- No Sentry / error tracking

---

## 📝 Notes / Audit Methodology

This plan was generated by:

1. Auditing the codebase across 8 dimensions (monitoring, performance, SEO, payments, marketing, support, CI/CD, risk areas)
2. Cross-referencing against typical Indian SaaS launch playbooks
3. Sequencing by criticality: blockers → polish → growth

To re-run the audit, ask the assistant to:

> Audit HireStepX for launch readiness across monitoring, performance, SEO, payments, marketing, support, CI/CD, and risk areas. Report findings concisely with file paths and key facts.

## 🔗 Related Files

- `docs/MARKETING.md` — landing page section breakdown
- `docs/Interview Focus/` — interview type specifications
- `vercel.json` — cron jobs
- `server-handlers/_llm.ts` — LLM fallback chain
- `public/sitemap.xml` — current sitemap (needs expansion)
- `.github/workflows/ci.yml` — CI pipeline
- `src/featureFlags.ts` — A/B testing infrastructure (ready to use)
- `CLAUDE.md` — project overview for new contributors / AI agents

---

*Update this doc as launch progresses. Mark tasks complete with* `[x]`*, add findings, revise targets based on real data.*
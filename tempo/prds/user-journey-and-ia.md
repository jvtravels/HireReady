# Level Up Interviews — User Journeys & Information Architecture

**Product:** Level Up Interviews | **Client:** Silva Vitalis LLC | **Date:** April 2026

---

## Table of Contents

1. [Information Architecture (Sitemap)](#information-architecture)
2. [Navigation Model](#navigation-model)
3. [User Journeys — B2C](#user-journeys--b2c)
4. [User Journeys — B2B Admin](#user-journeys--b2b-admin)
5. [User Journeys — B2B Coached Client](#user-journeys--b2b-coached-client)
6. [Cross-Journey Flows](#cross-journey-flows)
7. [State Machine: User Lifecycle](#state-machine-user-lifecycle)
8. [Page Inventory & Content Model](#page-inventory--content-model)
9. [Error States & Edge Cases](#error-states--edge-cases)

---

## Information Architecture

### Complete Sitemap

```
levelupinterviews.com
│
├── PUBLIC PAGES (unauthenticated)
│   ├── / (landing)                          ← B2C landing, luxury first-touch
│   ├── /for-teams                           ← B2B landing, coach-focused
│   ├── /signup                              ← Multi-step registration
│   │   ├── Step 1: Email + Password
│   │   ├── Step 2: Plan Selection (B2C / B2B)
│   │   └── Step 3: Privacy Consent
│   ├── /login                               ← Clerk-powered login + SSO + 2FA
│   ├── /privacy                             ← Privacy policy (static)
│   ├── /terms                               ← Terms of service (static)
│   └── /invite/accept?token=xxx             ← B2B client invite acceptance
│
├── B2C AUTHENTICATED (/dashboard)
│   ├── /dashboard                           ← Home: session history, resume input, CTAs
│   │   ├── [trial state]                    → "Start Your Free Mock Interview" CTA
│   │   ├── [expired state]                  → Upgrade banner + session history (locked)
│   │   ├── [weekly state]                   → Full access, upgrade-to-Pro nudge
│   │   └── [pro state]                      → Full access + analytics + challenges
│   ├── /dashboard/new-session               ← Resume/job context input form
│   ├── /interview/:sessionId                ← Real-time AI interview player
│   │   ├── [setup phase]                    → Mic permission, delivery mode (TTS/text)
│   │   ├── [active phase]                   → AI asks, user responds, dynamic follow-up
│   │   ├── [processing phase]               → AI scoring in progress
│   │   └── [complete phase]                 → Redirect to feedback
│   ├── /interview/:sessionId/feedback       ← Scorecard, suggestions, export
│   ├── /dashboard/history                   ← All past sessions with scores
│   ├── /dashboard/analytics                 ← [Pro only] Improvement trends, comparisons
│   ├── /dashboard/challenges                ← [Pro only] Practice challenges
│   └── /settings                            ← Account settings hub
│       ├── /settings/profile                ← Edit name, email, password (via Clerk)
│       ├── /settings/billing                ← Plan details, auto-renew toggle, upgrade
│       ├── /settings/data                   ← Export data, delete account
│       └── /settings/preferences            ← TTS default, notification preferences
│
├── B2B ADMIN AUTHENTICATED (/admin)
│   ├── /admin/dashboard                     ← Overview: pilot status, team stats, license
│   │   ├── [trial state]                    → Pilot banner + countdown + upgrade CTA
│   │   ├── [active state]                   → License status, usage summary
│   │   └── [expired state]                  → Renewal prompt
│   ├── /admin/clients                       ← Client management table
│   │   ├── [list view]                      → Sortable/filterable table
│   │   ├── [invite modal]                   → Single or bulk (CSV) invite
│   │   ├── [client detail]                  → Individual client progress & sessions
│   │   └── [removal modal]                  → Access-only or access + data deletion
│   ├── /admin/reports                       ← Aggregate analytics
│   │   ├── [overview tab]                   → Active users, total sessions, avg scores
│   │   └── [per-client tab]                 → Individual engagement breakdown
│   └── /admin/settings                      ← Organization settings
│       ├── /admin/settings/organization     ← Org name, admin details
│       ├── /admin/settings/billing          ← License, seats, payment method, renewal
│       ├── /admin/settings/data-retention   ← Retention policy (30/90/180 days)
│       └── /admin/settings/profile          ← Personal admin profile (via Clerk)
│
└── SHARED
    ├── 404                                  ← Not found page
    ├── /auth/callback                       ← Clerk SSO callback
    └── /payment/success                     ← Stripe redirect after payment
```

### Depth Analysis

| Level | Page Count | Examples |
| --- | --- | --- |
| Level 0 (Root) | 1 | Landing |
| Level 1 | 8 | /for-teams, /signup, /login, /privacy, /terms, /dashboard, /admin, /settings |
| Level 2 | 14 | /dashboard/new-session, /admin/clients, /settings/billing, etc. |
| Level 3 | 8 | /interview/:id/feedback, /admin/settings/data-retention, etc. |
| **Total unique pages** | **\~31** |  |

Maximum depth is 3 levels. No page is more than 3 clicks from the entry point.

---

## Navigation Model

### Public Navigation (Top Bar)

Visible on `/`, `/for-teams`, `/login`, `/signup`, `/privacy`, `/terms`.

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo: Level Up]     Pricing    For Teams    Login   Signup │
└──────────────────────────────────────────────────────────────┘
```

| Item | Behavior |
| --- | --- |
| Logo | Links to `/` (landing) |
| Pricing | Scrolls to pricing section on landing (anchor link) |
| For Teams | Links to `/for-teams` |
| Login | Links to `/login` |
| Signup | Links to `/signup` — primary CTA styling |

**Mobile (375px):** Logo + hamburger menu. Menu opens as overlay with all links.

### B2C Authenticated Navigation (Sidebar)

Visible on all `/dashboard/*` and `/interview/*` and `/settings/*` pages.

```
┌──────────┬───────────────────────────────────────────┐
│          │                                           │
│  Level   │                                           │
│   Up     │         Page Content Area                 │
│          │                                           │
│ ──────── │                                           │
│ Dashboard│                                           │
│ History  │                                           │
│ Analytics│  ← Pro badge                              │
│ Challeng.│  ← Pro badge                              │
│          │                                           │
│ ──────── │                                           │
│ Settings │                                           │
│          │                                           │
│ ──────── │                                           │
│ [Avatar] │                                           │
│ Sign Out │                                           │
└──────────┴───────────────────────────────────────────┘
```

| Item | Link | Notes |
| --- | --- | --- |
| Dashboard | `/dashboard` | Home — sessions, resume input |
| History | `/dashboard/history` | All past sessions |
| Analytics | `/dashboard/analytics` | Pro-only — show lock icon for non-Pro |
| Challenges | `/dashboard/challenges` | Pro-only — show lock icon for non-Pro |
| Settings | `/settings` | Expands to profile, billing, data |
| Avatar + Sign Out | Clerk-managed | User avatar, logout |

**Mobile (375px):** Sidebar collapses to hamburger icon. Tap opens as slide-in overlay.

### B2B Admin Navigation (Sidebar)

Visible on all `/admin/*` pages.

```
┌──────────┬───────────────────────────────────────────┐
│          │                                           │
│  Level   │                                           │
│   Up     │         Page Content Area                 │
│  ADMIN   │                                           │
│          │                                           │
│ ──────── │                                           │
│ Overview │                                           │
│ Clients  │                                           │
│ Reports  │                                           │
│          │                                           │
│ ──────── │                                           │
│ Settings │                                           │
│          │                                           │
│ ──────── │                                           │
│ [Avatar] │                                           │
│ Sign Out │                                           │
└──────────┴───────────────────────────────────────────┘
```

| Item | Link | Notes |
| --- | --- | --- |
| Overview | `/admin/dashboard` | Pilot status, team stats, license |
| Clients | `/admin/clients` | Client table, invite management |
| Reports | `/admin/reports` | Usage analytics, engagement |
| Settings | `/admin/settings` | Org settings, billing, retention, profile |
| Avatar + Sign Out | Clerk-managed | Admin avatar, logout |

**Mobile (375px):** Same hamburger collapse as B2C sidebar.

### Routing Logic (Auth Middleware)

```
User visits any page
    │
    ├── Not authenticated?
    │   ├── Public page → Render page
    │   └── Protected page → Redirect to /login?redirect=<original_url>
    │
    └── Authenticated?
        ├── Visits / (landing) or /for-teams
        │   ├── role = end_user → Redirect to /dashboard
        │   └── role = admin → Redirect to /admin/dashboard
        │
        ├── Visits /dashboard/* and role = admin → Redirect to /admin/dashboard
        ├── Visits /admin/* and role = end_user → 403 Forbidden
        │
        └── Otherwise → Render page
```

---

## User Journeys — B2C

### Journey 1: First-Time B2C User (Discovery → Free Mock → Upgrade)

**Persona:** Marcus Chen (Displaced Executive) **Goal:** Practice a realistic interview, evaluate the product, upgrade if impressed **Entry:** LinkedIn post → landing page

```
AWARENESS                 CONSIDERATION              ACTIVATION
─────────────────────────────────────────────────────────────────

LinkedIn/Google           /landing                   /signup
    │                        │                          │
    │  Clicks link        Sees luxury hero           Step 1: Email
    │  or searches        Reads value prop           + password
    ▼                     Scrolls pricing            Step 2: Plan
                          Clicks "Start Free         = Free Trial
                          Mock Interview"            Step 3: Privacy
                              │                      consent ✓
                              ▼                          │
                                                         ▼

FIRST VALUE                CORE EXPERIENCE            CONVERSION
─────────────────────────────────────────────────────────────────

/dashboard                 /interview/:id             /interview/:id/feedback
    │                          │                          │
    │  First-visit CTA      Setup: mic access          Scorecard:
    │  "Start Your Free     + delivery mode            87/100 overall
    │   Mock Interview"     (text or TTS)              Communication: 92
    │                          │                       Leadership: 84
    │  Enters resume        Active interview:          Strategy: 81
    │  + target role        AI asks question              │
    │  (VP Operations,      User responds              Suggestions:
    │   COO at mid-size)    AI follows up              "Quantify your
    │                       ~15-25 min                  team's revenue
    ▼                          │                        impact more
                            Submits session             specifically"
                               │                          │
                               ▼                          ▼

MONETIZATION               RETENTION                  GROWTH
─────────────────────────────────────────────────────────────────

/dashboard                 /dashboard                 /dashboard
    │                          │                          │
    │  Upgrade banner:      Session history            Pro upgrade nudge:
    │  "Get unlimited       with all past              "Track your
    │   practice for        feedback & scores          improvement with
    │   $29/week"              │                        Pro analytics"
    │                       Starts new                     │
    │  Stripe Checkout      sessions with              Stripe Checkout
    │  → Payment success    new contexts               $199/quarter
    │  → Access unlocked       │                           │
    ▼  immediately          Tracks improvement         /dashboard/analytics
                            in history                 /dashboard/challenges
```

**Key moments that matter:**

1. **Landing page (3-second test):** Marcus judges quality instantly — luxury design is the conversion lever
2. **First AI question (30-second test):** Must be role-specific, not generic — "Tell me about yourself" = bounce
3. **Feedback quality (conversion hook):** Specific, surprising feedback ("you undersold revenue by 40%") is what converts free → paid
4. **Post-payment dashboard:** Must immediately reflect upgraded state — no lag, no confusion

**Emotional arc:**

- Landing: Intrigued → "This looks different"
- Signup: Neutral → "Quick, no card, good"
- First question: Surprised → "This is actually relevant to my target role"
- Recording: Nervous → "Feels like a real interview"
- Feedback: Impressed → "I didn't realize I was doing that"
- Upgrade: Confident → "Worth $29 for a week of this"

---

### Journey 2: Returning B2C User (Ongoing Practice)

**Persona:** Priya Sharma (Strategic Climber) **Goal:** Track improvement over multiple sessions, sharpen specific skills **Entry:** Direct URL or bookmark → `/dashboard`

```
/dashboard                    /dashboard/new-session       /interview/:id
    │                              │                           │
    │  Sees session history     Inputs new context:         Interview adapts
    │  with score trends        "Director of Product        to focus on weak
    │  from past sessions       interview at Series B       areas from prior
    │                           fintech startup"            sessions
    │  Sees recommended            │                           │
    │  focus areas from         System notes prior          AI references:
    │  last session             session weaknesses          "Last time you
    │                           to inform question          struggled with
    │  [Pro] Practice           generation                  stakeholder
    │  challenge card:              │                        conflict
    │  "Try a C-level              ▼                        scenarios..."
    │   mock today"                                            │
    ▼                                                          ▼

/interview/:id/feedback       /dashboard/analytics          /dashboard/history
    │                              │                           │
    │  Score comparison:        [Pro] Trend chart:          Full session
    │  "Communication           Sessions 1-8                list with:
    │   improved 18%            Communication: ↑18%         - Date
    │   since last session"     Leadership: ↑12%            - Target role
    │                           Strategy: ↑7%               - Score
    │  Export: PDF/CSV/JSON        │                        - Key feedback
    │                           Category breakdown          - Re-read link
    │  "Next: focus on          over time                      │
    │   strategic vision            │                       Click any →
    │   articulation"           Exportable for              full feedback
    ▼                           personal tracking           review
```

**Key differences from first-time journey:**

- Dashboard shows *history* instead of first-time CTA
- AI questions build on prior session feedback (session memory)
- Feedback compares against previous performance
- Pro analytics provide the trend data Priya tracks in spreadsheets

---

### Journey 3: Expired B2C User (Re-engagement)

**Persona:** Marcus after his 7-day Weekly plan expires **Entry:** Email nudge or direct return → `/dashboard`

```
/dashboard (expired state)
    │
    │  Session history visible but grayed out
    │  "Start New Interview" button → triggers upgrade modal
    │
    │  Upgrade banner:
    │  ┌────────────────────────────────────────────────────┐
    │  │  Your access has expired.                          │
    │  │  Upgrade to continue practicing:                   │
    │  │                                                    │
    │  │  [$29/week — Weekly]  [$199/quarter — Pro ★]      │
    │  │                                                    │
    │  │  Pro includes: analytics, challenges, priority     │
    │  │  support, and your $29 is credited toward Pro.     │
    │  └────────────────────────────────────────────────────┘
    │
    ├── User clicks Weekly → Stripe Checkout → access restored
    └── User clicks Pro → Stripe Checkout → Pro features unlocked
```

---

## User Journeys — B2B Admin

### Journey 4: B2B Admin — Pilot Onboarding

**Persona:** Dana Whitfield (Solo Coach) **Goal:** Evaluate the tool with 2 clients before committing to annual license **Entry:** Coaching community post → `/for-teams`

```
DISCOVERY                  ONBOARDING                 TEAM SETUP
─────────────────────────────────────────────────────────────────

/for-teams                 /signup                    /admin/dashboard
    │                          │                          │
    │  Coach-focused hero   Step 1: Email             First-visit state:
    │  "Supercharge your    + password                ┌──────────────────┐
    │   interview           Step 2: Plan              │ Welcome, Dana!   │
    │   coaching"           = Team Pilot              │                  │
    │                       Step 3: Privacy           │ Your 1-month     │
    │  "Start Free          consent ✓                 │ pilot is active. │
    │   Team Pilot"             │                     │ 29 days left.    │
    │   No credit card          │                     │                  │
    │                           │                     │ Add your first   │
    │  Demo video               ▼                     │ client to get    │
    │  available                                      │ started. →       │
    ▼                                                 └──────────────────┘
                                                          │
                                                          ▼

CLIENT INVITATION          CLIENT ACTIVATION          MONITORING
─────────────────────────────────────────────────────────────────

/admin/clients             Email (console-logged)     /admin/dashboard
    │                          │                          │
    │  "Invite Client"      Client receives           Pilot banner:
    │  button → Modal:      invite link               "22 days left |
    │  ┌──────────────┐         │                      2/2 clients active"
    │  │ Email:        │    Client clicks →               │
    │  │ [_________]   │    /invite/accept?token=xx   Usage counters:
    │  │               │        │                     - Mocks completed: 7
    │  │ [Add Another] │    Creates account           - Active users: 2
    │  │               │    Confirms email            - Avg score: 78
    │  │ [Send Invite] │    Status → "activated"          │
    │  └──────────────┘         │                     Client table
    │                           ▼                     updates in
    │  Client table                                   real-time
    │  shows "pending"
    ▼

TRIAL END                  UPGRADE                    ONGOING
─────────────────────────────────────────────────────────────────

/admin/dashboard           Stripe Checkout            /admin/dashboard
    │                          │                          │
    │  Trial summary:       Per-seat annual           License status:
    │  "Your pilot ends     license payment           "Active | 8 seats |
    │   in 3 days"              │                      Renews Jan 2027"
    │                       Payment success →              │
    │  "Upgrade to keep     ┌──────────────────┐     Bulk invite
    │   client progress     │ License active!  │     unlocked →
    │   and unlock          │ Unlimited seats  │     CSV upload
    │   unlimited slots"    │ unlocked.        │         │
    │                       └──────────────────┘     Advanced reporting
    │  Summary report:          │                    enabled
    │  engagement data,         ▼                        │
    │  client scores,                                Per-client
    │  ROI indicators                                dashboards
    ▼                                                    ▼
```

**Key moments that matter:**

1. **B2B landing (value prop test):** Must speak to coaches, not just enterprises — Dana is solo, not a Fortune 500
2. **First invite sent (activation):** If invite flow takes &gt;2 minutes, Dana abandons
3. **First client activates (validation):** Dana checks if the AI quality is good enough to recommend
4. **Trial summary (conversion hook):** Engagement data and client scores justify the annual cost
5. **Post-upgrade (value expansion):** Bulk invite and reporting unlock real business value

---

### Journey 5: B2B Admin — Ongoing Client Management

**Persona:** James Okafor (Firm Operator) **Goal:** Manage 50+ candidates, generate reports for corporate clients **Entry:** Bookmark → `/admin/dashboard`

```
/admin/dashboard              /admin/clients              /admin/clients/:id
    │                              │                           │
    │  Quick stats:             Full table view:           Individual client:
    │  - 47 active clients      ┌──────────────────────┐   - Profile info
    │  - 312 mocks this month   │ Name  Status  Mocks  │   - Session history
    │  - Avg score: 81          │ ──── ──────── ────── │   - Score trends
    │  - 3 pending invites      │ Alex  Active   12    │   - Last active
    │                           │ Beth  Active    8    │   - Individual
    │  License: Active          │ Carl  Pending   0    │     feedback review
    │  48 / 50 seats used       │ Dana  Active   15    │       │
    │                           │ ...                  │   Coach references
    │  "Add seats" link         │                      │   this in 1:1
    ▼                           │ [Search] [Filter]    │   sessions
                                │ [Invite] [Export]    │       │
                                └──────────────────────┘       ▼
                                     │
                                     ▼

/admin/reports                /admin/settings/billing    /admin/settings/data-retention
    │                              │                          │
    │  Overview tab:            License details:           Retention policy:
    │  - Active users (47)      - Plan: Annual             ┌──────────────────┐
    │  - Total sessions (312)   - Seats: 48/50             │ Retain data for: │
    │  - Completion rate (74%)  - Renewal: Jan 2027        │ ○ 30 days        │
    │  - Avg score trend        - Payment method           │ ● 90 days        │
    │                               │                      │ ○ 180 days       │
    │  Per-client tab:          "Add 10 seats" →           │                  │
    │  - Individual engagement  Stripe upgrade             │ Compliance note: │
    │  - Score comparisons          │                      │ "Data is deleted │
    │  - Inactive alerts        "Download invoice"         │  permanently     │
    │                                                      │  after period."  │
    │  [Export as CSV] →                                   └──────────────────┘
    │  Download for                                            │
    │  corporate reporting                                 All org users
    ▼                                                      affected
```

---

### Journey 6: B2B Admin — Client Removal

**Persona:** James removing a candidate who landed a job

```
/admin/clients                  Removal Modal                   Result
    │                               │                              │
    │  Clicks "Remove"          ┌────────────────────────────┐     │
    │  on client row            │ Remove Sarah Johnson?      │     │
    │                           │                            │     │
    │                           │ ○ Remove access only       │     │
    │                           │   Sarah keeps her account  │     │
    │                           │   and interview history    │     │
    │                           │   as a personal user.      │     │
    │                           │                            │     │
    │                           │ ● Remove access + delete   │     │
    │                           │   data                     │     │
    │                           │   Sarah's data will be     │     │
    │                           │   deleted after 90 days    │     │
    │                           │   per your retention       │     │
    │                           │   policy.                  │     │
    │                           │                            │     │
    │                           │ [Cancel]    [Confirm]      │     │
    │                           └────────────────────────────┘     │
    │                                                              │
    │                           Action logged in AuditLog          │
    │                           Client removed from table          │
    │                           Seat freed up                      │
    ▼                                                              ▼
```

---

## User Journeys — B2B Coached Client

### Journey 7: Coached Client — Invite → First Interview

**Persona:** Aaliyah Torres (Coached Client) **Goal:** Accept invite, complete a mock interview, get useful feedback **Entry:** Email invite from coach → `/invite/accept`

```
EMAIL                      ACCEPTANCE                 FIRST EXPERIENCE
─────────────────────────────────────────────────────────────────

Coach sends invite         /invite/accept?token=xx    /dashboard
    │                          │                          │
    │  Email contains:      Token validated            First-visit CTA:
    │  "Your coach Dana     ┌──────────────────┐      "Your coach invited
    │   has invited you     │ Join Level Up     │       you to practice
    │   to Level Up         │ Interviews        │       interviews. Start
    │   Interviews"         │                   │       your first mock."
    │                       │ Create account:   │          │
    │  [Accept Invite]      │ Email: (pre-fill) │      Resume/job context:
    │  button               │ Password: [____]  │      "VP Sales, SaaS"
    │                       │                   │      (can skip resume
    │                       │ ☑ Accept terms    │       upload)
    │                       │                   │          │
    │                       │ [Create Account]  │      Enters interview
    │                       └──────────────────┘      player on mobile
    │                           │                          │
    │                       Email confirmed                ▼
    │                       Linked to Dana's org
    ▼                                                      

INTERVIEW                  FEEDBACK                   ONGOING
─────────────────────────────────────────────────────────────────

/interview/:id             /interview/:id/feedback    /dashboard
    │                          │                          │
    │  On mobile (375px)    Scorecard shows:           Session history
    │  Mic permission       "Communication: 85         with feedback
    │  granted              Leadership: 78              summaries
    │                       Strategic thinking: 72"        │
    │  AI asks:                 │                      Coach Dana sees
    │  "Tell me about       Specific tip:              Aaliyah's progress
    │   scaling a regional  "You undersold your        in /admin/clients
    │   sales team..."      team's revenue impact          │
    │                       by 40%. Quantify the       Coach references
    │  Responds via mic     $12M growth more           scores in next
    │  AI follows up        prominently."              1:1 session
    │  dynamically              │                          │
    │                       "This is actually           Uses 3-4 more
    │  ~15 min session      useful." (trust earned)     times over
    ▼                                                   2 weeks
```

**Key moments that matter:**

1. **Email invite (1-click acceptance):** Must be dead simple — Aaliyah didn't choose this tool
2. **Account creation (30 seconds):** Email pre-filled from invite, minimal fields, no credit card
3. **First question on mobile (credibility test):** Must be relevant to her target role, not generic
4. **Feedback specificity (trust moment):** "You undersold revenue by 40%" = trust earned. "Good answer" = tool abandoned.

**Emotional arc:**

- Email: Skeptical → "Another tool my coach wants me to use"
- Accept: Neutral → "At least it's quick"
- First question: Surprised → "This actually knows my background"
- Recording on mobile: Slightly anxious → "Feels natural enough"
- Feedback: Impressed → "Okay, this is actually helpful"
- Shares with coach: Validated → "My coach can see I'm improving"

---

## Cross-Journey Flows

### Flow A: Stripe Payment (B2C + B2B)

```
Trigger                    Stripe Checkout             Post-Payment
    │                          │                          │
    │  B2C: Clicks upgrade  Stripe hosted checkout     /payment/success
    │  on dashboard         page (external)                │
    │                           │                      Success state:
    │  B2B: Clicks upgrade  Enters payment details     ┌──────────────────┐
    │  on admin dashboard       │                      │ Payment received! │
    │                       Stripe processes            │                  │
    │                           │                      │ [B2C] Your plan  │
    │                       ├── Success → redirect     │ is now active.   │
    │                       │                          │                  │
    │                       └── Failure → retry        │ [B2B] License    │
    │                           page with error        │ upgraded. Bulk   │
    │                                                  │ invite unlocked. │
    │                                                  │                  │
    │                                                  │ [Go to Dashboard]│
    │                                                  └──────────────────┘
    │                                                      │
    │                                                  Dashboard state
    │                                                  updates immediately
    │                                                  (webhook or redirect
    │                                                  param triggers
    │                                                  status refresh)
    ▼
```

### Flow B: Data Export (All Users)

```
/settings/data                  Export Modal                 Download
    │                               │                          │
    │  Clicks "Export            ┌─────────────────────┐    Browser download
    │   My Data"                │ Export Your Data     │    triggers
    │                           │                     │    immediately
    │                           │ Choose format:      │        │
    │                           │ ○ JSON (full data)  │    Toast: "Your
    │                           │ ● CSV (tabular)     │    data export is
    │                           │ ○ PDF (summary)     │    ready."
    │                           │                     │        │
    │                           │ Includes:           │    AuditLog entry
    │                           │ - Profile info      │    created:
    │                           │ - All sessions      │    action:
    │                           │ - Feedback & scores │    "data_exported"
    │                           │ - Billing history   │
    │                           │                     │
    │                           │ [Cancel] [Export]    │
    │                           └─────────────────────┘
    ▼
```

### Flow C: Account Deletion (All Users)

```
/settings/data                  Deletion Modal              Confirmation
    │                               │                          │
    │  Clicks "Delete           ┌─────────────────────┐    Account flagged
    │   My Account"             │ Delete Your Account  │    for deletion
    │                           │                     │        │
    │                           │ ⚠ This action       │    ┌──────────────┐
    │                           │ cannot be undone     │    │ Account will │
    │                           │ after the retention  │    │ be deleted   │
    │                           │ period.              │    │ on [date].   │
    │                           │                     │    │              │
    │                           │ Retain data for:    │    │ You can log  │
    │                           │ ○ 30 days           │    │ in to cancel │
    │                           │ ● 90 days           │    │ before then. │
    │                           │ ○ 180 days          │    └──────────────┘
    │                           │                     │        │
    │                           │ Type "DELETE" to    │    User signed out
    │                           │ confirm: [_______]  │    AuditLog entry
    │                           │                     │    created
    │                           │ [Cancel] [Delete]   │
    │                           └─────────────────────┘
    ▼
```

---

## State Machine: User Lifecycle

### B2C User States

```
                    ┌─────────────┐
                    │  Anonymous  │
                    └──────┬──────┘
                           │ Signs up (free trial)
                           ▼
                    ┌─────────────┐
                    │   Trial     │  Can complete 1 mock interview
                    │  (active)   │  No payment info required
                    └──────┬──────┘
                           │ Completes 1 mock
                           ▼
                    ┌─────────────┐
                    │   Trial     │  Cannot start new sessions
                    │ (exhausted) │  Can view past feedback
                    └──────┬──────┘
                           │
                ┌──────────┼──────────┐
                │                     │
                ▼                     ▼
         ┌─────────────┐      ┌─────────────┐
         │   Weekly    │      │     Pro     │
         │   ($29)     │      │   ($199)    │
         │             │      │             │
         │ Unlimited   │      │ Unlimited   │
         │ interviews  │      │ interviews  │
         │ 7 days      │      │ + analytics │
         │ auto-renew  │      │ + challenges│
         │ optional    │      │ 3 months    │
         └──────┬──────┘      └──────┬──────┘
                │ Expires              │ Expires
                ▼                      ▼
         ┌─────────────┐      ┌─────────────┐
         │   Expired   │      │   Expired   │
         │  (Weekly)   │◄─────│   (Pro)     │
         │             │      │             │
         │ Nudge → Pro │      │ Nudge →     │
         │ Re-purchase │      │ Re-purchase │
         └──────┬──────┘      └─────────────┘
                │ Re-purchases
                ▼
         (Back to Weekly or Pro)

         Any state → Account Deletion → Retention Period → Permanent Erasure
```

### B2B Organization States

```
         ┌─────────────┐
         │   Trial     │  1-month pilot
         │  (pilot)    │  Up to 2 clients
         │             │  No payment
         └──────┬──────┘
                │
         ┌──────┼──────────────────┐
         │ Upgrades                │ Expires (no upgrade)
         ▼                         ▼
  ┌─────────────┐          ┌─────────────┐
  │   Active    │          │   Expired   │
  │  (annual)   │          │  (pilot)    │
  │             │          │             │
  │ Unlimited   │          │ Data kept   │
  │ clients     │          │ per retention│
  │ Full admin  │          │ Read-only   │
  │ Reporting   │          │ access      │
  └──────┬──────┘          └──────┬──────┘
         │ Renewal due             │ Upgrades (late)
         ▼                         │
  ┌─────────────┐                  │
  │   Renewal   │◄─────────────────┘
  │  (pending)  │
  └──────┬──────┘
         │
  ┌──────┼──────────────────┐
  │ Renews                  │ Doesn't renew
  ▼                         ▼
  Active (renewed)     Expired (annual)
```

### Invite States

```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Created   │────▶│   Pending   │────▶│  Activated  │
  │             │     │             │     │             │
  │ Admin sends │     │ Email sent  │     │ Client      │
  │ invite      │     │ Waiting for │     │ confirmed   │
  │             │     │ client to   │     │ email +     │
  │             │     │ accept      │     │ created     │
  │             │     │             │     │ account     │
  └─────────────┘     └──────┬──────┘     └─────────────┘
                             │
                             │ Expires (7 days)
                             ▼
                      ┌─────────────┐
                      │   Expired   │
                      │             │
                      │ Admin can   │
                      │ resend      │
                      └─────────────┘
```

---

## Page Inventory & Content Model

### Page-by-Page Content Requirements

| Page | Primary Content | Key Actions | Dynamic Data | States |
| --- | --- | --- | --- | --- |
| **/** (Landing) | Hero, value prop, pricing, FAQ, demo video | "Start Free Mock" CTA, "For Teams" link | None | Default |
| **/for-teams** | Coach-focused hero, pilot CTA, demo, ROI stats | "Start Free Pilot" CTA, "Request Demo" | None | Default |
| **/signup** | 3-step form | Next/back, submit | Form auto-save | Step 1, 2, 3 |
| **/login** | Login form, SSO buttons | Login, SSO, 2FA | None | Default, 2FA challenge |
| **/privacy** | Privacy policy text | None | None | Static |
| **/terms** | Terms of service text | None | None | Static |
| **/invite/accept** | Account creation form | Create account | Pre-filled email from token | Valid token, expired token |
| **/dashboard** | Session history, resume input, CTAs | Start session, view history | Sessions list, scores, trial status | Trial, exhausted, weekly, pro, expired |
| **/dashboard/new-session** | Resume/job context form | Submit, upload resume | Pre-filled from last session | Default, loading |
| **/interview/:id** | Interview player, AI questions, mic recorder | Record, submit, toggle TTS/text | AI questions, audio stream, timer | Setup, active, processing, complete |
| **/interview/:id/feedback** | Scorecard, suggestions, next steps | Export (PDF/CSV/JSON), start new | Scores, AI suggestions, comparison | Default, first-session, returning |
| **/dashboard/history** | Session list with scores | Filter, search, click to review | All past sessions | Empty, populated |
| **/dashboard/analytics** | Trend charts, score comparisons | Filter by date/category | Aggregated score data | Pro-only (locked for non-Pro) |
| **/dashboard/challenges** | Practice challenge cards | Start challenge | AI-generated prompts | Pro-only (locked for non-Pro) |
| **/settings/profile** | Name, email, avatar | Edit, save | Clerk user data | Default, editing |
| **/settings/billing** | Plan, payment method, auto-renew | Toggle auto-renew, upgrade, manage | Stripe subscription data | Trial, weekly, pro, expired |
| **/settings/data** | Export + delete buttons | Export, delete | None | Default, export-in-progress, deletion-pending |
| **/settings/preferences** | TTS default, delivery mode | Toggle, save | User preferences | Default |
| **/admin/dashboard** | Pilot status, team stats, license info | Upgrade, invite, manage | Usage counters, trial countdown | Trial, active, expired |
| **/admin/clients** | Client table | Sort, filter, invite, remove | Client list with statuses | Empty, populated, trial (2 max) |
| **/admin/reports** | Analytics overview + per-client | Export CSV, filter | Aggregated + individual data | Empty, populated |
| **/admin/settings/organization** | Org name, admin info | Edit, save | Organization data | Default |
| **/admin/settings/billing** | License, seats, invoices | Add seats, download invoice | Stripe license data | Trial, active |
| **/admin/settings/data-retention** | Retention policy selector | Change policy | Current policy | Default |
| **/admin/settings/profile** | Admin personal profile | Edit, save | Clerk user data | Default |
| **/payment/success** | Confirmation message | Go to dashboard | Payment details | B2C success, B2B success |
| **404** | Not found message | Go home | None | Default |

---

## Error States & Edge Cases

### Authentication Errors

| Scenario | Behavior | Page |
| --- | --- | --- |
| Invalid login credentials | Inline error: "Invalid email or password" | /login |
| SSO provider error | Toast: "SSO connection failed. Try email login." | /login |
| 2FA code expired | Inline: "Code expired. Request a new one." | /login (2FA step) |
| Session expired mid-interview | Save progress, redirect to /login with redirect param back to session | /interview/:id |
| Accessing /admin as end_user | 403 page: "You don't have access to this page." | /admin/\* |

### Interview Session Errors

| Scenario | Behavior | Page |
| --- | --- | --- |
| Mic permission denied | Show fallback: "Allow microphone access to continue" with browser-specific instructions | /interview/:id |
| Mic not available (no hardware) | Show file upload alternative: "Upload a recording instead" | /interview/:id |
| Audio upload exceeds 20MB | Inline error: "Recording too large. Try a shorter response." | /interview/:id |
| Audio upload fails (network) | Retry button with progress indicator. Auto-retry 2x before showing manual retry. | /interview/:id |
| AI response timeout | Loading skeleton with message: "Generating follow-up..." Timeout after 30s → "Having trouble connecting. Try again." | /interview/:id |
| Browser not supported (MediaRecorder) | Banner: "Your browser doesn't support audio recording. Use Chrome, Safari, or Firefox." + fallback file upload | /interview/:id |

### Payment Errors

| Scenario | Behavior | Page |
| --- | --- | --- |
| Stripe Checkout fails | Stripe's own error handling. Redirect to /dashboard with error toast. | Stripe → /dashboard |
| Payment succeeds but webhook delayed | Optimistic UI update via redirect param. Background poll for confirmed status. | /payment/success |
| Card declined | Stripe's own messaging. User can retry with different card. | Stripe Checkout |

### Invite Errors

| Scenario | Behavior | Page |
| --- | --- | --- |
| Invite token expired | "This invite has expired. Contact your coach for a new one." | /invite/accept |
| Invite token invalid | "Invalid invite link. Check with your coach." | /invite/accept |
| Email already has account | "You already have an account. Log in to link to this organization." + login link | /invite/accept |
| Org at trial client limit (2) | Admin sees: "Upgrade to invite more clients" when trying to send 3rd invite. | /admin/clients |

### Data & Account Errors

| Scenario | Behavior | Page |
| --- | --- | --- |
| Export generation fails | Toast: "Export failed. Please try again." + retry button | /settings/data |
| Deletion already pending | Show current deletion date: "Your account is scheduled for deletion on \[date\]. Cancel?" | /settings/data |
| B2B admin deletes own account | Block: "Transfer admin role before deleting your account." | /settings/data |

### Empty States

| Page | Empty State Content | CTA |
| --- | --- | --- |
| /dashboard (first visit, trial) | "Welcome! Start your free mock interview to see how AI-driven practice works." | "Start Free Mock Interview" |
| /dashboard/history (no sessions) | "No sessions yet. Complete your first interview to see your history here." | "Start Interview" |
| /dashboard/analytics (no data) | "Complete 2+ sessions to see your improvement trends." | "Start Interview" |
| /admin/clients (no clients) | "No clients yet. Invite your first client to get started." | "Invite Client" |
| /admin/reports (no data) | "Reports will appear here once your clients complete their first interviews." | "Invite Client" |

---

## Appendix: Screen Count by User Role

| Role | Unique Screens | Shared Screens | Total |
| --- | --- | --- | --- |
| Anonymous (public) | 7 | 0 | 7 |
| B2C User | 12 | 2 (404, payment/success) | 14 |
| B2B Admin | 9 | 2 (404, payment/success) | 11 |
| B2B Client (coached) | 12 | 2 (invite/accept + 404) | 14 |
| **Total unique screens** | **\~31** |  |  |

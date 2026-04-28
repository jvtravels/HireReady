# HireStepX — Email Templates Reference

Single source of truth for every transactional/lifecycle email sent to users (and ops). Use this as the spec when editing copy, designing templates, or adding new triggers.

**Sender identity (all emails)**
- **From**: `HireStepX <hello@hirestepx.com>` (fallback: `onboarding@resend.dev`)
- **Reply-To**: `support@hirestepx.com`
- **Brand color**: `#4F46E5` (indigo) primary, `#10B981` (emerald) success, `#EF4444` (red) security/alert
- **Logo**: HireStepX wordmark, top-left, 32px height
- **Footer (every email)**: address line + unsubscribe link (lifecycle/marketing only — not transactional/security) + "You're receiving this because you have a HireStepX account."
- **Width**: 600px max, mobile-first single column, 16px base font, system stack
- **CTA buttons**: rounded 8px, 14px 24px padding, white text on `#4F46E5`

**Voice**: confident, warm, India-aware (₹ for amounts, IST for times where relevant), no emoji-heavy fluff. Short sentences. One clear action per email.

---

## 1. Email Verification (Welcome)

| Field | Value |
|---|---|
| Trigger | New signup completes via `/api/send-welcome` (verify) |
| File | `server-handlers/send-welcome.ts:429` |
| Category | Transactional (no unsubscribe) |
| Rate limit | 3 / IP / hour |

**Subject**: `Verify your email — HireStepX`
**Preheader**: `One click to unlock 3 free mock interviews.`

**Body**
- **H1**: Welcome to HireStepX, {firstName}.
- **Lede**: You're one click away from your first AI mock interview. Verify your email to activate your account.
- **CTA button**: `Verify email` → `{verifyLink}` (24h expiry)
- **What's next list** (3 steps with icons):
  1. Upload your resume (PDF or paste text)
  2. Pick a target role and company
  3. Run a mock interview — get scored in minutes
- **Fallback link**: "Button not working? Paste this in your browser: {verifyLink}"
- **Security line**: "If you didn't create a HireStepX account, ignore this email."

---

## 2. Verification Reminder

| Field | Value |
|---|---|
| Trigger | User unverified after N hours |
| File | `send-welcome.ts:220` |
| Category | Lifecycle (unsubscribe ok) |
| Rate limit | 2 / IP / day |

**Subject**: `Still there? Verify your email and start practicing`
**Preheader**: `Your 3 free interviews are waiting.`

**Body**
- **H1**: One step left, {firstName}.
- **Body**: We saved your spot. Verify your email to unlock 3 free mock interviews — no card required.
- **CTA**: `Verify email`
- **Soft urgency**: "This link expires in 24 hours."
- **Tiny**: "Need a new link? Sign in and we'll resend."

---

## 3. Password Reset

| Field | Value |
|---|---|
| Trigger | Forgot-password flow |
| File | `send-welcome.ts:287` |
| Category | Security (no unsubscribe) |
| Rate limit | 3 / IP / hour |

**Subject**: `Reset your HireStepX password`
**Preheader**: `Link expires in 1 hour.`

**Body**
- **H1**: Reset your password
- **Body**: Click below to choose a new password. This link expires in **1 hour** and works only once.
- **CTA**: `Reset password` → `{resetLink}`
- **Security panel** (red border-left, light red bg):
  - "Didn't request this? You can safely ignore this email — your password won't change."
  - "If you see repeated reset emails you didn't request, contact support@hirestepx.com."
- **Fallback link**: plain-text URL.

---

## 4. Password Changed

| Field | Value |
|---|---|
| Trigger | Successful password change in settings |
| File | `send-welcome.ts:99` |
| Category | Security (no unsubscribe) |

**Subject**: `Your HireStepX password was changed`
**Preheader**: `If this wasn't you, act now.`

**Body**
- **H1**: Password updated
- **Body**: Your password was changed on **{date} at {time IST}**.
- **Detail row**: Device · IP city · Time
- **Security CTA**: `Wasn't you? Reset password now` (red button)
- **Footer note**: "We'll never email you to ask for your password."

---

## 5. New Device Login

| Field | Value |
|---|---|
| Trigger | Sign-in from unrecognized device token |
| File | `send-welcome.ts:157` |
| Category | Security |
| Rate limit | 5 / IP / hour |

**Subject**: `New sign-in to your HireStepX account`
**Preheader**: `{Browser} on {OS} · {City, Country}`

**Body**
- **H1**: New device signed in
- **Device card** (bordered):
  - Device: {browser} on {OS}
  - Location (approx): {city, country}
  - Time: {date, time IST}
- **Body**: HireStepX is single-device — signing in here logged you out of your previous device.
- **Security CTA**: `This wasn't me — secure account` → reset password link.

---

## 6. Payment Confirmation / Receipt

| Field | Value |
|---|---|
| Trigger | Razorpay payment verified |
| File | `verify-payment.ts:53` |
| Category | Transactional |

**Subject**: `Payment confirmed — {planName} activated`
**Preheader**: `Receipt for ₹{amount} · Payment ID {short}`

**Body**
- **H1**: You're in. Welcome to {planName}.
- **Receipt card**:
  - Plan: {planName}
  - Amount: ₹{amount}
  - Valid: {startDate} → {endDate}
  - Payment ID: {paymentId}
- **Plan benefits** (3-line bullet of what unlocks now)
- **Primary CTA**: `Start practicing` → `/dashboard`
- **Footer note**: "This is your tax invoice. Need GST details? Reply to this email."

---

## 7. Subscription Renewed

| Field | Value |
|---|---|
| Trigger | Razorpay `subscription.charged` webhook |
| File | `razorpay-webhook.ts:278` |
| Category | Transactional |

**Subject**: `Renewed — your {tier} plan is extended`
**Preheader**: `Next billing: {nextDate}`

**Body**
- **H1**: Subscription renewed
- **Body**: We charged ₹{amount} on {date} and extended your **{tier}** plan to **{newEndDate}**.
- **CTA**: `Continue practicing`
- **Tiny**: "Manage your plan in Settings → Subscription."

---

## 8. Renewal Reminder (Expiring Soon)

| Field | Value |
|---|---|
| Trigger | Daily cron, expires in ≤3 days, **manual** plans only (auto-renew skipped) |
| File | `send-renewal-reminders.ts` |
| Category | Lifecycle |

**Subject**: `Your {tier} plan expires in {N} day(s)`
**Preheader**: `Renew in one click to keep your unlimited access.`

**Body**
- **H1**: {N} day{s} left on your {tier} plan
- **Countdown banner**: "{N} days remaining"
- **Body**: Renew now and keep: unlimited interviews, advanced focus areas, full skill-decay tracking.
- **CTA**: `Renew now` → `/pricing?renew=1`
- **Soft fallback**: "If you don't renew, your account moves to free tier — your sessions and progress stay safe."

---

## 9. Payment Abandonment Recovery

| Field | Value |
|---|---|
| Trigger | Hourly cron, payment intent 1–24h old, unpaid |
| File | `send-abandonment-emails.ts` |
| Category | Lifecycle |

**Subject**: `You're one step away from {planName}`
**Preheader**: `Your checkout is still open — finish in 30 seconds.`

**Body**
- **H1**: Forgot something, {firstName}?
- **Body**: You started checking out for **{planName}** but didn't finish. Your spot is saved.
- **Plan card**: name + ₹{amount} + 3 key benefits
- **CTA**: `Complete purchase` → `/checkout?intent={id}`
- **No-pressure footer**: "No rush — the free tier is always there if you want to keep practicing."

---

## 10. Cancellation Confirmation

| Field | Value |
|---|---|
| Trigger | User cancels subscription |
| File | `cancel-subscription.ts:106` |
| Category | Transactional |

**Subject**: `Your subscription is cancelled`
**Preheader**: `You still have access until {endDate}.`

**Body**
- **H1**: We'll miss you, {firstName}.
- **Body**: Your **{tier}** plan is cancelled. You keep full access until **{endDate}** — after that, you'll move to free tier.
- **Reactivate CTA** (secondary): `Changed your mind? Reactivate`
- **Feedback ask** (1 line): "Mind telling us why? Reply with one word — we read every reply."

---

## 11. Pause / Resume Confirmation

| Field | Value |
|---|---|
| Trigger | User pauses or resumes subscription |
| File | `pause-subscription.ts:119` |
| Category | Transactional |

**Subject (pause)**: `Subscription paused — we'll see you soon`
**Subject (resume)**: `Welcome back — your subscription is active`

**Body (pause)**
- **H1**: Paused.
- **Body**: Your **{tier}** plan is paused. We won't bill you until you resume. You can resume anytime from Settings.
- **CTA**: `Resume now`

**Body (resume)**
- **H1**: You're back in.
- **Body**: Your **{tier}** plan is active again. Next billing: {date}.
- **CTA**: `Start practicing`

---

## 12. Reactivation Confirmation

| Field | Value |
|---|---|
| Trigger | User reactivates a cancelled-pending subscription |
| File | `reactivate-subscription.ts:112` |
| Category | Transactional |

**Subject**: `Welcome back — your HireStepX subscription is active`

**Body**
- **H1**: Welcome back, {firstName}.
- **Body**: Your **{tier}** plan is reactivated. Auto-renewal is back on — next billing **{nextBillingDate}**.
- **Plan summary card**: tier · next billing · benefits unlocked
- **CTA**: `Continue practicing`

---

## 13. Subscription Expired

| Field | Value |
|---|---|
| Trigger | Daily cron — `subscription_end` passed |
| File | `reset-expired-subscriptions.ts:71` |
| Category | Lifecycle |

**Subject**: `Your HireStepX subscription has expired`
**Preheader**: `Your data is safe — pick up where you left off.`

**Body**
- **H1**: Your {tier} plan expired
- **Body**: You've been moved to the free tier. **All your sessions, scores, and progress are preserved.**
- **Free tier card**: 3 free interviews · behavioral questions · skill tracking
- **Primary CTA**: `Renew {tier}` → `/pricing`
- **Secondary CTA**: `Continue on free tier` → `/dashboard`

---

## 14. Payment Failed / Halted

| Field | Value |
|---|---|
| Trigger | Razorpay `subscription.halted` (all retries failed) |
| File | `razorpay-webhook.ts:301` |
| Category | Transactional / Security |

**Subject**: `Payment failed — your HireStepX subscription is paused`
**Preheader**: `Update your payment method to restore access.`

**Body**
- **H1**: We couldn't process your payment
- **Body**: After several retries, your **{tier}** payment didn't go through. You've been moved to free tier.
- **What you lost** (compact 2-col table): feature → status (e.g. Unlimited interviews → Limited to 3/month)
- **Primary CTA**: `Update payment method` → settings deep link
- **Tiny**: "Common fixes: insufficient funds, expired card, bank-side block on autopay."

---

## 15. Re-engagement (Tiered)

| Field | Value |
|---|---|
| Trigger | Daily cron, inactivity tiers |
| File | `re-engage-users.ts` |
| Category | Lifecycle |

### 15a. Day 1–3 (Free)
**Subject**: `Your personalized {role} session is ready`
**Body**: One sentence on weakest skill from last session, single CTA `Start session` (3 questions, 10 min).

### 15b. Day 3–7 (Free)
**Subject**: `Your {skill} skills need a refresh`
**Body**: Skill-decay framing — "Your {skill} score drops ~12% after 7 days of no practice." CTA `Refresh now`.

### 15c. Day 7–14 (Free) — Last chance
**Subject**: `Don't lose your progress`
**Body**: Mild urgency. Show streak/score they'll lose if they don't return. CTA `Practice now`.

### 15d. Paid 14+ days
**Subject**: `You're paying for unlimited — let's use it`
**Body**: Value-justification frame. ROI on plan price. CTA `Start a session`.

### 15e. Paid 30+ days
**Subject**: `Brush up before your next interview`
**Body**: Soft, no guilt. "When's your next interview? Run a 10-min warm-up." CTA `Quick session`.

**All re-engagement footers**: prominent unsubscribe + "Pause emails for 30 days" link.

---

## 16. Weekly Progress Digest *(scaffold — disabled)*

| Field | Value |
|---|---|
| Trigger | Weekly cron on user's signup-weekday |
| File | `weekly-summary.ts` |
| Category | Lifecycle |
| Status | **Not yet shipped** — `sendEmail()` returns false |

**Subject**: `Your HireStepX week: {N} sessions, score {avgScore}`
**Preheader**: `+{delta} from last week`

**Body**
- **H1**: This week in your prep
- **Stats row** (3 tiles): Sessions · Avg score · Best skill
- **Score chart** (sparkline, last 4 weeks)
- **Weakest skill callout**: "Your {skill} dropped {N} pts. Run a focused session?"
- **CTA**: `View full report` → `/dashboard`
- **Streak row** (if active): "🔥 {N}-day streak"

---

## 17. Account Deletion Confirmation

| Field | Value |
|---|---|
| Trigger | User deletes account (sent **before** wipe) |
| File | `delete-account.ts:144` |
| Category | Transactional / Security |

**Subject**: `Your HireStepX account has been deleted`

**Body**
- **H1**: Account deleted
- **Body**: We've removed your HireStepX account and the data associated with it.
- **What was deleted** list: profile · sessions · payment history · resume · audit logs
- **Body**: "You can create a new account anytime."
- **Support line**: "Questions? Email support@hirestepx.com — we keep deletion-confirmation records for 30 days for compliance."

---

## 18. System Alert *(internal)*

| Field | Value |
|---|---|
| Trigger | Uptime check every 15 min, on degraded |
| File | `uptime-check.ts:37` |
| Category | Internal ops |
| Recipient | `support@hirestepx.com` only |

**Subject**: `[ALERT] HireStepX services degraded: {service}: {status}`

**Body** (plain text, no HTML chrome)
```
Service: {service}
Status: {status}
Timestamp: {ISO}
Endpoint: {url}
Details: {raw json}
```

---

## Design checklist for new emails

1. **Subject ≤ 50 chars**, no ALL CAPS, no clickbait
2. **Preheader** set explicitly (don't let it auto-fill from body)
3. **One primary CTA** — anything else is a text link
4. **HTML-escape** every interpolated user value (already enforced server-side; double-check in templates)
5. **Plain-text alternative** included (Resend auto, but verify)
6. **Footer**: physical address + unsubscribe (lifecycle only) + "Why am I getting this?"
7. **Test rendering**: Gmail (web/iOS), Outlook desktop, Apple Mail — Litmus or Mailtrap before merge
8. **Dark mode**: avoid pure-white backgrounds for cards; use `#F9FAFB` so it inverts cleanly
9. **i18n note**: copy is English-only today; ₹ amounts always; IST for times where shown
10. **Tracking**: Resend open/click tracking on lifecycle, **off** for security/transactional

## When adding a new email type

1. Extract template into `server-handlers/_email-templates.ts` if it doesn't exist; keep templates pure
2. Add row to this doc (copy, file, trigger, rate limit)
3. Add a unit test for the template in `src/__tests__/emailTemplates.test.ts` (snapshot the HTML)
4. If lifecycle/marketing: gate behind user `email_preferences` column in `profiles`
5. Log via `service_usage` (fire-and-forget) for cost/volume tracking

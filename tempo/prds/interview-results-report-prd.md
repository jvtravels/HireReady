# PRD — Interview Results Report (Post-Session Feedback)

**Product:** HireStepX | **Owner:** Product + Eng | **Status:** Draft v1.0 | **Target ship:** V1 in \~3 weeks | **Stakeholders:** PM, Eng, Design, Data

---

## 1. TL;DR

After a mock interview, users currently see a shallow score screen — one overall number, a few skill bars, and static tips. This PRD specifies a replacement: a **research-backed, evidence-linked, closed-loop results report** that is demonstrably richer than every competitor we studied (Yoodli, Big Interview, Exponent, Final Round AI, HireVue, Interviewer.AI, Karat, etc.). The report unifies four categories no single competitor covers: **delivery analytics**, **STAR/content quality**, **role-specific competency scoring**, and **per-question actionable coaching** — with every metric tied to a timestamped transcript span and every weakness auto-routed to a targeted drill. V1 ships in three weeks on the existing Groq/Gemini LLM pipeline with one new API endpoint; V2 layers on longitudinal trends, company-calibrated bars, and an interviewer thought-bubble timeline.

---

## 2. Problem & Why Now

### Problem

The current `SessionDetailView` shows an overall score and a `skillScores` map. It answers "how did I do?" but not "**what do I fix, and how?**" — which is the actual job-to-be-done after a mock interview. Session completion → dashboard return → drop-off is where we lose users; they don't come back because the session didn't obviously improve their chances of an offer.

Qualitative signals from early users:

- "Score went up, but I don't know why."
- "I want to know what a recruiter would think."
- "I re-read my answer and can't tell if it was good."
- "Which answer was my worst? I forgot by the time the session ended."

### Why now

1. **Competitive gap is closing.** Final Round AI, Yoodli, and Exponent ship weekly. If we don't lead on the results screen — the single most-visited page in the app after a session — we look like a cheap copy.
2. **LLM cost economics just turned favorable.** A full-report evaluation using Groq llama-3.3-70b costs ≈ $0.002 per session at current prices. This was uneconomical 12 months ago.
3. **Retention ceiling.** Top-of-funnel is healthy; 7-day retention is not. The results report is the primary lever because it determines whether the product feels useful after the emotional high of the interview wears off.
4. **Research validation.** Structured behavioral interviews have predictive validity of r≈0.51 vs. r≈0.20 for unstructured (Schmidt & Hunter 1998; Campion 1997). The closer our scoring mirrors structured frameworks, the more real-offer-predictive our product becomes.

---

## 3. Goals & Non-Goals

### Business goals

| Goal | Metric | Target (90 days post-launch) |
| --- | --- | --- |
| Increase session completion-to-second-session retention | % users who start a 2nd session within 7 days | +40% (baseline TBD) |
| Increase perceived product value | NPS on "Would you recommend HireStepX?" | +10 pts |
| Drive subscription conversion | Free → paid within 14 days | +25% |
| Increase organic share | \# shares per completed session | ≥ 0.05 |

### User goals

- **Understand** how they performed, in language they trust
- **Identify** their 1-3 highest-leverage fixes
- **Act** on those fixes within the same session (one-click drill)
- **Progress** across sessions in a measurable way
- **Trust** the scoring — every claim grounded in their own words

### Non-goals (V1)

- Video capture or visual analysis (no camera capture today)
- Real-time coaching during interview (different product — "Copilot" territory)
- Recruiter-facing ATS integration
- Company-specific calibration (V2)
- Longitudinal trend view (V2, needs ≥3 sessions per user)
- Voice cloning / TTS playback of the restructured answer (V3)

---

## 4. Success Metrics

### Primary (North-star)

- **Session → Return-Session rate within 7 days** — lift from baseline
- **"Fix acted upon" rate** — % of sessions where the user clicks any of the three Next-Step CTAs in the report within 24h

### Secondary (Engagement)

- **Time-on-report** (median): target 2.5–4 min (too short = skipped; too long = confusing)
- **Per-question card expand rate**: target ≥ 60%
- **"Restructured answer" view rate**: target ≥ 70%
- **Report → drill conversion**: target ≥ 30%
- **PDF download rate** (V1 P1): target ≥ 8% of reports
- **Share rate**: target ≥ 5% of reports

### Qualitative

- **Trust poll** ("Do these scores feel fair?") on 10% of reports: target ≥ 75% Yes
- **Usefulness poll** ("Did this help you know what to improve?"): target ≥ 80% Yes

### Guardrails

- LLM p95 latency for `/api/evaluate-session`: ≤ 12s
- LLM cost per session: ≤ $0.01
- Report page LCP: ≤ 2.5s on cached profile; ≤ 4s cold
- JSON payload: ≤ 80 KB per report
- Error-state rate: ≤ 1% of sessions

---

## 5. Target Users & Personas

### Persona A — "First-attempt Nisha" (new graduate)

- **Context:** CS grad, applying to Indian product companies and FAANG campus
- **Need:** Confidence + concrete fixes; hasn't seen real interview feedback before
- **Report emphasis:** STAR coaching, quantification prompts, model answers
- **Failure mode we avoid:** Overwhelming her with 20 metrics

### Persona B — "Career-switcher Arjun" (mid-career, changing functions)

- **Context:** 6 yrs backend → wants to move to PM; story-telling is his weakness
- **Need:** Evidence that his stories don't yet land; how to reframe
- **Report emphasis:** STAR compliance, first-person ownership ratio, restructured answers with citations
- **Failure mode:** Generic advice that doesn't use his actual words

### Persona C — "Senior IC Priya" (staff engineer, returning to market)

- **Context:** 10 yrs at one company; rusty on interviewing
- **Need:** Calibration — "am I at bar for L6 Google?"
- **Report emphasis:** Role-weighted skills radar, verdict band, fixable deltas
- **Failure mode:** Telling her she's weak on things L6 interviews don't care about

### Persona D — "FAANG-loop Vikram" (currently interviewing)

- **Context:** Onsite in 10 days at three top-tier companies
- **Need:** Tight, specific, bar-raiser-grade feedback; drills he can run twice daily
- **Report emphasis:** Per-question depth, red-flag signals, story-reuse detection (V2)
- **Failure mode:** Feel-good fluff instead of bar-calibrated criticism

---

## 6. User Journeys

### J1: Nisha completes her first behavioral session (new graduate)

1. Session ends → spinner: "Grading your interview…" (LLM call)
2. Report loads — hero: score 54/100, band **Lean Hire**, verdict *"Good problem framing; answers lacked measurable outcomes."*
3. She reads top 3 fixes. Clicks expand on Q3 (her weakest). Sees her own words highlighted — hedges in yellow, missing numbers called out.
4. Scrolls to restructured STAR with `[1][2][3]` citations — sees her Situation reframed with a specific metric inferred from context.
5. Clicks **"Practice quantification"** — routed to a 5-question drill pack focused on outcome-quantified behavioral answers.
6. Returns 2 days later for session 2.

### J2: Vikram preps for onsite (FAANG candidate)

1. Completes 45-min system-design mock.
2. Report loads. Hero verdict: *"Strong on trade-offs, weak on scoping."*
3. Glances at Core Metrics strip — Pace 198 wpm (red, too fast). Notes it.
4. Expands every question card in &lt;90s, scanning for red verdict tags.
5. Clicks **"Try this question again"** on the weakest — immediately launches a solo re-attempt.
6. Downloads PDF to share with mentor.

### J3: Arjun prepares a story portfolio (career-switcher)

1. Completes a behavioral mix session.
2. Notices **first-person ownership ratio** flag: 72% "we" vs 28% "I" across stories.
3. Clicks **"Save top story to Notebook"** — extracts his best STAR story. Plans to reuse it.
4. Comes back next week specifically to drill stories with higher "I" ownership.

### J4: Priya diagnoses her gaps (senior IC)

1. Completes a leadership session.
2. Skills radar shows weak **Influencing**, strong **Technical Depth**.
3. Per-question review shows her answers over-index on HOW, miss WHY (decision-making framing).
4. Opens the restructured answer and uses it as a template for future answers.
5. Shares her score card internally to a peer circle.

---

## 7. Feature Specification — V1

### 7.1 Hero Section

**Components:**

- **Overall score:** big numeric 0–100, right-aligned
- **Band label:** one of **Strong Hire / Hire / Lean Hire / No Hire / Strong No Hire** (plain, honest language)
  - Thresholds (V1, uncalibrated): ≥85 Strong Hire, 70-84 Hire, 55-69 Lean Hire, 40-54 No Hire, &lt;40 Strong No Hire
- **Session meta chip row:** Company · Role · Level · Difficulty · Date · Duration
- **One-line verdict:** LLM-generated, ≤140 chars, in second person ("Your framing is strong, but…")
- **Top 3 wins:** bullet list, each anchored to `Q{n}` with quoted fragment
- **Top 3 fixes:** bullet list, each with imperative phrasing ("Quantify the result in Q3") + anchor

**Behavior & edge cases:**

- If fewer than 3 wins/fixes can be honestly found, show as many as exist (never pad).
- If session score &lt; 30, replace "Top 3 wins" with "Smallest first step" — avoids demoralizing empty state.
- Session meta is clickable: Company → re-queues a session with same company; Role → sets filter.

**Loading state:** Skeleton shimmer on score tile + verdict line; meta chips populate immediately from session record.

**Error state:** If LLM evaluation fails, render heuristic fallback hero with a subtle banner: *"AI analysis timed out — basic report below. Retry now →"* with retry CTA. The retry calls `/api/evaluate-session` again without re-running the interview.

**Empty state:** Session with &lt;30s total speech time → hero shows *"Too short to evaluate"* with CTA to retry a 5-min session. No score band shown.

### 7.2 Core Objective Metrics Strip (4 tiles)

| Tile | Formula | Target band | Color logic |
| --- | --- | --- | --- |
| **Filler words / min** | count(`um`, `uh`, `like`, `you know`, `so`, `actually`, `basically`) / minutes of speech | 0–3 | Green ≤3, Amber 4–6, Red &gt;6 |
| **Silence ratio %** | Σ (inter-word pauses &gt; 1.5s) / total session duration × 100 | 0–20% | Green ≤20, Amber 21–30, Red &gt;30 |
| **Pace (wpm)** | total words / minutes of speech | 140–180 | Green 140–180, Amber 125–139 or 181–200, Red &lt;125 or &gt;200 |
| **Energy /100** | existing heuristic from `interviewEvaluation.ts`, normalized to 0–100 | 60–100 | Green ≥60, Amber 40–59, Red &lt;40 |

**Each tile shows:** metric value, unit, target band (small gray text), status dot, brief copy line ("Slightly fast — try to slow down on key points"). Hover reveals formula + why it matters.

**Research basis (cite in tooltips):**

- Filler rate: Bortfeld et al. 2001; &gt;6/min reads as unprepared
- Pace: National Center for Voice & Speech — 140–180 wpm is conversational sweet spot
- Silence: Brennan & Williams 1995 — filled pauses &gt;2s increase uncertainty
- Energy/prosody: Rosenberg & Hirschberg 2009 — variance correlates with charisma

**Edge cases:**

- Interview &lt;60s: show tiles as "—" with tooltip "Not enough speech."
- Filler detection disagrees with user's first language (e.g. Hinglish): V1 detects English fillers only; add a footnote "English-only detection."
- Pace heavily skewed by long think-pauses: we exclude pauses &gt;3s from the denominator so pace reflects active speech.

### 7.3 Skills Breakdown

**Data source:** `skillScores` object from LLM evaluation, already in the pipeline. V1 shows 5 axes weighted to the session's role:

| Role family | Axes (weights shown) |
| --- | --- |
| SWE | Problem Framing (1.0), Technical Depth (1.2), Trade-off Reasoning (1.0), Communication (1.0), Ownership (0.8) |
| PM | Product Sense (1.2), Analytical (1.0), Execution (1.0), Influencing (1.1), Customer Focus (1.0) |
| EM / Leadership | Strategic Thinking (1.2), People Management (1.2), Execution (1.0), Communication (1.0), Conflict Handling (1.0) |
| Data | Analytical (1.2), Technical Depth (1.1), Business Impact (1.0), Communication (1.0), Ownership (0.8) |
| Behavioral (default) | Structure (1.1), Ownership (1.0), Impact (1.1), Communication (1.0), Composure (0.9) |

**Render:** Horizontal bar chart (not radar in V1 — radar misreads with &lt;5 axes). Each bar: user score, static role-average overlay, delta label ("+12 above avg").

**Logic:** Role-weighted composite is stored per session but NOT shown as a second number — overall score already serves that purpose.

**Cohort placeholder for V1:** static averages from a seed table (literal constants in `roleBenchmarks.ts`). Recomputed monthly from aggregated session data starting V2.

### 7.4 Per-Question Deep-Dive Cards

The heart of the report. One collapsible card per question.

**Card content (collapsed state):**

- Question number + first \~80 chars of question
- Verdict chip (colored): **Strong / Complete / Partial / Weak / Off-topic**
- Per-answer score (0–100), right-aligned
- Expand toggle

**Card content (expanded state):**

- Full question text
- **Your answer** section: full transcript with inline highlight spans:
  - `<mark class="filler">um</mark>` — yellow underline
  - `<mark class="hedge">I think</mark>` — grey italic
  - `<mark class="quant">40%</mark>` — green underline
  - `<mark class="firstperson">I led</mark>` — blue bold
- **STAR compliance chips:** `S` `T` `A` `R` — each chip solid if detected, outlined if missing
- **Metrics ribbon for this answer:** Length (wc), Response latency (s), First-person ratio, Quantification count
- **Restructured STAR answer:** LLM-rewrite of the candidate's answer in STAR+L form, with `[1][2][3]` citation markers linking back to spans in the original. Hover a citation → highlights the source span.
- **Verdict explanation:** 1–2 sentences from the LLM ("Your answer identifies the situation but skips the result.")
- **Actions:** `Save to Notebook`, `Try this question again`

**STAR compliance detection:** The LLM evaluation prompt (see §11) classifies each answer into Situation/Task/Action/Result/Learning spans and returns `presence: { S: bool, T: bool, A: bool, R: bool, L: bool }`. Chip is solid if present with ≥1 sentence, outlined otherwise.

**Research basis:**

- STAR structure: SHL Universal Competency Framework; Big Interview's STAR Analyzer; structured-interview predictive validity (Schmidt & Hunter 1998)
- Quantification density: Campion et al. 1997 meta-analysis — quantified answers rate 1.5× higher in structured scoring
- First-person ratio: behavioral scoring penalizes over-"we" in accomplishment statements
- Hedging density: Hyland 1998; Jensen 2018 — hedges reduce perceived authority

**Edge cases:**

- Candidate answered "I don't know" or skipped → verdict chip **Skipped**, no restructured answer, coaching shows "It's OK to skip — here's a framework to attempt next time."
- Multi-part question — LLM evaluation handles as one composite; card shows Q a/b/c sub-tags if detected.
- Very long answer (&gt;400 words): restructured answer compressed to 3 paragraphs; original stays full-length with a `Collapse` toggle.

### 7.5 Next Steps (3 CTAs)

Three buttons below per-question section:

1. **🎯 Try your weakest question again** — opens the single worst-scoring question as a solo 1-question mock, preserving context
2. **📋 Save top story to Notebook** — extracts the highest-scoring answer's STAR into a reusable story entry
3. **📊 Drill your weakest skill** — creates a 5-question session with focus pre-set to the lowest-scoring skill

**Logic:** If the session had fewer than 3 questions, hide Try-again and show just the other two. If the candidate has no saved stories yet, the Notebook CTA has a contextual tooltip "First story — this becomes the seed for your Story Bank."

### 7.6 Export / Share (P1 — week 2)

- **📄 Download PDF** — uses `react-to-print`, applies a print stylesheet with page breaks between sections. Branded header, subdued colors.
- **🔗 Share link** — generates a tokenized, read-only share URL (`/report/share/{token}`) that expires in 14 days; excludes raw transcript by default (candidate toggle). Copied to clipboard.
- **LinkedIn** — pre-fills a share draft: "I scored X/100 on my HireStepX mock interview for a {role} role. My strongest skill: {top skill}. #InterviewPrep #HireStepX"
- **WhatsApp** — same copy, mobile-first handoff

---

## 8. Research & Logic Backing Each Metric

| Metric | Research citation | Why it predicts real-offer success |
| --- | --- | --- |
| Overall score (structured) | Schmidt & Hunter 1998; McDaniel et al. 1994 | Structured interview predictive validity r≈0.51 vs unstructured r≈0.20 |
| STAR/STAR+L compliance | Campion, Palmer, Campion 1997 | Structure in answers correlates with rater accuracy |
| Quantification density | Campion 1997 | Quantified answers rate 1.5× higher in structured scoring |
| First-person ownership | SHL UCF rubrics | Behavioral scorers penalize over-"we" attributions |
| Filler rate | Bortfeld et al. 2001 | &gt;6 fillers/min reads as unprepared / uncertain |
| Pace (wpm) | NCVS research; communication studies | 140–180 wpm is listener-optimal |
| Silence / pause analysis | Brennan & Williams 1995 | Pauses &gt;2s signal uncertainty |
| Hedging density | Hyland 1998 | Hedges ("I think", "maybe") reduce perceived authority |
| Energy / prosody proxy | Rosenberg & Hirschberg 2009 | Pitch variance predicts charisma perception |

**Deliberate-practice angle (Locke & Latham 2002; Ericsson):** Scores alone change nothing; **specific, time-boxed, feedback-looped drills** do. Every weakness we surface must route to a drill with a measurable re-attempt. This is why §7.5 is a feature, not polish.

**Goal-setting theory (Locke & Latham 2002):** Specific + difficult goals outperform "do your best." The Top 3 Fixes section uses imperative specificity ("Quantify the outcome in Q3 to a % or $") not general advice ("be more specific").

---

## 9. API Contract — `/api/evaluate-session`

### Request

```
POST /api/evaluate-session
Authorization: Bearer <supabase-user-jwt>
Content-Type: application/json

{
  "sessionId": "string",
  "transcript": [
    {
      "role": "interviewer" | "candidate",
      "text": "string",
      "startMs": number,
      "endMs": number
    }
  ],
  "meta": {
    "role": "string",
    "roleFamily": "swe|pm|em|data|behavioral",
    "targetCompany": "string|null",
    "level": "string|null",
    "difficulty": "warmup|standard|hard",
    "duration": number
  }
}
```

### Response

```
200 OK
{
  "version": "1.0",
  "overallScore": number, // 0-100
  "band": "strongHire|hire|leanHire|noHire|strongNoHire",
  "verdict": "string", // ≤140 chars
  "wins": [{ "text": "string", "questionIdx": number, "quote": "string" }],
  "fixes": [{ "text": "string", "questionIdx": number, "quote": "string" }],
  "coreMetrics": {
    "fillerPerMin": number,
    "silenceRatio": number,
    "paceWpm": number,
    "energy": number
  },
  "skills": [
    { "name": "string", "score": number, "cohortAvg": number, "weight": number }
  ],
  "perQuestion": [
    {
      "idx": number,
      "question": "string",
      "answerText": "string",
      "verdict": "strong|complete|partial|weak|offtopic|skipped",
      "score": number,
      "starPresence": { "S": bool, "T": bool, "A": bool, "R": bool, "L": bool },
      "metrics": {
        "wordCount": number,
        "latencyMs": number,
        "firstPersonRatio": number, // 0-1
        "quantCount": number,
        "hedgeCount": number
      },
      "highlights": [
        { "type": "filler|hedge|quant|firstperson", "start": number, "end": number }
      ],
      "restructured": {
        "text": "string",
        "citations": [{ "markerIdx": number, "sourceStart": number, "sourceEnd": number }]
      },
      "explanation": "string"
    }
  ]
}

4xx/5xx: { "error": "string", "code": "string", "retryable": bool }
```

### Caching

Response is deterministic given `sessionId` + model version. Cache keyed on `(sessionId, promptVersion)`. On re-request within 24h, serve from cache (allows user to re-open report without re-spending LLM tokens).

### Security

- Service-role auth on write side only
- User auth required; service verifies the session belongs to the calling user
- Rate limit: 3 evaluations per session-id per hour (prevent abuse / retry storms)

---

## 10. Data Model Changes

### `sessions` table (additive, non-breaking)

```
alter table sessions
  add column if not exists report_json jsonb,     -- full evaluate-session response
  add column if not exists report_version text default 'v1',
  add column if not exists report_generated_at timestamptz;

create index if not exists idx_sessions_report_generated on sessions(report_generated_at);
```

### `story_notebook` table (new, for §7.5 "Save to Notebook")

```
create table if not exists story_notebook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  session_id text references sessions(id) on delete set null,
  question_idx integer,
  title text,
  star jsonb,         -- { S: text, T: text, A: text, R: text, L: text }
  tags text[] default '{}',
  created_at timestamptz default now(),
  last_used_at timestamptz
);

alter table story_notebook enable row level security;
create policy "Users manage own stories" on story_notebook for all using (auth.uid() = user_id);
```

No other tables affected. The `llm_usage` table already captures each evaluation call for observability.

---

## 11. LLM Prompt Design Guidance

**Model:** Groq `llama-3.3-70b-versatile` primary, Gemini 2.0 Flash fallback (existing pipeline). **Temperature:** 0.25 for scoring stability. **Max tokens:** 4500 — the per-question section is the bulk. **Response format:** JSON mode (`response_format: { type: "json_object" }`). **Timeout:** 20s (one 2x retry via the existing `callLLM` wrapper).

**Prompt structure:**

1. **System role:** "You are a senior I-O-psychology-trained interview scorer calibrated to structured-interview rubrics (SHL UCF, STAR+L)."
2. **Context block:** session meta (role, company, level, difficulty)
3. **Transcript block:** numbered turns with timestamps
4. **Rubric block:** 5-axis skill rubric for the role-family with anchored descriptors (e.g. "Technical Depth: 85+ = production-grade trade-off reasoning with named systems; 60-84 = correct but generic; &lt;60 = fundamental gaps")
5. **Output schema block:** explicit JSON schema mirroring §9 response
6. **Guardrails block:**
   - Never invent quantitative claims the candidate didn't make
   - Every `wins[].quote` and `fixes[].quote` must be a verbatim substring of the candidate's answers
   - Every `highlights[]` span must match exact text offsets
   - Restructured answer must only use facts already in the candidate's words; "fabricated metric" counts as a fail
   - If the candidate skipped a question, verdict=`skipped`, restructured=`null`

**Validation layer (post-LLM, pre-return):**

- Verify `wins[].quote` and `fixes[].quote` are substrings of the transcript (reject response if not)
- Verify all span offsets are valid
- Verify `restructured.citations[].sourceStart/sourceEnd` reference actual candidate text
- If validation fails → fallback to a heuristic scoring path (no restructure, no citations) + log to `llm_usage` with `status='error'` and `errorMessage='validation_failed'`

**Prompt versioning:** `report_version` stored with each session. Never silently change a prompt that has shipped — bump version, and cache key forces re-eval only if user requests a "re-score with latest AI" flow (V2).

---

## 12. Analytics Events

Instrument with PostHog.

| Event | Properties | When |
| --- | --- | --- |
| `report_viewed` | sessionId, score, band, role, timeToFirstPaintMs | On report mount |
| `report_section_viewed` | section (hero/metrics/skills/perQuestion/next), sessionId | Each section intersects viewport ≥50% |
| `report_question_expanded` | sessionId, questionIdx, verdict | Card expanded |
| `report_restructure_viewed` | sessionId, questionIdx | Restructured answer scrolled into view |
| `report_citation_hovered` | sessionId, questionIdx, citationIdx | Citation marker hover |
| `report_action_clicked` | action (try_again/save_story/drill_skill/pdf/share), sessionId | CTA click |
| `report_pdf_downloaded` | sessionId | PDF download click |
| `report_shared` | channel (link/linkedin/whatsapp), sessionId | Share click |
| `report_retry_requested` | sessionId, reason (timeout/error) | Retry CTA click |
| `report_llm_completed` | sessionId, latencyMs, tokens, model, fallback | LLM call returned |
| `report_llm_failed` | sessionId, errorCode, latencyMs | LLM call failed |
| `report_trust_poll_submitted` | sessionId, fair (bool) | Trust poll answer |
| `report_usefulness_poll_submitted` | sessionId, useful (bool) | Usefulness poll answer |

**Funnel to track:** session_completed → report_viewed → report_section_viewed (perQuestion) → report_action_clicked → session_started (next one).

---

## 13. A/B Test Ideas (Post-V1)

1. **Hero layout** — Score-first vs Verdict-first — which drives more section scrolls?
2. **Fix phrasing** — Imperative ("Quantify Q3") vs Explanatory ("Q3 missed a measurable outcome") — which drives more drill clicks?
3. **Restructured answer expand default** — Collapsed vs Expanded — which drives more Notebook saves without reducing scroll-through?
4. **Band label wording** — "Strong Hire / No Hire" vs "Interview-Ready / Keep Practicing" — which drives higher NPS without softening signal?
5. **Primary CTA** — Single "Try your weakest Q again" hero button vs three-up CTA row — which drives more return sessions?
6. **Trust poll placement** — Footer vs inline after Top 3 Fixes — which yields more responses without reducing engagement?

---

## 14. Accessibility Requirements

- **WCAG 2.1 AA compliance** across the entire report
- **Color-independent status** — every color-coded metric also has an icon + text label (green/amber/red dots are duplicated with "On target / Slightly off / Needs work")
- **Contrast ratios** — body text 4.5:1 minimum, large text 3:1; verify the brand gilt color (#D4B37F) against obsidian (#111113) (currently 6.3:1, passes)
- **Keyboard navigation** — every card expand toggle, every CTA, every citation marker is keyboard reachable with `Tab`/`Shift+Tab`; `Enter`/`Space` activates
- **Screen-reader labels** — charts have `aria-label` summarizing the visual (e.g. "Skills chart: Communication 72, Technical Depth 85…"); citation markers announce "Citation 1, links to answer text starting 'At my last company'"
- **Focus management** — when a question card expands, focus moves to the first interactive element inside
- **Reduced motion** — `prefers-reduced-motion` disables the entrance animations on section reveal
- **Transcript is keyboard-scrollable** within the card even when collapsed parents are open
- **Text alternatives** for the skills chart (a hidden table with the same data for screen readers)

---

## 15. Performance Budgets

| Metric | Target | Rationale |
| --- | --- | --- |
| TTFB on `/api/evaluate-session` (p50) | ≤ 8s | LLM bound; user sees skeleton |
| TTFB p95 | ≤ 12s | Hard cap; retry path after |
| Report page LCP (cached) | ≤ 2.5s | Session already stored |
| Report page LCP (cold eval) | ≤ 4s | Includes eval call |
| JSON payload | ≤ 80 KB | Typical 15-Q session ≈ 40 KB |
| First interactive (TTI) | ≤ 3s after LCP | React hydration |
| PDF generation | ≤ 3s client-side | `react-to-print` client-rendered |
| LLM cost per session | ≤ $0.01 | ≈ 4.5k tokens @ Groq pricing |

**Measurement:** PostHog `$performance` events + Vercel Real User Monitoring. Alert on p95 regressions ≥15%.

---

## 16. Rollout Plan

| Phase | Duration | Scope | Exit criteria |
| --- | --- | --- | --- |
| **Staging** | 3–4 days | Internal team + 5 invited power users | ≥10 sessions evaluated, zero JSON-validation failures, latency p95 &lt;12s |
| **Canary 10%** | 3 days | Random 10% of production users, stratified by paid/free | No error-rate regression on session completion; Trust poll ≥70% Yes; LLM error rate &lt;2% |
| **50%** | 3 days | Expand to half of production | Retention signal trending +; cost per session within budget |
| **100%** | — | Full rollout; old `SessionDetailView` removed from bundle after 2 more weeks of parallel running | — |

**Kill switch:** Feature flag `results_report_v1` in the env + admin panel toggle. Flipping off reverts users to the legacy `SessionDetailView` without deployment.

**Monitoring:** Vercel function logs for `[evaluate-session]`, `[logUsage]`, Supabase table `llm_usage` for per-call observability, PostHog dashboards for funnel.

---

## 17. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| LLM hallucinates quantitative claims the candidate didn't make | Medium | High — breaks trust | Post-LLM validation (§11) rejects responses whose quotes/citations aren't substrings; fallback to heuristic report if validation fails |
| Restructured answer feels like the AI "wrote a better you" (uncanny) | Medium | Medium | Explicit header "Coached version — built from your own words" with hover-to-see-source citation markers |
| Latency spike during LLM provider outage | Medium | High | Groq→Gemini automatic failover already exists; add a background retry queue so users can navigate away and get a notification when ready (V1 P1) |
| Cost per session exceeds budget as usage scales | Low-medium | Medium | Monitor `llm_usage.total_tokens`; compress transcript input to ≤3000 tokens by summarizing low-information turns if needed |
| Users feel scored unfairly (especially non-native English speakers) | High | High | Trust poll; filler detection footnote acknowledges English-only; V2 adds language-aware detection; never show "energy" score to users who opted out of mic analysis |
| STAR compliance false-negatives on non-STAR questions (e.g. system design) | High | Medium | LLM prompt includes question-type detection; STAR chips only render for behavioral/situational questions |
| Users dismiss the report before acting | Unknown | High | Three-CTA next-steps section; exit-intent drill suggestion modal (V1 P1) |
| JSON validation failures cause silent fallback that users notice | Low | Medium | Log + Sentry alert on `validation_failed`; weekly review; retrain prompt if rate &gt;2% |
| Accessibility regressions | Low | High | Axe-core CI check on the report page; manual screen-reader walkthrough before canary |

---

## 18. Open Questions

1. **Band thresholds:** Are 85/70/55/40 the right cutoffs, or should we tune post-canary based on actual distribution?
2. **Verdict copy tone:** Honest-direct ("Your answer skipped the result") vs Coach-warm ("You're close — just add the result"). A/B candidate.
3. **Trust poll:** Inline (higher response rate) vs post-view (lower bias)?
4. **Skill axes:** Keep static per role-family or allow interviewer-type-specific (tech screen vs onsite vs final round)?
5. **Restructured answer visibility:** Always on vs gated behind "Show coached version" click (reduces uncanny feel)?
6. **Notebook stories:** Auto-save top story silently, or require explicit Save click?
7. **Share defaults:** Include score number in LinkedIn copy or only skill name?
8. **Localization:** V1 is English-only; when do we add Hindi transcript handling for Indian bilingual users?
9. **Free vs paid gating:** Is the full restructured answer a premium feature, or part of free tier?

---

## 19. Milestones & Timeline

| Week | Milestone | Effort | Owner |
| --- | --- | --- | --- |
| **W1** | API scaffold `/api/evaluate-session` + prompt v1 + JSON validation layer | 3d eng + 0.5d prompt eng | Backend eng |
| **W1** | `SessionDetailView` rewrite scaffold — hero + core metrics + skills bar | 2.5d eng + 2d design | Frontend eng + Design |
| **W2** | Per-question deep-dive cards (full behavior) | 3d eng | Frontend eng |
| **W2** | Next-steps CTA wiring (try-again, notebook, drill) + `story_notebook` table + policies | 2d eng | Fullstack eng |
| **W2** | Analytics events instrumented | 0.5d eng | Frontend eng |
| **W3** | PDF export + share links + LinkedIn/WhatsApp | 2d eng | Frontend eng |
| **W3** | A11y pass + perf tuning + feature flag wiring | 1.5d eng | Frontend eng |
| **W3** | Staging bake + internal review + 5 power-user test | 2d total | PM + QA |
| **W4** | Canary 10% → 50% → 100% | rolling | All |

**Total V1 engineering estimate:** ≈ 16 engineering days (≈ 3 weeks with one backend + one frontend engineer, parallelized).

---

## 20. V2 Roadmap Preview

Not shipping V1, but designed for additively:

- **Longitudinal trend** — line chart of overall + skill scores across all sessions; predicted readiness date
- **Company-calibrated bars** — target company changes band thresholds and skill weights; calibration seed from Glassdoor + Blind + proprietary loop data
- **Red-flag detector** — fires on blame language, missing result, excessive "we", scope drift, contradictions across answers
- **Interviewer thought-bubble timeline** — inferred interviewer cognitive state ("tracking / losing thread / probing for scope") per 15s window
- **Advanced delivery analytics** — pitch variance, hedging density timeline, lexical diversity (MTLD), response latency distribution, self-correction rate
- **Video timeline annotations** — once camera capture ships
- **Weekly progress email** — personalized summary + one drill nudge
- **Peer percentile** ("top 18% of this week's Stripe SWE candidates") — live-refreshed from anonymized aggregates
- **Recruiter-shareable card** — branded, candidate-controlled visibility, LinkedIn-native embed
- **Story Bank spaced repetition** — weak stories resurface on a Leitner schedule
- **Regenerate-in-my-voice** — TTS playback of the restructured answer in a cloned candidate voice for shadow-reading
- **Hiring-manager simulator view** — same report toggleable to recruiter-POV scorecard
- **Time-to-offer predictor** — "Ready for onsite in \~12 focused hours" with confidence interval
- **Hidden-bias language check** — flags over-hedging / over-apology patterns that disadvantage speakers, with rewrites
- **Bar-raiser replay** — replay a past answer against a harder rubric (E4 → E5 → E6) to show what would need to change
- **Blind-spot map** — competencies never asked about, so the candidate doesn't overfit

---

## Appendix — Sources

- Schmidt & Hunter, "The Validity and Utility of Selection Methods" (1998), Psychological Bulletin.
- McDaniel et al., "The Validity of Employment Interviews" (1994).
- Campion, Palmer, Campion, "A Review of Structure in the Selection Interview" (1997).
- Locke & Latham, "Building a Practically Useful Theory of Goal Setting and Task Motivation" (2002), American Psychologist.
- Bortfeld, Leon, Bloom, Schober, Brennan, "Disfluency rates in conversation" (2001), Language and Speech.
- Rosenberg & Hirschberg, "Charisma Perception from Text and Speech" (2009), Speech Communication.
- Brennan & Williams, "The feeling of another's knowing: Prosody and filled pauses as cues to listeners about the metacognitive states of speakers" (1995), Journal of Memory and Language.
- Hyland, "Hedging in Scientific Research Articles" (1998), John Benjamins.
- Brysbaert, Warriner, Kuperman, "Concreteness ratings for 40 thousand English lemmas" (2014), Behavior Research Methods.
- McCarthy & Jarvis, "MTLD, vocd-D, and HD-D: A validation study" (2010), Behavior Research Methods.
- Jensen, "Hedging in interviews" (2018).
- SHL Universal Competency Framework whitepapers (shl.com).
- Internal research brief: *HireStepX Interview-Results Research Brief* (this repo, Apr 2026).
- Competitor product pages audited: yoodli.ai, biginterview.com, tryexponent.com, finalroundai.com, interviewer.ai, hirevue.com, karat.com, huru.ai, interviewing.io, grow.google/certificates/interview-warmup, leetcode.com/interview, educative.io/mock-interview, modernhire.com.
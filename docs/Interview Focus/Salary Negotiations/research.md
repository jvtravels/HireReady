# Salary Negotiation Interview — Research Document

## Overview

The salary negotiation module simulates a realistic conversation between a candidate and a hiring manager discussing compensation, benefits, and employment terms. Unlike all other interview types, this is NOT a Q&A format — it's a continuous multi-turn conversation that follows a natural negotiation arc. The AI acts as a hiring manager with a defined negotiation band, style, and scenario.

**Target Audience**: All experience levels — especially those transitioning to higher roles or companies **Session Duration**: 10-25 minutes (5-6 conversational turns) **Key Competencies**: Anchoring, package thinking, leverage use, concession strategy, closing technique, composure **Important**: NOT evaluated using STAR structure. Evaluated on 5 core negotiation competencies.

---

## Indian Market Context

### Why Salary Negotiation Training Matters in India

1. **Cultural reluctance**: Indian professionals often accept first offers due to cultural conditioning ("it's rude to negotiate")
2. **Information asymmetry**: Candidates rarely know the company's actual band — HireStepX reveals this post-session
3. **CTC confusion**: Indian compensation structures (basic, HRA, special allowance, PF, gratuity, variable) are complex and deliberately opaque
4. **Notice period leverage**: 60-90 day notice periods create negotiation leverage that candidates rarely use
5. **Counter-offer dynamics**: 40-60% of Indian tech professionals receive counter-offers — knowing how to handle them is critical
6. **Gender pay gap**: Women in India negotiate 25-30% less frequently than men (Glassdoor India data)

### Indian Compensation Structure

| Component | Typical % of CTC | Notes |
| --- | --- | --- |
| Basic Salary | 40-50% | Base for PF, gratuity calculation |
| HRA | 15-25% | Higher in metro cities |
| Special Allowance | 10-20% | Flexible component |
| PF (Employer) | 12% of Basic | Mandatory above ₹15K/month |
| Gratuity | 4.81% of Basic | Payable after 5 years |
| Variable Pay | 10-20% | Performance-linked |
| ESOPs | 0-40% | Common in startups, rare in services |
| Joining Bonus | One-time | ₹50K-10 LPA depending on level |

### Salary Benchmarks by Role and City (2025-26)

#### Software Engineering

| Level | Bangalore | Delhi NCR | Mumbai | Pune | Hyderabad |
| --- | --- | --- | --- | --- | --- |
| SDE-1 (0-2 yr) | ₹8-18 LPA | ₹7-15 LPA | ₹7-14 LPA | ₹6-14 LPA | ₹7-15 LPA |
| SDE-2 (2-5 yr) | ₹18-35 LPA | ₹15-30 LPA | ₹14-28 LPA | ₹14-28 LPA | ₹15-30 LPA |
| Senior (5-8 yr) | ₹30-55 LPA | ₹25-45 LPA | ₹22-40 LPA | ₹22-40 LPA | ₹25-45 LPA |
| Staff (8-12 yr) | ₹50-90 LPA | ₹40-75 LPA | ₹35-65 LPA | ₹35-60 LPA | ₹40-75 LPA |
| Principal (12+ yr) | ₹80-1.5 Cr | ₹60-1.2 Cr | ₹55-1 Cr | ₹50-90 LPA | ₹60-1.2 Cr |

#### Product Management

| Level | Bangalore | Delhi NCR | Pune |
| --- | --- | --- | --- |
| APM (0-2 yr) | ₹12-22 LPA | ₹10-18 LPA | ₹10-18 LPA |
| PM (3-6 yr) | ₹25-50 LPA | ₹20-40 LPA | ₹18-35 LPA |
| Senior PM (6-10 yr) | ₹45-80 LPA | ₹35-65 LPA | ₹30-55 LPA |
| Director (10+ yr) | ₹70-1.5 Cr | ₹55-1.2 Cr | ₹45-90 LPA |

#### Data Science / ML

| Level | Bangalore | Delhi NCR |
| --- | --- | --- |
| Junior (0-2 yr) | ₹10-20 LPA | ₹8-16 LPA |
| Mid (3-5 yr) | ₹22-40 LPA | ₹18-32 LPA |
| Senior (5-8 yr) | ₹35-65 LPA | ₹28-50 LPA |
| Lead (8+ yr) | ₹55-1 Cr | ₹45-80 LPA |

### City Tiers and Adjustments

- **Tier 1** (100%): Bangalore, Delhi NCR, Mumbai, Pune, Hyderabad
- **Tier 2** (70-85%): Chennai, Kolkata, Chandigarh, Indore, Ahmedabad, Jaipur
- **Tier 3** (55-70%): Smaller cities, remote-first roles

---

## Conversation Arc

### Phase 1: Offer Reaction

**AI says**: "We're offering you ₹X LPA as your total CTC..." **What to evaluate**: Did they accept too quickly? Ask clarifying questions? Express interest without committing?

### Phase 2: Probe Expectations

**AI says**: "What range were you targeting for this move?" **What to evaluate**: Did they anchor high with market data? Avoid revealing exact current CTC? Frame around value, not needs?

### Phase 3: Counter-Offer

**AI says**: "That's above our initial band. Let me see what I can do..." **What to evaluate**: Did they negotiate beyond base? Explore multiple levers? Maintain leverage?

### Phase 4: Benefits Discussion

**AI says**: "Beyond base, there's equity, learning budget, flexibility..." **What to evaluate**: Did they think total comp? Prioritize clearly? Explore non-salary items?

### Phase 5: Closing Pressure

**AI says**: "This is at the top of our band. I have another strong candidate..." **What to evaluate**: Did they handle pressure? Negotiate deadline tactics? Not cave?

### Phase 6: Final Closing

**AI says**: "I'll send the formal offer letter. Any final questions?" **What to evaluate**: Did they confirm all terms? Set clear next steps?

---

## Negotiation Mechanics

### Negotiation Band System

Each session generates a negotiation band with:

- **Initial Offer**: Starting number the AI presents (typically 70-80% of band midpoint)
- **Walk-away**: Minimum the AI can go (below this, the AI walks away)
- **Max Stretch**: Highest possible package
- **Band Context**: Why this range exists ("internal equity", "budget constraints")

### Offer Structure Variations (Randomized)

- **Structure A**: Fixed CTC breakdown (base + variable + benefits)
- **Structure B**: CTC with joining bonus and relocation
- **Structure C**: Range-based ("₹X-Y depending on final structure")
- **Structure D**: Cash + ESOPs + joining bonus
- **Structure E**: Comp band positioning ("above midpoint")
- **Structure F**: Minimal opening (just a number)

### Negotiation Styles

| Style | Behavior | When Assigned |
| --- | --- | --- |
| Cooperative | Open to trade-offs, collaborative, shares band context | Avg score &lt; 65 (easier) |
| Defensive | Deflects, delays, avoids committing to numbers | Avg score 65-78 (medium) |
| Aggressive | Budget-conscious pushback, firm, uses pressure | Avg score 78+ (hardest) |

### Multi-Round Scenarios

| Scenario | Description |
| --- | --- |
| Standard | Typical offer negotiation |
| Lowball Recovery | Offer 20-30% below market — fight back |
| Exploding Offer | 24-hour deadline — handle pressure |
| Competing Offers | Use multiple offers as leverage |

### Monotonic Offer Rule (Critical)

- AI offers can ONLY go UP as negotiation progresses
- If ₹18 LPA offered initially, every subsequent offer must be &gt;= ₹18 LPA
- Server-side clamping prevents AI from offering less than previous highest

---

## Evaluation Framework

### 5 Core Negotiation Competencies (Scored 0-100 each)

1. **Anchoring**

   - Did they state a number with market justification?
   - Did they anchor HIGH enough?
   - Did they reveal current CTC without leverage? (negative)
   - Did they reference market data (levels.fyi, Glassdoor, AmbitionBox)?

2. **Package Thinking**

   - Did they negotiate beyond base salary?
   - Topics explored: equity/ESOPs, joining bonus, remote/flexibility, health insurance, learning budget, career growth, notice period, relocation, variable pay, title/level
   - Did they think in total compensation, not just fixed pay?

3. **Leverage Use**

   - Did they mention competing offers?
   - Did they reference market data, unique skills, or notice period as leverage?
   - Did they mention BATNA (Best Alternative to Negotiated Agreement)?
   - Or did they negotiate from a position of weakness?

4. **Concession Strategy**

   - When pushback happened, did they TRADE (not just concede)?
   - "I can accept ₹X base if you add ₹Y joining bonus" — give to get
   - Or did they cave immediately?
   - Did they make conditional concessions?

5. **Closing Technique**

   - Did they set clear next steps?
   - Handle deadline pressure without folding?
   - Confirm the FULL package (not just base)?
   - Ask for offer letter timeline?
   - Or leave things ambiguous?

### Scoring Rubric

- **90-100**: Anchored with market data, negotiated beyond base (equity, benefits, flexibility, joining bonus), maintained composure under pressure, used competing offers/BATNA strategically, explored creative trade-offs, closed with explicit confirmation. Bonus for: tactical silence, asking for time, deflecting current CTC
- **75-89**: Good instincts — stated expectations with reasoning, explored multiple components, handled pushback. But missed one key lever or accepted too quickly
- **60-74**: Basic — stated a number without justification, didn't explore beyond base, revealed current salary too early, folded under pressure
- **Below 60**: No negotiation — accepted first offer, no counter, couldn't articulate expectations, or adversarial/unprofessional

### Negotiation Facts Tracked

| Fact | Detection | Impact |
| --- | --- | --- |
| Accepted immediately | Quick acceptance without countering | \-25 leverage |
| Rejected outright | "No way", "insulting" | \-10 leverage |
| Named specific number | ₹X LPA with reasoning | +15 leverage |
| Mentioned competing offers | Other company offers | +20 leverage |
| Explored benefits | Equity, bonus, flexibility | +5 per topic |
| Revealed current CTC | "I'm currently earning..." | Negative signal |
| Used tactical silence | Very short strategic responses | +10 leverage |
| Mentioned BATNA | Walk-away alternative | +15 leverage |
| Expressed surprise | "That's lower than I expected" | +5 leverage (flinch tactic) |
| Asked for time | "Let me think about it" | +5 leverage |
| Deflected numbers | "What's your offer first?" | +5 leverage |

---

## Live Dashboard Metrics

During the negotiation, candidates see:

1. **Phase progress bar**: 6 phases from offer-reaction to closing
2. **Position vs band**: Visual bar showing where current offer sits relative to walk-away and max-stretch
3. **Leverage meter**: 0-100% based on tactics used
4. **Voice confidence**: Web Audio API analysis of volume and steadiness
5. **Topics checklist**: 11 possible topics, checked off as discussed
6. **Phase guidance**: Real-time tips for current phase

---

## Post-Session Analysis

### Deal Summary Card

- Initial offer vs final package (% improvement)
- Band captured (% of available range)
- Manager style faced (Cooperative/Tough/Evasive)
- Benefits discussed (tags)
- Replay option with different manager style

### Annotated Replay

Turn-by-turn transcript with color-coded annotations:

- **Green**: Good tactics (anchoring, BATNA, market data)
- **Red**: Mistakes (early acceptance, CTC disclosure)
- **Gray**: Neutral observations

### Expert Comparison

"What would an expert negotiator say?" — verbatim expert response for each key turn

---

## Negotiation Levers to Teach

### Cash Levers

- Base salary increase
- Joining bonus (one-time, ₹50K-10 LPA)
- Retention bonus (annual, ₹1-5 LPA)
- Notice period buyout (current_monthly × notice_months × 1.5)
- Performance review timeline (6-month vs annual for faster promotion)
- Variable pay guarantee (first year guaranteed variable)

### Non-Cash Levers

- ESOPs/RSUs (0.01-0.5% for IC, 0.1-2% for leadership)
- Remote/hybrid work policy
- Learning & development budget (₹50K-2 LPA/yr)
- Health insurance upgrade (family coverage, OPD, dental)
- Relocation support (₹50K-3 LPA one-time)
- Title/level adjustment (impacts future salary trajectory)
- Sabbatical policy
- Home office setup budget

### Industry-Specific Packages

| Industry | Key Levers | Benchmark Companies |
| --- | --- | --- |
| Fintech | Variable pay 15-25%, compliance bonuses | Razorpay, PhonePe, CRED |
| FAANG | RSUs 20-40% of total comp, annual refreshers | Google, Amazon, Microsoft |
| Startup | ESOPs 0.01-2%, joining bonus, fast promotions | Seed to Series C |
| E-commerce | Base + GMV-linked bonus, employee discounts | Flipkart, Meesho, Nykaa |
| Consulting/IT | Variable 20-30%, overseas deputation = 2-3x | TCS, Infosys, Wipro |
| Government/PSU | No base negotiation — negotiate grade, city, housing | PSU, government roles |

---

## Common Mistakes to Coach Against

1. **Accepting too quickly**: "Sounds good, I accept!" — leaves ₹2-5 LPA on the table
2. **Revealing current CTC first**: Anchors you low — let the company make the first offer
3. **Only negotiating base**: Missing ₹3-10 LPA worth of other components
4. **No market data**: "I want more" without "levels.fyi shows ₹X for this level"
5. **Emotional response**: Getting defensive or aggressive when pushed back
6. **No competing offers**: Even if you don't have one, creating urgency matters
7. **Leaving it open**: "I'll think about it" without setting a follow-up date
8. **Ignoring equity**: ₹5 LPA in ESOPs could be worth ₹50 LPA at exit
9. **Not confirming the full package**: Verbal agreement without written confirmation

---

## Research Sources

- **levels.fyi**: Tech compensation data (India filter)
- **Glassdoor India**: Salary reviews and negotiation reports
- **AmbitionBox**: Indian company salary data
- **"Never Split the Difference" (Chris Voss)**: FBI negotiation tactics applicable to salary
- **"Getting to Yes" (Fisher & Ury)**: Principled negotiation framework
- **Negotiation Genius (Bazerman & Malhotra)**: Academic negotiation strategy
- **PayScale India**: Compensation surveys
- **NASSCOM salary reports**: India tech industry compensation trends
- **TeamLease Salary Primer**: India employment and salary data
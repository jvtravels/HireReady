# Case Study Interview — Research Document

## Overview

Case study interviews present real business scenarios that test analytical thinking, problem decomposition, hypothesis-driven reasoning, and actionable recommendation skills. Unlike behavioral interviews, case studies evaluate how candidates THINK through unfamiliar problems, not what they've done before. This format is standard at consulting firms and increasingly common at tech companies for PM and senior engineering roles.

**Target Audience**: Product Managers, Senior Engineers, Strategy roles, Consulting candidates
**Session Duration**: 10-25 minutes
**Key Competencies**: Problem decomposition, hypothesis formation, data-driven analysis, framework application, actionable recommendations
**Note**: STAR structure is NOT used — case studies follow a different evaluation format

---

## Indian Market Context

### Where Case Studies Are Used in India
- **Management Consulting**: McKinsey, BCG, Bain India — 2-3 case rounds per interview
- **Product roles at tech companies**: Google PM, Flipkart PM, Swiggy PM — product sense cases
- **Strategy roles**: Corporate strategy at Reliance, Tata, Mahindra
- **Indian B-school placements**: IIM, ISB, XLRI — case competitions as prep
- **Tech leadership**: VP/Director roles at startups — "How would you solve X?"

### India-Specific Case Themes
1. **E-commerce logistics**: Last-mile delivery in Tier 3 cities, COD vs prepaid conversion
2. **Fintech adoption**: UPI penetration, financial inclusion, digital lending
3. **EdTech challenges**: Post-COVID monetization, Tier 2/3 penetration, vernacular content
4. **Quick commerce**: 10-minute delivery economics, dark store placement
5. **India price sensitivity**: Freemium models, ₹99 price points, sachet pricing

---

## Question Bank

### Core Script (5 Questions)

1. **API Reliability & Churn**
   - "Your company's core API has 99.95% uptime but customers are churning citing 'reliability issues.' Latency p99 is 2 seconds. How would you investigate and address this?"
   - Tests: Problem decomposition, looking beyond obvious metrics, data-driven approach

2. **Competitive Feature Pressure**
   - "A competitor just launched a feature that took them 2 months. Your team estimates it would take 6 months due to tech debt. The CEO wants it in 3. How do you handle this?"
   - Tests: Stakeholder negotiation, creative scoping, technical trade-offs

3. **Team Morale & Attrition**
   - "Your engineering team of 40 has low morale. Attrition is at 25%. Exit interviews cite 'lack of growth' and 'unclear direction.' You have 90 days to turn it around. What do you do?"
   - Tests: People leadership, organizational diagnosis, quick wins vs structural changes

### Mini Question Bank (6 Variants)
- API quality issue with declining DAU
- Competitive feature pressure and timeline negotiation
- Team attrition 90-day turnaround
- Declining DAU with steady signups (investigation)
- Team disagreement on rewrite vs incremental approach
- New market entry with competitor dominance

---

## Evaluation Framework

### Scoring Rubric (NOT STAR)

**Standard**
- 90-100: Clear problem decomposition with hypothesis-driven approach, uses frameworks appropriately, supports reasoning with data estimates, presents actionable recommendation with expected impact
- 75-89: Good structure and analysis but missing data-backed reasoning OR recommendation lacks specificity
- 60-74: Identifies some issues but analysis is shallow — no clear framework, jumps to solutions without diagnosis, or recommendations are generic
- Below 60: No structured analysis, completely off-track, or fails to engage with the problem

**Warmup**
- Generous scoring — rewards any structured thinking, doesn't require data estimates

**Intense**
- Demands: Clear frameworks, hypothesis formation, data estimates, specific recommendations with expected ROI

### Micro-Feedback Detection
| Pattern | Check | Score Impact |
|---------|-------|--------------|
| Framework usage | `hypothesis\|assumption\|estimate\|prioriti\|trade-off` | +15 |
| Structured approach | `first\|second\|third\|step` | +10 |
| Data points | `%\|x\|₹\|user counts` | +10 |
| Recommendation clarity | `recommend\|suggest\|propose\|should` | +5 |
| Vague language | Very short or generic response | -10 to -20 |

---

## Ideal Answer Structure

### The Case Study Framework (5 Steps)

1. **Clarify** (30 seconds): Ask 1-2 clarifying questions about scope, constraints, timeline
2. **Structure** (1 minute): Present your approach — "I'd break this into three areas..."
3. **Hypothesize** (1 minute): State your hypotheses — "My initial hypothesis is X because..."
4. **Analyze** (2-3 minutes): Walk through each area with data estimates and reasoning
5. **Recommend** (1 minute): Clear recommendation with expected impact and next steps

### Example Strong Answer (API Reliability Case)
> "Before diving in, I'd want to clarify: is the churn concentrated in specific customer segments or evenly distributed? And what's the churn rate — 2% monthly or 10%?
>
> I'd structure my investigation across three areas: (1) the gap between our metrics and customer perception, (2) the actual user experience beyond uptime, and (3) competitive benchmarking.
>
> My hypothesis is that 99.95% uptime masks a p99 latency problem — if our p99 is 2 seconds, that means roughly 1 in 100 API calls takes 2+ seconds. For a customer making 10,000 calls/day, that's 100 frustrating timeouts daily. That's not a reliability problem — it's a latency tail problem.
>
> I'd recommend: (1) Implement latency SLOs alongside uptime SLOs — target p99 < 500ms. (2) Add customer-facing status dashboards showing real-time latency, not just uptime. (3) Identify the top 10 slow endpoints and optimize them — likely a 2-sprint investment that could reduce churn by 30-40% based on the correlation between latency complaints and churn."

---

## India-Specific Case Examples

### E-Commerce Case
"Flipkart's Supermart (grocery) has 50% lower repeat rates than Swiggy Instamart in Bangalore. Investigate and recommend."

### Fintech Case
"A neobank has 5M registered users but only 500K monthly active. 80% of inactive users never completed KYC. How would you fix activation?"

### EdTech Case
"An online tutoring platform has 2M subscribers at ₹999/month. Post-COVID, monthly churn has increased from 5% to 12%. Diagnose and fix."

---

## Research Sources

- **Case in Point** (Marc Cosentino): Standard consulting case framework
- **Cracking the PM Interview**: Product case study methodology
- **Victor Cheng's LOMS**: Framework for consulting case interviews
- **Indian startup case studies**: Inc42, YourStory, The Ken — India-specific business challenges
- **IIM case study databases**: Indian academic case repositories

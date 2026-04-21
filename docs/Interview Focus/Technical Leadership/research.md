# Technical Leadership Interview — Research Document

## Overview

Technical leadership interviews assess system design thinking, architecture decisions at scale, incident response leadership, and technology evaluation rigor. Unlike pure coding interviews, these focus on the ability to make sound technical decisions with business context and lead engineering teams through complex technical challenges.

**Target Audience**: Senior Engineers, Staff Engineers, Principal Engineers, Engineering Managers, Architects
**Session Duration**: 10-25 minutes
**Key Competencies**: System design at scale, trade-off analysis, incident management, tech debt management, technology evaluation

---

## Indian Market Context

### Scale Challenges Unique to India
- **Population scale**: Systems serving 100M-500M users (Jio, Paytm, PhonePe)
- **Payment infrastructure**: UPI handles 10B+ transactions/month — latency and reliability critical
- **Vernacular support**: 22 official languages, 10+ scripts — content delivery and search at scale
- **Network diversity**: 2G/3G still prevalent in Tier 3/4 cities — offline-first and low-bandwidth design
- **Festive traffic**: Diwali/Big Billion Days = 10-50x normal traffic in hours

### Common Technical Leadership Roles in India
| Level | Title | Companies | TC Range |
|-------|-------|-----------|----------|
| L5-L6 | Senior Engineer / Staff Engineer | Google, Amazon, Microsoft India | ₹40-80 LPA |
| L6-L7 | Principal Engineer / Architect | Flipkart, Swiggy, Razorpay | ₹60-1.2 Cr |
| L7+ | Distinguished Engineer / VP Eng | FAANG India, Unicorns | ₹1-3 Cr+ |

---

## Question Bank

### Core Script (5 Questions)

1. **Scale to 10x Traffic**
   - "Describe a system you designed that had to handle 10x growth in traffic. What were the key architectural decisions and trade-offs?"
   - Tests: Scalability thinking, trade-off analysis, real experience

2. **Production Incident Response**
   - "Tell me about a major production incident you led the response for. How did you structure the incident response, and what systemic changes did you make afterward?"
   - Tests: Incident management, blameless culture, systemic thinking

3. **Technology Evaluation**
   - "How do you evaluate and introduce new technologies into your stack? Walk me through a recent technology decision you drove."
   - Tests: Tech evaluation rigor, risk management, team alignment

### Mini Question Bank (6 Variants)
- System scale design with trade-offs
- Production incident investigation and response
- Tech evaluation and decision-making process
- Monolith to microservices migration approach
- Technical debt management (pay down vs defer)
- Notification system design (10M users)

---

## Evaluation Framework

### Skill Dimensions
| Skill | Weight | What It Measures |
|-------|--------|-----------------|
| Technical Depth | Highest | System design knowledge, architecture patterns |
| Problem Solving | Highest | Debugging approach, root cause analysis |
| Communication | High | Explaining complex systems clearly |
| Structure | High | Organized system design approach |
| Trade-off Reasoning | High | Articulating what was sacrificed and why |
| Scalability Thinking | High | Handling growth, failure modes |
| Business Impact | Medium | Connecting technical decisions to business outcomes |

### India-Specific Technical Expectations
- **Payment systems**: Understanding UPI, NACH, NEFT/RTGS, settlement cycles
- **Compliance**: DPDP Act data localization, RBI data storage norms
- **Multi-region**: India region (Mumbai/Hyderabad) with DR considerations
- **Cost**: AWS/GCP India pricing, cost per million requests
- **CDN**: India-specific CDN challenges (last mile, ISP diversity)

---

## Ideal Answer Characteristics

### System Design Answer Structure
1. **Requirements clarification** (30 seconds): Ask about scale, latency, consistency requirements
2. **High-level design** (2 minutes): Components, data flow, API design
3. **Deep dive** (2-3 minutes): Database choice, caching strategy, message queues
4. **Trade-offs** (1 minute): CAP theorem, consistency vs availability, cost vs performance
5. **Failure modes** (1 minute): What happens when X fails? How do you detect and recover?
6. **Monitoring & observability** (30 seconds): Key metrics, alerting, dashboards

### Example Strong Answer (Incident Response)
> "Last Diwali, our payment gateway experienced a 45-minute partial outage affecting ₹200 crore in transactions. I was the incident commander. Within 5 minutes, I assembled the war room — 3 backend engineers, 1 DBA, and 1 infrastructure lead. We identified the root cause as a connection pool exhaustion in our PostgreSQL cluster due to a slow query introduced in the previous release. I made the call to immediately roll back the deployment rather than hotfix, which restored service in 12 minutes. Post-mortem: I implemented automated connection pool monitoring, added canary deployments with automatic rollback, and established a pre-festive-season load testing protocol. We've had zero payment outages in the 8 months since."

---

## Research Sources

- **System Design Primer** (Donne Martin): Foundational system design patterns
- **Google SRE Book**: Incident response and reliability practices
- **InfoQ India**: Indian tech architecture case studies
- **Uber/Flipkart engineering blogs**: India-scale system design examples
- **NPCI technical documentation**: UPI architecture and requirements

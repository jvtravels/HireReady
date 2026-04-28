/* Vercel Edge Function — Dynamic Follow-Up Question Generation */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId, sanitizeForLLM, validateContentType } from "./_shared";
import { callLLM, extractJSON } from "./_llm";
import { detectCandidateIntent, extractCandidateSalaryNumber } from "./_follow-up-helpers";
import { classifyCompanyTier, tierPromptSuffix } from "./_company-tier";
import { lookupSalaryContext, getNegotiationStyleContext, INDUSTRY_PACKAGE_CONTEXT, type NegotiationStyle } from "../data/salary-lookup";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  if (!GROQ_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), {
      status: 503, headers: withRequestId(corsHeaders(req)),
    });
  }

  // Validate Content-Type before preamble (uses its own error path)
  {
    const early = validateContentType(req, withRequestId(corsHeaders(req)));
    if (early) return early;
  }

  // Composed preamble: CORS → body size (512KB) → origin → IP limit → auth → LLM quota
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "follow-up",
    ipLimit: 20,
    checkQuota: true,
    maxBytes: 524288,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  try {
    const { question, answer, type, role, jobDescription, company, currentCity, jobCity, followUpDepth = 0, previousFollowUps, persona, conversationHistory, negotiationPhase, questionIndex, totalQuestions, resumeTopSkills, initialOfferText, negotiationFacts, negotiationStyle, negotiationBand, industry, highestOfferMade, candidateTarget, negotiationScenario } = await req.json() as {
      question: string; answer: string; type: string; role: string;
      jobDescription?: string; company?: string;
      currentCity?: string; jobCity?: string;
      followUpDepth?: number; previousFollowUps?: string[];
      persona?: string; conversationHistory?: string;
      negotiationPhase?: string; questionIndex?: number; totalQuestions?: number;
      resumeTopSkills?: string[];
      initialOfferText?: string;
      negotiationFacts?: {
        acceptedImmediately?: boolean;
        rejectedOutright?: boolean;
        candidateCounter?: string;
        candidateCurrentCTC?: string;
        hasCompetingOffers?: boolean;
        topicsRaised?: string[];
        deflectedNumbers?: boolean;
        askedForTime?: boolean;
        usedTacticalSilence?: boolean;
        mentionedBATNA?: boolean;
        expressedSurprise?: boolean;
      };
      negotiationStyle?: NegotiationStyle;
      negotiationBand?: {
        initialOffer: number;
        minOffer: number;
        maxStretch: number;
        walkAway: number;
        bandContext: string;
        hasEquity?: boolean;
      };
      industry?: string;
      highestOfferMade?: number;
      candidateTarget?: number;
      negotiationScenario?: string;
    };

    if (!question || typeof question !== "string" || !answer || typeof answer !== "string") {
      return new Response(JSON.stringify({ error: "Missing question or answer" }), { status: 400, headers });
    }

    // Whitelist persona values for panel interviews
    if (persona) {
      const validPersonas = new Set(["hiring manager", "technical lead", "hr partner"]);
      if (!validPersonas.has(String(persona).toLowerCase())) {
        return new Response(JSON.stringify({ error: "Invalid persona" }), { status: 400, headers });
      }
    }

    // Detect weak answers that warrant follow-up
    const wordCount = answer.trim().split(/\s+/).length;
    const hasMetrics = /\d+%|\$\d|[0-9]+x|[0-9]+ (users|customers|engineers|people|team|million|billion)/i.test(answer);
    const hasPassiveVoice = /(was done|were made|it was|has been|got done|we had)/i.test(answer);
    const lacksFirstPerson = !(/ I /i.test(answer) || /^I /i.test(answer));
    const isShort = wordCount < 40;

    const jdContext = jobDescription ? `The candidate is targeting this role: ${sanitizeForLLM(jobDescription, 500)}. If relevant, probe for skills mentioned in the JD.` : "";
    const resumeSkillsContext = Array.isArray(resumeTopSkills) && resumeTopSkills.length > 0
      ? `Candidate's key skills from resume: ${resumeTopSkills.slice(0, 6).map(s => sanitizeForLLM(s, 50)).filter(Boolean).join(", ")}. If relevant to the current topic, ask them to demonstrate these skills with specific examples.`
      : "";
    const previousContext = previousFollowUps && previousFollowUps.length > 0
      ? `\nPrevious follow-up exchange:\n${previousFollowUps.map(s => sanitizeForLLM(s, 300)).join("\n")}`
      : "";

    const isSalaryNeg = type === "salary-negotiation";

    // For salary negotiation: determine conversation phase from content + index
    // Content-based detection: analyze what's happened so far to pick the right phase
    function detectSalaryPhase(): string {
      if (negotiationPhase) return negotiationPhase; // explicit override from client
      const idx = questionIndex ?? 0;
      const total = totalQuestions ?? 6;
      const progressRatio = idx / Math.max(1, total);
      const facts = negotiationFacts;

      // Early acceptance → skip to closing
      if (facts?.acceptedImmediately && idx >= 2) return "closing";
      // Walk-away detected → closing-pressure (retention attempt)
      const walkAwayPat = /\b(walk away|walking away|i.?m out|not interested|decline|pull out|no deal|have to pass)\b/i;
      if (walkAwayPat.test(answer)) return "closing-pressure";
      // Candidate mentioned competing offers → probe-expectations with compete angle
      if (facts?.hasCompetingOffers && idx <= 3) return "probe-expectations";
      // Has a counter number + past initial reaction → counter-offer phase
      if (facts?.candidateCounter && idx >= 2) return "counter-offer";
      // Late in conversation → closing phases
      if (progressRatio >= 0.85) return "closing";
      if (progressRatio >= 0.7) return "closing-pressure";
      // Topics raised beyond base → benefits-discussion
      if (facts?.topicsRaised && facts.topicsRaised.length >= 2 && idx >= 3) return "benefits-discussion";
      // Index-based fallback for earlier phases
      if (idx <= 1) return "offer-reaction";
      if (idx === 2) return "probe-expectations";
      if (idx === 3) return "counter-offer";
      if (idx === 4) return "benefits-discussion";
      if (idx === 5) return "closing-pressure";
      return "closing";
    }
    const salaryPhase = isSalaryNeg
      ? detectSalaryPhase()
      : "";

    // Depth 0: probe for detail (existing behavior)
    // Depth 1: challenge / pushback
    // Depth 2: pivot to adjacent competency
    const safeDepth = Math.max(0, Math.min(2, Math.floor(followUpDepth)));
    const followUpTypeLabel = isSalaryNeg
      ? (salaryPhase || "negotiation_response")
      : (safeDepth === 0 ? "probe_detail" : safeDepth === 1 ? "challenge" : "pivot");

    // Determine answer strength for adaptive follow-up behavior
    const hasSpecifics = /specifically|for example|for instance|in particular|one time|at my previous|at our company|we decided/i.test(answer);
    const hasStructure = /first|second|then|finally|result|outcome|impact|as a result|because of this/i.test(answer);
    const qualitySignals = [!isShort, hasMetrics, !hasPassiveVoice, !lacksFirstPerson, hasSpecifics, hasStructure].filter(Boolean).length;
    const answerStrength = qualitySignals >= 5 ? "strong" : qualitySignals >= 3 ? "decent" : qualitySignals >= 1 ? "weak" : "very_weak";

    // Cross-question memory: earlier conversation for thematic connections
    // For salary-negotiation: higher cap and placed prominently — the LLM MUST remember what's been said
    const historyCharLimit = isSalaryNeg ? 4000 : 2500;
    const historyLabel = isSalaryNeg
      ? "FULL NEGOTIATION HISTORY (you MUST reference previous offers, numbers, and promises — never contradict what you said earlier)"
      : "EARLIER IN THIS INTERVIEW (use for thematic connections — reference earlier answers when relevant)";
    const historyContext = conversationHistory
      ? `\n${historyLabel}:\n${sanitizeForLLM(conversationHistory, historyCharLimit)}`
      : "";

    let depthInstructions: string;
    if (isSalaryNeg) {
      // Salary-negotiation: each follow-up is the hiring manager's NEXT conversational turn.
      // The phase determines what the manager should say next — this creates a natural conversation arc.
      const phaseInstructions: Record<string, string> = {
        "offer-reaction": `PHASE: Reacting to the candidate's response to your initial offer.

YOUR GOAL: Understand where they stand and steer toward specifics.
- If they ACCEPTED immediately: acknowledge warmly, BUT gently probe — "That's great! But before we finalize, have you thought about [equity/flexibility/growth]? I want you to feel confident about the full picture." Accepting instantly is a missed opportunity — help them see that.
- If they named a number: MIRROR IT BACK — "I heard ₹X from you. That's [above/within/below] our band for this role in [city]." Then ask what's driving their number — market data, competing offers, or expectations?
- If they asked about breakdown: provide base/bonus/benefits split with EXACT numbers, then ask "Does knowing the structure change your thinking?"
- If they said it's too low: "I hear you — help me understand what range feels right. Are you benchmarking against a specific offer or market data?"
- If they deflected ("what's your offer first?"): recognize the tactic — "Nice try! I've already shared our number. I need to understand your side to see where we can meet. What range are you targeting?"
- If they asked for time to think: "Of course — take a moment. But I should mention, we're looking to close this position by [date]. Can we reconnect in 48 hours?"
- If vague/empty: restate your offer with the exact ₹ number and ask for their target range.
CRITICAL: ALWAYS mirror back what the candidate said before responding. Start with "I heard you say..." or "So you're looking at..." — this makes it feel like a real conversation.`,

        "probe-expectations": `PHASE: Probing deeper into the candidate's expectations.

YOUR GOAL: Understand their number so you can counter BELOW it. You want to close as LOW as possible.
- If they ACCEPTED: acknowledge warmly, transition to package details or closing. That's a win — close quickly.
- If they shared a number BELOW your initial offer: "That works for us — let me finalize this." Close immediately — you're saving money.
- If they shared a number NEAR your initial offer: small stretch — "I can do ₹X" (slightly above your initial). Don't overshoot.
- If they shared a number ABOVE your initial offer: DON'T match it. Probe WHY: "₹X is what you're targeting. Is that based on market research, a competing offer, or your current package progression?" — understanding their reasoning helps you counter LOWER.
- If their number is way above your band (>1.5x maxStretch): REALITY CHECK with empathy — "I appreciate the ambition. ₹X is significantly above our band for this level in [city]. For context, [role] at companies like ours typically falls in the ₹Y-Z range."
- If they mentioned competing offers: probe specifics — "What are they offering? More importantly, what matters most to you — the number, the role, or the team?"
- If they deflected: put your full offer on the table with breakdown, then ask what would make it a yes.
CRITICAL: NEVER offer more than what the candidate asked for. If they said ₹30 LPA, your counter should be ₹25-28 LPA, not ₹35 LPA.`,

        "counter-offer": `PHASE: Making a counter-offer based on everything you've heard.

YOUR GOAL: Close the deal as LOW as possible while keeping the candidate interested. You are the HIRING MANAGER — your job is to save the company money while making a fair offer.
- CRITICAL: Your counter-offer MUST be BELOW the candidate's ask. NEVER offer MORE than what they asked for. If they said ₹30 LPA and your band goes to ₹40 LPA, counter at ₹25-28 LPA — NOT ₹35-40 LPA. You want to save cost.
- ALWAYS make a concrete counter: "Here's what I can do — ₹X base, ₹Y variable, and I'll add a ₹Z joining bonus. That brings your total to ₹W LPA." Never say vague things like "some flexibility."
- If their ask is AT or BELOW your initial offer: "That's within our range — I can work with that." Close quickly — that's a win for you.
- If their ask is ABOVE your initial offer but within your band: counter PARTWAY — split the difference. "You asked for ₹X, I started at ₹Y. Let me see if I can stretch to ₹Z" (where Z is between Y and X, closer to Y).
- If they want more base: "I can move base to ₹X if we adjust variable to Y%. Or I could add a ₹Z joining bonus to bridge the gap. Which works better for you?" — restructure to SEEM higher without actually raising total CTC much.
- If they focus only on salary: redirect to non-cash — ${negotiationBand?.hasEquity ? `"I may not be able to match ₹X on base, but let me show you the full picture: joining bonus, ESOPs vesting over 4 years, plus learning budget. The total package value is actually ₹V."` : `"I may not be able to match ₹X on base, but let me show you the full picture: joining bonus, learning budget, and upgraded health insurance. The total package value is actually ₹V." Do NOT mention ESOPs or equity — this role does not include them.`}
- If they pushed hard: be transparent — "₹X is genuinely my ceiling for this band. Beyond that, I'd need to go back to leadership. But here's what I CAN add: [2-3 specific levers with numbers]."
- Notice period as a lever: "What's your notice period? If you can join within 30 days, I'll add a ₹X notice buyout."
- If vague: "What's the minimum package that makes this a clear yes for you? Give me a number and I'll tell you what I can do."`,

        "benefits-discussion": `PHASE: Expanding the conversation to total compensation beyond base salary.

YOUR GOAL: PROACTIVELY suggest creative trade-offs, don't just describe benefits.
- If they only discussed base: "Let me paint the full picture. Beyond ₹X CTC, there's: [list specific benefits with values]. When you add it all up, the real value is closer to ₹Y."
- ${negotiationBand?.hasEquity ? `If they asked about equity/ESOPs: go DEEP — "Great question. We offer X% vesting over 4 years with a 1-year cliff. At our current valuation, that's worth roughly ₹Y annually. What matters more to you — the vesting schedule or the total allocation?"` : `If they asked about equity/ESOPs: be honest — "We don't offer ESOPs at this level/company type. But let me tell you what we DO offer that's valuable: [joining bonus, learning budget, flexible work, health coverage, performance-linked bonuses]. What matters most to you?"`}
- If they asked about flexibility: be concrete — "We do [X days WFH/week]. Team standups are at [time]. As long as you hit your deliverables, we're flexible on hours."
- If they seem stuck on base: brainstorm together — "What if we keep base at ₹X but add a performance-linked ₹Y bonus after 6 months? Plus a ₹Z joining bonus upfront? Would that change the math for you?"
- If they asked about growth: "Typical promotion cycle is [X months]. Our last 3 hires at this level moved to [next level] within [timeline] with a [X-Y%] raise. I can build that trajectory into your offer letter."
- PROACTIVE suggestions: don't wait for them to ask. Offer — "Have you thought about our sabbatical policy? Or the fact that we cover ₹X for certifications annually?"`,

        "closing-pressure": `PHASE: Creating urgency and moving toward a decision.

YOUR GOAL: Close the deal NOW at the current offer level. Do NOT raise the offer further unless absolutely necessary.
- If they seem close: "I genuinely want to close this today. I have one other strong candidate at final stage, and the headcount approval expires end of month. What do I need to do to get a yes?"
- If still pushing: present FINAL offer — but keep it at or slightly above your last offer, NOT at maxStretch. "Here's my absolute best: ₹X base, ₹Y variable, ₹Z joining bonus. Total: ₹W LPA. This is genuinely the top of what I can do."
- If they mention notice period: "What's your notice? If it's 60+ days, I'll add a ₹X buyout bonus for joining within 30. Can you negotiate with your current employer?"
- If they want time to think: don't panic — "Of course. I respect that. Can we touch base by [specific day]? I'll hold the offer till then, but I should be transparent — I can't guarantee the same terms after [date] because budget cycles."
- If they're asking questions (good sign): answer warmly, then close — "Great questions. So now that you have the full picture — are we ready to move forward?"
- Explicit confirmation: ALWAYS end with a clear ask — "So just to confirm — are we agreed on ₹X total, with [key terms]? I want to make sure we're aligned before I send this to HR."`,

        "closing": `PHASE: Finalizing the negotiation.

YOUR GOAL: Summarize the SPECIFIC deal and set concrete next steps. Rebuild warmth.
- Recap with EXACT numbers: "Great. So here's what we've agreed: ₹X base, ₹Y variable, ₹Z joining bonus, [equity/benefits]. Total CTC: ₹W LPA."
- Set timeline: "I'll have HR send the formal offer letter by [day]. You'll have [X days] to review and sign."
- Ask about notice: "What's your notice period? We'd love to have you start by [date]."
- Warm close: "I'm really glad we found a number that works. I think you're going to do great things here, and the team is excited to have you."
- If still negotiating: "I hear you, but this is genuinely my final offer. I've stretched as far as I can. The next step is either a yes or we part as friends — what's it going to be?"
- If they want to think: "Absolutely. The offer stands until [date]. But I'll be honest — I'd love an answer sooner so I can lock in the headcount."`,
      };

      // Extract the initial offer from conversation history so the LLM can reference exact numbers
      const offerCtx = initialOfferText
        ? `\nINITIAL OFFER YOU PRESENTED: "${sanitizeForLLM(initialOfferText, 500)}"\nYou MUST use these exact numbers when referencing the offer. Do NOT invent different figures.`
        : "";

      // Build structured facts context so the LLM has precise anchors
      const factsLines: string[] = [];
      if (negotiationFacts) {
        if (negotiationFacts.acceptedImmediately) factsLines.push("- Candidate ACCEPTED the offer immediately (probe if they've considered the full package)");
        if (negotiationFacts.rejectedOutright) factsLines.push("- Candidate REJECTED the offer outright (stay professional, ask what would work)");
        if (negotiationFacts.candidateCounter) factsLines.push(`- Candidate's counter/target: ${sanitizeForLLM(negotiationFacts.candidateCounter, 30)} — YOU KNOW THIS. Negotiate around it, do NOT re-ask.`);
        if (negotiationFacts.candidateCurrentCTC) factsLines.push(`- Candidate's current CTC: ${sanitizeForLLM(negotiationFacts.candidateCurrentCTC, 30)} — YOU KNOW THIS. Do NOT ask again.`);
        if (negotiationFacts.hasCompetingOffers) factsLines.push("- Candidate mentioned COMPETING OFFERS — you MUST address this: ask what they're offering, what matters beyond the number, and where you can differentiate.");
        if (negotiationFacts.deflectedNumbers) factsLines.push("- Candidate DEFLECTED sharing their numbers — recognize this tactic. Stay warm but firm: you need their input to negotiate.");
        if (negotiationFacts.askedForTime) factsLines.push("- Candidate asked for TIME TO THINK — respect this, but set a 48-hour window with a reason. Ask what's giving them pause.");
        if (negotiationFacts.usedTacticalSilence) factsLines.push("- Candidate used TACTICAL SILENCE (short/minimal responses) — they may be creating pressure. Don't rush to fill the silence. Acknowledge it calmly.");
        if (negotiationFacts.mentionedBATNA) factsLines.push("- Candidate mentioned their BATNA/walk-away alternative — take this seriously. Ask what would make them choose you over their alternative.");
        if (negotiationFacts.expressedSurprise) factsLines.push("- Candidate EXPRESSED SURPRISE at the offer — this may be a flinch tactic. Stay composed, reaffirm value, and ask what they were expecting.");
        if (negotiationFacts.topicsRaised && negotiationFacts.topicsRaised.length > 0) {
          factsLines.push(`- Topics the candidate raised: ${negotiationFacts.topicsRaised.join(", ")} — reference these when suggesting trade-offs.`);
          // Proactively suggest levers based on topics NOT yet raised
          const unreasedLevers = ["joining bonus", "notice period/joining", "remote/flexibility", "learning budget", "career growth", "health insurance"]
            .filter(l => !negotiationFacts.topicsRaised!.includes(l));
          if (unreasedLevers.length > 0 && negotiationFacts.topicsRaised!.length >= 1) {
            factsLines.push(`- PROACTIVE LEVER TIP: The candidate hasn't asked about ${unreasedLevers.slice(0, 3).join(", ")} — consider offering one of these to sweeten the deal or create a trade-off.`);
          }
        }
        // Notice period as a proactive lever (even if candidate didn't raise it)
        if (!negotiationFacts.topicsRaised?.includes("notice period/joining")) {
          factsLines.push("- NOTICE PERIOD: You haven't discussed notice period yet. Proactively ask: 'What's your notice period?' and offer buyout as a lever: 'If you can join within 30 days, I'll add ₹X for notice buyout.'");
        }
      }
      const factsCtx = factsLines.length > 0
        ? `\nCANDIDATE FACTS (from this conversation — use these to personalize your response):\n${factsLines.join("\n")}`
        : "";

      // Negotiation band context (structured authority limits)
      const bandCtx = negotiationBand?.bandContext
        ? `\n${sanitizeForLLM(negotiationBand.bandContext, 600)}`
        : "";

      // Monotonic offer rule + candidate target context
      const offerTrackingCtx = highestOfferMade
        ? `\nIMPORTANT: Your highest previous offer was ₹${highestOfferMade} LPA. Your next offer MUST be >= ₹${highestOfferMade} LPA. Never go backwards.`
        : "";
      const targetCtx = candidateTarget
        ? `\nThe candidate's stated target is ₹${candidateTarget} LPA. Use this to calibrate your offers — if their target is within your band, work toward it. If above, reality-check it.`
        : "";

      // Negotiation style context
      const styleCtx = negotiationStyle
        ? `\n${getNegotiationStyleContext(negotiationStyle)}`
        : "";

      // Scenario-specific context
      const scenarioCtx = negotiationScenario === "lowball"
        ? "\nSCENARIO: LOWBALL OFFER. Your initial offer is deliberately 20-30% below market rate. Be prepared for strong pushback. If the candidate negotiates well, gradually move toward market rate but make them earn every increment."
        : negotiationScenario === "exploding"
        ? "\nSCENARIO: EXPLODING OFFER. You have a 24-hour deadline for the candidate to accept. Create time pressure. If they ask for more time, emphasize the urgency but consider a brief extension if they make a strong case."
        : negotiationScenario === "competing"
        ? "\nSCENARIO: COMPETING OFFERS. The candidate claims to have multiple offers. Probe for specifics — ask which companies, what terms. If credible, be more flexible. If vague, call the bluff professionally."
        : "";

      // Industry-specific package flavor
      const industryCtx = industry && INDUSTRY_PACKAGE_CONTEXT[industry.toLowerCase()]
        ? `\n${INDUSTRY_PACKAGE_CONTEXT[industry.toLowerCase()]}`
        : "";

      // Intent detection + salary-number extraction extracted into
      // ./_follow-up-helpers.ts so the regex rules can be unit-tested.
      const intent = detectCandidateIntent(answer);
      const candidateAccepted = intent.accepted;
      const isConditionalAccept = intent.conditionalAccept;
      const candidateRejected = intent.rejected;
      const candidateDeflected = intent.deflected;
      const candidateWalkAway = intent.walkAway;
      const candidateNeedsTime = intent.needsTime;
      const candidateMentionedCompeting = intent.mentionedCompeting;
      const candidateNum = extractCandidateSalaryNumber(answer);

      // Build intent banner — placed at the VERY TOP of the prompt so the LLM can't miss it
      let intentBanner = "";
      if (candidateAccepted && !isConditionalAccept) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE ACCEPTED THE OFFER. THEY SAID: "${sanitizeForLLM(answer, 350)}" ⚠️⚠️⚠️
YOU MUST acknowledge their acceptance warmly FIRST. Then either:
- If they accepted too quickly (within first 2 questions): gently probe — "That's great! But before we lock this in, have you considered [equity/flexibility/growth path]? I want you to feel confident."
- If later in the negotiation: move to closing — recap the EXACT agreed package with ₹ numbers, mention offer letter timeline, ask about notice period. Rebuild warmth: "I'm really glad we worked this out."
DO NOT counter-offer or act as if they rejected. They said YES.
`;
      } else if (isConditionalAccept) {
        intentBanner = `
THE CANDIDATE CONDITIONALLY ACCEPTED. THEY SAID: "${sanitizeForLLM(answer, 350)}"
They accepted the core offer but have a condition or want to discuss something else (equity, benefits, flexibility, etc.).
YOU MUST:
1. Acknowledge the acceptance warmly FIRST: "Great, I'm glad the base works for you!"
2. Then address their specific condition/question directly with concrete answers and ₹ numbers.
3. Do NOT re-negotiate the base salary — they already accepted that. Focus on what they asked about.
`;
      } else if (candidateWalkAway) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE IS WALKING AWAY. THEY SAID: "${sanitizeForLLM(answer, 350)}" ⚠️⚠️⚠️
This is a CRITICAL moment. You MUST attempt retention:
- First, acknowledge: "I understand, and I respect that."
- Then, pause and pivot: "But before you make a final decision — I genuinely believe you'd be a great fit here."
- Offer to escalate: "Let me go back to my leadership. I may be able to push this higher." Give a specific stretch number if available.
- Create soft urgency: "Can you give me 24 hours before you decide?"
DO NOT let them walk without an attempt to retain. DO NOT beg or over-promise. Stay professional.
`;
      } else if (candidateRejected) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE REJECTED/PUSHED BACK. THEY SAID: "${sanitizeForLLM(answer, 350)}" ⚠️⚠️⚠️
YOU MUST acknowledge their pushback FIRST ("I hear you", "I understand"). Then:
- Make a SPECIFIC better counter-offer with exact ₹ numbers (not vague "flexibility").
- If they named a number, mirror it: "You're looking at ₹X — let me see how close I can get."
- If their ask is way above your band: reality-check with empathy — "₹X is significantly above our band. For context, this role in [city] typically ranges ₹Y-Z. Help me understand — is there flexibility on your end?"
DO NOT ignore their rejection. DO NOT close the deal as if they agreed.
`;
      } else if (candidateNeedsTime) {
        intentBanner = `
THE CANDIDATE WANTS TIME TO THINK. THEY SAID: "${sanitizeForLLM(answer, 350)}"
RESPECT their request, but create soft urgency:
- "Of course — take the time you need. Can we reconnect by [specific day]? I should be transparent: the headcount approval has a window, and I'd hate for timing to be an issue."
- Ask what's giving them pause: "Can I ask what's on your mind? Sometimes talking it through helps."
- If they mention family/partner: "Absolutely — it's a big decision. Would it help if I put together a written summary of the full package for you to share with them?"
`;
      } else if (candidateDeflected) {
        intentBanner = `
THE CANDIDATE DEFLECTED. THEY SAID: "${sanitizeForLLM(answer, 350)}"
They're trying to avoid committing to a number. Recognize the tactic:
- "I appreciate the approach, but I've already shared our offer of ₹X. To make this work, I need to understand your side. What range are you targeting?"
- If they asked "what's your best offer?" — "I've shared our opening number. This is a conversation, not an auction — help me understand what you need and I'll see what I can do."
- Stay warm but firm. Don't cave to pressure.
`;
      } else if (candidateMentionedCompeting) {
        intentBanner = `
THE CANDIDATE MENTIONED COMPETING OFFERS. THEY SAID: "${sanitizeForLLM(answer, 350)}"
ENGAGE with this directly:
- "That's helpful to know. Can you share what they're offering? Not to match blindly, but to understand where we need to be competitive."
- "What makes you lean toward us vs them? Is it purely the number, or are there other factors?"
- If appropriate: "We may not be able to match on base, but our [equity/growth/flexibility] is often what makes the difference for candidates choosing between us and [competitor type]."
`;
      } else {
        intentBanner = `
THE CANDIDATE SAID: "${sanitizeForLLM(answer, 350)}"${candidateNum ? `\nTHEY MENTIONED A SPECIFIC NUMBER: ₹${candidateNum} LPA. You MUST mirror this back — "I heard ₹${candidateNum} from you..." — before responding.` : ""}
Your response MUST directly address what they said above. Start by acknowledging their words.
`;
      }

      // Equity availability guard for all salary negotiation phases
      const equityGuard = negotiationBand?.hasEquity === false
        ? "\nEQUITY GUARD: This role does NOT include ESOPs, RSUs, or stock options. Do NOT mention equity in any offer, counter-offer, or benefits discussion. Focus on base, joining bonus, variable pay (if applicable), learning budget, health insurance, and flexibility."
        : "";

      depthInstructions = `You are a HIRING MANAGER in a salary negotiation. You MUST stay in character. ALWAYS set needsFollowUp to true.
${intentBanner}${equityGuard}${historyContext}
${factsCtx}${offerCtx}${bandCtx}${offerTrackingCtx}${targetCtx}${styleCtx}${industryCtx}${scenarioCtx}

CURRENT PHASE: ${salaryPhase.toUpperCase()}
${phaseInstructions[salaryPhase] || phaseInstructions["offer-reaction"]}

RULES:
- MATCH INTENT: Re-read the candidate's answer above. Accepted → acknowledge and close. Rejected → acknowledge and counter. Question → answer it. NEVER ignore what they said.
- MIRROR FIRST: Start by paraphrasing what the candidate said. "I heard ₹X from you..." or "So your concern is..."
- BE SPECIFIC: Use exact ₹ numbers in any counter-offer. Never say "some flexibility" — say "I can stretch to ₹X."
- DON'T RE-ASK: Never ask for info already in CANDIDATE FACTS above.
- OFFERS GO UP ONLY: Every offer >= your initial offer. But never offer MORE than the candidate asked for.
- Near maxStretch: "That's at the top of my authority. Let me check with leadership on ₹X."
- Tone: Real Indian hiring manager — professional, warm, direct. 2-4 sentences. Use ₹ and LPA.
- Stay in character. Never give coaching tips.`;
    } else if (safeDepth === 0) {
      depthInstructions = `Analysis of candidate's answer:
- Word count: ${wordCount} ${isShort ? "(SHORT — likely needs follow-up)" : "(adequate length)"}
- Contains metrics/numbers: ${hasMetrics ? "yes" : "NO — probe for quantified impact"}
- Uses passive voice: ${hasPassiveVoice ? "YES — probe for their specific role" : "no"}
- Uses first-person 'I': ${lacksFirstPerson ? "NO — probe for individual contribution" : "yes"}
- Contains specifics: ${hasSpecifics ? "yes" : "NO — too generic"}
- Answer strength: ${answerStrength}

${answerStrength === "strong" ? `The answer is strong. Follow up ONLY if:
- You spot an interesting claim that deserves a "tell me more" probe
- There's a deeper insight to unlock ("What would you do differently at 10x scale?")
- The answer hints at a challenge or conflict worth exploring
If the answer fully addresses the question with specifics and metrics, set needsFollowUp to false.` :
answerStrength === "decent" ? `The answer is decent but could be stronger. Follow up to:
- Push for specific numbers/metrics ("Can you quantify the impact?")
- Clarify their specific role vs team effort ("What was YOUR contribution specifically?")
- Ask for the outcome/result if they stopped at the action ("What happened as a result?")` :
`The answer is weak. You SHOULD follow up. Choose the most pressing gap:
- If too vague: "Can you walk me through a specific example of that?"
- If no metrics: "What were the actual numbers — users, revenue, timeline?"
- If passive/team: "I want to understand YOUR role specifically — what did YOU decide?"
- If too short: "Tell me more about that — what was the situation and what did you do?"
Tone: Be encouraging but firm. A real interviewer would probe, not just move on.`}`;
    } else if (safeDepth === 1) {
      depthInstructions = `This is a CHALLENGE follow-up (depth 1). You MUST generate a follow-up — set needsFollowUp to true.

Your goal: Test depth, conviction, and ownership. Real interviewers do this — it's not adversarial, it's thorough.

${answerStrength === "strong" ? `The candidate gave a strong answer. RAISE THE BAR:
- "That's impressive. But what if the constraints were different — say, half the budget and twice the timeline pressure?"
- "You mentioned [specific thing]. I'm curious — what was the biggest risk you took, and how did you mitigate it?"
- "If you had to do this again with a completely new team, what would you change?"
- "What's the counterfactual — what would have happened if you hadn't intervened?"` :
`The candidate's answer has gaps. PUSH FOR DEPTH:
- "I hear what you're saying, but walk me through the specific steps you took — not what the team did, what YOU did."
- "That's interesting, but I'm not seeing the numbers. What was the measurable impact?"
- "Let me play devil's advocate — couldn't you have achieved the same thing with [simpler approach]?"
- "What would someone who disagreed with your approach say? How would you respond?"`}

Be conversational but direct. Sound like a senior interviewer at a top Indian product company. 2-3 sentences max.`;
    } else {
      depthInstructions = `This is a PIVOT follow-up (depth 2). You MUST generate a follow-up — set needsFollowUp to true.

Your goal: Pivot to an adjacent competency revealed by the candidate's answer. This tests breadth.

Choose based on what's most relevant to their answer:
- Leadership/influence: "That shows strong execution. How did you bring others along — especially skeptics?"
- Failure/learning: "Every approach has downsides. What didn't go well, and what did you learn?"
- Scale/future: "Now imagine this at 10x scale, or at a company like ${company || "a fast-growing startup"}. What breaks?"
- Cross-functional: "How did you navigate the politics around that decision? Who pushed back?"
- Self-awareness: "What would your manager or skip-level say about how you handled this?"

Be genuinely curious, not interrogative. 2-3 sentences max.`;
    }

    const panelContext = persona ? `\nYou are the "${sanitizeForLLM(persona, 30)}" panelist in a panel interview. Your follow-up should reflect your role's perspective.` : "";

    // Salary context for salary-negotiation follow-ups (prevents losing city-adjusted rates)
    const salaryFollowUpCtx = (type === "salary-negotiation" || type === "hr-round")
      ? `\n${lookupSalaryContext({ role, company, currentCity, jobCity })}\nUse ₹ and LPA. Follow-up offers/counters MUST stay within these ranges.
CRITICAL: You are the HIRING MANAGER making a salary offer. Stay in character — do NOT switch to behavioral interview questions. Your follow-ups must be about compensation, benefits, joining timeline, notice buyout, or counter-offers.`
      : "";

    const prompt = `You are an expert interviewer. Given a candidate's answer to an interview question, decide if a follow-up question is needed.${panelContext}

Interview type: ${sanitizeForLLM(type, 50) || "behavioral"}
Role: ${sanitizeForLLM(role, 100) || "senior role"}${company ? `\nCompany: ${sanitizeForLLM(company, 100)}` : ""}${salaryFollowUpCtx}${jdContext ? `\n${jdContext}` : ""}${resumeSkillsContext ? `\n${resumeSkillsContext}` : ""}${historyContext}

Question asked: "${sanitizeForLLM(question, 500)}"
Candidate's answer: "${sanitizeForLLM(answer, 1000)}"${previousContext}

${depthInstructions}

CROSS-QUESTION MEMORY: If the candidate mentioned something interesting in an earlier answer (visible in the conversation history above), you SHOULD reference it naturally roughly every 3rd question: "Earlier you mentioned X — how does that connect to what you just described?" This makes the interview feel like a real conversation, not a checklist.

PUSHBACK RULE: Real interviewers push back on weak or vague answers — they don't just nod and move on. If the answer is high-level, generic, or lacks specifics (no metrics, no concrete actions, no "I" voice), your follow-up MUST press for specifics ONCE before changing topic. Examples: "That's high-level — what specifically did *you* do?", "Give me a concrete number.", "Walk me through one moment, not the general approach." Do NOT pile on with multiple challenges; one sharp pushback per weak answer.

QUESTION LENGTH: Mix lengths like a real interviewer. About 30% of follow-ups should be ≤8 words ("So why now?", "And the team's reaction?", "What was the actual number?"). The rest can be longer. Avoid every follow-up being 25+ words — it sounds scripted.

INDIAN INTERVIEWER VOICE: This is a mock for the Indian job market. Speak in natural Indian English. Light fillers like "Achha", "Got it got it", "Right right", "One more thing —", "Ek aur question —" are appropriate occasionally — don't overdo. Use ₹ / LPA / CTC, not $ / annual salary. AVOID Americanisms: "awesome", "totally", "reach out", "circle back", "touch base", "let's dive in", "killer", "rockstar". Currency, college tiers (IIT/IIM/NIT), and city references (Bangalore, Hyderabad, Pune, Gurgaon) should feel native, not exotic.

${tierPromptSuffix(classifyCompanyTier(company))}

Respond JSON only:
{"needsFollowUp":true/false,"followUpText":"The follow-up question (2-3 sentences, conversational). Only include if needsFollowUp is true.","followUpType":"${followUpTypeLabel}","reason":"Brief reason"}`;

    // Salary-neg fallback: generate a context-aware response when LLM fails
    // This prevents the static pre-generated script (with wrong numbers) from playing
    const salaryNegFallback = (): Response => {
      const numMatch = answer.match(/₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/i);
      let fallbackText: string;
      if (numMatch) {
        fallbackText = `I hear you — ₹${numMatch[1]} LPA is what you're looking at. Let me see what flexibility I have in the package structure. Can you help me understand what's driving that number — is it based on market data, a competing offer, or your current package progression?`;
      } else if (/\b(accept|sounds good|that works|deal|agreed|fine with me|okay|ok|sure|yes)\b/i.test(answer) && !/\b(but|however|only if|unless)\b/i.test(answer)) {
        fallbackText = `That's great to hear! I'm glad we could find something that works. Let me put together the final numbers and have HR send you the formal offer letter. What's your notice period situation?`;
      } else if (/\b(too low|not enough|can.?t accept|not acceptable|walk away|not interested)\b/i.test(answer)) {
        fallbackText = `I hear your concern, and I appreciate you being direct. Help me understand — what range would work for you? I want to see if there's a way to bridge the gap.`;
      } else {
        fallbackText = `I appreciate you sharing that. What's most important to you in this package — is it the base number, the overall CTC, or are there specific benefits that would move the needle for you?`;
      }
      return new Response(JSON.stringify({ needsFollowUp: true, followUpText: fallbackText, followUpType: "negotiation_response" }), { status: 200, headers });
    };

    let result: { text: string };
    try {
      result = await callLLM({ prompt, temperature: 0.3, maxTokens: 500, jsonMode: true, fast: true }, 12000, { userId: auth.userId, endpoint: "follow-up" });
    } catch (llmErr) {
      console.error("Follow-up LLM call failed:", llmErr);
      if (isSalaryNeg) return salaryNegFallback();
      return new Response(JSON.stringify({ needsFollowUp: false, error: "LLM call failed" }), { status: 502, headers });
    }
    const parsed = extractJSON<{ needsFollowUp?: boolean; followUpText?: string; followUpType?: string }>(result.text);
    if (!parsed || typeof parsed !== "object") {
      if (isSalaryNeg) return salaryNegFallback();
      return new Response(JSON.stringify({ needsFollowUp: false, error: "LLM response parsing failed" }), { status: 502, headers });
    }
    // Sanitize LLM response fields
    if (typeof parsed.followUpText !== "string") parsed.followUpText = "";
    if (typeof parsed.needsFollowUp !== "boolean") parsed.needsFollowUp = false;

    // Salary hallucination guard: clamp any salary numbers in LLM response to negotiation band limits
    if (isSalaryNeg && negotiationBand && parsed.followUpText) {
      const offerNumRe = /₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh|lakhs|Cr|cr|crore)/g;
      let match: RegExpExecArray | null;
      let clamped = parsed.followUpText;
      const approvalRe = /\b(approval|leadership|sign.?off|check with|go back to)\b/i;
      while ((match = offerNumRe.exec(parsed.followUpText)) !== null) {
        const rawNum = parseFloat(match[1]);
        // Convert Crore to LPA (1 Cr = 100 LPA)
        const isCrore = /cr|crore/i.test(match[0]);
        const num = isCrore ? rawNum * 100 : rawNum;
        if (num > negotiationBand.maxStretch * 1.05) {
          // LLM hallucinated well above max stretch — clamp to maxStretch
          // If LLM already included approval language, just fix the number.
          // If not, the text may sound inconsistent after clamping — add approval framing.
          console.warn(`[follow-up] LLM offered ₹${num} LPA, above maxStretch ₹${negotiationBand.maxStretch} — clamping`);
          clamped = clamped.replace(match[0], `₹${negotiationBand.maxStretch} LPA`);
          if (!approvalRe.test(clamped)) {
            // Inject approval framing since the clamped number IS the ceiling
            clamped = clamped.replace(
              `₹${negotiationBand.maxStretch} LPA`,
              `₹${negotiationBand.maxStretch} LPA — that's the absolute top of what I can approve`,
            );
          }
        } else if (num > negotiationBand.maxStretch && !approvalRe.test(clamped)) {
          // Between maxStretch and 1.05x — within tolerance but add approval framing
          console.warn(`[follow-up] LLM offered ₹${num} LPA near maxStretch ₹${negotiationBand.maxStretch} — adding approval context`);
          clamped = clamped.replace(match[0], `${match[0]}, which I'd need leadership sign-off for,`);
        } else if (num < negotiationBand.walkAway) {
          // LLM offered below walk-away — clamp to initial offer
          console.warn(`[follow-up] LLM offered ₹${num} LPA, below walkAway ₹${negotiationBand.walkAway} — clamping`);
          clamped = clamped.replace(match[0], `₹${negotiationBand.initialOffer} LPA`);
        }
      }
      // Monotonic enforcement: no offer can go below the highest previous offer
      // Fixed: removed the `>= walkAway` condition that created a loophole allowing regressions
      // between highestOfferMade and walkAway. Now ALL numbers below highestOffer get clamped.
      if (highestOfferMade && highestOfferMade > 0) {
        const monoRe = /₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh|lakhs)/g;
        let monoMatch: RegExpExecArray | null;
        // Collect all offer numbers to check total CTC monotonicity
        const allOfferNums: number[] = [];
        const tempStr = clamped;
        let tempMatch: RegExpExecArray | null;
        const tempRe = /₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh|lakhs)/g;
        while ((tempMatch = tempRe.exec(tempStr)) !== null) {
          allOfferNums.push(parseFloat(tempMatch[1]));
        }
        // If the MAX number in the response (proxy for total CTC) is still >= highestOfferMade,
        // only clamp individual components that look like the "main" offer (the largest number).
        // Otherwise, clamp all sub-highestOffer numbers unconditionally.
        const maxOfferedInResponse = allOfferNums.length > 0 ? Math.max(...allOfferNums) : 0;
        const totalCTCMaintained = maxOfferedInResponse >= highestOfferMade;
        while ((monoMatch = monoRe.exec(clamped)) !== null) {
          const monoNum = parseFloat(monoMatch[1]);
          // Skip numbers that are clearly not offer amounts (e.g., "₹2 LPA learning budget")
          const isSmallComponent = monoNum < highestOfferMade * 0.3;
          if (monoNum < highestOfferMade && !isSmallComponent && !totalCTCMaintained) {
            console.warn(`[follow-up] Monotonic violation: ₹${monoNum} < previous highest ₹${highestOfferMade} — clamping`);
            clamped = clamped.replace(monoMatch[0], `₹${highestOfferMade} LPA`);
          }
        }
      }
      // Cost-saving guard: if candidate stated a target, clamp offers that exceed it
      // A real hiring manager would NEVER offer more than what the candidate asked for
      if (candidateTarget && candidateTarget > 0) {
        const costRe = /₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh|lakhs)/g;
        let costMatch: RegExpExecArray | null;
        while ((costMatch = costRe.exec(clamped)) !== null) {
          const costNum = parseFloat(costMatch[1]);
          // If this is clearly the "main" offer number (not a small component like bonus)
          const isMainOffer = costNum > candidateTarget * 0.5;
          if (costNum > candidateTarget && isMainOffer) {
            // Calculate a realistic counter: partway between initial offer and candidate's target
            const realisticCounter = Math.round(
              (negotiationBand.initialOffer + candidateTarget) / 2 * 10,
            ) / 10;
            const clampedVal = Math.max(realisticCounter, highestOfferMade || negotiationBand.initialOffer);
            console.warn(`[follow-up] Cost guard: ₹${costNum} exceeds candidate target ₹${candidateTarget} — clamping to ₹${clampedVal}`);
            clamped = clamped.replace(costMatch[0], `₹${clampedVal} LPA`);
          }
        }
      }
      parsed.followUpText = clamped;
    }

    // Intent-mismatch validator: catch cases where LLM ignores the detected intent
    if (isSalaryNeg && parsed.followUpText) {
      const text = parsed.followUpText.toLowerCase();
      const counterOfferPat = /how about|what if I offer|counter.*with|we could do|let me offer/i;
      // Re-detect intent here since the original detection is block-scoped
      const acceptRe = /\b(i accept|i.?ll accept|accept the offer|sounds good|that works for me|it.?s a deal|i.?m happy with|fine with me|i agree|agreed|let.?s go ahead)\b/i;
      const walkRe = /\b(walk away|walking away|i.?m out|not interested|i.?ll pass|no deal|withdraw|decline the offer|i decline|pull out|not worth|won.?t work|move on|have to pass)\b/i;
      const hedgeRe = /\b(but|however|only if|unless|provided|on condition|contingent|except|though)\b/i;
      const didAccept = acceptRe.test(answer) && !hedgeRe.test(answer.slice(answer.search(acceptRe)));
      const didWalkAway = walkRe.test(answer) && !acceptRe.test(answer);
      if (didAccept && counterOfferPat.test(parsed.followUpText)) {
        // LLM is counter-offering when candidate already accepted — reject and signal fallback
        console.warn("[follow-up] Intent mismatch: candidate accepted but LLM counter-offered — rejecting");
        parsed.needsFollowUp = false;
      } else if (didWalkAway && /congratulations|glad you accepted|welcome aboard/i.test(text)) {
        // LLM is congratulating when candidate is walking away — reject
        console.warn("[follow-up] Intent mismatch: candidate walking away but LLM congratulated — rejecting");
        parsed.needsFollowUp = false;
      } else if (parsed.followUpText.length < 30) {
        // Response too short to be meaningful — reject
        console.warn("[follow-up] Response too short (<30 chars) — rejecting");
        parsed.needsFollowUp = false;
      }
    }

    // Salary-negotiation: continue the conversation, but allow early close if candidate accepted
    // and we're past the initial offer phase (don't force 5 more turns after "I accept")
    const candidateAcceptedEarly = isSalaryNeg && negotiationFacts?.acceptedImmediately
      && (questionIndex ?? 0) >= 2; // past the first question
    const needsFollowUp = isSalaryNeg
      ? (candidateAcceptedEarly ? !!parsed.needsFollowUp : true)
      : (safeDepth >= 1 ? true : !!parsed.needsFollowUp);

    return new Response(JSON.stringify({
      needsFollowUp,
      followUpText: parsed.followUpText || "",
      followUpType: followUpTypeLabel,
      persona: persona ? ({"hiring manager": "Hiring Manager", "technical lead": "Technical Lead", "hr partner": "HR Partner"} as Record<string, string>)[persona.toLowerCase()] || persona : undefined,
    }), { status: 200, headers });
  } catch (err) {
    console.error("Follow-up generation error:", err);
    // Return needsFollowUp: false so the interview continues, but use 502 status
    // so client-side can distinguish between "no follow-up needed" and "error occurred"
    return new Response(JSON.stringify({ needsFollowUp: false, error: "Follow-up generation failed" }), { status: 502, headers });
  }
}

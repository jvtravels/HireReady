/* Vercel Edge Function — Dynamic Follow-Up Question Generation */

export const config = { runtime: "edge" };

import { handleCorsPreflightOrMethod, corsHeaders, isRateLimited, getClientIp, rateLimitResponse, verifyAuth, unauthorizedResponse, validateOrigin, sanitizeForLLM, withRequestId, checkLLMQuota, validateContentType } from "./_shared.js";
import { callLLM, extractJSON } from "./_llm.js";
import { lookupSalaryContext, getNegotiationStyleContext, INDUSTRY_PACKAGE_CONTEXT, type NegotiationStyle } from "../data/salary-lookup.js";

declare const process: { env: Record<string, string | undefined> };
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

export default async function handler(req: Request): Promise<Response> {
  const earlyResponse = handleCorsPreflightOrMethod(req);
  if (earlyResponse) return earlyResponse;

  const headers = withRequestId(corsHeaders(req));

  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > 524288) {
    return new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers });
  }

  if (!GROQ_KEY && !GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "LLM not configured" }), { status: 503, headers });
  }

  if (!validateOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  }

  const ctError = validateContentType(req, headers);
  if (ctError) return ctError;

  const auth = await verifyAuth(req);
  if (!auth.authenticated) return unauthorizedResponse(headers);

  const ip = getClientIp(req);
  if (await isRateLimited(ip, "follow-up", 20, 60_000)) {
    return rateLimitResponse(headers);
  }

  // LLM quota check
  const quota = await checkLLMQuota(auth.userId!, "follow-up");
  if (!quota.allowed) {
    return new Response(JSON.stringify({ error: quota.reason, needsFollowUp: false }), { status: 429, headers });
  }

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

    // For salary negotiation: determine conversation phase from questionIndex
    const salaryPhase = isSalaryNeg
      ? (negotiationPhase || (questionIndex !== undefined && totalQuestions
        ? questionIndex <= 1 ? "offer-reaction" : questionIndex === 2 ? "probe-expectations" : questionIndex === 3 ? "counter-offer" : "closing"
        : "offer-reaction"))
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

YOUR GOAL: Negotiate around what the candidate already told you. Move FORWARD — do NOT re-gather data.
- If they ACCEPTED: acknowledge warmly, transition to package details or closing.
- If they shared a number: MIRROR IT — "₹X is what you're targeting." Then probe the WHY: "Is that based on market research, a competing offer, or your current package progression?" Understanding their reasoning helps you counter smarter.
- If their number is way above your band (>1.5x maxStretch): REALITY CHECK with empathy — "I appreciate the ambition. ₹X is significantly above our band for this level in [city]. For context, [role] at companies like ours typically falls in the ₹Y-Z range. Help me understand how we bridge this gap — is there flexibility on your end, or should we explore a more senior position?"
- If they mentioned competing offers: probe — "What are they offering? More importantly, what matters most to you — the number, the role, or the team? Because those are very different conversations."
- If they deflected: put your full offer on the table with breakdown, then ask what would make it a yes.
- If they want to think about it: "Absolutely. Take the time you need — but can I ask what's giving you pause? Sometimes talking it through helps."
IMPORTANT: Once the candidate states ANY number, negotiate around it. Never re-ask what you already know.`,

        "counter-offer": `PHASE: Making a counter-offer based on everything you've heard.

YOUR GOAL: Trade, don't just concede. Make a SPECIFIC counter with exact ₹ numbers.
- ALWAYS make a concrete counter: "Here's what I can do — ₹X base, ₹Y variable, and I'll add a ₹Z joining bonus. That brings your total to ₹W LPA." Never say vague things like "some flexibility."
- If they want more base: "I can move base to ₹X if we adjust variable to Y%. Or I could add a ₹Z joining bonus to bridge the gap. Which works better for you?"
- If they focus only on salary: expand — "Beyond the ₹X CTC, let me throw in: ₹Y joining bonus, Z ESOPs vesting over 4 years, plus a ₹W learning budget. The total package value is actually ₹V."
- If they pushed hard: be transparent — "₹X is genuinely my ceiling for this band. Beyond that, I'd need to go back to leadership. But here's what I CAN add: [2-3 specific levers with numbers]."
- If their ask is reasonable (within your band): stretch and close — "You know what, let me make this work. ₹X LPA total, plus [one bonus lever]. Can we shake on this?"
- Notice period as a lever: "What's your notice period? If you can join within 30 days, I'll add a ₹X notice buyout."
- If vague: "What's the minimum package that makes this a clear yes for you? Give me a number and I'll tell you what I can do."`,

        "benefits-discussion": `PHASE: Expanding the conversation to total compensation beyond base salary.

YOUR GOAL: PROACTIVELY suggest creative trade-offs, don't just describe benefits.
- If they only discussed base: "Let me paint the full picture. Beyond ₹X CTC, there's: [list specific benefits with values]. When you add it all up, the real value is closer to ₹Y."
- If they asked about equity/ESOPs: go DEEP — "Great question. We offer X% vesting over 4 years with a 1-year cliff. At our current valuation, that's worth roughly ₹Y annually. What matters more to you — the vesting schedule or the total allocation?"
- If they asked about flexibility: be concrete — "We do [X days WFH/week]. Team standups are at [time]. As long as you hit your deliverables, we're flexible on hours."
- If they seem stuck on base: brainstorm together — "What if we keep base at ₹X but add a performance-linked ₹Y bonus after 6 months? Plus a ₹Z joining bonus upfront? Would that change the math for you?"
- If they asked about growth: "Typical promotion cycle is [X months]. Our last 3 hires at this level moved to [next level] within [timeline] with a [X-Y%] raise. I can build that trajectory into your offer letter."
- PROACTIVE suggestions: don't wait for them to ask. Offer — "Have you thought about our sabbatical policy? Or the fact that we cover ₹X for certifications annually?"`,

        "closing-pressure": `PHASE: Creating urgency and moving toward a decision.

YOUR GOAL: Close professionally. Create genuine but gentle urgency.
- If they seem close: "I genuinely want to close this today. I have one other strong candidate at final stage, and the headcount approval expires end of month. What do I need to do to get a yes?"
- If still pushing: present FINAL offer — "Here's my absolute best: ₹X base, ₹Y variable, ₹Z joining bonus, [equity]. Total: ₹W LPA. This is genuinely the top of what I can approve."
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

      // Detect candidate intent from the answer to make it prominent in the prompt
      // Position-aware: "but I accept" should count as acceptance, "I accept but want more equity" should not
      const acceptWords = /\b(i accept|i.?ll accept|accept the offer|sounds good|that works for me|it.?s a deal|i.?m happy with|fine with me|i agree|agreed|let.?s go ahead)\b/i;
      const rejectWords = /\b(not acceptable|too low|can.?t accept|absolutely not|not enough|walk away|not interested|i reject|no deal|way too low|that.?s insulting)\b/i;
      const hedgeWords = /\b(but|however|only if|unless|provided|on condition|contingent|except|though)\b/i;
      const deflectWords = /\b(you first|your offer|what.*you.*offer|tell me.*first|don.?t want to share|prefer not|rather not|you tell me)\b/i;
      const thinkWords = /\b(need time|think about|sleep on|let me think|consider|talk to.*(?:family|partner|wife|husband)|get back to you|not ready)\b/i;
      const competingWords = /\b(other offer|competing|another company|counter.?offer|multiple offers|also talking|interviewing at|got an offer)\b/i;
      const walkAwayWords = /\b(walk away|walking away|i.?m out|not interested|i.?ll pass|no deal|withdraw|decline the offer|i decline|pull out|not worth|won.?t work|isn.?t going to work|move on|take the other|thanks but no|not for me|have to pass)\b/i;
      // Short affirmative-only answers (< 8 words) like "yes", "okay", "sure" count as acceptance
      // BUT only if there's no hedge word anywhere in the answer
      const isShortAffirmative = answer.trim().split(/\s+/).length < 8
        && /^(yes|yeah|okay|ok|sure|deal|agreed|accept|sounds good|that works|fine)\b/i.test(answer.trim())
        && !hedgeWords.test(answer);
      // Position-aware intent: acceptance is valid only if no hedge/qualifier appears AFTER the acceptance phrase
      const acceptIdx = answer.search(acceptWords);
      const hedgeIdx = answer.search(hedgeWords);
      const hasAcceptFirst = acceptIdx >= 0 && (hedgeIdx < 0 || hedgeIdx < acceptIdx);
      const hasHedgeAfterAccept = acceptIdx >= 0 && hedgeIdx > acceptIdx;
      const candidateAccepted = (hasAcceptFirst || isShortAffirmative) && !hasHedgeAfterAccept;
      const candidateRejected = rejectWords.test(answer) && !acceptWords.test(answer);
      const candidateDeflected = deflectWords.test(answer);
      const candidateWalkAway = walkAwayWords.test(answer) && !acceptWords.test(answer);

      // Extract candidate's specific number if they mentioned one
      const candidateNumMatch = answer.match(/₹?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lakhs|l\b)/i);
      const candidateNum = candidateNumMatch ? candidateNumMatch[1] : null;
      // "consider" co-occurring with a number is a counter, not a time request
      const candidateNeedsTime = thinkWords.test(answer) && !candidateNumMatch;
      const candidateMentionedCompeting = competingWords.test(answer);

      // Build intent banner — placed at the VERY TOP of the prompt so the LLM can't miss it
      let intentBanner = "";
      if (candidateAccepted) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE ACCEPTED THE OFFER. THEY SAID: "${sanitizeForLLM(answer, 350)}" ⚠️⚠️⚠️
YOU MUST acknowledge their acceptance warmly FIRST. Then either:
- If they accepted too quickly (within first 2 questions): gently probe — "That's great! But before we lock this in, have you considered [equity/flexibility/growth path]? I want you to feel confident."
- If later in the negotiation: move to closing — recap the EXACT agreed package with ₹ numbers, mention offer letter timeline, ask about notice period. Rebuild warmth: "I'm really glad we worked this out."
DO NOT counter-offer or act as if they rejected. They said YES.
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

      depthInstructions = `You are a HIRING MANAGER in a salary negotiation. You MUST stay in character. ALWAYS set needsFollowUp to true.
${intentBanner}
${factsCtx}${offerCtx}${bandCtx}${offerTrackingCtx}${targetCtx}${styleCtx}${industryCtx}${scenarioCtx}

${phaseInstructions[salaryPhase] || phaseInstructions["offer-reaction"]}

RULES:
- #1 RULE: Your response MUST match the candidate's intent. Re-read their answer above. If they accepted → acknowledge and close. If they rejected → acknowledge and counter. If they asked a question → answer it. NEVER respond as if they said something different.
- MIRROR-BACK (CRITICAL): ALWAYS start by paraphrasing what the candidate said. If they named a number: "I heard ₹X from you..." If they raised a concern: "So your main concern is..." This makes it feel like a real conversation, not a script.
- Make SPECIFIC counter-offers with exact ₹ numbers. NEVER say vague things like "some flexibility" or "we can look at it." Say "I can stretch to ₹X if we structure it as..."
- NEVER ask for info the candidate already provided. Use what you know from CANDIDATE FACTS.
- Use EXACT numbers from the initial offer and candidate facts above. Do NOT invent figures.
- MONOTONIC OFFERS (CRITICAL): Your offers can ONLY go UP. If initial offer was ₹X LPA, every subsequent number MUST be >= ₹X. Even when restructuring components, TOTAL CTC must stay >= initial.
- If near maxStretch: frame it as needing approval — "That's at the top of my authority. Let me see if I can get leadership to sign off on ₹X." NEVER silently hit a ceiling.
- Use MARKET BENCHMARKS to anchor: "For [role] in [city], the market range is ₹X-Y. Our offer of ₹Z puts you at the Nth percentile."
- Notice period is a LEVER: proactively ask about it and offer buyout as a trade — "If you can join in 30 days, I'll add ₹X notice buyout."
- Sound like a real Indian hiring manager — professional, warm, direct. 2-4 sentences.
- Use ₹ and LPA. Indian context.
- NEVER break character. NEVER give coaching tips. You ARE the hiring manager.`;
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

    // Cross-question memory: earlier conversation for thematic connections
    const historyContext = conversationHistory
      ? `\nEARLIER IN THIS INTERVIEW (use for thematic connections — reference earlier answers when relevant):\n${sanitizeForLLM(conversationHistory, 2500)}`
      : "";

    const prompt = `You are an expert interviewer. Given a candidate's answer to an interview question, decide if a follow-up question is needed.${panelContext}

Interview type: ${sanitizeForLLM(type, 50) || "behavioral"}
Role: ${sanitizeForLLM(role, 100) || "senior role"}${company ? `\nCompany: ${sanitizeForLLM(company, 100)}` : ""}${salaryFollowUpCtx}${jdContext ? `\n${jdContext}` : ""}${resumeSkillsContext ? `\n${resumeSkillsContext}` : ""}${historyContext}

Question asked: "${sanitizeForLLM(question, 500)}"
Candidate's answer: "${sanitizeForLLM(answer, 1000)}"${previousContext}

${depthInstructions}

CROSS-QUESTION MEMORY: If the candidate mentioned something interesting in an earlier answer (visible in the conversation history above), you MAY reference it naturally: "Earlier you mentioned X — how does that connect to what you just described?" This makes the interview feel like a real conversation, not a checklist.

Respond JSON only:
{"needsFollowUp":true/false,"followUpText":"The follow-up question (2-3 sentences, conversational). Only include if needsFollowUp is true.","followUpType":"${followUpTypeLabel}","reason":"Brief reason"}`;

    const result = await callLLM({ prompt, temperature: 0.3, maxTokens: 500, jsonMode: true, fast: true }, 8000);
    const parsed = extractJSON<{ needsFollowUp?: boolean; followUpText?: string; followUpType?: string }>(result.text);
    if (!parsed || typeof parsed !== "object") {
      // Return 502 so client can distinguish "LLM failed" from "no follow-up needed"
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
      if (highestOfferMade && highestOfferMade > 0) {
        const monoRe = /₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh|lakhs)/g;
        let monoMatch: RegExpExecArray | null;
        while ((monoMatch = monoRe.exec(clamped)) !== null) {
          const monoNum = parseFloat(monoMatch[1]);
          if (monoNum < highestOfferMade && monoNum >= negotiationBand.walkAway) {
            console.warn(`[follow-up] Monotonic violation: ₹${monoNum} < previous highest ₹${highestOfferMade} — clamping`);
            clamped = clamped.replace(monoMatch[0], `₹${highestOfferMade} LPA`);
          }
        }
      }
      parsed.followUpText = clamped;
    }

    // Intent-mismatch validator: catch cases where LLM ignores the detected intent
    if (isSalaryNeg && parsed.followUpText) {
      const text = parsed.followUpText.toLowerCase();
      const counterOfferPat = /how about|what if I offer|counter.*with|we could do|let me offer/i;
      if (candidateAccepted && counterOfferPat.test(parsed.followUpText)) {
        // LLM is counter-offering when candidate already accepted — reject and signal fallback
        console.warn("[follow-up] Intent mismatch: candidate accepted but LLM counter-offered — rejecting");
        parsed.needsFollowUp = false;
      } else if (candidateWalkAway && /congratulations|glad you accepted|welcome aboard/i.test(text)) {
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

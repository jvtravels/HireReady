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
    const { question, answer, type, role, jobDescription, company, currentCity, jobCity, followUpDepth = 0, previousFollowUps, persona, conversationHistory, negotiationPhase, questionIndex, totalQuestions, resumeTopSkills, initialOfferText, negotiationFacts, negotiationStyle, negotiationBand, industry } = await req.json() as {
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
        "offer-reaction": `CONVERSATION PHASE: Reacting to candidate's response to initial offer.

Read the candidate's response carefully and respond naturally:
- If they expressed interest but didn't commit → "Great to hear! Before we get into specifics, I'm curious — what's your current compensation looking like? And what range are you targeting for this move?"
- If they asked about the breakdown → Provide details (base, bonus, benefits) and then ask: "Does that give you a clearer picture? What range were you expecting?"
- If they immediately named a counter-number → "That's helpful to know. Let me understand — is that based on a competing offer, your current package, or market research?"
- If they said it's too low → "I appreciate the honesty. Help me understand what you had in mind — what would make this work for you?"
- If they accepted immediately → "I'm glad! But before we finalize, I want to make sure you've thought about the full picture — benefits, growth path, work flexibility. Anything you'd want to discuss?"
- If the answer is vague/empty → "I want to make sure we're on the same page. What are your salary expectations for this role? A range is fine."`,

        "probe-expectations": `CONVERSATION PHASE: Probing the candidate's expectations and current situation.

You've heard their initial reaction. Now probe deeper — but RESPOND to what they actually said:
- If they shared their current CTC → Acknowledge it and position your offer: "So you're at ₹X currently. Our offer of ₹Y represents a Z% hike. Is that in the range you were hoping for, or do you have a specific target?"
- If they named a higher range → "I hear you. ₹X is above our initial band, but let me see what flexibility I have. What's driving that number — is it a competing offer, or your market research?"
- If they mentioned competing offers → "That's fair. Without asking you to share details, can you tell me what matters most — is it the base, the total package, or the role itself?"
- If they deflected or asked you to go first → "Fair enough. Let me put our cards on the table — [restate offer with breakdown]. Now, what would you need to see to make this a yes?"
- If the answer is vague/empty → "I need to understand your expectations to work with you on this. Can you share what CTC range you're targeting?"`,

        "counter-offer": `CONVERSATION PHASE: Making a counter-offer based on the negotiation so far.

You've heard their expectations. Now negotiate — trade, don't just concede:
- If they asked for more base → "I can move the base to ₹X, but I'd need to adjust the variable component. Alternatively, I can add a joining bonus of ₹Y. Which would you prefer?"
- If they focused only on salary → "Base is one piece. Let me share the full picture — [mention benefits: learning budget, flexible work, health insurance, ESOPs]. When you factor these in, the effective package is closer to ₹X. Does that change your thinking?"
- If they were reasonable → "I think we're close. Let me stretch to ₹X CTC — that's genuinely the ceiling for this band. I can also add [one extra lever]. Would that work?"
- If they pushed hard → "I respect the ambition. Let me be transparent — ₹X is the max for this level. But here's what I can do: [offer 2-3 non-salary levers]. What matters most to you?"
- If the answer is vague/empty → "We need to find a number that works for both of us. I've shared our range — what's the minimum package that would make you say yes?"`,

        "benefits-discussion": `CONVERSATION PHASE: Discussing the full package beyond base salary.

The candidate has heard your counter. Now expand the conversation to total compensation:
- If they only discussed base → "Let me show you the full picture. Beyond the ₹X base, you'd get [benefits]. When you factor in the learning budget, flexible work, and health coverage, the effective value is closer to ₹Y. What matters most to you?"
- If they asked about equity/ESOPs → Address it directly with specific numbers from the salary data. Explain vesting schedule.
- If they asked about work flexibility → "We offer [specific policy]. Many of our team members find this adds significant value to their work-life balance."
- If they brought up career growth → "Your first performance review would be at 6 months, and we have a clear promotion path. For this role, the next level typically comes in 18-24 months with a 20-30% jump."
- If the answer is vague/empty → "I want to make sure you're seeing the complete package. What non-salary benefits matter most to you — flexibility, learning, equity, or something else?"`,

        "closing-pressure": `CONVERSATION PHASE: Creating urgency and moving toward a decision.

Apply gentle pressure to close. Be professional but create urgency:
- If they seem close to accepting → "I think we're aligned. I should mention — this is at the top of our band, and I have one other strong candidate in the final round. I'd love to wrap this up today."
- If they're still pushing → "I've been as flexible as I can. Here's what I can do as a final offer: [full breakdown]. I'd need your decision by [specific date]. Can you commit to that timeline?"
- If they ask about notice period → "What's your notice period? If you can join in 30 days instead of 60-90, I can add an early joining bonus. That's a win-win."
- If they want to think → "Absolutely — take 48 hours. But I want to be upfront: I can hold this offer until [date], after which the headcount may be reallocated."
- If the answer is vague/empty → "I need to move this forward. What's the one thing standing between you and a yes?"`,

        "closing": `CONVERSATION PHASE: Closing the negotiation — finalize and wrap up.

Move toward a decision. Be warm but create gentle urgency:
- If they seem satisfied → "Great, I think we have a deal. Let me summarize: [recap final package]. I'll have HR send the offer letter by [tomorrow/end of week]. What's your notice period, so we can plan your start date?"
- If they're still negotiating → "I've stretched as far as I can on this. Here's my final offer: [full breakdown]. I'd need your decision by [next week]. We have other candidates in the pipeline, and I'd hate to lose you over a small gap."
- If they mentioned notice period → "If you can join within 30 days, I'll add an early joining bonus. Otherwise, we'll work with your timeline. Shall I have HR start the paperwork?"
- If they want to think about it → "Of course, take your time — but I'd appreciate a decision by [date]. The team is excited about you joining, and I want to hold this headcount."
- If the answer is vague/empty → "Let me put the final offer on the table: [recap]. I need a yes or no by [date]. What do you say?"`,
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
        if (negotiationFacts.candidateCounter) factsLines.push(`- Candidate's counter/target: ${sanitizeForLLM(negotiationFacts.candidateCounter, 30)}`);
        if (negotiationFacts.candidateCurrentCTC) factsLines.push(`- Candidate's current CTC: ${sanitizeForLLM(negotiationFacts.candidateCurrentCTC, 30)}`);
        if (negotiationFacts.hasCompetingOffers) factsLines.push("- Candidate mentioned competing offers");
        if (negotiationFacts.deflectedNumbers) factsLines.push("- Candidate deflected/refused to share their numbers");
        if (negotiationFacts.topicsRaised && negotiationFacts.topicsRaised.length > 0) {
          factsLines.push(`- Topics the candidate raised: ${negotiationFacts.topicsRaised.join(", ")}`);
        }
      }
      const factsCtx = factsLines.length > 0
        ? `\nCANDIDATE FACTS (from this conversation — use these to personalize your response):\n${factsLines.join("\n")}`
        : "";

      // Negotiation band context (structured authority limits)
      const bandCtx = negotiationBand?.bandContext
        ? `\n${sanitizeForLLM(negotiationBand.bandContext, 600)}`
        : "";

      // Negotiation style context
      const styleCtx = negotiationStyle
        ? `\n${getNegotiationStyleContext(negotiationStyle)}`
        : "";

      // Industry-specific package flavor
      const industryCtx = industry && INDUSTRY_PACKAGE_CONTEXT[industry.toLowerCase()]
        ? `\n${INDUSTRY_PACKAGE_CONTEXT[industry.toLowerCase()]}`
        : "";

      depthInstructions = `You are a HIRING MANAGER in a salary negotiation. You MUST stay in character — NEVER ask behavioral/STAR questions. ALWAYS set needsFollowUp to true (the conversation must continue).
${offerCtx}${factsCtx}${bandCtx}${styleCtx}${industryCtx}

${phaseInstructions[salaryPhase] || phaseInstructions["offer-reaction"]}

CRITICAL RULES:
- Your response MUST directly reference what the candidate just said. Do NOT ignore their answer.
- If the candidate gave a blank or very short answer, acknowledge it and re-ask clearly.
- When referencing the offer, use the EXACT numbers from the initial offer above. Do NOT make up different amounts.
- If you have a negotiation band, NEVER exceed your maxStretch without saying you need approval. NEVER go below your floor.
- Sound like a real Indian hiring manager — professional, warm, direct. 2-3 sentences max.
- Use ₹ and LPA for all amounts. Use Indian context.
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
      return new Response(JSON.stringify({ needsFollowUp: false }), { status: 200, headers });
    }
    // Sanitize LLM response fields
    if (typeof parsed.followUpText !== "string") parsed.followUpText = "";
    if (typeof parsed.needsFollowUp !== "boolean") parsed.needsFollowUp = false;

    // Salary-negotiation: always continue the conversation. Other types: depths 1-2 always follow up.
    const needsFollowUp = isSalaryNeg ? true : (safeDepth >= 1 ? true : !!parsed.needsFollowUp);

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

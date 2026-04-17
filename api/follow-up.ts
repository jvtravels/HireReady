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
        "offer-reaction": `PHASE: Reacting to the candidate's response to your initial offer.

YOUR GOAL: Understand where they stand and steer toward specifics.
- If they ACCEPTED the offer (e.g. "I accept", "sounds good", "deal", "that works"): You MUST first acknowledge their acceptance warmly ("That's great to hear!"), THEN gently coach them by saying something like "Before we finalize, I want to make sure you've seen the full picture — have you thought about [benefits/equity/flexibility/growth path]?" Do NOT ignore their acceptance or pretend they said something else.
- If they named a number or expectation: acknowledge it, compare to your offer, ask what's driving their number.
- If they asked about breakdown: provide base/bonus/benefits split, then ask if that changes their view.
- If they said it's too low: acknowledge their honesty, ask what range would work for them.
- If vague/empty: restate your offer clearly and ask for their target range.
CRITICAL: Your response MUST directly reference what the candidate actually said. Do NOT hallucinate that they mentioned a range or counter if they simply accepted.`,

        "probe-expectations": `PHASE: Probing deeper into the candidate's expectations.

YOUR GOAL: Negotiate around what the candidate already told you. Move FORWARD — do NOT gather more data.
- If they ACCEPTED the offer: acknowledge warmly ("Wonderful! I'm glad the offer works for you."), then transition to full package details or closing. Do NOT keep negotiating or pretend they didn't accept.
- If they shared a number/expectation (even just base or total): acknowledge that EXACT number, compare it to your offer, and make a counter or trade. Do NOT ask for current CTC, breakdown, or justification — that sounds interrogative, not collaborative.
- If they mentioned competing offers: ask what matters most — base, total package, or the role itself.
- If they deflected: put your full offer on the table with breakdown, then ask what would make it a yes.
- If vague/empty: ask directly for their target CTC range.
IMPORTANT: Once the candidate states ANY salary expectation, you MUST negotiate around that number. Never ask "what's your current CTC" or "can you share your expectations" — you already know.`,

        "counter-offer": `PHASE: Making a counter-offer based on everything you've heard.

YOUR GOAL: Trade, don't just concede. Use non-salary levers.
- If they ACCEPTED: acknowledge warmly, then present the full package breakdown and move toward closing.
- If they want more base: offer to adjust variable/bonus components, or add a joining bonus — ask which they prefer.
- If they focus only on salary: expand to total package (benefits, learning budget, flexibility, ESOPs).
- If they seem reasonable: stretch to a specific CTC number and add one extra lever.
- If they pushed hard: state your max transparently and offer 2-3 non-salary levers.
- If vague/empty: ask for their minimum acceptable package.`,

        "benefits-discussion": `PHASE: Expanding the conversation to total compensation beyond base salary.

YOUR GOAL: Show the full value of the package. Address what THEY care about.
- If they only discussed base: break down the full package value including benefits.
- If they asked about equity/ESOPs: give specific details and vesting schedule.
- If they asked about flexibility: describe the policy concretely.
- If they asked about growth: describe the promotion path with timelines and typical raises.
- If vague/empty: ask what non-salary benefits matter most to them.`,

        "closing-pressure": `PHASE: Creating urgency and moving toward a decision.

YOUR GOAL: Close professionally. Create gentle urgency without being pushy.
- If they seem close: mention timeline pressure (other candidates, headcount window).
- If still pushing: present your final offer with full breakdown and ask for a commitment timeline.
- If they mention notice period: explore early joining bonus as a lever.
- If they want time to think: give a specific window (48 hours) with a reason.
- If vague/empty: ask directly what's standing between them and a yes.`,

        "closing": `PHASE: Finalizing the negotiation.

YOUR GOAL: Summarize the deal and move to next steps.
- If they seem satisfied: recap the final package, mention offer letter timeline, ask about notice period.
- If still negotiating: present your absolute final offer, set a decision deadline.
- If they mentioned notice period: explore if earlier joining unlocks a bonus.
- If they want to think: set a specific deadline and express enthusiasm.
- If vague/empty: put the final offer on the table and ask for a yes/no by a date.`,
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

      // Detect candidate intent from the answer to make it prominent in the prompt
      // Tighter patterns to avoid false positives: "okay but I want more" shouldn't count as acceptance
      const negationWords = /\b(no|not|don.?t|can.?t|won.?t|wouldn.?t|never|reject|decline|but)\b/i;
      const acceptWords = /\b(i accept|i.?ll accept|accept the offer|sounds good|that works for me|it.?s a deal|i.?m happy with|fine with me|i agree|agreed|let.?s go ahead)\b/i;
      const rejectWords = /\b(not acceptable|too low|can.?t accept|absolutely not|not enough|walk away|not interested|i reject|no deal|way too low|that.?s insulting)\b/i;
      // Short affirmative-only answers (< 8 words) like "yes", "okay", "sure" count as acceptance
      const isShortAffirmative = answer.trim().split(/\s+/).length < 8 && /^(yes|yeah|okay|ok|sure|deal|agreed|accept|sounds good|that works|fine)\b/i.test(answer.trim());
      const candidateAccepted = (acceptWords.test(answer) || isShortAffirmative) && !negationWords.test(answer);
      const candidateRejected = rejectWords.test(answer) && !acceptWords.test(answer);

      // Build intent banner — placed at the VERY TOP of the prompt so the LLM can't miss it
      let intentBanner = "";
      if (candidateAccepted) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE ACCEPTED THE OFFER. THEY SAID: "${sanitizeForLLM(answer, 200)}" ⚠️⚠️⚠️
YOU MUST acknowledge their acceptance FIRST ("That's great!", "Wonderful!"). Then either:
- Walk them through the full package details before finalizing, OR
- Move directly to closing (summarize package, mention offer letter, set timeline).
DO NOT counter-offer, negotiate, or act as if they rejected. They said YES.
`;
      } else if (candidateRejected) {
        intentBanner = `
⚠️⚠️⚠️ THE CANDIDATE REJECTED/PUSHED BACK. THEY SAID: "${sanitizeForLLM(answer, 200)}" ⚠️⚠️⚠️
YOU MUST acknowledge their pushback FIRST ("I understand your concern", "I hear you"). Then:
- Ask what would make it work for them, OR
- Make a better counter-offer with specific numbers.
DO NOT ignore their rejection. DO NOT close the deal as if they agreed. They said NO.
`;
      } else {
        intentBanner = `
THE CANDIDATE SAID: "${sanitizeForLLM(answer, 200)}"
Your response MUST directly address what they said above. Start by acknowledging their words.
`;
      }

      depthInstructions = `You are a HIRING MANAGER in a salary negotiation. You MUST stay in character. ALWAYS set needsFollowUp to true.
${intentBanner}
${factsCtx}${offerCtx}${bandCtx}${styleCtx}${industryCtx}

${phaseInstructions[salaryPhase] || phaseInstructions["offer-reaction"]}

RULES:
- #1 RULE: Your response MUST match the candidate's intent. Re-read their answer above. If they accepted → acknowledge and close. If they rejected → acknowledge and counter. If they asked a question → answer it. NEVER respond as if they said something different.
- Start by acknowledging what the candidate JUST said — quote their number or key point.
- Then advance the negotiation: counter, probe motivation, expand to benefits, or close.
- NEVER ask for info the candidate already provided (salary expectation, CTC, counter-offer). Use what you know.
- Use EXACT numbers from the initial offer and candidate facts above. Do NOT invent figures.
- MONOTONIC OFFERS (CRITICAL): Your offers can ONLY go UP. If initial offer was ₹X LPA, every subsequent number MUST be >= ₹X. Offering ₹20 when initial was ₹25 is WRONG — even when restructuring components, the TOTAL CTC must stay >= initial. Check conversation history.
- If you have a negotiation band, NEVER exceed maxStretch without saying you need approval.
- Sound like a real Indian hiring manager — professional, warm, direct. 2-3 sentences max.
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

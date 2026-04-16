/* ─── Interview Script Definitions & Generators ─── */

import type { User } from "./AuthContext";

/** Fisher-Yates shuffle + pick N items — ensures different questions every session */
function shuffleAndPick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export interface InterviewStep {
  type: "intro" | "question" | "follow-up" | "closing";
  aiText: string;
  thinkingDuration: number;
  speakingDuration: number;
  waitForUser: boolean;
  scoreNote?: string;
  persona?: string; // For panel interviews: which interviewer is speaking
}

export const scriptsByType: Record<string, InterviewStep[]> = {
  behavioral: [
    { type: "intro", aiText: "Hi! Welcome to your behavioral mock interview. I'm your AI interviewer today. We'll focus on leadership, decision-making, and conflict resolution. This will take about 15 minutes. Feel free to take your time. Ready?", thinkingDuration: 500, speakingDuration: 6000, waitForUser: true },
    { type: "question", aiText: "Great. Tell me about a time you had to make a difficult technical decision that significantly impacted your team's roadmap. What was the situation, and how did you approach it?", thinkingDuration: 600, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: STAR structure, strategic framing, business impact" },
    { type: "question", aiText: "Now, let's talk about scaling. Describe a situation where you had to scale your engineering organization. What challenges did you face, and how did you maintain engineering velocity during that growth?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: scaling strategy, people management, metrics" },
    { type: "question", aiText: "Let's shift to stakeholder management. Tell me about a time when you had to push back on a request from a senior executive. How did you handle it, and what was the outcome?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: stakeholder alignment, communication, courage" },
    { type: "closing", aiText: "That's excellent. We've covered some great ground today. You showed strong strategic thinking and good STAR structure. Your main area for improvement is quantifying business impact — try anchoring your answers with specific metrics. Great session! Any final thoughts before we wrap up?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
  strategic: [
    { type: "intro", aiText: "Welcome to your strategic interview session. Today we'll explore your vision-setting ability, roadmap thinking, and business alignment. Let's dive in — are you ready?", thinkingDuration: 500, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: "Imagine you've just joined a company as VP of Engineering. The product has strong market fit but the tech stack is aging. How would you approach building a 3-year technical strategy?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: strategic vision, prioritization, stakeholder buy-in" },
    { type: "question", aiText: "Tell me about a time you had to pivot a major initiative based on changing business conditions. How did you recognize the need and communicate the change?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: adaptability, communication, decisiveness" },
    { type: "question", aiText: "How do you ensure engineering strategy stays aligned with business goals? Walk me through your approach to cross-functional planning.", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: cross-functional alignment, planning rigor" },
    { type: "closing", aiText: "Excellent session. Your strategic thinking is sharp, especially around prioritization frameworks. I'd recommend strengthening your answers with more specific revenue or growth metrics. Well done! Anything you'd like to add before we finish?", thinkingDuration: 800, speakingDuration: 6000, waitForUser: true },
  ],
  technical: [
    { type: "intro", aiText: "Welcome to your technical leadership interview. We'll focus on architecture decisions, system design at scale, and tech strategy. Ready to begin?", thinkingDuration: 500, speakingDuration: 4500, waitForUser: true },
    { type: "question", aiText: "Describe a system you designed that had to handle 10x growth in traffic. What were the key architectural decisions and trade-offs?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: scalability thinking, trade-off analysis" },
    { type: "question", aiText: "Tell me about a major production incident you led the response for. How did you structure the incident response, and what systemic changes did you make afterward?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: incident management, blameless culture, systemic thinking" },
    { type: "question", aiText: "How do you evaluate and introduce new technologies into your stack? Walk me through a recent technology decision you drove.", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: tech evaluation rigor, risk management" },
    { type: "closing", aiText: "Strong session. Your technical depth is evident, and you communicate architecture decisions clearly. For improvement, try connecting technical decisions more explicitly to business outcomes. Great work! Any final thoughts?", thinkingDuration: 800, speakingDuration: 6500, waitForUser: true },
  ],
  "case-study": [
    { type: "intro", aiText: "Welcome to your case study interview. I'll present you with business scenarios that test your analytical thinking and problem-solving frameworks. Let's start.", thinkingDuration: 500, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: "Your company's core API has 99.95% uptime but customers are churning citing 'reliability issues.' Latency p99 is 2 seconds. How would you investigate and address this?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: problem decomposition, data-driven approach" },
    { type: "question", aiText: "A competitor just launched a feature that took them 2 months. Your team estimates it would take 6 months due to tech debt. The CEO wants it in 3. How do you handle this?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: negotiation, creative solutions, scope management" },
    { type: "question", aiText: "Your engineering team of 40 has low morale. Attrition is at 25%. Exit interviews cite 'lack of growth' and 'unclear direction.' You have 90 days to turn it around. What do you do?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: people leadership, organizational design, quick wins" },
    { type: "closing", aiText: "Impressive problem-solving. You structured your answers well and considered multiple stakeholders. To improve, try to quantify the expected impact of your proposed solutions. Great case analysis! Anything else you'd like to share?", thinkingDuration: 800, speakingDuration: 6500, waitForUser: true },
  ],
  "campus-placement": [
    { type: "intro", aiText: "Hi! Welcome to your campus placement mock interview. I'll be your interviewer today. We'll cover a mix of HR questions, problem-solving, and questions about your academic projects. This is designed to feel like a real on-campus interview. Ready to begin?", thinkingDuration: 500, speakingDuration: 6000, waitForUser: true },
    { type: "question", aiText: "Let's start with the basics. Tell me about yourself — your academic background, key projects, and what you're looking for in your first role.", thinkingDuration: 600, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: concise intro, relevant highlights, career clarity" },
    { type: "question", aiText: "Walk me through a project you're most proud of from college. What was your specific contribution, and what did you learn from the challenges you faced?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: technical depth, ownership, learning mindset" },
    { type: "question", aiText: "Where do you see yourself in 5 years? How does this role fit into your long-term career goals?", thinkingDuration: 600, speakingDuration: 3500, waitForUser: true, scoreNote: "Focus on: ambition, alignment with role, realistic goals" },
    { type: "question", aiText: "Tell me about a time you worked in a team on a tight deadline — perhaps for a college project, hackathon, or internship. How did you handle disagreements or pressure?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: teamwork, conflict resolution, deadline management" },
    { type: "closing", aiText: "Good session! You showed solid self-awareness and communicated your experiences clearly. For campus interviews, remember to quantify your project outcomes — user counts, performance improvements, or business impact. Practice keeping your answers under 2 minutes. Any final questions?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
  "hr-round": [
    { type: "intro", aiText: "Welcome to your HR round practice session. This round focuses on your personality, cultural fit, and soft skills. I'll ask questions that real HR managers ask. Let's get started — are you ready?", thinkingDuration: 500, speakingDuration: 5000, waitForUser: true },
    { type: "question", aiText: "Tell me about yourself. Walk me through your journey — what drives you and why are you interested in this role?", thinkingDuration: 600, speakingDuration: 4000, waitForUser: true, scoreNote: "Focus on: concise narrative, motivation, role alignment" },
    { type: "question", aiText: "What are your greatest strengths and weaknesses? Give me a specific example of how a strength helped you deliver results, and how you're working on a weakness.", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: self-awareness, honesty, growth mindset" },
    { type: "question", aiText: "Describe a conflict you had with a colleague or team member. How did you resolve it, and what did you learn?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: emotional intelligence, resolution approach, maturity" },
    { type: "question", aiText: "Why should we hire you over other candidates? What unique value do you bring to this team?", thinkingDuration: 600, speakingDuration: 4000, waitForUser: true, scoreNote: "Focus on: confidence without arrogance, unique value proposition" },
    { type: "closing", aiText: "Well done! Your answers showed good self-awareness. Key tips for HR rounds: always connect your answers back to the company's values and mission, keep responses structured but conversational, and prepare thoughtful questions to ask back. Great practice! Anything else before we wrap up?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
  management: [
    { type: "intro", aiText: "Welcome to your management interview session. We'll explore your leadership style, team management approach, and how you drive results through others. This covers questions typical for operations, project management, and general management roles. Ready?", thinkingDuration: 500, speakingDuration: 6000, waitForUser: true },
    { type: "question", aiText: "Tell me about your management philosophy. How do you balance getting results with keeping your team motivated and engaged?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: leadership style clarity, people-first thinking, results orientation" },
    { type: "question", aiText: "Describe a situation where you had to manage a team through a significant change or reorganization. What was your approach and what challenges did you face?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: change management, communication, empathy" },
    { type: "question", aiText: "How do you handle underperformance on your team? Walk me through a specific example where you had to address a team member who wasn't meeting expectations.", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: difficult conversations, fairness, development orientation" },
    { type: "question", aiText: "Tell me about a cross-functional initiative you led. How did you align different departments with competing priorities toward a shared goal?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: influence without authority, stakeholder management, strategic thinking" },
    { type: "closing", aiText: "Strong session. Your management approach shows maturity. To improve: use more specific data points — team sizes, budget impact, timelines, and measurable outcomes. This makes your leadership tangible. Well done! Any closing thoughts?", thinkingDuration: 800, speakingDuration: 6500, waitForUser: true },
  ],
  "government-psu": [
    { type: "intro", aiText: "Welcome to your government and public sector interview practice. These interviews test your awareness of public administration, ethics, current affairs, and your motivation for public service. Let's begin — are you ready?", thinkingDuration: 500, speakingDuration: 5500, waitForUser: true },
    { type: "question", aiText: "Why do you want to work in the public sector? What motivates you to choose government service over a private sector career?", thinkingDuration: 600, speakingDuration: 4000, waitForUser: true, scoreNote: "Focus on: genuine motivation, understanding of public service, idealism balanced with realism" },
    { type: "question", aiText: "Suppose you're posted in a rural district and discover that a government scheme is not reaching its intended beneficiaries due to local corruption. What steps would you take?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Focus on: ethical reasoning, practical approach, knowledge of governance systems" },
    { type: "question", aiText: "India faces challenges in balancing economic growth with environmental sustainability. How would you approach this trade-off in a policy role?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: balanced perspective, policy awareness, analytical thinking" },
    { type: "question", aiText: "Tell me about a current national issue you feel strongly about. What is the government's current approach, and what would you do differently?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: current affairs knowledge, critical thinking, constructive suggestions" },
    { type: "closing", aiText: "Good discussion. You showed thoughtful reasoning. For government interviews, remember to reference specific policies, schemes, and constitutional provisions. Stay balanced — avoid extreme positions. Your awareness and articulation are key differentiators. Any final points?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
  teaching: [
    { type: "intro", aiText: "Welcome to your teaching position interview practice. Whether you're preparing for a school, college, or competitive teaching exam interview, we'll cover pedagogy, classroom management, and subject knowledge. Let's start — ready?", thinkingDuration: 500, speakingDuration: 5500, waitForUser: true },
    { type: "question", aiText: "What is your teaching philosophy? How do you ensure every student in a diverse classroom is engaged and learning?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: inclusive pedagogy, student-centered approach, practical examples" },
    { type: "question", aiText: "Describe how you would handle a classroom situation where a group of students is consistently disruptive and affecting other students' learning.", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: classroom management, empathy, positive discipline" },
    { type: "question", aiText: "How do you integrate technology and modern teaching methods into your lessons? Can you give a specific example of an innovative approach you've used or would use?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Focus on: tech integration, innovation, pedagogical reasoning" },
    { type: "question", aiText: "A parent complains that their child is not performing well and blames your teaching methods. How do you handle this conversation?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: communication, professionalism, collaborative problem-solving" },
    { type: "closing", aiText: "Well done! You showed a genuine passion for teaching. Remember, interviewers for teaching positions look for patience, adaptability, and a commitment to student growth. Back your answers with specific classroom examples whenever possible. Great session! Any questions?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
  "panel": [
    { type: "intro", aiText: "Welcome to your panel interview. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. We'll each ask you questions from our perspective. Let's begin — tell us briefly about yourself.", thinkingDuration: 500, speakingDuration: 6000, waitForUser: true, persona: "Hiring Manager" },
    { type: "question", aiText: "From a technical standpoint, tell me about the most complex system you've designed or contributed to. What were the key architectural trade-offs?", thinkingDuration: 800, speakingDuration: 5000, waitForUser: true, scoreNote: "Technical Lead evaluating: architecture depth, trade-off analysis", persona: "Technical Lead" },
    { type: "question", aiText: "I'd like to understand your leadership style. Can you describe a time you had to rally a team through a difficult period? What was your approach?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Hiring Manager evaluating: leadership, team management", persona: "Hiring Manager" },
    { type: "question", aiText: "Let's talk about culture and collaboration. How do you handle disagreements with peers, especially when you strongly believe your approach is right?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "HR Partner evaluating: emotional intelligence, conflict resolution, cultural fit", persona: "HR Partner" },
    { type: "question", aiText: "Back to the technical side — if I gave you a system currently handling 1000 requests per second and told you it needs to handle 100x that in 6 months, how would you approach it?", thinkingDuration: 800, speakingDuration: 5500, waitForUser: true, scoreNote: "Technical Lead evaluating: scalability thinking, planning", persona: "Technical Lead" },
    { type: "closing", aiText: "Thank you for speaking with all of us today. We've covered technical depth, leadership, and cultural fit. You showed strong communication across all three dimensions. For panel interviews, remember to address each panelist's perspective directly. Great practice — any questions for us?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true, persona: "Hiring Manager" },
  ],
  "salary-negotiation": [
    { type: "intro", aiText: "Good to see you again. We've completed all the interview rounds, and the team was really impressed with your profile. I'm here to discuss the offer details and see if we can make this work. Let me walk you through what we've put together.", thinkingDuration: 500, speakingDuration: 5500, waitForUser: true },
    { type: "question", aiText: "We've put together a competitive offer for this role based on our internal bands and market benchmarks. It includes a base salary, performance bonus, and standard benefits including health insurance for you and your family. I'll walk you through the details — but first, how are you feeling about the opportunity overall?", thinkingDuration: 600, speakingDuration: 5500, waitForUser: true, scoreNote: "Phase: offer-reaction. Evaluate: Did they accept too quickly? Did they ask clarifying questions? Did they express interest without committing?" },
    { type: "question", aiText: "I appreciate you sharing that. Before we go further, I'd like to understand your expectations better. What is your current compensation package, and what range were you targeting for this move? I want to make sure we find something that works for both sides.", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Phase: probe-expectations. Evaluate: Did they anchor high with market data? Did they avoid revealing exact current CTC? Did they frame it around value, not needs?" },
    { type: "question", aiText: "I hear you. That's a bit above our initial band for this level. Let me see what I can do — there's some flexibility on the base, and I could also look at a joining bonus or ESOPs to bridge the gap. What matters more to you — a higher fixed component or equity upside?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Phase: counter-offer. Evaluate: Did they negotiate beyond just base? Did they explore multiple levers? Did they maintain leverage without being adversarial?" },
    { type: "question", aiText: "Let me lay out the full picture then. Beyond the base and variable, there's a learning budget, flexible work options, and comprehensive benefits. I think the total package is quite competitive when you factor everything in. What would make this a clear yes for you?", thinkingDuration: 700, speakingDuration: 5500, waitForUser: true, scoreNote: "Phase: benefits-discussion. Evaluate: Did they think about total compensation? Did they prioritize clearly? Did they explore non-salary items?" },
    { type: "question", aiText: "I appreciate the thorough discussion. I should mention — this is genuinely at the top of our approved band for this level. I've got one other strong candidate at final stage. I'd love to close this today. What's your notice period, and when could you realistically join us?", thinkingDuration: 700, speakingDuration: 5000, waitForUser: true, scoreNote: "Phase: closing-pressure. Evaluate: Did they handle pressure well? Did they negotiate notice buyout? Did they set a clear timeline?" },
    { type: "closing", aiText: "I think we've found good ground here. Let me summarize what we've discussed — the enhanced package with the benefits we agreed on. I'll have HR send you the formal offer letter by tomorrow. Take a day or two to review it, and let us know. We'd really love to have you on the team.", thinkingDuration: 800, speakingDuration: 6000, waitForUser: true },
  ],
};

export const defaultScript = scriptsByType.behavioral;

/** Type-specific question banks for practice rounds — expanded pools for randomization */
type QuestionBank = { q: string; qResume: string; scoreNote: string };
const miniQuestionsByType: Record<string, QuestionBank[]> = {
  behavioral: [
    { q: "Tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?", qResume: "Based on your experience as {title}, tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?", scoreNote: "STAR structure, decision-making clarity, outcome" },
    { q: "What's the biggest challenge you've faced working with cross-functional teams, and how did you handle it?", qResume: "In your role as {title}, what's the biggest challenge you faced working with cross-functional teams, and how did you handle it?", scoreNote: "Collaboration, communication, conflict resolution" },
    { q: "If you joined a new team tomorrow as a {role} and found that velocity had dropped 40% over the last quarter, what would be your first three steps?", qResume: "Imagine you're stepping into a new {role} position and you find that team velocity has dropped 40% over the last quarter. Given your background, what would be your first three steps?", scoreNote: "Analytical thinking, prioritization, leadership approach" },
    { q: "Describe a time when you received critical feedback that was hard to hear. How did you respond, and what changed as a result?", qResume: "As {title}, describe a time when you received critical feedback that was hard to hear. How did you respond, and what changed?", scoreNote: "Self-awareness, resilience, growth mindset" },
    { q: "Tell me about a project that failed or didn't meet expectations. What happened, and what did you learn?", qResume: "From your time as {title}, tell me about a project that didn't meet expectations. What happened, and what did you learn?", scoreNote: "Accountability, learning from failure, honesty" },
    { q: "Give me an example of when you had to influence someone without having direct authority over them. How did you get buy-in?", qResume: "In your role as {title}, give me an example of when you had to influence someone without direct authority. How did you get buy-in?", scoreNote: "Influence, persuasion, stakeholder management" },
    { q: "Tell me about a time you had to deliver results under extreme time pressure. What trade-offs did you make?", qResume: "As {title}, tell me about a time you delivered results under extreme time pressure. What trade-offs did you make?", scoreNote: "Prioritization under pressure, decision-making speed, outcome focus" },
    { q: "Describe a situation where you had to onboard quickly into an unfamiliar domain. How did you get up to speed?", qResume: "When you started as {title}, how did you get up to speed quickly in an unfamiliar domain? Walk me through your approach.", scoreNote: "Learning agility, resourcefulness, adaptability" },
  ],
  "hr-round": [
    { q: "Tell me about yourself — your background, what drives you, and why you're interested in this role.", qResume: "Walk me through your journey from {title} to where you are now. What motivates you, and why are you looking at this role?", scoreNote: "Concise narrative, motivation, role alignment" },
    { q: "What are your greatest strengths and one area you're actively working to improve? Give me a specific example.", qResume: "From your experience as {title}, what would you say is your greatest strength? And what's one area you're actively working to improve?", scoreNote: "Self-awareness, honesty, growth mindset" },
    { q: "Why should we hire you over other candidates? What unique value do you bring?", qResume: "Given your background as {title}, why should we hire you over other candidates? What unique value do you bring to this {role} position?", scoreNote: "Confidence without arrogance, unique value proposition, role fit" },
    { q: "How do you handle stress and pressure at work? Give me a specific example.", qResume: "As {title}, how did you handle stress during high-pressure periods? Walk me through a specific example.", scoreNote: "Stress management, emotional regulation, practical strategies" },
    { q: "What kind of work culture do you thrive in? What values matter most to you in a workplace?", qResume: "Having worked as {title}, what kind of work culture helps you do your best work? What values matter most?", scoreNote: "Cultural fit awareness, values articulation, self-knowledge" },
    { q: "Where do you see yourself professionally in the next 3-5 years? How does this role help you get there?", qResume: "Where do you see your career heading in 3-5 years after {title}? How does this {role} position fit your trajectory?", scoreNote: "Career clarity, ambition, realistic planning" },
  ],
  "campus-placement": [
    { q: "Tell me about yourself — your academic background, key projects, and what you're looking for in your first role.", qResume: "I can see you've been involved in some interesting work. Tell me about your academic background, your role as {title}, and what you're looking for in your career.", scoreNote: "Concise intro, relevant highlights, career clarity" },
    { q: "Walk me through a project you're most proud of. What was your specific contribution, and what did you learn from the challenges?", qResume: "Walk me through your experience as {title}. What was your specific contribution, and what did you learn from the challenges you faced?", scoreNote: "Technical depth, ownership, learning mindset" },
    { q: "Where do you see yourself in 5 years? How does this role fit into your long-term goals?", qResume: "Where do you see yourself in 5 years? How does transitioning from {title} to a {role} fit into your long-term goals?", scoreNote: "Ambition, alignment with role, realistic goals" },
    { q: "What was the toughest technical problem you solved during your studies or internship? Walk me through your approach.", qResume: "As {title}, what was the toughest technical problem you tackled? Walk me through your debugging or problem-solving approach.", scoreNote: "Problem-solving methodology, technical thinking, persistence" },
    { q: "Tell me about a time you worked in a team where not everyone contributed equally. How did you handle it?", qResume: "During your time as {title}, tell me about working with a team where contributions were uneven. How did you handle it?", scoreNote: "Teamwork, conflict handling, leadership potential" },
    { q: "Why did you choose your field of study? How has it prepared you for this career?", qResume: "What led you to become {title}? How has that experience prepared you for a career as {role}?", scoreNote: "Self-awareness, motivation, career narrative" },
  ],
  strategic: [
    { q: "If you joined a company as {role} and the tech stack was aging but product-market fit was strong, how would you approach building a technical strategy?", qResume: "Based on your experience as {title}, if you joined a company where the tech stack was aging but PMF was strong, how would you build a technical strategy?", scoreNote: "Strategic vision, prioritization, stakeholder buy-in" },
    { q: "Tell me about a time you had to pivot a major initiative. How did you recognize the need and communicate the change?", qResume: "In your role as {title}, tell me about a time you had to pivot a major initiative. How did you recognize the need and communicate the change?", scoreNote: "Adaptability, communication, decisiveness" },
    { q: "How do you ensure your work stays aligned with broader business goals? Walk me through your approach.", qResume: "As {title}, how did you ensure your team's work stayed aligned with broader business goals?", scoreNote: "Cross-functional alignment, planning rigor" },
    { q: "You've been given a budget of ₹5 crore and 6 months to launch a new product line. How do you allocate resources and de-risk the initiative?", qResume: "Drawing on your experience as {title}, you have ₹5 crore and 6 months to launch a new product line. How do you plan and de-risk it?", scoreNote: "Resource allocation, risk management, strategic planning" },
    { q: "How do you decide what NOT to build? Walk me through your framework for saying no to stakeholder requests.", qResume: "As {title}, how did you decide what NOT to build? Walk me through a time you said no to a stakeholder.", scoreNote: "Prioritization discipline, stakeholder management, strategic focus" },
    { q: "Your competitor just raised a large funding round and is underpricing you. What's your 12-month strategic response?", qResume: "With your experience as {title}, a competitor just raised major funding and is underpricing you. What's your 12-month strategic response?", scoreNote: "Competitive strategy, market positioning, long-term thinking" },
  ],
  technical: [
    { q: "Describe a system you worked on that had to handle significant scale. What were the key architectural decisions and trade-offs?", qResume: "From your time as {title}, describe a system you designed or worked on at scale. What were the key architectural trade-offs?", scoreNote: "Scalability thinking, trade-off analysis" },
    { q: "Tell me about a major production issue you dealt with. How did you approach the investigation and what systemic changes followed?", qResume: "In your role as {title}, tell me about a major production issue you dealt with. How did you approach the investigation?", scoreNote: "Incident management, systemic thinking" },
    { q: "How do you evaluate and introduce new technologies? Walk me through a recent technology decision.", qResume: "As {title}, how did you evaluate and introduce new technologies into your stack? Walk me through a specific decision.", scoreNote: "Tech evaluation rigor, risk management" },
    { q: "If you had to migrate a monolithic application to microservices, how would you approach it? What would you NOT decompose?", qResume: "Given your experience as {title}, how would you approach migrating a monolith to microservices? What would you keep together?", scoreNote: "Architecture migration, boundary identification, pragmatism" },
    { q: "How do you approach technical debt? When is it worth paying down vs living with?", qResume: "As {title}, how did you manage technical debt? Give me a specific example of when you chose to pay it down vs defer.", scoreNote: "Technical judgment, business impact awareness, pragmatism" },
    { q: "Design a notification system that handles 10 million users. Walk me through the key components and failure modes.", qResume: "Drawing on your experience as {title}, design a notification system for 10M users. Walk me through components and failure handling.", scoreNote: "System design, failure mode thinking, scalability" },
  ],
  "case-study": [
    { q: "Your core product has strong uptime but customers are churning citing quality issues. Latency is high. How would you investigate and address this?", qResume: "Drawing on your experience as {title} — your core product has strong uptime but customers are churning citing quality issues. How would you investigate?", scoreNote: "Problem decomposition, data-driven approach" },
    { q: "A competitor launched a feature in 2 months. Your team estimates 6 months due to tech debt. Leadership wants it in 3. How do you handle this?", qResume: "As a {role} with your background as {title} — a competitor shipped in 2 months, your team says 6, leadership wants 3. How do you handle this?", scoreNote: "Negotiation, creative solutions, scope management" },
    { q: "Your team of 40 has 25% attrition. Exit interviews cite lack of growth and unclear direction. You have 90 days to turn it around. What do you do?", qResume: "Given your experience as {title} — your team has 25% attrition citing lack of growth. You have 90 days. What do you do?", scoreNote: "People leadership, organizational design, quick wins" },
    { q: "Your app's daily active users dropped 15% in the last month but signups are steady. What's your investigation plan?", qResume: "As {title}, your app's DAU dropped 15% but signups are steady. Walk me through your investigation and fix plan.", scoreNote: "Analytical thinking, metrics understanding, hypothesis formation" },
    { q: "Two of your top engineers want to rewrite a critical system from scratch. The rest of the team thinks it's risky. How do you decide?", qResume: "With your background as {title}, two senior engineers want a full rewrite of a critical system. Others disagree. How do you decide?", scoreNote: "Technical judgment, team dynamics, risk assessment" },
    { q: "You're launching in a new market where your main competitor has 70% share. Your budget is limited. What's your go-to-market strategy?", qResume: "Given your experience as {title}, you're entering a market where a competitor has 70% share with limited budget. What's your strategy?", scoreNote: "Market analysis, resource constraint thinking, creative strategy" },
  ],
  management: [
    { q: "How do you approach building and scaling a team? Walk me through how you'd staff up a new initiative from scratch.", qResume: "From your experience as {title}, how do you approach building and scaling a team? Walk me through your process.", scoreNote: "Hiring strategy, team composition, scaling approach" },
    { q: "Tell me about a time you had to give difficult feedback to a team member. How did you approach it and what was the outcome?", qResume: "As {title}, tell me about a time you had to give difficult feedback to a team member. How did you approach it?", scoreNote: "Coaching ability, empathy, directness" },
    { q: "How do you balance technical excellence with delivery speed? Give me an example of a trade-off you made.", qResume: "In your role as {title}, how did you balance technical excellence with delivery speed? Share a specific trade-off.", scoreNote: "Prioritization, pragmatism, team alignment" },
    { q: "One of your best performers wants to leave for a competitor. How do you handle the conversation?", qResume: "As {title}, one of your best performers wants to leave. How do you handle that retention conversation?", scoreNote: "Retention strategy, empathy, honest conversation" },
    { q: "Your team consistently misses sprint commitments. Morale is still high but stakeholders are frustrated. What do you do?", qResume: "In your role as {title}, your team keeps missing sprint goals but morale is fine — stakeholders are frustrated. What do you do?", scoreNote: "Process improvement, stakeholder management, root cause analysis" },
    { q: "How do you ensure remote or distributed team members feel equally included and productive?", qResume: "As {title}, how did you keep remote or distributed team members equally included and productive?", scoreNote: "Remote management, inclusion, communication systems" },
  ],
  panel: [
    { q: "Tell us about yourself and what draws you to this {role} position.", qResume: "Walk us through your journey from {title} to applying for this {role} position. What draws you to this opportunity?", scoreNote: "Concise intro, multi-audience awareness, role motivation" },
    { q: "Describe a project where you had to coordinate across multiple teams or stakeholders with competing priorities.", qResume: "From your time as {title}, describe a project where you coordinated across multiple teams with competing priorities.", scoreNote: "Cross-functional collaboration, stakeholder management" },
    { q: "What's your approach when you disagree with a decision made by leadership? Walk me through a specific example.", qResume: "As {title}, what's your approach when you disagree with a decision made by leadership? Give a specific example.", scoreNote: "Professional disagreement, influence without authority, outcome focus" },
    { q: "How would you describe your working style to someone who's never worked with you? What should we expect?", qResume: "Having been {title}, how would you describe your working style? What would your previous team say about working with you?", scoreNote: "Self-awareness, team fit, communication" },
    { q: "Tell us about a technical challenge that required you to step outside your comfort zone. How did you approach it?", qResume: "As {title}, tell us about a time you had to step outside your comfort zone technically. How did you handle it?", scoreNote: "Learning agility, intellectual curiosity, problem-solving" },
    { q: "If you had to pick one metric to measure your success in this {role} role, what would it be and why?", qResume: "Based on your experience as {title}, if you had to pick one metric to measure your success as {role}, what would it be?", scoreNote: "Impact thinking, metric-driven mindset, role understanding" },
  ],
  "salary-negotiation": [
    // Ordered as a conversation arc: offer → probe → counter → benefits → closing. Engine picks in order.
    { q: "We've put together a competitive offer for the {role} position. It includes a base salary, performance bonus, and standard benefits including health insurance. I'll walk you through the specifics — but first, how are you feeling about the opportunity overall?", qResume: "We've put together a competitive offer for the {role} position — factoring in your background as {title}. It includes base, variable pay, and comprehensive benefits. How are you feeling about the opportunity?", scoreNote: "Phase: offer-reaction. Evaluate: not accepting immediately, asking clarifying questions, expressing measured interest" },
    { q: "That's helpful. Can you share what range you were targeting for this move? And is that based on your current package, market research, or another offer?", qResume: "That's helpful. Given your background as {title}, what range were you targeting for this {role} position? Is that based on your current package, market data, or another offer?", scoreNote: "Phase: probe-expectations. Evaluate: anchoring high with reasoning, avoiding revealing exact current CTC, using data not emotion" },
    { q: "I hear you. That's above our initial band, but let me see what I can do. There's some flexibility on the base, and I could also look at a joining bonus or equity. What matters most to you in the overall package?", qResume: "I hear you. That's above our initial band for someone at your level. Let me see what flexibility I have — we can look at the base, a joining bonus, or equity. As you transition from {title} to {role}, what matters most to you?", scoreNote: "Phase: counter-offer. Evaluate: exploring beyond base salary, total comp thinking, professional framing, not accepting first counter" },
    { q: "Let me lay out the complete picture. Beyond the base and variable, there's health coverage for your family, a learning budget, and flexible work options. The total package is quite strong. What else would make this a clear yes?", qResume: "Let me lay out the full picture. Beyond base and variable, there's family health insurance, a learning budget, and flexible work. How does the total package compare to what you were expecting as {title}? What else would make this a yes?", scoreNote: "Phase: benefits-discussion. Evaluate: did they negotiate non-salary items, ask about growth, explore equity/ESOPs, think about total comp" },
    { q: "I appreciate the thorough discussion. Let me be transparent — this is at the top of our band for this level. I've got one other strong candidate, and I'd love to close this today. What's your notice period, and when could you realistically join?", qResume: "I appreciate the conversation. This package is genuinely at the top of our band for this {role} level. I'd love to close today — what's your notice period from your current role as {title}, and when could you realistically start?", scoreNote: "Phase: closing-pressure. Evaluate: handling deadline pressure, not caving under urgency, negotiating notice buyout, setting timeline" },
    { q: "Alright, I think we're very close. Let me summarize what we've discussed, and I'll have HR send the formal offer letter. Take a day or two to review it. We'd really love to have you on the team.", qResume: "Great, I think we have a deal. Let me summarize what we've agreed on, and I'll have HR send the offer letter by tomorrow. Take a day to review it, {title} to {role} is a strong move — we're excited to have you.", scoreNote: "Phase: closing. Evaluate: confirming understanding, asking about anything missed, professional close" },
  ],
  "government-psu": [
    { q: "Why do you want to work in the public sector? What motivates you about government service?", qResume: "With your background as {title}, why are you interested in public sector work? What motivates you about government service?", scoreNote: "Public service motivation, alignment with government values" },
    { q: "How would you handle a situation where a colleague is not following proper procedures? Walk me through your approach.", qResume: "Drawing from your experience as {title}, how would you handle a situation where a colleague is not following proper procedures?", scoreNote: "Ethics, procedural awareness, diplomacy" },
    { q: "Describe how you would handle a situation where you need to implement a new policy that is unpopular with staff.", qResume: "As someone who's been {title}, how would you handle implementing a new policy that's unpopular with the team?", scoreNote: "Change management, leadership, communication under pressure" },
    { q: "What are the biggest challenges facing public administration in India today, and how would you address them in your role?", qResume: "Given your experience as {title}, what do you see as the biggest challenges in Indian public administration? How would you tackle them?", scoreNote: "Current affairs, analytical thinking, practical governance" },
    { q: "A senior official asks you to approve a file that you believe has procedural irregularities. What do you do?", qResume: "As someone with {title} experience, a senior official asks you to approve a file with procedural issues. How do you handle it?", scoreNote: "Integrity, ethical courage, procedural knowledge" },
    { q: "How would you improve citizen service delivery in a district with poor infrastructure and limited digital access?", qResume: "Drawing from your background as {title}, how would you improve citizen service delivery in a resource-constrained district?", scoreNote: "Ground-level thinking, innovation within constraints, empathy" },
  ],
};

/** Generate a 3-question quick onboarding interview script */
export function getMiniScript(user: User | null, company?: string, interviewType?: string): InterviewStep[] {
  const name = user?.name?.split(" ")[0] || "";
  const role = user?.targetRole || "the role";
  const targetCompany = company || user?.targetCompany || "";
  const hasResume = !!user?.resumeFileName;
  const latestRole = user?.resumeData?.experience?.[0];
  const title = latestRole?.title || "";

  const companyContext = targetCompany ? ` at ${targetCompany}` : "";
  const resumeContext = hasResume && latestRole
    ? ` I've reviewed your resume — I can see you were ${latestRole.title}${latestRole.company ? ` at ${latestRole.company}` : ""}. I'll reference your background in my questions.`
    : "";

  const typeKey = interviewType && miniQuestionsByType[interviewType] ? interviewType : "behavioral";
  const typeLabel = typeKey.replace(/-/g, " ");
  // For salary-negotiation: maintain sequential order (conversation arc), use 5 questions for richer negotiation.
  const pool = miniQuestionsByType[typeKey];
  const isSalaryNeg = typeKey === "salary-negotiation";
  const questionCount = isSalaryNeg ? Math.min(5, pool.length) : 3;
  const questions = isSalaryNeg ? pool.slice(0, questionCount) : shuffleAndPick(pool, 3);

  const makeQ = (bank: { q: string; qResume: string; scoreNote: string }) => {
    const raw = hasResume && title ? bank.qResume : bank.q;
    return raw.replace(/\{title\}/g, title).replace(/\{role\}/g, role);
  };

  const isPanel = typeKey === "panel";
  // Panel persona rotation: HM intro, TL q1, HM q2, HR q3, HM closing
  const panelPersonas = ["Hiring Manager", "Technical Lead", "Hiring Manager", "HR Partner", "Hiring Manager"];

  const introText = isSalaryNeg
    ? `Hi${name ? ` ${name}` : ""}! Good to see you again. We've completed all the interview rounds for the ${role} position${companyContext}, and the team was very impressed. I'm here to walk you through the offer we've put together. Let me get into the details.`
    : isPanel
    ? `Hi${name ? ` ${name}` : ""}! Welcome to your panel interview at HireStepX. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. This is a quick 3-question practice round for the ${role} position${companyContext}.${resumeContext} We'll each ask you questions from our perspective. Ready? Let's go.`
    : `Hi${name ? ` ${name}` : ""}! Welcome to HireStepX. This is a quick 3-question ${typeLabel} practice round for the ${role} position${companyContext}.${resumeContext} I'll ask you real interview questions and give you a score at the end. Ready? Let's go.`;

  // Build question steps dynamically (salary-neg gets 5, others get 3)
  const questionSteps: InterviewStep[] = questions.map((bank, i) => ({
    type: "question" as const,
    aiText: makeQ(bank),
    thinkingDuration: i === 0 ? 1200 : 1200,
    speakingDuration: 4000,
    waitForUser: true,
    scoreNote: bank.scoreNote,
    ...(isPanel ? { persona: panelPersonas[Math.min(i + 1, panelPersonas.length - 1)] } : {}),
  }));

  return [
    { type: "intro" as const, aiText: introText,
      thinkingDuration: 800, speakingDuration: 5000, waitForUser: true, ...(isPanel ? { persona: panelPersonas[0] } : {}) },
    ...questionSteps,
    { type: "closing" as const, aiText: isSalaryNeg
      ? `I think we've covered the key points. Let me summarize what we've discussed and I'll have HR send the formal offer letter. Take a couple of days to think it over${name ? `, ${name}` : ""} — we'd love to have you on board.`
      : isPanel
      ? "Thank you for speaking with all of us today. We've covered some great ground. Any final thoughts before we calculate your score?"
      : "Great answers! That wraps up your quick practice round. Any final thoughts before I calculate your score?",
      thinkingDuration: 1000, speakingDuration: 4000, waitForUser: true, ...(isPanel ? { persona: panelPersonas[4] } : {}) },
  ];
}

/** Generate a full interview script with difficulty scaling and personalization */
export function getScript(type: string | null, difficulty: string | null, user: User | null): InterviewStep[] {
  const typeKey = type || "behavioral";
  const base = (typeKey && scriptsByType[typeKey]) ? scriptsByType[typeKey] : defaultScript;

  const speedMultiplier = difficulty === "warmup" ? 1.4 : difficulty === "intense" ? 0.6 : 1;
  const thinkMultiplier = difficulty === "warmup" ? 1.5 : difficulty === "intense" ? 0.5 : 1;

  const role = user?.targetRole || "the role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const name = user?.name?.split(" ")[0] || "";
  const feedbackStyle = user?.learningStyle || "direct";
  const hasResume = !!user?.resumeFileName;
  const latestRole = user?.resumeData?.experience?.[0];
  const title = latestRole?.title || "";

  const companyContext = company ? ` at ${company}` : "";
  const industryContext = industry ? ` in the ${industry} space` : "";
  const resumeContext = hasResume ? " I've reviewed your resume, so these questions will draw from your actual experience." : "";

  const isPanel = typeKey === "panel";

  const personalizedIntro: InterviewStep = {
    type: "intro",
    aiText: isPanel
      ? `Hi${name ? ` ${name}` : ""}! Welcome to your panel interview. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. We'll be focusing on ${role} position${companyContext}${industryContext}.${resumeContext} ${difficulty === "warmup" ? "This will be conversational — no pressure." : difficulty === "intense" ? "We'll be pushing you hard today." : "We have 5 questions for you today."} We'll each ask you questions from our perspective. Ready to begin?`
      : `Hi${name ? ` ${name}` : ""}! Welcome to your mock interview. I'm your AI interviewer today. We'll be focusing on ${(typeKey).replace(/-/g, " ")} questions for the ${role} position${companyContext}${industryContext}.${resumeContext} ${difficulty === "warmup" ? "This will be conversational — no pressure, just practice." : difficulty === "intense" ? "I'll be pushing you hard today — expect rapid follow-ups and high expectations." : "I have 5 questions lined up for you. Feel free to take your time."} Ready to begin?`,
    thinkingDuration: 1000,
    speakingDuration: 6000,
    waitForUser: true,
    ...(isPanel && base[0]?.persona ? { persona: base[0].persona } : {}),
  };

  const closingPrefix = feedbackStyle === "encouraging"
    ? "Really great work today! You showed some strong skills. "
    : "Let me give you direct feedback. ";

  const personalizedClosing: InterviewStep = {
    type: "closing",
    aiText: isPanel
      ? `${closingPrefix}Thank you for speaking with all of us today. We've covered technical depth, leadership, and cultural fit.${company ? ` For ${company} specifically, I'd recommend emphasizing your ${industry || "industry"} domain expertise more.` : ""} For panel interviews, remember to address each panelist's perspective directly. Any final thoughts before we wrap up?`
      : `${closingPrefix}${base[base.length - 1].aiText.replace(/^.*?\./, "")}${company ? ` For ${company} specifically, I'd recommend emphasizing your ${industry || "industry"} domain expertise more.` : ""} Any final thoughts before we wrap up?`,
    thinkingDuration: 2000,
    speakingDuration: 7000,
    waitForUser: true,
    ...(isPanel && base[base.length - 1]?.persona ? { persona: base[base.length - 1].persona } : {}),
  };

  // Use the expanded mini question pools to randomize full interview questions too
  // Pick 5 random questions (or 3 for mini-style types) from the pool, then personalize
  const pool = miniQuestionsByType[typeKey] || miniQuestionsByType["behavioral"];
  let questionSteps: InterviewStep[];
  if (pool && pool.length > 0) {
    const questionCount = Math.min(5, pool.length);
    // Salary-negotiation: maintain sequential order (conversation arc). Others: randomize.
    const selected = typeKey === "salary-negotiation"
      ? pool.slice(0, questionCount)
      : shuffleAndPick(pool, questionCount);
    const panelPersonas = ["Technical Lead", "Hiring Manager", "HR Partner", "Technical Lead", "Hiring Manager"];
    questionSteps = selected.map((bank, i) => {
      const raw = hasResume && title ? bank.qResume : bank.q;
      const aiText = raw.replace(/\{title\}/g, title).replace(/\{role\}/g, role);
      return {
        type: "question" as const,
        aiText,
        thinkingDuration: 700,
        speakingDuration: 5000,
        waitForUser: true,
        scoreNote: bank.scoreNote,
        ...(isPanel ? { persona: panelPersonas[i % panelPersonas.length] } : {}),
      };
    });
  } else {
    // Fall back to the hardcoded base questions (shouldn't happen with expanded pools)
    questionSteps = base.slice(1, -1);
  }

  const steps = [
    personalizedIntro,
    ...questionSteps,
    personalizedClosing,
  ];

  return steps.map(step => ({
    ...step,
    thinkingDuration: Math.round(step.thinkingDuration * thinkMultiplier),
    speakingDuration: Math.round(step.speakingDuration * speedMultiplier),
  }));
}

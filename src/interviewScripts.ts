/* ─── Interview Script Definitions & Generators ─── */

import type { User } from "./AuthContext";

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
    { type: "intro", aiText: "Welcome to your salary negotiation practice session. I'll play the role of a hiring manager extending you an offer. We'll practice negotiating compensation, benefits, and terms. This is a safe space to build your confidence. Ready to negotiate?", thinkingDuration: 500, speakingDuration: 5500, waitForUser: true },
    { type: "question", aiText: "We'd like to offer you the position. The base salary is $95,000 with standard benefits. How does that sound to you?", thinkingDuration: 600, speakingDuration: 3500, waitForUser: true, scoreNote: "Focus on: not accepting immediately, asking for time, showing enthusiasm without committing" },
    { type: "question", aiText: "I understand you'd like to discuss the compensation. What salary range were you thinking of, and what's your reasoning?", thinkingDuration: 700, speakingDuration: 4000, waitForUser: true, scoreNote: "Focus on: anchoring high, citing market data, framing value not needs" },
    { type: "question", aiText: "That's above our initial budget. We could potentially go to $105,000 but that's really stretching it. Would you accept at that number?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: negotiating beyond salary (equity, bonus, PTO, flexibility), not accepting first counter" },
    { type: "question", aiText: "Let's talk about the full package then. What other elements of compensation are important to you, and what would make this a clear yes?", thinkingDuration: 700, speakingDuration: 4500, waitForUser: true, scoreNote: "Focus on: total comp thinking, prioritization, professional framing" },
    { type: "closing", aiText: "Great negotiation practice! Key takeaways: always express enthusiasm first, anchor with data not demands, negotiate the full package not just base salary, and never accept the first offer on the spot. You showed good instincts. Any final questions about negotiation strategy?", thinkingDuration: 800, speakingDuration: 7000, waitForUser: true },
  ],
};

export const defaultScript = scriptsByType.behavioral;

/** Type-specific mini question banks for 3-question practice rounds */
const miniQuestionsByType: Record<string, { q: string; qResume: string; scoreNote: string }[]> = {
  behavioral: [
    { q: "Tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?", qResume: "Based on your experience as {title}, tell me about a time you had to make a tough decision with incomplete information. What was the situation, and how did you approach it?", scoreNote: "STAR structure, decision-making clarity, outcome" },
    { q: "What's the biggest challenge you've faced working with cross-functional teams, and how did you handle it?", qResume: "In your role as {title}, what's the biggest challenge you faced working with cross-functional teams, and how did you handle it?", scoreNote: "Collaboration, communication, conflict resolution" },
    { q: "If you joined a new team tomorrow as a {role} and found that velocity had dropped 40% over the last quarter, what would be your first three steps?", qResume: "Imagine you're stepping into a new {role} position and you find that team velocity has dropped 40% over the last quarter. Given your background, what would be your first three steps?", scoreNote: "Analytical thinking, prioritization, leadership approach" },
  ],
  "hr-round": [
    { q: "Tell me about yourself — your background, what drives you, and why you're interested in this role.", qResume: "Walk me through your journey from {title} to where you are now. What motivates you, and why are you looking at this role?", scoreNote: "Concise narrative, motivation, role alignment" },
    { q: "What are your greatest strengths and one area you're actively working to improve? Give me a specific example.", qResume: "From your experience as {title}, what would you say is your greatest strength? And what's one area you're actively working to improve?", scoreNote: "Self-awareness, honesty, growth mindset" },
    { q: "Why should we hire you over other candidates? What unique value do you bring?", qResume: "Given your background as {title}, why should we hire you over other candidates? What unique value do you bring to this {role} position?", scoreNote: "Confidence without arrogance, unique value proposition, role fit" },
  ],
  "campus-placement": [
    { q: "Tell me about yourself — your academic background, key projects, and what you're looking for in your first role.", qResume: "I can see you've been involved in some interesting work. Tell me about your academic background, your role as {title}, and what you're looking for in your career.", scoreNote: "Concise intro, relevant highlights, career clarity" },
    { q: "Walk me through a project you're most proud of. What was your specific contribution, and what did you learn from the challenges?", qResume: "Walk me through your experience as {title}. What was your specific contribution, and what did you learn from the challenges you faced?", scoreNote: "Technical depth, ownership, learning mindset" },
    { q: "Where do you see yourself in 5 years? How does this role fit into your long-term goals?", qResume: "Where do you see yourself in 5 years? How does transitioning from {title} to a {role} fit into your long-term goals?", scoreNote: "Ambition, alignment with role, realistic goals" },
  ],
  strategic: [
    { q: "If you joined a company as {role} and the tech stack was aging but product-market fit was strong, how would you approach building a technical strategy?", qResume: "Based on your experience as {title}, if you joined a company where the tech stack was aging but PMF was strong, how would you build a technical strategy?", scoreNote: "Strategic vision, prioritization, stakeholder buy-in" },
    { q: "Tell me about a time you had to pivot a major initiative. How did you recognize the need and communicate the change?", qResume: "In your role as {title}, tell me about a time you had to pivot a major initiative. How did you recognize the need and communicate the change?", scoreNote: "Adaptability, communication, decisiveness" },
    { q: "How do you ensure your work stays aligned with broader business goals? Walk me through your approach.", qResume: "As {title}, how did you ensure your team's work stayed aligned with broader business goals?", scoreNote: "Cross-functional alignment, planning rigor" },
  ],
  technical: [
    { q: "Describe a system you worked on that had to handle significant scale. What were the key architectural decisions and trade-offs?", qResume: "From your time as {title}, describe a system you designed or worked on at scale. What were the key architectural trade-offs?", scoreNote: "Scalability thinking, trade-off analysis" },
    { q: "Tell me about a major production issue you dealt with. How did you approach the investigation and what systemic changes followed?", qResume: "In your role as {title}, tell me about a major production issue you dealt with. How did you approach the investigation?", scoreNote: "Incident management, systemic thinking" },
    { q: "How do you evaluate and introduce new technologies? Walk me through a recent technology decision.", qResume: "As {title}, how did you evaluate and introduce new technologies into your stack? Walk me through a specific decision.", scoreNote: "Tech evaluation rigor, risk management" },
  ],
  "case-study": [
    { q: "Your core product has strong uptime but customers are churning citing quality issues. Latency is high. How would you investigate and address this?", qResume: "Drawing on your experience as {title} — your core product has strong uptime but customers are churning citing quality issues. How would you investigate?", scoreNote: "Problem decomposition, data-driven approach" },
    { q: "A competitor launched a feature in 2 months. Your team estimates 6 months due to tech debt. Leadership wants it in 3. How do you handle this?", qResume: "As a {role} with your background as {title} — a competitor shipped in 2 months, your team says 6, leadership wants 3. How do you handle this?", scoreNote: "Negotiation, creative solutions, scope management" },
    { q: "Your team of 40 has 25% attrition. Exit interviews cite lack of growth and unclear direction. You have 90 days to turn it around. What do you do?", qResume: "Given your experience as {title} — your team has 25% attrition citing lack of growth. You have 90 days. What do you do?", scoreNote: "People leadership, organizational design, quick wins" },
  ],
  management: [
    { q: "How do you approach building and scaling a team? Walk me through how you'd staff up a new initiative from scratch.", qResume: "From your experience as {title}, how do you approach building and scaling a team? Walk me through your process.", scoreNote: "Hiring strategy, team composition, scaling approach" },
    { q: "Tell me about a time you had to give difficult feedback to a team member. How did you approach it and what was the outcome?", qResume: "As {title}, tell me about a time you had to give difficult feedback to a team member. How did you approach it?", scoreNote: "Coaching ability, empathy, directness" },
    { q: "How do you balance technical excellence with delivery speed? Give me an example of a trade-off you made.", qResume: "In your role as {title}, how did you balance technical excellence with delivery speed? Share a specific trade-off.", scoreNote: "Prioritization, pragmatism, team alignment" },
  ],
  panel: [
    { q: "Tell us about yourself and what draws you to this {role} position.", qResume: "Walk us through your journey from {title} to applying for this {role} position. What draws you to this opportunity?", scoreNote: "Concise intro, multi-audience awareness, role motivation" },
    { q: "Describe a project where you had to coordinate across multiple teams or stakeholders with competing priorities.", qResume: "From your time as {title}, describe a project where you coordinated across multiple teams with competing priorities.", scoreNote: "Cross-functional collaboration, stakeholder management" },
    { q: "What's your approach when you disagree with a decision made by leadership? Walk me through a specific example.", qResume: "As {title}, what's your approach when you disagree with a decision made by leadership? Give a specific example.", scoreNote: "Professional disagreement, influence without authority, outcome focus" },
  ],
  "salary-negotiation": [
    { q: "We'd like to discuss compensation. What salary range are you expecting for this {role} position, and what's your reasoning?", qResume: "Given your experience as {title}, what salary range are you expecting for this {role} position? Walk me through your reasoning.", scoreNote: "Anchoring strategy, market data usage, value framing" },
    { q: "That's above our initial budget. We could stretch to meet partway. Would you accept a lower number with a performance review in 6 months?", qResume: "That's above our initial budget for someone transitioning from {title}. We could meet partway with a 6-month review. Would you accept?", scoreNote: "Counter-offer handling, not accepting first counter, creative alternatives" },
    { q: "Let's talk about the full package. What other elements beyond base salary are important to you?", qResume: "Beyond base salary, what elements of the total compensation package matter most to you as you move from {title} to {role}?", scoreNote: "Total comp thinking, prioritization, professional framing" },
  ],
  "government-psu": [
    { q: "Why do you want to work in the public sector? What motivates you about government service?", qResume: "With your background as {title}, why are you interested in public sector work? What motivates you about government service?", scoreNote: "Public service motivation, alignment with government values" },
    { q: "How would you handle a situation where a colleague is not following proper procedures? Walk me through your approach.", qResume: "Drawing from your experience as {title}, how would you handle a situation where a colleague is not following proper procedures?", scoreNote: "Ethics, procedural awareness, diplomacy" },
    { q: "Describe how you would handle a situation where you need to implement a new policy that is unpopular with staff.", qResume: "As someone who's been {title}, how would you handle implementing a new policy that's unpopular with the team?", scoreNote: "Change management, leadership, communication under pressure" },
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
  const questions = miniQuestionsByType[typeKey];

  const makeQ = (bank: { q: string; qResume: string; scoreNote: string }) => {
    const raw = hasResume && title ? bank.qResume : bank.q;
    return raw.replace(/\{title\}/g, title).replace(/\{role\}/g, role);
  };

  const isPanel = typeKey === "panel";
  // Panel persona rotation: HM intro, TL q1, HM q2, HR q3, HM closing
  const panelPersonas = ["Hiring Manager", "Technical Lead", "Hiring Manager", "HR Partner", "Hiring Manager"];

  return [
    { type: "intro" as const, aiText: isPanel
      ? `Hi${name ? ` ${name}` : ""}! Welcome to your panel interview at HireStepX. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. This is a quick 3-question practice round for the ${role} position${companyContext}.${resumeContext} We'll each ask you questions from our perspective. Ready? Let's go.`
      : `Hi${name ? ` ${name}` : ""}! Welcome to HireStepX. This is a quick 3-question ${typeLabel} practice round for the ${role} position${companyContext}.${resumeContext} I'll ask you real interview questions and give you a score at the end. Ready? Let's go.`,
      thinkingDuration: 800, speakingDuration: 5000, waitForUser: true, ...(isPanel ? { persona: panelPersonas[0] } : {}) },
    { type: "question" as const, aiText: makeQ(questions[0]), thinkingDuration: 1200, speakingDuration: 4000, waitForUser: true, scoreNote: questions[0].scoreNote, ...(isPanel ? { persona: panelPersonas[1] } : {}) },
    { type: "question" as const, aiText: makeQ(questions[1]), thinkingDuration: 1200, speakingDuration: 3500, waitForUser: true, scoreNote: questions[1].scoreNote, ...(isPanel ? { persona: panelPersonas[2] } : {}) },
    { type: "question" as const, aiText: makeQ(questions[2]), thinkingDuration: 1200, speakingDuration: 4000, waitForUser: true, scoreNote: questions[2].scoreNote, ...(isPanel ? { persona: panelPersonas[3] } : {}) },
    { type: "closing" as const, aiText: isPanel
      ? "Thank you for speaking with all of us today. We've covered some great ground. Any final thoughts before we calculate your score?"
      : "Great answers! That wraps up your quick practice round. Any final thoughts before I calculate your score?",
      thinkingDuration: 1000, speakingDuration: 4000, waitForUser: true, ...(isPanel ? { persona: panelPersonas[4] } : {}) },
  ];
}

/** Generate a full interview script with difficulty scaling and personalization */
export function getScript(type: string | null, difficulty: string | null, user: User | null): InterviewStep[] {
  const base = (type && scriptsByType[type]) ? scriptsByType[type] : defaultScript;

  const speedMultiplier = difficulty === "warmup" ? 1.4 : difficulty === "intense" ? 0.6 : 1;
  const thinkMultiplier = difficulty === "warmup" ? 1.5 : difficulty === "intense" ? 0.5 : 1;

  const role = user?.targetRole || "the role";
  const company = user?.targetCompany;
  const industry = user?.industry;
  const name = user?.name?.split(" ")[0] || "";
  const feedbackStyle = user?.learningStyle || "direct";
  const hasResume = !!user?.resumeFileName;

  const companyContext = company ? ` at ${company}` : "";
  const industryContext = industry ? ` in the ${industry} space` : "";
  const resumeContext = hasResume ? " I've reviewed your resume, so these questions will draw from your actual experience." : "";

  const isPanel = type === "panel";

  const personalizedIntro: InterviewStep = {
    type: "intro",
    aiText: isPanel
      ? `Hi${name ? ` ${name}` : ""}! Welcome to your panel interview. I'm the hiring manager, and I'll be joined by our technical lead and HR partner. We'll be focusing on ${role} position${companyContext}${industryContext}.${resumeContext} ${difficulty === "warmup" ? "This will be conversational — no pressure." : difficulty === "intense" ? "We'll be pushing you hard today." : "This will take about 15 minutes."} We'll each ask you questions from our perspective. Ready to begin?`
      : `Hi${name ? ` ${name}` : ""}! Welcome to your mock interview. I'm your AI interviewer today. We'll be focusing on ${(type || "behavioral").replace(/-/g, " ")} questions for the ${role} position${companyContext}${industryContext}.${resumeContext} ${difficulty === "warmup" ? "This will be conversational — no pressure, just practice." : difficulty === "intense" ? "I'll be pushing you hard today — expect rapid follow-ups and high expectations." : "This will take about 15 minutes. Feel free to take your time."} Ready to begin?`,
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

  const steps = [
    personalizedIntro,
    ...base.slice(1, -1),
    personalizedClosing,
  ];

  return steps.map(step => ({
    ...step,
    thinkingDuration: Math.round(step.thinkingDuration * thinkMultiplier),
    speakingDuration: Math.round(step.speakingDuration * speedMultiplier),
  }));
}

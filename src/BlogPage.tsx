import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { c, font } from "./tokens";
import { useSEO, articleJsonLd, faqJsonLd } from "./useSEO";

/* ─── Blog post data (SEO-optimized interview prep articles) ─── */
interface FAQ { question: string; answer: string }

interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  company: string;
  category: string;
  readTime: string;
  heroImage: string;
  heroAlt: string;
  datePublished: string;
  intro: string;
  sections: { heading: string; content: string }[];
  faqs: FAQ[];
  relatedSlugs: string[];
  cta: string;
}

const posts: BlogPost[] = [
  {
    slug: "top-10-google-interview-questions",
    title: "Top 10 Google Interview Questions (2025) — With Sample Answers",
    metaDescription: "Prepare for Google interviews with the top 10 most-asked behavioral and technical questions. Includes sample answers and scoring tips from AI analysis.",
    company: "Google",
    category: "Behavioral",
    readTime: "8 min",
    heroImage: "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=1200&h=500&fit=crop",
    heroAlt: "Google office building representing Google interview preparation",
    datePublished: "2025-04-01",
    intro: "Google receives over 3 million applications per year, with an acceptance rate under 1%. The interview process is notoriously rigorous — but predictable. Here are the most-asked questions and how to answer them like a top 1% candidate.",
    sections: [
      { heading: "1. Tell me about a time you led a project with ambiguous requirements", content: "Google loves ambiguity. They want to see structured thinking under uncertainty. Use the STAR method but emphasize the 'situation' — describe the specific ambiguity (unclear stakeholders? shifting goals? no precedent?) and how you created clarity.\n\nSample opener: \"In Q3 last year, I was asked to lead our team's migration to a new data pipeline, but the target architecture hadn't been finalized and three teams had competing requirements...\"" },
      { heading: "2. Describe a time you had to influence without authority", content: "This is the #1 most-asked behavioral question at Google. They operate with a flat hierarchy where ICs regularly need to align cross-functional teams.\n\nKey: Focus on how you built consensus, not how you were right. Mention specific techniques — data-driven proposals, 1:1 conversations, pilot programs." },
      { heading: "3. Tell me about your biggest failure and what you learned", content: "Google explicitly trains interviewers to assess 'intellectual humility.' A candidate who can't name a real failure is a red flag.\n\nFramework: Pick a genuine failure (not a humble-brag). Describe the decision, the outcome, and — critically — the specific behavioral change you made afterward. They want to hear that your failures actually changed you." },
      { heading: "4. How would you improve Google Search?", content: "Product sense questions test whether you can think at Google's scale. Don't jump to solutions — start with users.\n\nStructure: (1) Clarify the user segment, (2) Identify the top pain point with data reasoning, (3) Propose a solution, (4) Define success metrics, (5) Acknowledge tradeoffs." },
      { heading: "5. Describe a time you used data to make a decision", content: "Google is a data-driven company. They want to see that you don't just collect data — you interpret it critically and act on it.\n\nTip: Include a moment where the data was ambiguous or contradictory, and explain how you resolved it. This separates good answers from great ones." },
      { heading: "6. How do you prioritize when everything is urgent?", content: "This tests your framework thinking. Google interviewers want to see a systematic approach, not just 'I work hard.'\n\nBest approach: Name your framework (ICE scoring, RICE, effort/impact matrix), then give a specific example where you used it and the outcome." },
      { heading: "7. Tell me about a time you disagreed with your manager", content: "Google values respectful dissent. The wrong answer is 'I always agree with my manager' — that's a red flag for Googleyness.\n\nStructure: Describe the disagreement, how you raised it constructively, the resolution, and what you learned about effective disagreement." },
      { heading: "8. Design a system to serve 1 billion users", content: "System design questions at Google assess scalability thinking. Start with requirements, estimate the scale, then work through the architecture layer by layer.\n\nTip: Always discuss tradeoffs explicitly. Google engineers make tradeoff decisions daily — they want to see you do the same." },
      { heading: "9. What makes you want to work at Google?", content: "This seems simple but is heavily weighted. Generic answers ('I love the culture') will hurt you.\n\nWinning approach: Reference a specific Google product, paper, or initiative. Connect it to your personal experience. Show you've done homework that goes beyond the careers page." },
      { heading: "10. Where do you see yourself in 5 years?", content: "Google wants people who think about impact at scale. Don't say 'managing a team' — say what problem you want to solve and how Google's resources uniquely enable it.\n\nBest answers connect personal growth with company mission. Show you've thought about how your trajectory aligns with Google's direction." },
    ],
    faqs: [
      { question: "How many rounds are in a Google interview?", answer: "Google typically has 5-6 rounds: phone screen, 2 coding interviews, 1 system design, 1 behavioral (Googleyness & Leadership), and sometimes a team-matching call." },
      { question: "How long does the Google interview process take?", answer: "The process typically takes 4-8 weeks from application to offer, though it can vary depending on the role and team." },
      { question: "What is the Google interview acceptance rate?", answer: "Google's acceptance rate is approximately 0.2-0.5%, making it one of the most competitive employers globally." },
    ],
    relatedSlugs: ["behavioral-interview-questions-freshers", "system-design-interview-preparation", "amazon-leadership-principles-interview"],
    cta: "Practice these exact questions with Hirloop's AI interviewer — get scored feedback on each answer in minutes.",
  },
  {
    slug: "flipkart-interview-prep-guide",
    title: "Flipkart Interview Prep Guide — What to Expect in 2025",
    metaDescription: "Complete Flipkart interview preparation guide. Covers coding rounds, system design, HR behavioral questions, and insider tips for SDE-1 to SDE-3 roles.",
    company: "Flipkart",
    category: "Full Guide",
    readTime: "10 min",
    heroImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&h=500&fit=crop",
    heroAlt: "Team collaborating in a modern office, representing Flipkart interview preparation",
    datePublished: "2025-04-01",
    intro: "Flipkart is one of India's most sought-after tech employers, with competitive compensation and challenging problems at scale. Here's everything you need to know about their interview process for SDE roles.",
    sections: [
      { heading: "Interview Structure", content: "Flipkart's process typically has 4-5 rounds:\n\n1. Online Assessment — DSA problems (2-3 questions, 90 minutes)\n2. Machine Coding Round — Build a small system in 90 minutes\n3. Problem Solving (x2) — Whiteboard DSA with follow-ups\n4. System Design — For SDE-2+ roles\n5. Hiring Manager — Behavioral + culture fit" },
      { heading: "Most-Asked DSA Topics", content: "Based on interview reports, Flipkart heavily tests:\n\n• Trees and Graphs (especially BFS/DFS variations)\n• Dynamic Programming (medium-hard level)\n• Design Patterns (Strategy, Observer, Factory)\n• Hashmaps and two-pointer techniques\n• Matrix/grid problems" },
      { heading: "Machine Coding Round Tips", content: "This is unique to Flipkart and catches many candidates off guard. You'll be asked to build a small application (e.g., a parking lot system, splitwise clone) in 90 minutes.\n\nKeys to success:\n• Use proper OOP design — interfaces, clean separation\n• Write unit tests even if not required\n• Handle edge cases\n• Keep the code extensible" },
      { heading: "Behavioral Questions to Prepare", content: "Flipkart values ownership and customer obsession:\n\n• Tell me about a time you went above and beyond for a customer/user\n• Describe a technical decision you made that had business impact\n• How do you handle disagreements in code reviews?\n• What's the most complex system you've worked on?" },
      { heading: "Compensation Expectations (2025)", content: "SDE-1: ₹18-28 LPA\nSDE-2: ₹30-50 LPA\nSDE-3: ₹50-80 LPA\nSenior Staff: ₹80 LPA+\n\nFlipkart also offers ESOPs which can significantly increase total compensation." },
    ],
    faqs: [
      { question: "Does Flipkart have a machine coding round?", answer: "Yes, Flipkart's machine coding round is unique — you build a small application in 90 minutes. Focus on clean OOP design, extensibility, and edge case handling." },
      { question: "What is Flipkart SDE-1 salary in 2025?", answer: "Flipkart SDE-1 salary ranges from ₹18-28 LPA including base, bonus, and ESOPs." },
    ],
    relatedSlugs: ["top-10-google-interview-questions", "razorpay-interview-experience", "system-design-interview-preparation"],
    cta: "Simulate a full Flipkart interview loop on Hirloop — behavioral, technical, and system design rounds with AI scoring.",
  },
  {
    slug: "behavioral-interview-questions-freshers",
    title: "50 Behavioral Interview Questions for Freshers — India Campus Placements",
    metaDescription: "Top 50 behavioral interview questions asked in Indian campus placements. Includes STAR method examples for freshers with limited work experience.",
    company: "Campus",
    category: "Freshers",
    readTime: "12 min",
    heroImage: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=500&fit=crop",
    heroAlt: "University students in a campus setting preparing for placement interviews",
    datePublished: "2025-04-01",
    intro: "Campus placements are stressful — especially behavioral rounds where you feel like you have 'nothing to talk about.' The truth is: college projects, internships, hackathons, and even group assignments are valid experiences. Here's how to use them.",
    sections: [
      { heading: "The STAR Method for Freshers", content: "STAR stands for Situation, Task, Action, Result. As a fresher, your examples can come from:\n\n• College projects and capstone work\n• Internships (even 2-month ones count)\n• Hackathons and coding competitions\n• Club leadership and event organization\n• Part-time work or freelancing\n\nThe key is specificity — don't say 'I worked in a team.' Say 'I led a 4-person team to build a food delivery app in 48 hours at HackMIT.'" },
      { heading: "Top 10 Questions for TCS/Infosys/Wipro", content: "Mass recruiters ask predictable questions:\n\n1. Tell me about yourself (keep it 90 seconds)\n2. Why should we hire you?\n3. What are your strengths and weaknesses?\n4. Describe a challenging situation you faced\n5. Where do you see yourself in 5 years?\n6. Why do you want to work here?\n7. Tell me about a team project\n8. How do you handle pressure?\n9. What's your biggest achievement?\n10. Do you have any questions for us?\n\nFor each, prepare a 2-minute answer using STAR." },
      { heading: "Top 10 Questions for Product Companies", content: "Startups and product companies go deeper:\n\n1. Walk me through a project you're proud of\n2. Tell me about a time you had to learn something quickly\n3. Describe a conflict in a team and how you resolved it\n4. What's the hardest bug you've debugged?\n5. How do you approach a problem you've never seen before?\n6. Tell me about a time you failed\n7. Describe a time you went beyond what was asked\n8. How do you prioritize when you have multiple deadlines?\n9. Tell me about a time you gave or received difficult feedback\n10. What would you do in your first 30 days here?" },
      { heading: "Questions About Your Projects", content: "Every fresher gets asked about their projects. Be ready for:\n\n• What was your specific contribution?\n• What was the most challenging part?\n• What would you do differently?\n• How did you handle disagreements in the team?\n• What did you learn that you couldn't learn in class?\n\nTip: Know your project's architecture, your design decisions, and the alternatives you considered." },
      { heading: "Common Mistakes Freshers Make", content: "1. Memorizing scripted answers (interviewers can tell)\n2. Using 'we' for everything (they want to know YOUR role)\n3. Giving vague answers without numbers or outcomes\n4. Not preparing questions to ask the interviewer\n5. Treating HR rounds as 'easy' — they have elimination power\n\nThe fix: Practice out loud. Record yourself. Get feedback on filler words, pacing, and structure." },
    ],
    faqs: [
      { question: "How do freshers answer behavioral questions without work experience?", answer: "Use examples from college projects, internships, hackathons, club leadership, and group assignments. The STAR method works the same — focus on your specific contribution and the outcome." },
      { question: "What is the STAR method?", answer: "STAR stands for Situation, Task, Action, Result. It's a structured framework for answering behavioral interview questions by describing a specific example from your experience." },
      { question: "How many behavioral questions should freshers prepare?", answer: "Prepare 8-10 strong STAR stories that can be adapted across different questions. Most behavioral questions map to themes like teamwork, leadership, conflict, failure, and initiative." },
    ],
    relatedSlugs: ["tcs-interview-questions-freshers-2025", "how-to-introduce-yourself-in-interview", "hr-interview-questions-answers-india"],
    cta: "Practice your behavioral answers with Hirloop's AI interviewer — it'll score your STAR structure, clarity, and confidence in real-time.",
  },
  {
    slug: "razorpay-interview-experience",
    title: "Razorpay Interview Experience — SDE & PM Roles (2025)",
    metaDescription: "Detailed Razorpay interview experience for SDE and PM roles. Covers coding rounds, system design, culture fit, and salary expectations.",
    company: "Razorpay",
    category: "Experience",
    readTime: "7 min",
    heroImage: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&h=500&fit=crop",
    heroAlt: "Fintech workspace representing Razorpay interview preparation",
    datePublished: "2025-04-01",
    intro: "Razorpay has grown into one of India's most valuable fintech companies. Their interview process emphasizes problem-solving depth and ownership mindset. Here's what to expect.",
    sections: [
      { heading: "Interview Process Overview", content: "Razorpay's hiring loop:\n\n1. Recruiter screen (30 min) — background, motivation, salary expectations\n2. Online coding round — 2 DSA problems, 60 minutes\n3. Technical round 1 — DSA + problem decomposition\n4. Technical round 2 — System design (for SDE-2+)\n5. Culture round — Values alignment, ownership stories\n6. Hiring manager — Final bar raiser" },
      { heading: "What Razorpay Values", content: "Razorpay's culture centers on:\n\n• Ownership — They want people who treat problems as their own, not someone else's\n• Speed — Fintech moves fast; they value velocity with quality\n• Customer empathy — Understanding merchant pain points\n• Technical depth — Not just using tools, but understanding how they work\n\nIn behavioral rounds, tell stories that demonstrate these values." },
      { heading: "System Design Focus Areas", content: "Razorpay system design questions often relate to payments:\n\n• Design a payment gateway\n• Design a retry mechanism for failed transactions\n• Design a notification system at scale\n• Design an idempotent API\n\nKey: Always discuss consistency, reliability, and failure handling. In fintech, a bug can mean lost money." },
      { heading: "Salary Expectations (2025)", content: "SDE-1: ₹15-25 LPA\nSDE-2: ₹28-45 LPA\nSDE-3: ₹50-70 LPA\nPM: ₹25-50 LPA\n\nRazorpay offers competitive ESOPs and a strong learning environment." },
    ],
    faqs: [
      { question: "How hard is the Razorpay interview?", answer: "Razorpay interviews are moderately hard — similar to Flipkart level. DSA questions are medium-hard, and system design focuses on payment-specific problems like idempotency and retry mechanisms." },
      { question: "What is Razorpay SDE-2 salary?", answer: "Razorpay SDE-2 salary ranges from ₹28-45 LPA including base pay, bonuses, and ESOPs." },
    ],
    relatedSlugs: ["flipkart-interview-prep-guide", "system-design-interview-preparation", "ace-case-study-interviews"],
    cta: "Run a Razorpay-style interview on Hirloop — system design, behavioral, and technical rounds tailored to fintech.",
  },
  {
    slug: "ace-case-study-interviews",
    title: "How to Ace Case Study Interviews — Framework + Examples",
    metaDescription: "Master case study interviews with proven frameworks. Includes examples for consulting, product, and strategy roles with step-by-step walkthroughs.",
    company: "Consulting",
    category: "Strategy",
    readTime: "9 min",
    heroImage: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&h=500&fit=crop",
    heroAlt: "Professional analyzing data charts for case study interview preparation",
    datePublished: "2025-04-01",
    intro: "Case study interviews test your ability to structure ambiguous problems, analyze data, and communicate recommendations clearly. Whether you're interviewing for McKinsey, a product role, or a startup strategy position — the core skills are the same.",
    sections: [
      { heading: "The Universal Case Framework", content: "Every case can be broken into four steps:\n\n1. Clarify — Ask questions to narrow the problem scope\n2. Structure — Create a framework (don't force-fit MECE; adapt to the problem)\n3. Analyze — Work through each branch with data and logic\n4. Recommend — State your answer, the key driver, risks, and next steps\n\nThe biggest mistake? Jumping to step 3 without doing step 1 properly." },
      { heading: "Market Sizing Questions", content: "Example: 'How many electric scooters are sold in India per year?'\n\nApproach:\n• Start with India's population (~1.4B)\n• Urban population: ~500M\n• Two-wheeler households: ~35% = 175M\n• Annual purchase rate: ~8% (new + replacement) = 14M\n• EV penetration: ~10% = 1.4M electric scooters/year\n\nAlways state assumptions, check reasonableness, and note what data you'd verify." },
      { heading: "Profitability Cases", content: "Framework: Revenue (Price x Volume) - Costs (Fixed + Variable)\n\nAlways ask:\n• Is the decline in revenue, increase in costs, or both?\n• When did it start? What changed?\n• Is it affecting the entire market or just this company?\n\nThen drill into the specific branch that's causing the issue." },
      { heading: "Product Strategy Cases", content: "Example: 'Should Swiggy launch a grocery delivery service?'\n\nStructure:\n1. Market attractiveness — TAM, growth, competition\n2. Strategic fit — Synergies with existing business, brand alignment\n3. Feasibility — Operational capability, investment required\n4. Risks — Cannibalization, regulatory, execution risk\n5. Recommendation with conditions" },
      { heading: "Practice Tips", content: "1. Practice out loud — case interviews are oral exams\n2. Write your structure before speaking\n3. Do mental math daily (no calculator in case interviews)\n4. Read business news — cases are inspired by real scenarios\n5. Record yourself and review for filler words and unclear transitions" },
    ],
    faqs: [
      { question: "How do I prepare for case study interviews?", answer: "Practice structuring problems using frameworks (not memorized templates), do mental math daily, read business news for case inspiration, and practice out loud — recording yourself helps identify filler words and unclear transitions." },
      { question: "What is the MECE framework?", answer: "MECE stands for Mutually Exclusive, Collectively Exhaustive. It means breaking a problem into categories that don't overlap and together cover all possibilities. It's the foundation of structured problem-solving in consulting." },
    ],
    relatedSlugs: ["top-10-google-interview-questions", "salary-negotiation-tips-india", "tell-me-about-yourself-best-answer"],
    cta: "Practice case study interviews on Hirloop — the AI will play the interviewer, give you data when asked, and score your structure and recommendation.",
  },
  // ═══════════════════════════════════════════
  // NEW HIGH-VOLUME SEO POSTS
  // ═══════════════════════════════════════════
  {
    slug: "tcs-interview-questions-freshers-2025",
    title: "TCS Interview Questions for Freshers 2025 — Complete Preparation Guide",
    metaDescription: "Complete TCS interview questions guide for freshers 2025. Covers TCS NQT, technical round, HR questions, managerial round with sample answers and tips.",
    company: "TCS",
    category: "Freshers",
    readTime: "11 min",
    heroImage: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&h=500&fit=crop",
    heroAlt: "Students preparing for TCS campus placement interview",
    datePublished: "2025-04-02",
    intro: "TCS (Tata Consultancy Services) is the largest IT employer in India, hiring 40,000+ freshers annually through campus placements. The process is structured and predictable — which means thorough preparation gives you a real edge. Here's your complete guide.",
    sections: [
      { heading: "TCS Interview Process for Freshers", content: "TCS follows a standardized hiring process:\n\n1. TCS NQT (National Qualifier Test) — Online aptitude + coding test\n2. Technical Interview — CS fundamentals, project discussion\n3. Managerial Round — Behavioral + situational questions\n4. HR Round — Offer discussion, joining expectations\n\nThe NQT is the main filter — about 60% of candidates are eliminated here." },
      { heading: "TCS NQT Preparation Strategy", content: "The NQT has three sections:\n\n• Verbal Ability — Reading comprehension, grammar, vocabulary (20 min)\n• Reasoning Ability — Logical puzzles, pattern recognition (40 min)\n• Numerical Ability — Quantitative aptitude, data interpretation (40 min)\n• Coding — 1-2 programming problems in C/C++/Java/Python (30 min)\n\nTip: The coding section has the highest weightage for your score band (Digital, Prime, Ninja). Practice at least 50 coding problems of easy-medium difficulty." },
      { heading: "Top 20 TCS Technical Interview Questions", content: "1. What is OOP? Explain the four pillars.\n2. Difference between abstract class and interface\n3. What is normalization in DBMS? Explain 1NF, 2NF, 3NF\n4. Explain the OSI model layers\n5. What is a deadlock? How do you prevent it?\n6. Explain the difference between stack and heap memory\n7. What is a linked list? Types of linked lists?\n8. Explain TCP vs UDP\n9. What is a foreign key in SQL?\n10. Write a program to reverse a string\n11. Explain the software development lifecycle (SDLC)\n12. What is agile methodology?\n13. Difference between compiler and interpreter\n14. What is polymorphism? Give an example.\n15. Explain cloud computing and its types\n16. What is DNS? How does it work?\n17. Explain multithreading vs multiprocessing\n18. What is a binary search tree?\n19. Explain the MVC architecture\n20. What is REST API?\n\nFor each, prepare a 1-2 minute explanation with a real-world example." },
      { heading: "TCS HR Interview Questions", content: "1. Tell me about yourself\n2. Why TCS?\n3. Are you willing to relocate?\n4. Are you comfortable with night shifts?\n5. Do you have any backlogs?\n6. What is your expected salary?\n7. Where do you see yourself in 5 years?\n8. Why should we hire you?\n9. Do you have any bond or service agreement concerns?\n10. Are you open to any technology or domain?\n\nCritical: TCS expects 'yes' to relocation and night shifts. Hesitation is a red flag." },
      { heading: "TCS Salary for Freshers (2025)", content: "TCS Ninja: ₹3.36 LPA (most common)\nTCS Digital: ₹7-7.5 LPA\nTCS Prime: ₹9-9.5 LPA\n\nYour NQT score determines which band you qualify for. Digital and Prime require strong coding performance." },
    ],
    faqs: [
      { question: "What is TCS NQT cutoff for 2025?", answer: "TCS NQT doesn't have a fixed cutoff. Candidates are placed in bands — Ninja (lowest), Digital (mid), and Prime (highest) — based on their overall score with heavy emphasis on the coding section." },
      { question: "Is TCS interview easy for freshers?", answer: "TCS interviews are moderate in difficulty. The NQT aptitude test is the main filter. Technical and HR rounds are straightforward if you know CS fundamentals and can discuss your projects clearly." },
      { question: "How to prepare for TCS NQT in 2 weeks?", answer: "Focus on: (1) Solve 50+ coding problems in your strongest language, (2) Practice 20 aptitude questions daily, (3) Review CS fundamentals — DBMS, OOP, OS, networking. Use Hirloop to practice behavioral answers." },
    ],
    relatedSlugs: ["behavioral-interview-questions-freshers", "infosys-interview-questions-2025", "wipro-interview-questions-answers"],
    cta: "Practice TCS interview questions with Hirloop's AI — get instant feedback on your technical explanations and HR answers.",
  },
  {
    slug: "infosys-interview-questions-2025",
    title: "Infosys Interview Questions 2025 — InfyTQ, Power Programmer & SP Roles",
    metaDescription: "Infosys interview questions for 2025 freshers. Covers InfyTQ certification, Power Programmer, Systems Engineer roles with technical and HR round preparation.",
    company: "Infosys",
    category: "Freshers",
    readTime: "9 min",
    heroImage: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=500&fit=crop",
    heroAlt: "Modern tech office representing Infosys interview preparation",
    datePublished: "2025-04-02",
    intro: "Infosys hires 20,000+ freshers annually across three main tracks: Systems Engineer (SE), Power Programmer (PP), and Digital Specialist Engineer (DSE). Each has different interview patterns — here's how to prepare for all of them.",
    sections: [
      { heading: "Infosys Hiring Tracks Explained", content: "Systems Engineer (SE): ₹3.6 LPA — General IT roles, aptitude-focused hiring\nPower Programmer (PP): ₹6.5 LPA — Strong coders, advanced DSA required\nDigital Specialist Engineer (DSE): ₹6.5-9.5 LPA — Specialized tech roles\n\nInfyTQ certification gives you a direct interview call for SE/PP tracks." },
      { heading: "Infosys Online Test Pattern", content: "The online test has sections:\n\n• Quantitative Aptitude — 10 questions, 25 minutes\n• Logical Reasoning — 10 questions, 25 minutes\n• Verbal Ability — 10 questions, 20 minutes\n• Pseudo Code / Programming — 5 questions, 10 minutes\n• Coding — 2 hands-on problems, 40 minutes\n\nFor Power Programmer: Additional advanced coding round with 3 hard problems." },
      { heading: "Top Technical Interview Questions", content: "1. Explain OOPS concepts with real-world examples\n2. What is the difference between SQL and NoSQL?\n3. Explain the concept of normalization\n4. What is a virtual function in C++?\n5. Difference between process and thread\n6. What is a REST API? How does it differ from SOAP?\n7. Explain the concept of inheritance with an example\n8. What is garbage collection?\n9. Explain the difference between ArrayList and LinkedList\n10. What is the purpose of the 'static' keyword?\n\nInfosys interviewers prefer conceptual clarity over rote definitions." },
      { heading: "HR Round Questions", content: "1. Tell me about yourself (keep under 2 minutes)\n2. Why Infosys over other companies?\n3. Are you flexible about location and technology?\n4. Tell me about a challenging project you worked on\n5. How do you handle tight deadlines?\n6. What do you know about Infosys?\n7. Are you comfortable with a 2-year service agreement?\n\nKey: Research Infosys's recent initiatives (AI, cloud, sustainability) — mentioning these shows genuine interest." },
      { heading: "InfyTQ Preparation Tips", content: "InfyTQ is Infosys's free certification platform:\n\n1. Complete all Python/Java modules on the platform\n2. Score 65%+ in the certification exam for guaranteed interview\n3. Practice on the platform's coding environment — the actual test uses the same interface\n4. Focus on data structures and algorithms for PP track\n\nTimeline: Start InfyTQ prep 2-3 months before campus drive." },
    ],
    faqs: [
      { question: "What is InfyTQ and is it mandatory?", answer: "InfyTQ is Infosys's free online training and certification platform. While not mandatory, completing InfyTQ certification (65%+ score) guarantees you a direct interview call, skipping the initial aptitude screening." },
      { question: "What is Infosys Power Programmer salary?", answer: "Infosys Power Programmer salary for freshers is ₹6.5 LPA (2025). This track requires strong coding skills and involves working on advanced technology projects." },
      { question: "How is Infosys interview different from TCS?", answer: "Infosys focuses more on conceptual understanding and coding ability, while TCS emphasizes aptitude scores. Infosys also has the InfyTQ certification path which TCS doesn't offer." },
    ],
    relatedSlugs: ["tcs-interview-questions-freshers-2025", "wipro-interview-questions-answers", "behavioral-interview-questions-freshers"],
    cta: "Simulate an Infosys interview on Hirloop — practice technical explanations and HR answers with AI-powered feedback.",
  },
  {
    slug: "how-to-introduce-yourself-in-interview",
    title: "How to Introduce Yourself in an Interview — Script + Examples (India)",
    metaDescription: "Learn how to introduce yourself in an interview with proven scripts and examples. Covers freshers, experienced professionals, and career changers with Indian context.",
    company: "General",
    category: "Skills",
    readTime: "7 min",
    heroImage: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=1200&h=500&fit=crop",
    heroAlt: "Professional introducing themselves in a job interview setting",
    datePublished: "2025-04-03",
    intro: "\"Tell me about yourself\" is the first question in 95% of interviews — and most candidates blow it. They either recite their resume or give a 5-minute monologue. Here's how to nail it in 60-90 seconds with a structure that works every time.",
    sections: [
      { heading: "The Perfect Structure (Present-Past-Future)", content: "Follow this 3-part structure:\n\n1. Present — What you do now (role, key skills, recent achievement)\n2. Past — How you got here (education, relevant experience)\n3. Future — Why you're here (what excites you about this role)\n\nKeep it under 90 seconds. Practice with a timer." },
      { heading: "Script for Freshers", content: "\"Hi, I'm [Name], a recent [degree] graduate from [College] with a specialization in [field]. During college, I built [specific project] which [result/impact]. I also interned at [Company] where I worked on [specific task]. What I'm most passionate about is [relevant interest], which is exactly why I'm excited about this role at [Company] — specifically [something specific about the job description].\"\n\nTotal: ~60 seconds. Specific. Memorable." },
      { heading: "Script for Experienced Professionals", content: "\"I'm [Name], currently a [Title] at [Company] where I [key responsibility + metric]. Over the past [X] years, I've focused on [domain/skill], most recently [specific achievement with numbers]. Before that, I [relevant previous experience]. I'm looking to move into [target area] because [genuine reason], and this role at [Company] aligns with that — especially [specific aspect of the role].\"\n\nKey: Lead with your strongest recent achievement, not your job title." },
      { heading: "Script for Career Changers", content: "\"I'm [Name]. For the past [X] years, I've been working in [current field] as a [Title], where I developed strong skills in [transferable skills]. Recently, I've been [learning/building/contributing to] [new field] — for example, [specific project or certification]. I'm making this transition because [authentic reason], and I see a natural fit with [Company] because [connection].\"\n\nTip: Don't apologize for changing careers. Frame it as an evolution, not a pivot." },
      { heading: "Common Mistakes to Avoid", content: "1. Starting with \"So basically...\" — Start with your name.\n2. Reciting your resume chronologically — They can read it. Tell a story.\n3. Being too humble (\"I'm just a fresher\") — Own your experience.\n4. Going over 2 minutes — You'll lose them. 60-90 seconds max.\n5. Not customizing for the company — Generic intros feel lazy.\n6. Sharing personal details (\"I'm from Delhi, I have 2 siblings\") — Keep it professional unless asked.\n7. Using buzzwords (\"passionate\", \"hardworking\", \"team player\") — Show, don't tell." },
      { heading: "Practice Exercise", content: "Write your introduction using the Present-Past-Future structure. Then:\n\n1. Read it out loud 5 times\n2. Record yourself on your phone\n3. Listen back — check for filler words (um, so, basically)\n4. Time it — aim for 60-90 seconds\n5. Practice with a friend or AI interviewer\n\nThe goal: It should sound natural, not rehearsed. You know you've got it when you can deliver it without notes and it sounds like a conversation." },
    ],
    faqs: [
      { question: "How long should a self-introduction be in an interview?", answer: "Keep your self-introduction between 60-90 seconds (roughly 150-200 words). Anything longer risks losing the interviewer's attention. Practice with a timer." },
      { question: "Should I mention personal details in my introduction?", answer: "No. Keep your introduction professional — focus on your education, experience, skills, and why you're interested in the role. Only share personal details if specifically asked." },
      { question: "How to introduce yourself as a fresher with no experience?", answer: "Lead with your education and specialization, then highlight college projects, internships, hackathons, or relevant coursework. End with what excites you about the role. No experience ≠ nothing to say." },
    ],
    relatedSlugs: ["behavioral-interview-questions-freshers", "tell-me-about-yourself-best-answer", "hr-interview-questions-answers-india"],
    cta: "Practice your self-introduction with Hirloop's AI — get instant feedback on pacing, clarity, and filler words.",
  },
  {
    slug: "tell-me-about-yourself-best-answer",
    title: "\"Tell Me About Yourself\" — Best Answer Examples for 2025 Interviews",
    metaDescription: "Best answers for 'Tell me about yourself' in 2025 interviews. Includes scripts for freshers, experienced, managers, and career changers with real examples.",
    company: "General",
    category: "Skills",
    readTime: "8 min",
    heroImage: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1200&h=500&fit=crop",
    heroAlt: "Confident professional answering tell me about yourself interview question",
    datePublished: "2025-04-03",
    intro: "This single question sets the tone for your entire interview. A great answer creates momentum — a weak one puts you on the defensive for the next 45 minutes. Here are proven answer templates for every career stage.",
    sections: [
      { heading: "Why Interviewers Ask This Question", content: "They're evaluating three things:\n\n1. Communication skills — Can you organize thoughts clearly?\n2. Relevance — Do you understand what matters for this role?\n3. Self-awareness — Do you know your own strengths?\n\nThey're NOT asking for your life story. They want a professional highlight reel." },
      { heading: "The 3-Sentence Formula", content: "If you're nervous, use this minimal formula:\n\nSentence 1: Who you are professionally right now\nSentence 2: Your most relevant achievement or experience\nSentence 3: Why you're excited about this specific opportunity\n\nExample: \"I'm a backend engineer at a fintech startup where I built the payment reconciliation system processing ₹50 Cr monthly. My strength is designing reliable systems under tight deadlines — our last release had zero downtime. I'm excited about this role because [Company] is solving payment problems at 100x the scale, and I want to be part of that.\"" },
      { heading: "Answer for Software Engineers", content: "\"I'm a software engineer with [X] years of experience specializing in [area]. Currently at [Company], I'm responsible for [key project/system], which [impact metric]. The most interesting problem I've solved recently was [brief description]. I'm drawn to [Target Company] because [specific reason related to their engineering challenges].\"" },
      { heading: "Answer for Product Managers", content: "\"I'm a product manager who's spent the last [X] years building [type of products]. At [Company], I led the launch of [product/feature] which grew to [metric]. My approach combines user research with data-driven prioritization — I'm the PM who actually talks to customers before writing specs. [Target Company]'s focus on [specific area] is what brought me here.\"" },
      { heading: "Answer for Management Roles", content: "\"I lead a team of [X] engineers/analysts at [Company], where we're responsible for [domain]. Over the past year, I've [key achievement — growing the team, shipping a major project, improving metrics]. What I've learned is that the best teams are built on clear expectations and psychological safety. I'm looking at [Target Company] because [reason tied to leadership opportunity].\"" },
      { heading: "What NOT to Say", content: "• \"I'm a hard worker and a team player\" — Everyone says this. It means nothing.\n• \"My weakness is that I'm a perfectionist\" — Interviewers hear this 10x/day.\n• \"I've been coding since I was 12\" — Unless it's directly relevant, skip the origin story.\n• \"Basically, I'm just looking for a good opportunity\" — Too passive. Show direction.\n• Starting with \"So...\" or \"Well...\" — Start with your name or role." },
    ],
    faqs: [
      { question: "How to answer tell me about yourself for freshers?", answer: "Use the Present-Past-Future formula: Start with your degree and specialization, mention your strongest project or internship with a specific result, then connect to why you're excited about this role. Keep it under 90 seconds." },
      { question: "Should I mention my hobbies in tell me about yourself?", answer: "Only if they're directly relevant to the role or demonstrate a valuable skill. 'I contribute to open-source projects' is relevant for a developer role. 'I like cooking' is not." },
      { question: "What is the best answer for tell me about yourself for experienced professionals?", answer: "Lead with your current role and a quantified achievement, briefly mention your career trajectory, then explain why this specific opportunity interests you. Focus on impact, not job descriptions." },
    ],
    relatedSlugs: ["how-to-introduce-yourself-in-interview", "hr-interview-questions-answers-india", "behavioral-interview-questions-freshers"],
    cta: "Practice your 'tell me about yourself' answer with Hirloop — the AI will score your structure, relevance, and delivery in real-time.",
  },
  {
    slug: "wipro-interview-questions-answers",
    title: "Wipro Interview Questions & Answers 2025 — Elite NTH & Turbo Roles",
    metaDescription: "Wipro interview questions for freshers 2025. Complete guide for Elite NTH, Turbo, and WILP programs with technical, aptitude, and HR round preparation.",
    company: "Wipro",
    category: "Freshers",
    readTime: "8 min",
    heroImage: "https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?w=1200&h=500&fit=crop",
    heroAlt: "Corporate office environment representing Wipro interview preparation",
    datePublished: "2025-04-03",
    intro: "Wipro hires 15,000+ freshers annually through three main programs: Elite NTH (National Talent Hunt), Turbo, and WILP. The selection process is aptitude-heavy with a structured interview format. Here's how to prepare.",
    sections: [
      { heading: "Wipro Hiring Programs", content: "Elite NTH: ₹3.5 LPA — Standard engineering roles via online test + interview\nTurbo: ₹6.5 LPA — Advanced engineering roles, harder coding round\nWILP: ₹3.5 LPA — Work-Integrated Learning Program for non-CS graduates\n\nYour test score determines which track you're eligible for." },
      { heading: "Wipro Online Assessment", content: "Pattern (2025):\n\n• Aptitude — 20 questions, 30 minutes (quantitative + logical + verbal)\n• Written Communication — Essay in 20 minutes\n• Coding — 2 problems in 60 minutes\n\nFor Turbo: Additional advanced coding round (3 problems, hard difficulty)\n\nMinimum cutoff: ~60% in aptitude, at least 1 coding problem fully solved." },
      { heading: "Technical Interview Questions", content: "1. What are access modifiers in Java/C++?\n2. Explain the difference between overloading and overriding\n3. What is a primary key vs unique key?\n4. Explain the software testing lifecycle\n5. What is a JOIN in SQL? Types of JOINs?\n6. What is the difference between HTTP and HTTPS?\n7. Explain the concept of multithreading\n8. What is cloud computing? Types of cloud services?\n9. What is an API? How does it work?\n10. Explain your final year project architecture\n\nWipro values conceptual clarity and the ability to explain things simply." },
      { heading: "HR Round Preparation", content: "Wipro HR questions are straightforward:\n\n1. Tell me about yourself\n2. Why Wipro?\n3. Are you ready to relocate to any city?\n4. What is your expected CTC?\n5. Are you comfortable working in shifts?\n6. Do you have any service bond concerns? (Wipro has a 1-year bond)\n7. When can you join?\n\nKey: Wipro values adaptability. Express willingness to work across technologies, locations, and shifts." },
    ],
    faqs: [
      { question: "What is Wipro Elite NTH salary for freshers?", answer: "Wipro Elite NTH salary for freshers in 2025 is ₹3.5 LPA. The Turbo track offers ₹6.5 LPA for candidates with stronger coding skills." },
      { question: "Is Wipro interview difficult?", answer: "Wipro interviews are considered easy to moderate. The online aptitude test is the main filter. Technical interviews focus on CS fundamentals, and HR rounds are straightforward." },
      { question: "What is the difference between Wipro Elite and Turbo?", answer: "Elite NTH (₹3.5 LPA) is for general engineering roles, while Turbo (₹6.5 LPA) targets strong coders with an additional hard coding round. Both share the same initial aptitude test." },
    ],
    relatedSlugs: ["tcs-interview-questions-freshers-2025", "infosys-interview-questions-2025", "behavioral-interview-questions-freshers"],
    cta: "Practice Wipro interview questions on Hirloop — simulate technical, aptitude, and HR rounds with AI scoring.",
  },
  {
    slug: "hr-interview-questions-answers-india",
    title: "Top 30 HR Interview Questions & Answers for India (2025)",
    metaDescription: "30 most-asked HR interview questions in India with best answers. Covers freshers and experienced candidates with salary negotiation tips and common mistakes.",
    company: "General",
    category: "HR Round",
    readTime: "10 min",
    heroImage: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&h=500&fit=crop",
    heroAlt: "HR interview in progress with interviewer and candidate",
    datePublished: "2025-04-04",
    intro: "HR rounds are often treated as formalities — but they have real elimination power. In India, HR rejection rates range from 10-25% even after clearing technical rounds. Here are the 30 questions you'll face and how to answer them.",
    sections: [
      { heading: "The 10 Universal HR Questions", content: "These appear in almost every Indian company interview:\n\n1. Tell me about yourself\n2. Why do you want to work here?\n3. What are your strengths?\n4. What are your weaknesses?\n5. Where do you see yourself in 5 years?\n6. Why should we hire you?\n7. Tell me about a challenge you faced\n8. How do you handle stress/pressure?\n9. What are your salary expectations?\n10. Do you have any questions for us?" },
      { heading: "Answering 'What Are Your Weaknesses?'", content: "The worst answers:\n• \"I'm a perfectionist\" (cliché)\n• \"I work too hard\" (insincere)\n• \"I don't have any\" (arrogant)\n\nThe right approach: Pick a real but manageable weakness, explain what you're doing to improve, and give evidence of progress.\n\nExample: \"I used to struggle with delegating — I'd try to do everything myself. I recognized this during my final year project when I was stretched too thin. Now I consciously break tasks into team assignments and set checkpoints. My last internship manager actually noted my delegation skills as a strength in my review.\"" },
      { heading: "Salary Negotiation Questions", content: "Q: \"What are your salary expectations?\"\n\nFor freshers: \"I'm aware of the industry standard for this role and level. I'm open to a competitive offer that reflects my skills and the responsibilities of this position.\"\n\nFor experienced: \"Based on my [X] years of experience and the market rate for this role, I'm looking at [range]. But I'm also evaluating the overall package — growth opportunities, learning, and team culture matter to me.\"\n\nNever give a single number. Always give a range with your target at the bottom." },
      { heading: "Tricky Questions and How to Handle Them", content: "Q: \"Why did you leave your last job?\" — Never badmouth. Say: \"I'm looking for [positive thing] that this role offers.\"\n\nQ: \"Tell me about a conflict with a colleague\" — Show maturity. Describe the situation, how you listened to their perspective, and the resolution.\n\nQ: \"Are you planning to do an MBA/MS?\" — Be honest but strategic. \"My immediate focus is building depth in [field]. I'm open to further education if it aligns with my career path.\"\n\nQ: \"Do you have any backlogs?\" — If yes, be honest: \"I had [X] backlogs in [subjects], which I cleared by [date]. It taught me about time management and prioritization.\"" },
      { heading: "Body Language Tips for HR Rounds", content: "1. Maintain natural eye contact (70% of the time)\n2. Sit upright but not rigid\n3. Use hand gestures when explaining — it signals confidence\n4. Smile when greeting, not constantly\n5. Don't cross your arms\n6. Nod occasionally to show engagement\n7. Avoid touching your face or hair repeatedly\n\nIn virtual interviews: Look at the camera (not the screen), ensure good lighting, and keep your background clean." },
    ],
    faqs: [
      { question: "Can you get rejected in HR round?", answer: "Yes. HR rejection rates in India are 10-25% even after clearing technical rounds. Common reasons: salary mismatch, poor communication, lack of enthusiasm, or red flags in behavioral answers." },
      { question: "How to answer 'Why should we hire you' for freshers?", answer: "Highlight your relevant skills, a specific project or achievement that demonstrates those skills, and your enthusiasm for the company/role. End with what value you'll bring in the first 90 days." },
      { question: "Should I negotiate salary in an HR interview?", answer: "Yes, but tactfully. Research market rates, give a range (not a single number), and express that you value the total package including learning and growth opportunities." },
    ],
    relatedSlugs: ["how-to-introduce-yourself-in-interview", "tell-me-about-yourself-best-answer", "salary-negotiation-tips-india"],
    cta: "Practice HR interview questions with Hirloop — the AI evaluates your answers for clarity, confidence, and professionalism.",
  },
  {
    slug: "amazon-leadership-principles-interview",
    title: "Amazon Leadership Principles Interview Guide — All 16 Principles Explained",
    metaDescription: "Master Amazon's 16 Leadership Principles for interviews. Includes STAR examples, most-asked questions per principle, and tips for SDE and PM roles in India.",
    company: "Amazon",
    category: "Behavioral",
    readTime: "11 min",
    heroImage: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?w=1200&h=500&fit=crop",
    heroAlt: "Amazon headquarters representing Amazon leadership principles interview prep",
    datePublished: "2025-04-04",
    intro: "Every Amazon interview question maps to one of their 16 Leadership Principles. Interviewers are trained to assess specific LPs per question. If you understand the principles, you can predict and prepare for nearly every question they'll ask.",
    sections: [
      { heading: "The 5 Most-Tested Principles", content: "While all 16 matter, these 5 appear in 80%+ of interview loops:\n\n1. Customer Obsession — \"Tell me about a time you went above and beyond for a customer\"\n2. Ownership — \"Describe a time you took on something outside your area of responsibility\"\n3. Dive Deep — \"Tell me about a time you had to debug a complex problem\"\n4. Bias for Action — \"Describe a time you made a decision with incomplete data\"\n5. Deliver Results — \"Tell me about your most impactful project\"\n\nPrepare 2 STAR stories for each of these." },
      { heading: "How Amazon Interviews Are Structured", content: "Amazon uses the Bar Raiser process:\n\n• 4-6 interviews, each 45-60 minutes\n• Each interviewer is assigned 2-3 Leadership Principles to assess\n• One interviewer is the 'Bar Raiser' — they can veto a hire\n• Every question is behavioral (STAR format expected)\n• For SDE roles: 2 coding + 1 system design + 1-2 behavioral rounds\n\nFormat: \"Tell me about a time when...\" followed by deep-dive follow-ups." },
      { heading: "STAR Method for Amazon", content: "Amazon interviewers are trained to dig deeper than most companies. Expect:\n\n• \"What was YOUR specific role?\" (they want I, not we)\n• \"What data did you use?\" (Dive Deep)\n• \"What would you do differently?\" (Earn Trust / Learn and Be Curious)\n• \"What was the measurable impact?\" (Deliver Results)\n\nTip: Prepare metrics for every story. Amazon runs on data — vague answers score poorly." },
      { heading: "Amazon India-Specific Tips", content: "Amazon India (Hyderabad, Bangalore) has some unique patterns:\n\n• Heavy focus on scale — India is Amazon's fastest-growing market\n• System design questions often involve India-specific constraints (network latency, regional language support, COD payments)\n• The bar for SDE-2 is high — prepare for hard LP + coding interviews\n• Amazon India offers SDE-1: ₹22-35 LPA, SDE-2: ₹35-60 LPA" },
      { heading: "Preparing Your Story Bank", content: "Create a 10-story bank mapped to Leadership Principles:\n\n• 2 stories about Customer Obsession\n• 2 about Ownership (taking initiative beyond your role)\n• 2 about Deliver Results (quantified impact)\n• 1 about disagreeing with a team/manager (Have Backbone)\n• 1 about learning something new quickly (Learn and Be Curious)\n• 1 about simplifying a complex process (Invent and Simplify)\n• 1 about a failure and what you learned (Earn Trust)\n\nEach story should have: clear situation, your specific actions, measurable result, and a reflection." },
    ],
    faqs: [
      { question: "How many Leadership Principles does Amazon have?", answer: "Amazon has 16 Leadership Principles (updated from 14 in 2021). The two newest are 'Strive to be Earth's Best Employer' and 'Success and Scale Bring Broad Responsibility.'" },
      { question: "What is the Amazon Bar Raiser?", answer: "The Bar Raiser is an experienced interviewer from a different team who ensures hiring standards stay high. They have veto power — even if all other interviewers say 'hire', the Bar Raiser can reject a candidate." },
      { question: "What is Amazon SDE-1 salary in India?", answer: "Amazon SDE-1 salary in India (2025) is ₹22-35 LPA including base, signing bonus, and RSUs. Bangalore and Hyderabad are the primary locations." },
    ],
    relatedSlugs: ["top-10-google-interview-questions", "system-design-interview-preparation", "behavioral-interview-questions-freshers"],
    cta: "Practice Amazon Leadership Principle questions on Hirloop — the AI maps each answer to specific LPs and scores your STAR structure.",
  },
  {
    slug: "system-design-interview-preparation",
    title: "System Design Interview Preparation — Complete Guide for Indian Engineers",
    metaDescription: "Complete system design interview prep guide. Covers step-by-step framework, top 15 questions, and India-specific tips for Google, Amazon, Flipkart, and startup interviews.",
    company: "General",
    category: "Technical",
    readTime: "12 min",
    heroImage: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=500&fit=crop",
    heroAlt: "System architecture diagram representing system design interview preparation",
    datePublished: "2025-04-05",
    intro: "System design interviews are the highest-signal round for SDE-2+ roles at top companies. They test whether you can think at scale, make tradeoffs, and communicate technical decisions clearly. Here's a step-by-step preparation framework.",
    sections: [
      { heading: "The 5-Step Framework", content: "Follow this framework in every system design interview:\n\n1. Requirements (3-5 min) — Clarify functional and non-functional requirements. Ask about scale, latency, consistency requirements.\n\n2. Estimation (2-3 min) — Back-of-envelope math. How many users? QPS? Storage? Bandwidth?\n\n3. High-Level Design (10 min) — Draw the major components: clients, load balancers, application servers, databases, caches, message queues.\n\n4. Deep Dive (15-20 min) — The interviewer picks 1-2 areas to go deep. This is where you differentiate yourself.\n\n5. Tradeoffs & Extensions (5 min) — Discuss what you'd change for 10x scale, what you'd monitor, how you'd handle failures." },
      { heading: "Top 15 System Design Questions", content: "Most-asked across Google, Amazon, Flipkart, and startups:\n\n1. Design URL Shortener (like bit.ly)\n2. Design a Chat Application (like WhatsApp)\n3. Design a News Feed (like Facebook/Instagram)\n4. Design a Rate Limiter\n5. Design a Notification System\n6. Design Twitter/X\n7. Design YouTube (video streaming at scale)\n8. Design an E-commerce System (like Flipkart)\n9. Design a Payment System (like Razorpay)\n10. Design a Search Autocomplete\n11. Design a Ride-Sharing Service (like Uber/Ola)\n12. Design a File Storage System (like Google Drive)\n13. Design a Distributed Cache\n14. Design a Job Scheduler\n15. Design a Metrics/Monitoring System" },
      { heading: "Key Concepts You Must Know", content: "• Load Balancing — Round-robin, consistent hashing, L4 vs L7\n• Caching — Redis/Memcached, cache-aside vs write-through, eviction policies\n• Database — SQL vs NoSQL, sharding strategies, replication\n• Message Queues — Kafka, RabbitMQ, async processing\n• CDN — How CDNs work, cache invalidation\n• Consistency Models — Strong, eventual, causal consistency\n• CAP Theorem — You can't have all three: choose two\n• API Design — REST vs GraphQL, rate limiting, pagination\n• Microservices — Service discovery, circuit breakers, saga pattern" },
      { heading: "India-Specific Tips", content: "Indian tech interviews often include constraints that US interviews don't:\n\n• COD (Cash on Delivery) handling in e-commerce systems\n• UPI/IMPS payment integration in payment systems\n• Multi-language/script support (Hindi, Tamil, Bengali)\n• Low-bandwidth optimization for tier-2/3 city users\n• India's data localization requirements (RBI mandates for financial data)\n• Spike handling for events like Flipkart Big Billion Days or IPL streaming\n\nMentioning these shows domain awareness and impresses Indian interviewers." },
      { heading: "Preparation Timeline (4 Weeks)", content: "Week 1: Learn the fundamentals — caching, databases, load balancing, message queues\nWeek 2: Practice 3 classic problems (URL shortener, chat app, news feed)\nWeek 3: Practice 3 harder problems (payment system, search, ride-sharing)\nWeek 4: Mock interviews — practice explaining your design out loud\n\nResources: System Design Primer (GitHub), Designing Data-Intensive Applications (book), Hirloop's AI system design interviews" },
    ],
    faqs: [
      { question: "When do system design interviews start in the interview process?", answer: "System design rounds are typically required for SDE-2 (3+ years experience) and above. Some companies like Google and Amazon include a simplified version for SDE-1 as well." },
      { question: "How long is a system design interview?", answer: "System design interviews are typically 45-60 minutes. Spend 5 minutes on requirements, 3 on estimation, 10 on high-level design, 20 on deep dives, and 5 on tradeoffs." },
      { question: "What if I get a system I've never designed before?", answer: "Use the framework: clarify requirements, estimate scale, draw high-level components, and deep-dive where the interviewer guides you. The process matters more than the specific system." },
    ],
    relatedSlugs: ["top-10-google-interview-questions", "amazon-leadership-principles-interview", "flipkart-interview-prep-guide"],
    cta: "Practice system design interviews on Hirloop — explain your architecture to the AI and get feedback on your approach, tradeoffs, and communication.",
  },
  {
    slug: "salary-negotiation-tips-india",
    title: "Salary Negotiation Tips for India — How to Get 20-40% More",
    metaDescription: "Practical salary negotiation tips for Indian job market. Covers freshers, experienced professionals, counter-offer strategies, and exact scripts to use.",
    company: "General",
    category: "Career",
    readTime: "8 min",
    heroImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&h=500&fit=crop",
    heroAlt: "Professional negotiating salary with charts and data",
    datePublished: "2025-04-05",
    intro: "Most Indians don't negotiate salary — and leave 20-40% on the table. Companies expect negotiation. They budget for it. When you accept the first offer, you're not being humble — you're being underpaid. Here's how to negotiate effectively.",
    sections: [
      { heading: "When Companies Have Room to Negotiate", content: "Companies always have a budget range. Typical ranges:\n\n• Freshers (mass hiring): ₹0-10% room — Very little flexibility\n• Freshers (product companies): ₹15-30% room\n• Experienced (3-5 yrs): ₹20-40% room\n• Experienced (5+ yrs): ₹25-50% room\n• Leadership: Highly negotiable\n\nRule of thumb: If the company reached out to YOU, there's more room. If you applied cold, less room." },
      { heading: "The Negotiation Script", content: "When they share the offer:\n\n\"Thank you for the offer. I'm genuinely excited about this role and the team. I've done some research on market compensation for this role and level, and based on [my experience / competing offer / market data], I was hoping we could explore something closer to [X]. Is there flexibility in the base/stocks/joining bonus?\"\n\nKey principles:\n• Express enthusiasm first (they need to know you'll accept if they meet the number)\n• Anchor with a specific number (not a range)\n• Name the reason (market data, competing offer, experience)\n• Ask about the total package, not just base salary" },
      { heading: "Leverage: The Only Thing That Matters", content: "Your negotiation power comes from:\n\n1. Competing offers — The #1 leverage. Even one other offer changes the dynamic.\n2. Rare skills — If you have skills they can't easily find, you have power.\n3. Internal referral — Referred candidates often get better offers.\n4. The company's urgency — If they need to fill the role fast, you benefit.\n\nIf you have zero leverage: Focus on non-salary benefits (joining bonus, flexible work, learning budget, title)." },
      { heading: "What to Negotiate Beyond Salary", content: "Base salary is just one component. Also negotiate:\n\n• Joining bonus — Often easier to get than base salary increase (₹50K-5L)\n• ESOPs/RSUs — Ask for more vesting or accelerated schedule\n• Flexible work — Remote days, flexible hours\n• Learning budget — Conference attendance, certifications\n• Title — A better title costs the company nothing but helps your next negotiation\n• Notice period buyout — If your current employer has a long notice period\n• Relocation assistance — If moving cities" },
      { heading: "Common Mistakes", content: "1. Negotiating before getting the offer — Wait until they commit to you.\n2. Sharing your current salary too early — \"I'd prefer to focus on the value I'll bring to this role.\"\n3. Accepting immediately — \"Thank you! Can I have 2-3 days to review the complete offer?\"\n4. Negotiating via email for important points — Do it on a call where tone matters.\n5. Burning bridges — Always be grateful and professional, even if you decline.\n6. Not negotiating at all — The worst that happens is they say no." },
    ],
    faqs: [
      { question: "Is it OK to negotiate salary in India?", answer: "Absolutely. Companies expect it and budget for it. Not negotiating often means accepting 20-40% less than what was available. Be professional and back your ask with data." },
      { question: "How much should I counter-offer in India?", answer: "Counter 15-30% above the initial offer for experienced roles. For freshers at mass-hiring companies, counter by 5-10%. Always anchor with a specific number, not a range." },
      { question: "What if they say the offer is non-negotiable?", answer: "Ask about other components: joining bonus, ESOPs, flexible work, title, or learning budget. If everything is truly fixed, evaluate the total package against your alternatives." },
    ],
    relatedSlugs: ["hr-interview-questions-answers-india", "tell-me-about-yourself-best-answer", "ace-case-study-interviews"],
    cta: "Practice salary negotiation conversations with Hirloop's AI — simulate the back-and-forth and build your confidence before the real thing.",
  },
];

/* ─── Helpers ─── */
function getRelatedPosts(slugs: string[]): BlogPost[] {
  return slugs.map(s => posts.find(p => p.slug === s)).filter((p): p is BlogPost => !!p);
}

/* ─── Category filters ─── */
const CATEGORIES = ["All", ...Array.from(new Set(posts.map(p => p.category)))];

/* ─── Blog index (list of all posts) ─── */
function BlogIndex({ navigate }: { navigate: (path: string) => void }) {
  const [activeCategory, setActiveCategory] = useState("All");

  useSEO({
    title: "Interview Prep Blog — Hirloop",
    description: "Company-specific interview preparation guides, question banks, and career strategies for Indian job seekers. Google, Amazon, TCS, Infosys, Flipkart, and more.",
    ogType: "website",
  });

  const filtered = activeCategory === "All" ? posts : posts.filter(p => p.category === activeCategory);
  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian }}>
      {/* Nav */}
      <nav style={{ padding: "20px 40px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>Hirloop</span>
        </Link>
        <Link to="/signup" style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.obsidian,
          background: c.ivory, padding: "8px 20px", borderRadius: 10, textDecoration: "none",
        }}>Start Free Practice</Link>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gilt, marginBottom: 12 }}>Blog</p>
          <h1 style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 12 }}>
            Interview prep that actually helps
          </h1>
          <p style={{ fontFamily: font.ui, fontSize: 16, color: c.stone, lineHeight: 1.6, maxWidth: 560 }}>
            Company-specific guides, question banks, and strategies from real interview patterns.
          </p>
        </div>

        {/* Category filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 40, flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 500, padding: "7px 16px",
                borderRadius: 100, border: "none", cursor: "pointer", transition: "all 0.2s",
                background: activeCategory === cat ? c.ivory : "rgba(245,242,237,0.05)",
                color: activeCategory === cat ? c.obsidian : c.stone,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Featured post */}
        {featured && (
          <article
            onClick={() => navigate(`/blog/${featured.slug}`)}
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
              background: c.graphite, borderRadius: 16, border: `1px solid ${c.border}`,
              overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s", marginBottom: 32,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = c.borderHover; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
          >
            <div style={{ position: "relative", minHeight: 320 }}>
              <img
                src={featured.heroImage} alt={featured.heroAlt} loading="eager"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
              />
            </div>
            <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", padding: "3px 10px", background: "rgba(212,179,127,0.08)", borderRadius: 100 }}>{featured.company}</span>
                <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, padding: "3px 10px", background: "rgba(245,242,237,0.04)", borderRadius: 100 }}>{featured.category}</span>
              </div>
              <h2 style={{ fontFamily: font.display, fontSize: "clamp(22px, 2.5vw, 30px)", fontWeight: 400, color: c.ivory, lineHeight: 1.25, letterSpacing: "-0.02em", marginBottom: 12 }}>
                {featured.title}
              </h2>
              <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 16 }}>
                {featured.metaDescription}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{featured.readTime} read</span>
                <span style={{ color: c.stone }}>·</span>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{new Date(featured.datePublished).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>
          </article>
        )}

        {/* Post grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {rest.map(post => (
            <article
              key={post.slug}
              onClick={() => navigate(`/blog/${post.slug}`)}
              style={{
                background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
                overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s",
                display: "flex", flexDirection: "column",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = c.borderHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
            >
              <div style={{ position: "relative", height: 160 }}>
                <img
                  src={post.heroImage} alt={post.heroAlt} loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", padding: "2px 8px", background: "rgba(212,179,127,0.08)", borderRadius: 100 }}>{post.company}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 500, color: c.stone, padding: "2px 8px", background: "rgba(245,242,237,0.04)", borderRadius: 100 }}>{post.category}</span>
                </div>
                <h3 style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory, lineHeight: 1.35, marginBottom: 8, flex: 1 }}>
                  {post.title}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{post.readTime} read</span>
                  <span style={{ color: c.stone, fontSize: 11 }}>·</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{new Date(post.datePublished).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{
          marginTop: 56, textAlign: "center", padding: "40px 32px",
          background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.1)`,
          borderRadius: 16,
        }}>
          <p style={{ fontFamily: font.display, fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Stop reading, start practicing
          </p>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, marginBottom: 24 }}>
            AI mock interviews with instant feedback — 3 sessions free.
          </p>
          <Link to="/signup" style={{
            display: "inline-block", fontFamily: font.ui, fontSize: 14, fontWeight: 600,
            padding: "12px 32px", borderRadius: 8, textDecoration: "none",
            background: c.ivory, color: c.obsidian,
          }}>
            Get Started Free
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Single blog post ─── */
function BlogPostPage({ post }: { post: BlogPost }) {
  const url = `https://hirloop.com/blog/${post.slug}`;
  const related = getRelatedPosts(post.relatedSlugs);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Combine article + FAQ JSON-LD
  const articleLd = articleJsonLd({ title: post.title, description: post.metaDescription, url, image: post.heroImage, datePublished: post.datePublished });
  const faqLd = post.faqs.length > 0 ? faqJsonLd(post.faqs) : null;
  const combinedLd = faqLd ? { ...articleLd, "@graph": [articleLd, faqLd] } : articleLd;

  useSEO({
    title: `${post.title} — Hirloop`,
    description: post.metaDescription,
    canonical: url,
    ogImage: post.heroImage,
    ogType: "article",
    jsonLd: combinedLd,
  });

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian }}>
      {/* Nav */}
      <nav style={{ padding: "20px 40px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, letterSpacing: "0.02em" }}>Hirloop</span>
          </Link>
          <span style={{ color: c.stone, fontSize: 14 }}>/</span>
          <Link to="/blog" style={{ textDecoration: "none", fontFamily: font.ui, fontSize: 13, color: c.stone }}>Blog</Link>
        </div>
        <Link to="/signup" style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.obsidian,
          background: c.ivory, padding: "8px 20px", borderRadius: 10, textDecoration: "none",
        }}>Start Free Practice</Link>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", height: 360, overflow: "hidden" }}>
        <img
          src={post.heroImage} alt={post.heroAlt}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.35)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${c.obsidian} 0%, ${c.obsidian}80 40%, transparent 100%)` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 720, margin: "0 auto", padding: "0 40px 40px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", padding: "4px 12px", background: "rgba(212,179,127,0.12)", borderRadius: 100, backdropFilter: "blur(8px)" }}>{post.company}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk, padding: "4px 12px", background: "rgba(245,242,237,0.08)", borderRadius: 100, backdropFilter: "blur(8px)" }}>{post.category}</span>
          </div>
          <h1 style={{ fontFamily: font.display, fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {post.title}
          </h1>
        </div>
      </div>

      {/* Article meta bar */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 40px", display: "flex", alignItems: "center", gap: 16, borderBottom: `1px solid ${c.border}`, marginBottom: 40 }}>
        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{post.readTime} read</span>
        <span style={{ color: c.stone, fontSize: 10 }}>·</span>
        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{new Date(post.datePublished).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}</span>
        <span style={{ color: c.stone, fontSize: 10 }}>·</span>
        <span style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt }}>Hirloop Team</span>
      </div>

      <article style={{ maxWidth: 720, margin: "0 auto", padding: "0 40px 80px" }}>
        {/* Intro */}
        <p style={{ fontFamily: font.ui, fontSize: 17, color: c.chalk, lineHeight: 1.75, marginBottom: 48, borderLeft: `3px solid ${c.gilt}`, paddingLeft: 20 }}>
          {post.intro}
        </p>

        {/* Sections */}
        {post.sections.map((section, i) => (
          <section key={i} style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: c.ivory, marginBottom: 14, lineHeight: 1.3 }}>
              {section.heading}
            </h2>
            <div style={{ fontFamily: font.ui, fontSize: 15, color: c.chalk, lineHeight: 1.8, whiteSpace: "pre-line" }}>
              {section.content}
            </div>
            {i < post.sections.length - 1 && (
              <div style={{ width: 40, height: 1, background: c.border, margin: "40px 0 0" }} />
            )}
          </section>
        ))}

        {/* FAQ Section — accordion */}
        {post.faqs.length > 0 && (
          <section style={{ marginTop: 56, marginBottom: 48 }}>
            <h2 style={{ fontFamily: font.display, fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 400, color: c.ivory, marginBottom: 24, letterSpacing: "-0.02em" }}>
              Frequently Asked Questions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {post.faqs.map((faq, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={i} style={{ borderBottom: "1px solid #1a1a1b" }}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      style={{
                        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "18px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <span style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 500, color: c.ivory, lineHeight: 1.4, paddingRight: 16 }}>
                        {faq.question}
                      </span>
                      <svg
                        aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke={c.stone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <div style={{
                      maxHeight: isOpen ? 300 : 0, overflow: "hidden",
                      transition: "max-height 0.3s ease, padding 0.3s ease",
                      paddingBottom: isOpen ? 18 : 0,
                    }}>
                      <p style={{ fontFamily: font.ui, fontSize: 14, color: c.chalk, lineHeight: 1.7 }}>
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* CTA */}
        <div style={{
          background: `linear-gradient(135deg, rgba(212,179,127,0.08), rgba(212,179,127,0.03))`,
          border: `1px solid rgba(212,179,127,0.15)`,
          borderRadius: 16, padding: "36px 40px", textAlign: "center", marginTop: 48,
        }}>
          <p style={{ fontFamily: font.display, fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Ready to practice?
          </p>
          <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.6, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            {post.cta}
          </p>
          <Link to="/signup" style={{
            display: "inline-block", fontFamily: font.ui, fontSize: 14, fontWeight: 600,
            padding: "12px 32px", borderRadius: 8, textDecoration: "none",
            background: c.ivory, color: c.obsidian,
          }}>
            Start Free Practice
          </Link>
        </div>

        {/* Related Posts */}
        {related.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <h2 style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 20, letterSpacing: "0.02em" }}>
              Continue Reading
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(related.length, 3)}, 1fr)`, gap: 16 }}>
              {related.map(r => (
                <Link key={r.slug} to={`/blog/${r.slug}`} style={{
                  background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`,
                  textDecoration: "none", transition: "border-color 0.2s", overflow: "hidden",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = c.borderHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
                >
                  <img src={r.heroImage} alt={r.heroAlt} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    style={{ width: "100%", height: 100, objectFit: "cover" }} />
                  <div style={{ padding: "14px 16px" }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, lineHeight: 1.35, display: "block", marginBottom: 6 }}>{r.title}</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{r.readTime} read</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

/* ─── Main export ─── */
export default function BlogPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  if (!slug) {
    return <BlogIndex navigate={navigate} />;
  }

  const post = posts.find(p => p.slug === slug);
  if (!post) {
    return (
      <div style={{ minHeight: "100vh", background: c.obsidian, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <h1 style={{ fontFamily: font.display, fontSize: 32, color: c.ivory, marginBottom: 12 }}>Post Not Found</h1>
        <p style={{ fontFamily: font.ui, fontSize: 15, color: c.stone, marginBottom: 24 }}>This blog post doesn't exist.</p>
        <Link to="/blog" style={{ fontFamily: font.ui, fontSize: 14, color: c.gilt, textDecoration: "none" }}>Back to Blog</Link>
      </div>
    );
  }

  return <BlogPostPage post={post} />;
}

/* Export slugs for sitemap generation */
export const blogSlugs = posts.map(p => p.slug);

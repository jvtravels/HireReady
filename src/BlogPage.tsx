import { useParams, useNavigate, Link } from "react-router-dom";
import { c, font } from "./tokens";
import { useDocTitle } from "./useDocTitle";

/* ─── Blog post data (SEO-optimized interview prep articles) ─── */
interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  company: string;
  category: string;
  readTime: string;
  heroImage: string;
  intro: string;
  sections: { heading: string; content: string }[];
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
    intro: "Flipkart is one of India's most sought-after tech employers, with competitive compensation and challenging problems at scale. Here's everything you need to know about their interview process for SDE roles.",
    sections: [
      { heading: "Interview Structure", content: "Flipkart's process typically has 4-5 rounds:\n\n1. Online Assessment — DSA problems (2-3 questions, 90 minutes)\n2. Machine Coding Round — Build a small system in 90 minutes\n3. Problem Solving (x2) — Whiteboard DSA with follow-ups\n4. System Design — For SDE-2+ roles\n5. Hiring Manager — Behavioral + culture fit" },
      { heading: "Most-Asked DSA Topics", content: "Based on interview reports, Flipkart heavily tests:\n\n• Trees and Graphs (especially BFS/DFS variations)\n• Dynamic Programming (medium-hard level)\n• Design Patterns (Strategy, Observer, Factory)\n• Hashmaps and two-pointer techniques\n• Matrix/grid problems" },
      { heading: "Machine Coding Round Tips", content: "This is unique to Flipkart and catches many candidates off guard. You'll be asked to build a small application (e.g., a parking lot system, splitwise clone) in 90 minutes.\n\nKeys to success:\n• Use proper OOP design — interfaces, clean separation\n• Write unit tests even if not required\n• Handle edge cases\n• Keep the code extensible" },
      { heading: "Behavioral Questions to Prepare", content: "Flipkart values ownership and customer obsession:\n\n• Tell me about a time you went above and beyond for a customer/user\n• Describe a technical decision you made that had business impact\n• How do you handle disagreements in code reviews?\n• What's the most complex system you've worked on?" },
      { heading: "Compensation Expectations (2025)", content: "SDE-1: ₹18-28 LPA\nSDE-2: ₹30-50 LPA\nSDE-3: ₹50-80 LPA\nSenior Staff: ₹80 LPA+\n\nFlipkart also offers ESOPs which can significantly increase total compensation." },
    ],
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
    intro: "Campus placements are stressful — especially behavioral rounds where you feel like you have 'nothing to talk about.' The truth is: college projects, internships, hackathons, and even group assignments are valid experiences. Here's how to use them.",
    sections: [
      { heading: "The STAR Method for Freshers", content: "STAR stands for Situation, Task, Action, Result. As a fresher, your examples can come from:\n\n• College projects and capstone work\n• Internships (even 2-month ones count)\n• Hackathons and coding competitions\n• Club leadership and event organization\n• Part-time work or freelancing\n\nThe key is specificity — don't say 'I worked in a team.' Say 'I led a 4-person team to build a food delivery app in 48 hours at HackMIT.'" },
      { heading: "Top 10 Questions for TCS/Infosys/Wipro", content: "Mass recruiters ask predictable questions:\n\n1. Tell me about yourself (keep it 90 seconds)\n2. Why should we hire you?\n3. What are your strengths and weaknesses?\n4. Describe a challenging situation you faced\n5. Where do you see yourself in 5 years?\n6. Why do you want to work here?\n7. Tell me about a team project\n8. How do you handle pressure?\n9. What's your biggest achievement?\n10. Do you have any questions for us?\n\nFor each, prepare a 2-minute answer using STAR." },
      { heading: "Top 10 Questions for Product Companies", content: "Startups and product companies go deeper:\n\n1. Walk me through a project you're proud of\n2. Tell me about a time you had to learn something quickly\n3. Describe a conflict in a team and how you resolved it\n4. What's the hardest bug you've debugged?\n5. How do you approach a problem you've never seen before?\n6. Tell me about a time you failed\n7. Describe a time you went beyond what was asked\n8. How do you prioritize when you have multiple deadlines?\n9. Tell me about a time you gave or received difficult feedback\n10. What would you do in your first 30 days here?" },
      { heading: "Questions About Your Projects", content: "Every fresher gets asked about their projects. Be ready for:\n\n• What was your specific contribution?\n• What was the most challenging part?\n• What would you do differently?\n• How did you handle disagreements in the team?\n• What did you learn that you couldn't learn in class?\n\nTip: Know your project's architecture, your design decisions, and the alternatives you considered." },
      { heading: "Common Mistakes Freshers Make", content: "1. Memorizing scripted answers (interviewers can tell)\n2. Using 'we' for everything (they want to know YOUR role)\n3. Giving vague answers without numbers or outcomes\n4. Not preparing questions to ask the interviewer\n5. Treating HR rounds as 'easy' — they have elimination power\n\nThe fix: Practice out loud. Record yourself. Get feedback on filler words, pacing, and structure." },
    ],
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
    intro: "Razorpay has grown into one of India's most valuable fintech companies. Their interview process emphasizes problem-solving depth and ownership mindset. Here's what to expect.",
    sections: [
      { heading: "Interview Process Overview", content: "Razorpay's hiring loop:\n\n1. Recruiter screen (30 min) — background, motivation, salary expectations\n2. Online coding round — 2 DSA problems, 60 minutes\n3. Technical round 1 — DSA + problem decomposition\n4. Technical round 2 — System design (for SDE-2+)\n5. Culture round — Values alignment, ownership stories\n6. Hiring manager — Final bar raiser" },
      { heading: "What Razorpay Values", content: "Razorpay's culture centers on:\n\n• Ownership — They want people who treat problems as their own, not someone else's\n• Speed — Fintech moves fast; they value velocity with quality\n• Customer empathy — Understanding merchant pain points\n• Technical depth — Not just using tools, but understanding how they work\n\nIn behavioral rounds, tell stories that demonstrate these values." },
      { heading: "System Design Focus Areas", content: "Razorpay system design questions often relate to payments:\n\n• Design a payment gateway\n• Design a retry mechanism for failed transactions\n• Design a notification system at scale\n• Design an idempotent API\n\nKey: Always discuss consistency, reliability, and failure handling. In fintech, a bug can mean lost money." },
      { heading: "Salary Expectations (2025)", content: "SDE-1: ₹15-25 LPA\nSDE-2: ₹28-45 LPA\nSDE-3: ₹50-70 LPA\nPM: ₹25-50 LPA\n\nRazorpay offers competitive ESOPs and a strong learning environment." },
    ],
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
    intro: "Case study interviews test your ability to structure ambiguous problems, analyze data, and communicate recommendations clearly. Whether you're interviewing for McKinsey, a product role, or a startup strategy position — the core skills are the same.",
    sections: [
      { heading: "The Universal Case Framework", content: "Every case can be broken into four steps:\n\n1. Clarify — Ask questions to narrow the problem scope\n2. Structure — Create a framework (don't force-fit MECE; adapt to the problem)\n3. Analyze — Work through each branch with data and logic\n4. Recommend — State your answer, the key driver, risks, and next steps\n\nThe biggest mistake? Jumping to step 3 without doing step 1 properly." },
      { heading: "Market Sizing Questions", content: "Example: 'How many electric scooters are sold in India per year?'\n\nApproach:\n• Start with India's population (~1.4B)\n• Urban population: ~500M\n• Two-wheeler households: ~35% = 175M\n• Annual purchase rate: ~8% (new + replacement) = 14M\n• EV penetration: ~10% = 1.4M electric scooters/year\n\nAlways state assumptions, check reasonableness, and note what data you'd verify." },
      { heading: "Profitability Cases", content: "Framework: Revenue (Price x Volume) - Costs (Fixed + Variable)\n\nAlways ask:\n• Is the decline in revenue, increase in costs, or both?\n• When did it start? What changed?\n• Is it affecting the entire market or just this company?\n\nThen drill into the specific branch that's causing the issue." },
      { heading: "Product Strategy Cases", content: "Example: 'Should Swiggy launch a grocery delivery service?'\n\nStructure:\n1. Market attractiveness — TAM, growth, competition\n2. Strategic fit — Synergies with existing business, brand alignment\n3. Feasibility — Operational capability, investment required\n4. Risks — Cannibalization, regulatory, execution risk\n5. Recommendation with conditions" },
      { heading: "Practice Tips", content: "1. Practice out loud — case interviews are oral exams\n2. Write your structure before speaking\n3. Do mental math daily (no calculator in case interviews)\n4. Read business news — cases are inspired by real scenarios\n5. Record yourself and review for filler words and unclear transitions" },
    ],
    cta: "Practice case study interviews on Hirloop — the AI will play the interviewer, give you data when asked, and score your structure and recommendation.",
  },
];

/* ─── Blog index (list of all posts) ─── */
function BlogIndex({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div style={{ minHeight: "100vh", background: c.obsidian }}>
      <nav style={{ padding: "20px 40px", borderBottom: `1px solid ${c.border}` }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>Hirloop</span>
        </Link>
      </nav>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 40px" }}>
        <h1 style={{ fontFamily: font.display, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Interview Prep Blog
        </h1>
        <p style={{ fontFamily: font.ui, fontSize: 16, color: c.stone, lineHeight: 1.6, marginBottom: 48 }}>
          Company-specific guides, question banks, and strategies to help you land your dream role.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {posts.map(post => (
            <article
              key={post.slug}
              onClick={() => navigate(`/blog/${post.slug}`)}
              style={{
                background: c.graphite, borderRadius: 14, border: `1px solid ${c.border}`,
                overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = c.borderHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = c.border; }}
            >
              <img
                src={post.heroImage}
                alt=""
                loading="lazy"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                style={{ width: "100%", height: 180, objectFit: "cover" }}
              />
              <div style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", padding: "3px 10px", background: "rgba(201,169,110,0.08)", borderRadius: 100 }}>{post.company}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{post.readTime} read</span>
                </div>
                <h2 style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 600, color: c.ivory, lineHeight: 1.35, marginBottom: 8 }}>{post.title}</h2>
                <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.5 }}>{post.metaDescription}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Single blog post ─── */
function BlogPostPage({ post }: { post: BlogPost }) {
  useDocTitle(post.title);

  return (
    <div style={{ minHeight: "100vh", background: c.obsidian }}>
      <nav style={{ padding: "20px 40px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 16 }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, letterSpacing: "0.06em" }}>Hirloop</span>
        </Link>
        <span style={{ color: c.stone }}>/</span>
        <Link to="/blog" style={{ textDecoration: "none", fontFamily: font.ui, fontSize: 13, color: c.stone }}>Blog</Link>
      </nav>

      {/* Hero */}
      <div style={{ position: "relative", height: 300, overflow: "hidden" }}>
        <img
          src={post.heroImage}
          alt=""
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.4)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${c.obsidian}, transparent)` }} />
      </div>

      <article style={{ maxWidth: 720, margin: "-80px auto 0", padding: "0 40px 80px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.04em", padding: "3px 10px", background: "rgba(201,169,110,0.08)", borderRadius: 100 }}>{post.company}</span>
          <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, letterSpacing: "0.04em", padding: "3px 10px", background: "rgba(240,237,232,0.04)", borderRadius: 100 }}>{post.category}</span>
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, padding: "3px 0" }}>{post.readTime} read</span>
        </div>

        <h1 style={{ fontFamily: font.display, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 400, color: c.ivory, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 24 }}>
          {post.title}
        </h1>

        <p style={{ fontFamily: font.ui, fontSize: 16, color: c.chalk, lineHeight: 1.7, marginBottom: 40 }}>
          {post.intro}
        </p>

        {post.sections.map((section, i) => (
          <section key={i} style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 600, color: c.ivory, marginBottom: 12, lineHeight: 1.3 }}>
              {section.heading}
            </h2>
            <div style={{ fontFamily: font.ui, fontSize: 15, color: c.chalk, lineHeight: 1.75, whiteSpace: "pre-line" }}>
              {section.content}
            </div>
          </section>
        ))}

        {/* CTA */}
        <div style={{
          background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`,
          borderRadius: 14, padding: "32px 36px", textAlign: "center", marginTop: 48,
        }}>
          <p style={{ fontFamily: font.ui, fontSize: 15, color: c.chalk, lineHeight: 1.6, marginBottom: 20 }}>
            {post.cta}
          </p>
          <Link to="/signup" style={{
            display: "inline-block", fontFamily: font.ui, fontSize: 14, fontWeight: 600,
            padding: "12px 32px", borderRadius: 8, textDecoration: "none",
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian,
          }}>
            Start Free Practice
          </Link>
        </div>
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

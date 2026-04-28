import { describe, it, expect } from "vitest";
import { computeMicroFeedback } from "../interviewMicroFeedback";

/** Helper: generate padding words to meet word-count thresholds */
function pad(base: string, targetWords: number): string {
  const current = base.trim().split(/\s+/).length;
  if (current >= targetWords) return base;
  const extra = Array.from({ length: targetWords - current }, (_, i) => `extra${i}`).join(" ");
  return `${base} ${extra}`;
}

describe("computeMicroFeedback", () => {
  describe("salary-negotiation", () => {
    it("penalizes accepting too quickly", () => {
      const r = computeMicroFeedback("Sounds good, I accept!", "salary-negotiation", []);
      expect(r.feedback).toContain("Don't accept too quickly");
    });

    it("penalizes outright rejection with short answer", () => {
      const r = computeMicroFeedback("That's way too low, absolutely not.", "salary-negotiation", []);
      expect(r.feedback).toContain("Stay open and professional");
      expect(r.score).toBeLessThan(50);
    });

    it("rewards mentioning numbers and benefits together", () => {
      const r = computeMicroFeedback(
        pad("I would expect around 25 lakh base with equity vesting and flexible remote work along with a learning budget and insurance coverage for me and my family", 35),
        "salary-negotiation",
        [],
      );
      expect(r.feedback).toContain("Strong negotiation");
      expect(r.score).toBeGreaterThanOrEqual(80);
    });

    it("suggests discussing benefits when only numbers mentioned", () => {
      const text = pad("I am looking for around 20 lakh per annum based on my market research and current compensation level in the industry", 35);
      const r = computeMicroFeedback(text, "salary-negotiation", []);
      expect(r.feedback).toContain("beyond base");
    });

    it("tips on elaborating for very short answers with a number", () => {
      const r = computeMicroFeedback("20 lpa", "salary-negotiation", []);
      expect(r.feedback).toContain("Elaborate");
      expect(r.feedback).toContain("number");
    });

    it("tips on sharing detail for very short answers without a number", () => {
      const r = computeMicroFeedback("I would like to accept this offer.", "salary-negotiation", []);
      expect(r.feedback).toContain("Share more detail");
      expect(r.feedback).not.toContain("number");
    });

    it("warns verbose answers to stay concise", () => {
      const text = pad("I think we should discuss", 110);
      const r = computeMicroFeedback(text, "salary-negotiation", []);
      expect(r.feedback).toContain("concise");
    });

    it("recognizes competing offers", () => {
      const text = pad("I have another company offering me a better package and I am considering their counter offer seriously as well right now", 35);
      const r = computeMicroFeedback(text, "salary-negotiation", []);
      expect(r.feedback).toContain("leverage");
    });

    it("clamps score to [0, 100]", () => {
      const r = computeMicroFeedback("No way", "salary-negotiation", []);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });
  });

  describe("government-psu", () => {
    it("asks to elaborate for short answers", () => {
      const r = computeMicroFeedback("Policy is important.", "government-psu", []);
      expect(r.feedback).toContain("Elaborate more");
    });

    it("suggests policy references when missing", () => {
      const text = pad("I think the situation requires careful analysis and a good understanding of the problems involved in this area of governance and public administration work", 55);
      const r = computeMicroFeedback(text, "government-psu", []);
      expect(r.feedback).toContain("policies");
    });

    it("asks for balanced perspective when policy mentioned but not balanced", () => {
      const text = pad("The NEP policy introduced by the ministry focuses on transforming the education system with new curriculum guidelines and assessment frameworks for all levels of schooling across the nation", 55);
      const r = computeMicroFeedback(text, "government-psu", []);
      expect(r.feedback).toContain("balanced");
    });

    it("praises policy-aware and balanced answers", () => {
      const text = pad("The RTI Act has improved transparency in government departments however on the other hand its implementation faces challenges in rural districts due to limited infrastructure and awareness among citizens", 55);
      const r = computeMicroFeedback(text, "government-psu", []);
      expect(r.feedback).toContain("Strong answer");
    });
  });

  describe("case-study", () => {
    it("requests structure for short answers", () => {
      const r = computeMicroFeedback("Increase revenue.", "case-study", []);
      expect(r.feedback).toContain("structured thinking");
    });

    it("suggests structure when neither framework nor structure present", () => {
      const text = pad("The company should focus on growth and improving their market position through better products and services for their growing customer base in the region they operate in", 55);
      const r = computeMicroFeedback(text, "case-study", []);
      expect(r.feedback).toContain("Structure your answer");
    });

    it("asks for data when structured but no data", () => {
      const text = pad("First I would analyze the market segment carefully then second I would identify key customer groups and third I would prioritize the highest value opportunities for growth", 55);
      const r = computeMicroFeedback(text, "case-study", []);
      expect(r.feedback).toContain("data");
    });

    it("praises framework + data", () => {
      const text = pad("My hypothesis is that the funnel drops at checkout and based on the cohort analysis 30% of users abandon at that step so I recommend an A/B test targeting 15% improvement in conversion rate", 55);
      const r = computeMicroFeedback(text, "case-study", []);
      expect(r.feedback).toContain("Excellent");
    });
  });

  describe("hr-round", () => {
    it("requests elaboration for short answers", () => {
      const r = computeMicroFeedback("I work hard.", "hr-round", []);
      expect(r.feedback).toContain("thoughtful");
    });

    it("suggests self-awareness when missing motivation and awareness", () => {
      const text = pad("The company has a great product and the market opportunity is strong with plenty of potential in this sector going forward in the coming years", 45);
      const r = computeMicroFeedback(text, "hr-round", []);
      expect(r.feedback).toContain("self-awareness");
    });

    it("suggests cultural fit when awareness present but no team mention", () => {
      const text = pad("I realized my strength is in problem solving and I have improved significantly through feedback and continuous growth over the years which taught me a lot about myself", 45);
      const r = computeMicroFeedback(text, "hr-round", []);
      expect(r.feedback).toContain("teamwork");
    });

    it("praises self-aware and motivated answers", () => {
      const text = pad("I am passionate about building products and I realized through feedback that my strength is in motivating teams through collaboration and support of everyone involved", 45);
      const r = computeMicroFeedback(text, "hr-round", []);
      // self-awareness + motivation + cultural fit all present => "Great — authentic..."
      expect(r.feedback).toContain("authentic");
    });
  });

  describe("management", () => {
    it("requests depth for short answers", () => {
      const r = computeMicroFeedback("I delegate well.", "management", []);
      expect(r.feedback).toContain("depth");
    });

    it("suggests people focus when missing", () => {
      const text = pad("I improved the deployment pipeline and optimized our infrastructure to reduce costs significantly while increasing system reliability metrics across all of our production services", 55);
      const r = computeMicroFeedback(text, "management", []);
      expect(r.feedback).toContain("people");
    });

    it("praises people-focused answers with outcomes", () => {
      const text = pad("I coached my team members through regular 1:1s and provided feedback sessions and the result was a 40% improvement in delivery speed which shipped features on time consistently", 55);
      const r = computeMicroFeedback(text, "management", []);
      expect(r.feedback).toContain("Strong");
    });
  });

  describe("campus-placement", () => {
    it("requests more for very short answers", () => {
      const r = computeMicroFeedback("I like coding.", "campus-placement", []);
      expect(r.feedback).toContain("say a bit more");
    });

    it("suggests concrete examples when missing", () => {
      const text = pad("I am a very hardworking person with strong analytical skills and a willingness to learn new technologies quickly and adapt to new situations", 45);
      const r = computeMicroFeedback(text, "campus-placement", []);
      expect(r.feedback).toContain("project");
    });

    it("praises project + learning answers", () => {
      const text = pad("I built a hackathon project for accessibility and I learned that user research is critical to building products that actually work well for real users", 45);
      const r = computeMicroFeedback(text, "campus-placement", []);
      expect(r.feedback).toContain("Great answer");
    });
  });

  describe("standard fallback (unknown type)", () => {
    it("falls through to standard for unknown interview types", () => {
      const text = pad("I led a project where we achieved 50% cost reduction and first we identified bottlenecks then I coordinated the team to resolve them systematically", 55);
      const r = computeMicroFeedback(text, "technical", []);
      expect(r.score).toBeGreaterThan(50);
      expect(r.feedback).not.toBeNull();
    });

    it("penalizes very short standard answers", () => {
      const r = computeMicroFeedback("Yes I can.", "behavioral", []);
      expect(r.feedback).toContain("elaborate");
    });

    it("adjusts feedback for excelling candidates", () => {
      const text = pad("We achieved 200% growth with 50 users and first we redesigned the experience then we shipped it and the result was a 3x improvement in engagement", 55);
      const r = computeMicroFeedback(text, "behavioral", [85, 90]);
      expect(r.feedback).toBeDefined();
    });

    it("adjusts feedback for struggling candidates", () => {
      const r = computeMicroFeedback("I did stuff at work.", "behavioral", [30, 40]);
      expect(r.feedback).toContain("2-3 sentences");
    });

    it("score is always within [0, 100]", () => {
      const r1 = computeMicroFeedback("ok", "behavioral", []);
      expect(r1.score).toBeGreaterThanOrEqual(0);
      expect(r1.score).toBeLessThanOrEqual(100);

      const r2 = computeMicroFeedback(
        pad("I personally led a team of 50 engineers and first we identified the problem then we shipped a solution that achieved 200% growth and $5M revenue without this the company would have failed completely", 110),
        "behavioral",
        [],
      );
      expect(r2.score).toBeGreaterThanOrEqual(0);
      expect(r2.score).toBeLessThanOrEqual(100);
    });
  });
});

/**
 * Company-specific interview guidance. Used by generate-questions.ts as an
 * in-code fallback when server-handlers/_role-content.ts returns null (i.e.
 * when the company_guidance Supabase table has no row for the slug, which
 * is the default today).
 *
 * Extracted from generate-questions.ts so that file stays focused on
 * request-handling logic and this file can be imported by tests + eventually
 * by a seed script that populates the DB.
 */

export const COMPANY_GUIDANCE: Record<string, string> = {
  tcs: "TCS interviews follow NQT (National Qualifier Test) pattern. Focus on: technical fundamentals (DSA, DBMS, OS, networking), HR questions about adaptability and teamwork, and coding aptitude. Ask about willingness to relocate, work in shifts, and handle client-facing roles. TCS values process orientation and learning agility.",
  infosys: "Infosys interviews follow InfyTQ pattern. Focus on: Java/Python fundamentals, puzzle-solving, logical reasoning, and HR questions about innovation and continuous learning. Infosys values design thinking and digital transformation mindset. Ask about experience with agile methodologies.",
  wipro: "Wipro NLTH (National Level Talent Hunt) pattern. Focus on: coding aptitude, technical fundamentals, and HR questions about adaptability. Wipro values spirit of being Wipro (integrity, customer-centricity). Ask about handling ambiguity and cross-functional collaboration.",
  accenture: "Accenture interviews emphasize consulting skills, communication, and problem-solving. Focus on: case studies, client interaction scenarios, technology awareness (cloud, AI, digital). Accenture values innovation, inclusion, and stewardship. Ask about managing stakeholder expectations.",
  cognizant: "Cognizant GenC/GenC Next pattern. Focus on: coding skills (Java/Python), SDLC knowledge, and HR questions about team dynamics. Cognizant values digital engineering and modernization. Ask about experience with legacy system transformation.",
  google: "Google interviews follow structured behavioral + technical format. Focus on: Googleyness (intellectual humility, collaboration, bias to action), leadership (even without authority), and role-related knowledge. Use the STAR format. Ask about ambiguous problem-solving and data-driven decisions.",
  microsoft: "Microsoft interviews emphasize growth mindset, collaboration, and customer obsession. Focus on: system design thinking, behavioral scenarios about influence and impact, and technical depth in the relevant stack. Ask about learning from failures.",
  amazon: "Amazon interviews are heavily LP (Leadership Principles) driven. Focus on: Customer Obsession, Ownership, Invent and Simplify, Bias for Action, Deliver Results. Every question should map to an LP. Expect deep-dive follow-ups like 'What would you do differently?' and 'Give me the metrics.'",
  flipkart: "Flipkart interviews emphasize scale, India-specific e-commerce challenges, and product thinking. Focus on: system design for scale, data-driven decision making, and startup-like ownership mentality. Ask about handling competing priorities and fast execution.",
  meta: "Meta interviews focus on impact, move fast, and be bold. Ask about scaling systems, building for billions of users, and cross-functional collaboration. Behavioral questions should explore how candidates handle disagreement, prioritize ruthlessly, and measure success.",
};

/**
 * Given a free-text company name, return the best-matching guidance entry
 * (key + body) or empty strings if no match. Kept pure so it's trivially
 * testable — see src/__tests__/roleContentMatch.test.ts.
 */
export function matchCompanyKey(company: string): { key: string; fallback: string } {
  if (!company) return { key: "", fallback: "" };
  const normalized = company.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(COMPANY_GUIDANCE)) {
    if (normalized.includes(k) || k.includes(normalized)) return { key: k, fallback: v };
  }
  return { key: "", fallback: "" };
}

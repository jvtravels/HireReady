/**
 * Company-tier classifier for the Indian job market.
 *
 * Different companies interview very differently:
 *  - Tier-1 service (TCS, Infosys, Wipro): formal, hierarchy-aware, heavy on
 *    notice-period & joining-formality questions.
 *  - Tier-1 product Indian (Razorpay, Zerodha, Cred): founder-mode, fast,
 *    casual, deep on craft and ownership.
 *  - Tier-1 product global (Google India, Amazon India, Microsoft):
 *    Western corporate tone, leadership principles, system-design heavy.
 *  - Startup early-stage: scrappy, "first 30 days", ownership over polish.
 *  - Default: balanced behavioral/HR mix, no special tilt.
 */

export type CompanyTier =
  | "service"
  | "product-india"
  | "product-global"
  | "startup"
  | "default";

const SERVICE_COS = [
  "tcs", "tata consultancy", "infosys", "wipro", "cognizant", "hcl",
  "tech mahindra", "capgemini", "accenture", "mindtree", "ltimindtree",
  "lti", "mphasis", "persistent", "hexaware", "coforge", "ibm",
  "deloitte", "ey", "pwc", "kpmg", "genpact", "sapient", "dxc",
];

const PRODUCT_INDIA_COS = [
  "razorpay", "zerodha", "cred", "phonepe", "flipkart", "swiggy",
  "zomato", "paytm", "meesho", "dream11", "nykaa", "freshworks",
  "zoho", "byju", "upgrad", "unacademy", "vedantu", "ola", "oyo",
  "make my trip", "makemytrip", "policybazaar", "lenskart", "urban company",
  "urbanclap", "delhivery", "rivigo", "bigbasket", "dunzo", "groww",
  "upstox", "smallcase", "khatabook", "cashfree", "pine labs", "pinelabs",
  "myntra", "dailyhunt", "sharechat", "inshorts", "moengage", "browserstack",
  "postman", "icertis", "darwinbox", "drip capital", "open financial",
  "chargebee", "freshdesk",
];

const PRODUCT_GLOBAL_COS = [
  "google", "amazon", "microsoft", "meta", "facebook", "apple", "netflix",
  "uber", "adobe", "linkedin", "salesforce", "atlassian", "stripe",
  "twilio", "shopify", "intuit", "cisco", "oracle", "vmware", "nvidia",
  "intel", "qualcomm", "samsung", "yahoo", "ebay", "walmart labs",
  "expedia", "booking", "airbnb", "snap", "twitter", "x corp", "lyft",
  "doordash", "instacart", "spotify", "dropbox", "gitlab", "databricks",
  "snowflake", "mongodb", "elastic", "confluent", "hashicorp", "okta",
  "cloudflare", "fastly", "datadog", "splunk", "servicenow",
  "workday", "sap", "siemens", "thoughtworks",
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Match `term` only at word boundaries inside `n` so "ola" doesn't match "foolabs". */
function wordMatch(n: string, term: string): boolean {
  // term may contain spaces; pad both sides with space sentinels for cheap boundary check
  return ` ${n} `.includes(` ${term} `);
}

export function classifyCompanyTier(company?: string | null): CompanyTier {
  if (!company) return "default";
  const n = normalize(company);
  if (!n) return "default";
  for (const term of PRODUCT_GLOBAL_COS) if (wordMatch(n, term)) return "product-global";
  for (const term of PRODUCT_INDIA_COS) if (wordMatch(n, term)) return "product-india";
  for (const term of SERVICE_COS) if (wordMatch(n, term)) return "service";
  // "labs" / "ai" can appear as a CamelCase suffix ("BrightLabs") — normalization
  // strips the boundary, so accept the suffix form too.
  if (/(\blabs?\b|labs?$|\bai\b|ai$|\bseed\b|\bstealth\b)/i.test(n) || /\.(io|ai)\b/i.test(company)) return "startup";
  return "default";
}

export function tierPromptSuffix(tier: CompanyTier): string {
  switch (tier) {
    case "service":
      return [
        "COMPANY CULTURE: This is a tier-1 Indian IT services / consulting company (TCS, Infosys, Wipro tier).",
        "Interviews here are formal, slightly hierarchical, and emphasize: process discipline, communication clarity,",
        "willingness to work in teams, basic technical fundamentals over deep specialization, and notice-period /",
        "joining-formality readiness. Tone should be polite and respectful. Avoid casual slang.",
      ].join(" ");
    case "product-india":
      return [
        "COMPANY CULTURE: This is an Indian product company / unicorn (Razorpay, Zerodha, Cred, Flipkart tier).",
        "Interviews here are founder-mode: fast, casual, depth-oriented, low on hierarchy, high on craft and ownership.",
        "Push hard on actual contributions, metrics they personally moved, scrappy decision-making under uncertainty.",
        "Tone should be conversational and direct — first names, no Sir/Ma'am. Less formality, more substance.",
      ].join(" ");
    case "product-global":
      return [
        "COMPANY CULTURE: This is a global product company's India office (Google, Amazon, Microsoft tier).",
        "Interviews follow Western corporate structure: leadership principles, structured behavioral framework",
        "(STAR), system-design depth at senior levels, emphasis on scalability, ambiguity handling, and",
        "cross-cultural collaboration. Tone should be professional, structured, and clear. Expect rigor.",
      ].join(" ");
    case "startup":
      return [
        "COMPANY CULTURE: This is an early-stage startup.",
        "Interviews here emphasize: ownership over polish, what would you do in your first 30 days, comfort",
        "with ambiguity, willingness to wear multiple hats, scrappiness over process. Push on autonomous",
        "execution and learning velocity. Tone should be casual, founder-style, and direct.",
      ].join(" ");
    default:
      return "";
  }
}

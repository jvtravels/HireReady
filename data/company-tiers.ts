/**
 * Company-to-tier classification for salary lookups.
 * Tiers determine the salary band used for a given role + experience level.
 *
 * Source: india-salary-research-2025-26.md, Levels.fyi, AmbitionBox
 */

export type CompanyTier =
  | "faang"
  | "big-tech"
  | "indian-unicorn"
  | "it-services"
  | "startup-early"
  | "startup-growth"
  | "consulting-mbb"
  | "consulting-big4"
  | "bfsi-global"
  | "bfsi-domestic"
  | "government-psu"
  | "fmcg-mnc"
  | "edtech"
  | "saas-product";

/** Lowercase company name → tier */
const COMPANY_TIER_MAP: Record<string, CompanyTier> = {
  // FAANG / MAANG
  google: "faang", alphabet: "faang",
  amazon: "faang",
  meta: "faang", facebook: "faang",
  apple: "faang",
  netflix: "faang",
  microsoft: "faang", // Pays FAANG-tier in India

  // Big Tech (non-FAANG)
  adobe: "big-tech",
  oracle: "big-tech",
  sap: "big-tech",
  salesforce: "big-tech",
  servicenow: "big-tech",
  intuit: "big-tech",
  atlassian: "big-tech",
  ibm: "big-tech",
  cisco: "big-tech",
  intel: "big-tech",
  nvidia: "big-tech",
  qualcomm: "big-tech",
  linkedin: "big-tech",
  uber: "big-tech",
  spotify: "big-tech",
  airbnb: "big-tech",
  shopify: "big-tech",
  stripe: "big-tech",
  paypal: "big-tech",
  visa: "big-tech",
  mastercard: "big-tech",
  github: "big-tech",
  gitlab: "big-tech",
  figma: "big-tech",
  notion: "big-tech",
  twilio: "big-tech",
  openai: "big-tech",
  anthropic: "big-tech",
  deepmind: "big-tech",
  "scale ai": "big-tech",

  // Indian Unicorns
  flipkart: "indian-unicorn",
  meesho: "indian-unicorn",
  nykaa: "indian-unicorn",
  swiggy: "indian-unicorn",
  zomato: "indian-unicorn",
  razorpay: "indian-unicorn",
  phonepe: "indian-unicorn",
  paytm: "indian-unicorn",
  cred: "indian-unicorn",
  zerodha: "indian-unicorn",
  groww: "indian-unicorn",
  ola: "indian-unicorn",
  delhivery: "indian-unicorn",
  ather: "indian-unicorn",
  dream11: "indian-unicorn",
  myntra: "indian-unicorn",
  lenskart: "indian-unicorn",
  boat: "indian-unicorn",
  rapido: "indian-unicorn",
  dunzo: "indian-unicorn",
  urbancompany: "indian-unicorn",
  makemytrip: "indian-unicorn",
  oyo: "indian-unicorn",

  // IT Services
  tcs: "it-services",
  "tata consultancy": "it-services",
  "tata consultancy services": "it-services",
  infosys: "it-services",
  wipro: "it-services",
  hcl: "it-services",
  "hcl technologies": "it-services",
  "hcltech": "it-services",
  "tech mahindra": "it-services",
  cognizant: "it-services",
  "cognizant technology solutions": "it-services",
  capgemini: "it-services",
  accenture: "it-services",
  ltimindtree: "it-services",
  "lti mindtree": "it-services",
  "l&t infotech": "it-services",
  mphasis: "it-services",
  mindtree: "it-services",

  // Consulting — MBB
  mckinsey: "consulting-mbb",
  "mckinsey & company": "consulting-mbb",
  bcg: "consulting-mbb",
  bain: "consulting-mbb",
  "bain & company": "consulting-mbb",
  "boston consulting": "consulting-mbb",
  "boston consulting group": "consulting-mbb",

  // Consulting — Big 4
  deloitte: "consulting-big4",
  pwc: "consulting-big4",
  "pricewaterhousecoopers": "consulting-big4",
  ey: "consulting-big4",
  kpmg: "consulting-big4",
  "ernst & young": "consulting-big4",
  "ernst young": "consulting-big4",

  // BFSI — Global IB
  "goldman sachs": "bfsi-global",
  "jp morgan": "bfsi-global",
  jpmorgan: "bfsi-global",
  "morgan stanley": "bfsi-global",
  "deutsche bank": "bfsi-global",
  barclays: "bfsi-global",
  "bank of america": "bfsi-global",
  citi: "bfsi-global",
  citibank: "bfsi-global",
  "credit suisse": "bfsi-global",
  ubs: "bfsi-global",
  hsbc: "bfsi-global",

  // BFSI — Domestic
  "hdfc bank": "bfsi-domestic",
  "icici bank": "bfsi-domestic",
  sbi: "bfsi-domestic",
  "kotak mahindra": "bfsi-domestic",
  "axis bank": "bfsi-domestic",
  "bajaj finance": "bfsi-domestic",
  "hdfc life": "bfsi-domestic",
  rbi: "bfsi-domestic",
  sebi: "bfsi-domestic",

  // Government / PSU (actual government-owned entities)
  isro: "government-psu",
  drdo: "government-psu",
  bhel: "government-psu",
  ntpc: "government-psu",
  ongc: "government-psu",
  bsnl: "government-psu",
  "indian railways": "government-psu",
  "indian oil": "government-psu",
  iocl: "government-psu",
  sail: "government-psu",
  gail: "government-psu",
  "coal india": "government-psu",
  hal: "government-psu",
  "hindustan aeronautics": "government-psu",

  // Large Indian conglomerates & private corporates
  "l&t": "indian-unicorn",
  "larsen & toubro": "indian-unicorn",
  "l&t infotech": "it-services",
  "tata motors": "indian-unicorn",
  "maruti suzuki": "indian-unicorn",
  "mahindra & mahindra": "indian-unicorn",
  "tata group": "indian-unicorn",
  "reliance industries": "indian-unicorn",
  reliance: "indian-unicorn",
  "adani group": "indian-unicorn",
  adani: "indian-unicorn",
  "mahindra group": "indian-unicorn",
  mahindra: "indian-unicorn",
  "jio": "indian-unicorn",
  "reliance jio": "indian-unicorn",
  airtel: "indian-unicorn",
  "bharti airtel": "indian-unicorn",
  vodafone: "indian-unicorn",
  "vodafone idea": "indian-unicorn",
  "hindustan unilever": "fmcg-mnc",
  hul: "fmcg-mnc",
  itc: "fmcg-mnc",
  nestle: "fmcg-mnc",

  // EdTech
  "byju's": "edtech", byjus: "edtech",
  unacademy: "edtech",
  upgrad: "edtech",
  "physics wallah": "edtech",
  scaler: "edtech",

  // SaaS / Product
  freshworks: "saas-product",
  zoho: "saas-product",
  postman: "saas-product",
  browserstack: "saas-product",

  // Startup keywords
  "pre-seed": "startup-early",
  seed: "startup-early",
  "series a": "startup-growth",
  "series b": "startup-growth",
  "series c": "startup-growth",
};

/** Tier display names for compact salary context */
export const TIER_LABELS: Record<CompanyTier, string> = {
  faang: "FAANG/Big Tech",
  "big-tech": "Top Tech",
  "indian-unicorn": "Indian Unicorn",
  "it-services": "IT Services",
  "startup-early": "Early-stage Startup",
  "startup-growth": "Growth Startup",
  "consulting-mbb": "MBB Consulting",
  "consulting-big4": "Big 4",
  "bfsi-global": "Global Bank/IB",
  "bfsi-domestic": "Domestic Bank",
  "government-psu": "Government/PSU/Conglomerate",
  "fmcg-mnc": "FMCG/MNC",
  edtech: "EdTech",
  "saas-product": "SaaS/Product",
};

/**
 * Resolve a free-text company name to its tier.
 * Uses substring matching similar to getCompanyGuidance().
 */
export function getCompanyTier(company: string | undefined | null): CompanyTier | null {
  if (!company) return null;
  const key = company.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 &]/g, "").trim();

  // Direct match
  if (COMPANY_TIER_MAP[key]) return COMPANY_TIER_MAP[key];

  // Substring match (both directions)
  for (const [k, tier] of Object.entries(COMPANY_TIER_MAP)) {
    if (key.includes(k) || k.includes(key)) return tier;
  }

  // Check for startup/enterprise keywords
  if (key.includes("startup")) return "startup-growth";
  if (key.includes("government") || key.includes("psu") || key.includes("ministry") || key.includes("railways") || key.includes("defence")) return "government-psu";
  if (key.includes("mnc") || key.includes("enterprise")) return "big-tech";
  if (key.includes("bank") || key.includes("finance") || key.includes("insurance")) return "bfsi-domestic";
  if (key.includes("consult")) return "consulting-big4";
  if (key.includes("edtech") || key.includes("education") || key.includes("learning")) return "edtech";
  if (key.includes("saas") || key.includes("software") || key.includes("tech")) return "saas-product";
  if (key.includes("services") || key.includes("solutions") || key.includes("infotech") || key.includes("technologies")) return "it-services";
  if (key.includes("fmcg") || key.includes("consumer") || key.includes("retail")) return "fmcg-mnc";

  return null; // unknown company — caller defaults to indian-unicorn
}

/**
 * Map certain tiers to equivalent salary tiers for lookup fallback.
 * e.g., saas-product companies pay similarly to indian-unicorn tier.
 */
export function getSalaryTierFallback(tier: CompanyTier): CompanyTier {
  switch (tier) {
    case "saas-product": return "indian-unicorn";
    case "edtech": return "startup-growth";
    case "fmcg-mnc": return "indian-unicorn";
    case "big-tech": return "faang"; // close enough for salary ranges
    default: return tier;
  }
}

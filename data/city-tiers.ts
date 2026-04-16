/**
 * Indian city tier classification and salary multipliers.
 * Tier 1 = major tech hubs (Bangalore baseline = 1.0x)
 * Tier 2 = secondary metros
 * Tier 3 = all other cities
 *
 * Source: india-salary-research-2025-26.md, ResumeGyani city-wise data
 */

export type CityTier = "tier1" | "tier2" | "tier3";

const CITY_TIER_MAP: Record<string, CityTier> = {
  // Tier 1 — major tech hubs
  bangalore: "tier1", bengaluru: "tier1",
  mumbai: "tier1", bombay: "tier1",
  delhi: "tier1", "delhi ncr": "tier1", "new delhi": "tier1",
  gurgaon: "tier1", gurugram: "tier1",
  noida: "tier1", "greater noida": "tier1",
  ghaziabad: "tier1", faridabad: "tier1",
  hyderabad: "tier1",
  pune: "tier1",

  // Tier 2 — secondary metros
  chennai: "tier2",
  kolkata: "tier2", calcutta: "tier2",
  ahmedabad: "tier2",
  jaipur: "tier2",
  chandigarh: "tier2", mohali: "tier2",
  kochi: "tier2", cochin: "tier2",
  thiruvananthapuram: "tier2", trivandrum: "tier2",
  lucknow: "tier2",
  indore: "tier2",
  coimbatore: "tier2",
  nagpur: "tier2",
  visakhapatnam: "tier2", vizag: "tier2",
  bhubaneswar: "tier2",
  mysore: "tier2", mysuru: "tier2",
  mangalore: "tier2", mangaluru: "tier2",
  vadodara: "tier2", baroda: "tier2",
  surat: "tier2",
};

/**
 * Salary multiplier ranges by city tier (Bangalore = 1.0x baseline).
 * Applied to base salary figures which use Bangalore/Tier-1 as reference.
 */
export const CITY_MULTIPLIERS: Record<CityTier, { min: number; max: number; col: string }> = {
  tier1: { min: 1.0, max: 1.0, col: "baseline" },
  tier2: { min: 0.82, max: 0.90, col: "0.7-0.8x cost of living vs Bangalore" },
  tier3: { min: 0.65, max: 0.75, col: "0.5-0.6x cost of living vs Bangalore" },
};

/** Resolve a free-text city name to its tier. Defaults to tier1 (assumes metro if unknown). */
export function getCityTier(city: string | undefined | null): CityTier {
  if (!city) return "tier1";
  const key = city.toLowerCase().trim().replace(/\s+/g, " ");
  if (CITY_TIER_MAP[key]) return CITY_TIER_MAP[key];
  // Partial match: "Bangalore, Karnataka" → "bangalore"
  for (const [k, tier] of Object.entries(CITY_TIER_MAP)) {
    if (key.includes(k) || k.includes(key)) return tier;
  }
  return "tier1"; // default — unknown cities assumed metro
}

/** Apply city-tier multiplier to a salary value. Returns rounded to nearest 0.5 LPA. */
export function adjustForCity(lpa: number, tier: CityTier): number {
  const mult = (CITY_MULTIPLIERS[tier].min + CITY_MULTIPLIERS[tier].max) / 2;
  return Math.round(lpa * mult * 2) / 2; // round to nearest 0.5
}

/** City suggestions for the autocomplete in SessionSetup. */
export const CITY_SUGGESTIONS = [
  // Tier 1
  "Bangalore", "Mumbai", "Delhi NCR", "Gurgaon", "Noida",
  "Hyderabad", "Pune",
  // Tier 2
  "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Chandigarh",
  "Kochi", "Thiruvananthapuram", "Lucknow", "Indore", "Coimbatore",
  "Nagpur", "Visakhapatnam", "Bhubaneswar", "Mysore", "Mangalore",
  "Vadodara", "Surat",
  // Tier 3 — notable
  "Bhopal", "Patna", "Ranchi", "Dehradun", "Raipur",
  "Guwahati", "Agra", "Varanasi", "Amritsar", "Jodhpur",
  // Remote
  "Remote / Pan-India",
];

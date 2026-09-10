"use client";
/**
 * Salary page UI — /salary/[company] and /salary hub.
 *
 * Client component so the hub can use search/filter/pagination.
 * All data still flows from server-side route files as props.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { tokens as t, fonts } from "../auth/_tokens";
import {
  editorialCSS,
  edSansLead,
  ED_PADDING,
  DarkBand,
  ctaPrimaryStyle,
  ctaGhostStyle,
} from "./_editorial";
import { FAQItem } from "./MarketingPagesV2";
import { pickVariant } from "../../data/_content-variants";

/* PRI-150: rotate a few hand-written phrasings for the templated sentences
   below so 224 salary pages built from one skeleton don't read as
   verbatim duplicates to Google — see data/_content-variants.ts. */
const INTRO_SOURCING_VARIANTS = [
  (_companyLabel: string) =>
    `Salary ranges below are sourced primarily from AmbitionBox, with Glassdoor as a secondary cross-check, and reflect total CTC (base + variable + equity) at the 25th–90th percentile of reported offers in India.`,
  (companyLabel: string) =>
    `The figures below reflect total CTC — base, variable, and equity combined — at the 25th–90th percentile of reported ${companyLabel} offers in India, cross-checked against AmbitionBox and Glassdoor.`,
  (companyLabel: string) =>
    `Every band below is total CTC (base + variable + equity), drawn from the 25th–90th percentile of reported offers at ${companyLabel} in India and verified against AmbitionBox and Glassdoor.`,
] as const;

const ROLE_HEADING_VARIANTS = [
  (roleLabel: string, companyLabel: string) => `${roleLabel} Salary at ${companyLabel} (India, 2026)`,
  (roleLabel: string, companyLabel: string) => `${companyLabel} ${roleLabel} Compensation (India, 2026)`,
  (roleLabel: string, companyLabel: string) => `How Much Does ${companyLabel} Pay a ${roleLabel}?`,
] as const;

const ROLE_SUBTEXT_VARIANTS = [
  (roleLabel: string, companyLabel: string) =>
    `Total CTC ranges for ${roleLabel}s at ${companyLabel} India, from fresher to senior level.`,
  (roleLabel: string, companyLabel: string) =>
    `${companyLabel}'s pay bands for ${roleLabel}s in India, fresher through senior.`,
  (roleLabel: string, companyLabel: string) =>
    `What ${roleLabel}s actually earn at ${companyLabel} in India, across every experience level.`,
] as const;
/* ─── Types ─────────────────────────────────────────────────────── */

export interface SalaryBandRow {
  level: "entry" | "mid" | "senior" | "lead" | "executive";
  levelLabel: string;
  totalMin: number;
  totalMax: number;
  baseMin?: number;
  baseMax?: number;
  equityType?: string;
  equityMin?: number;
  equityMax?: number;
  notes?: string;
  source: string;
  dataConfidenceTier?: "high" | "medium" | "low";
  lastVerified: string;
}

export interface SalaryRoleSection {
  roleKey: string;
  roleLabel: string;
  bands: SalaryBandRow[];
}

export interface SalaryPageProps {
  companySlug: string;
  companyLabel: string;
  companyDescription: string;
  roles: SalaryRoleSection[];
  questionPageSlug?: string;
  blogPostSlug?: string;
  noticePeriodDays?: number;
  bondPenaltyLpa?: number;
  calibrationDate: string;
  /* Visible FAQ content — must mirror the FAQPage JSON-LD schema built in
     the route file so structured data matches what's actually shown. */
  faqs?: { q: string; a: string }[];
  /* Company snapshot — grounded, verified facts (not LLM-invented) from
     COMPANY_KNOWN_FACTS. Gives the page a substantive per-company section
     beyond the salary table itself; only rendered when we have the data. */
  scale?: string;
  products?: string[];
  interviewNotes?: string;
  /* Peer-median comparison per role (same array order as `roles`), computed
     live from the other companies in this company's peer group. `null` when
     fewer than 3 peers report data for that role/level — real substance for
     the low-role-count pages, never shown when it'd just be noise. */
  peerComparisons?: (PeerComparison | null)[];
  /* 2-3 real recruitment-process lines pulled from the linked
     /questions/[slug] page, teasing that page's already-vetted content
     instead of only linking to it. */
  interviewTeaser?: InterviewTeaser | null;
}

export interface PeerComparison {
  groupLabel: string;
  level: string;
  peerCount: number;
  peerMedianMin: number;
  peerMedianMax: number;
}

export interface InterviewTeaser {
  questionSlug: string;
  searchPhrase: string;
  items: string[];
}

const LEVEL_PHRASE: Record<string, string> = {
  entry: "entry-level",
  mid: "mid-level",
  senior: "senior",
  lead: "lead",
  executive: "executive",
};

/* ─── Company logo domains (Clearbit) ───────────────────────────── */

const COMPANY_DOMAIN: Record<string, string> = {
  accenture: "accenture.com",
  acko: "acko.com",
  adobe: "adobe.com",
  amazon: "amazon.com",
  "angel-one": "angelone.in",
  anthropic: "anthropic.com",
  "apollo-247": "apollo247.com",
  apple: "apple.com",
  "arm-india": "arm.com",
  "ather-energy": "atherenergy.com",
  atlassian: "atlassian.com",
  axis: "axisbank.com",
  bain: "bain.com",
  "bajaj-finance": "bajajfinserv.in",
  barclays: "barclays.com",
  bcg: "bcg.com",
  bharatpe: "bharatpe.com",
  bigbasket: "bigbasket.com",
  blackbuck: "blackbuck.com",
  blinkit: "blinkit.com",
  "bny-mellon": "bnymellon.com",
  boat: "boat-lifestyle.com",
  "bosch-india": "bosch.in",
  browserstack: "browserstack.com",
  byjus: "byjus.com",
  capgemini: "capgemini.com",
  "capillary-tech": "capillarytech.com",
  cars24: "cars24.com",
  cashfree: "cashfree.com",
  chargebee: "chargebee.com",
  cisco: "cisco.com",
  citadel: "citadel.com",
  citi: "citi.com",
  clari: "clari.com",
  clevertap: "clevertap.com",
  cognizant: "cognizant.com",
  "country-delight": "countrydelight.in",
  cred: "cred.club",
  curefit: "cure.fit",
  darwinbox: "darwinbox.com",
  databricks: "databricks.com",
  "de-shaw": "deshaw.com",
  delhivery: "delhivery.com",
  deloitte: "deloitte.com",
  "deutsche-bank": "db.com",
  digit: "godigit.com",
  dmart: "dmart.in",
  "dr-lal-pathlabs": "lalpathlab.com",
  dream11: "dream11.com",
  druva: "druva.com",
  "ecom-express": "ecomexpress.in",
  "ericsson-india": "ericsson.com",
  exotel: "exotel.com",
  ey: "ey.com",
  "fi-money": "fi.money",
  fibe: "fibe.in",
  fiserv: "fiserv.com",
  flipkart: "flipkart.com",
  freshworks: "freshworks.com",
  globallogic: "globallogic.com",
  godrej: "godrej.com",
  goldman: "goldmansachs.com",
  google: "google.com",
  groww: "groww.in",
  gupshup: "gupshup.io",
  hasura: "hasura.io",
  hcl: "hcltech.com",
  hdfc: "hdfc.com",
  "hdfc-bank": "hdfcbank.com",
  hsbc: "hsbc.com",
  hul: "hul.co.in",
  ibm: "ibm.com",
  icici: "icicibank.com",
  "icici-lombard": "icicilombard.com",
  indmoney: "indmoney.com",
  infosys: "infosys.com",
  inmobi: "inmobi.com",
  "intel-india": "intel.com",
  intuit: "intuit.com",
  itc: "itcportal.com",
  ixigo: "ixigo.com",
  "jane-street": "janestreet.com",
  jpmc: "jpmorgan.com",
  jupiter: "jupiter.money",
  juspay: "juspay.in",
  khatabook: "khatabook.com",
  kotak: "kotak.com",
  kpmg: "kpmg.com",
  kreditbee: "kreditbee.com",
  krutrim: "krutrim.com",
  lenskart: "lenskart.com",
  licious: "licious.com",
  linkedin: "linkedin.com",
  "lowes-india": "lowes.com",
  ltimindtree: "ltimindtree.com",
  "m2p-fintech": "m2pfintech.com",
  mahindra: "mahindra.com",
  makemytrip: "makemytrip.com",
  mamaearth: "mamaearth.com",
  mastercard: "mastercard.com",
  mediatek: "mediatek.com",
  medibuddy: "medibuddy.in",
  mckinsey: "mckinsey.com",
  meesho: "meesho.com",
  meta: "meta.com",
  metropolis: "metropolisindia.com",
  microsoft: "microsoft.com",
  millennium: "mlp.com",
  mindtickle: "mindtickle.com",
  moengage: "moengage.com",
  moglix: "moglix.com",
  moneyview: "moneyview.in",
  "morgan-stanley": "morganstanley.com",
  mphasis: "mphasis.com",
  myntra: "myntra.com",
  naukri: "naukri.com",
  navi: "navi.com",
  nestle: "nestle.in",
  netflix: "netflix.com",
  ninjacart: "ninjacart.com",
  nium: "nium.com",
  niyo: "niyo.in",
  "nokia-india": "nokia.com",
  "ntt-data": "nttdata.com",
  nvidia: "nvidia.com",
  nykaa: "nykaa.com",
  ola: "olacabs.com",
  "ola-electric": "olaelectric.com",
  openai: "openai.com",
  optiver: "optiver.com",
  oracle: "oracle.com",
  oyo: "oyorooms.com",
  paytm: "paytm.com",
  perplexity: "perplexity.ai",
  persistent: "persistent.com",
  phonepe: "phonepe.com",
  physicswallah: "pw.live",
  "pine-labs": "pinelabs.com",
  plivo: "plivo.com",
  policybazaar: "policybazaar.com",
  postman: "postman.com",
  practo: "practo.com",
  "procter-gamble": "pg.com",
  purplle: "purplle.com",
  pwc: "pwc.com",
  qualcomm: "qualcomm.com",
  rapido: "rapido.bike",
  razorpay: "razorpay.com",
  "rebel-foods": "rebelfoods.com",
  rivigo: "rivigo.com",
  rupeek: "rupeek.com",
  salesforce: "salesforce.com",
  "samsung-india": "samsung.com",
  "sap-labs": "sap.com",
  sarvam: "sarvam.ai",
  "sarvam-ai": "sarvam.ai",
  sbi: "sbi.co.in",
  scaler: "scaler.com",
  servicenow: "servicenow.com",
  shadowfax: "shadowfax.in",
  sharechat: "sharechat.com",
  shiprocket: "shiprocket.com",
  "siemens-india": "siemens.com",
  sigmoid: "sigmoid.com",
  slice: "sliceit.in",
  smallcase: "smallcase.com",
  spinny: "spinny.com",
  "standard-chartered": "sc.com",
  "star-health": "starhealth.in",
  stripe: "stripe.com",
  sumologic: "sumologic.com",
  swiggy: "swiggy.com",
  "target-india": "target.com",
  "tata-1mg": "1mg.com",
  "tata-motors": "tatamotors.com",
  tcs: "tcs.com",
  techmahindra: "techmahindra.com",
  "texas-instruments": "ti.com",
  thoughtworks: "thoughtworks.com",
  "tower-research": "tower-research.com",
  tracxn: "tracxn.com",
  truecaller: "truecaller.com",
  uber: "uber.com",
  udaan: "udaan.com",
  unacademy: "unacademy.com",
  upstox: "upstox.com",
  vedantu: "vedantu.com",
  "visa-india": "visa.com",
  vmware: "vmware.com",
  wakefit: "wakefit.co",
  "walmart-global-tech": "walmart.com",
  "wells-fargo": "wellsfargo.com",
  wipro: "wipro.com",
  workday: "workday.com",
  yulu: "yulu.bike",
  zepto: "zeptonow.com",
  zerodha: "zerodha.com",
  zeta: "zeta.tech",
  zoho: "zoho.com",
  zomato: "zomato.com",
};

function companyLogoUrl(slug: string): string | null {
  const domain = COMPANY_DOMAIN[slug];
  return domain
    ? `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`
    : null;
}

/* ─── Helpers ────────────────────────────────────────────────────── */

const LEVEL_ORDER = ["entry", "mid", "senior", "lead", "executive"] as const;
const LEVEL_LABEL: Record<string, string> = {
  entry: "Fresher / 0–2 yrs",
  mid: "Mid-level / 3–5 yrs",
  senior: "Senior / 6–9 yrs",
  lead: "Lead / 10–12 yrs",
  executive: "Manager / 12+ yrs",
};

function fmt(n: number): string {
  if (n >= 100) return `₹${n}L`;
  return `₹${n.toFixed(n % 1 === 0 ? 0 : 1)}L`;
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const wrap: CSSProperties = {
  background: t.cream,
  minHeight: "100vh",
  paddingBottom: 80,
};

const container: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "0 40px",
};

const containerNarrow: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "0 40px",
};

const eyebrow: CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: t.copper,
  marginBottom: 12,
};

const h1Style: CSSProperties = {
  fontFamily: fonts.serif,
  fontSize: "clamp(28px, 4vw, 42px)",
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
  color: t.coal,
  textWrap: "balance" as never,
  marginBottom: 16,
};

const leadStyle: CSSProperties = {
  ...edSansLead,
  maxWidth: "58ch",
  marginBottom: 0,
};

const sectionTitle: CSSProperties = {
  fontFamily: fonts.serif,
  fontSize: 20,
  fontWeight: 700,
  color: t.coal,
  marginBottom: 4,
  letterSpacing: "-0.01em",
};

/* Table styles */
const tableWrap: CSSProperties = {
  overflowX: "auto",
  marginBottom: 24,
  borderRadius: 8,
  border: `1px solid ${t.line}`,
  background: t.white,
};

const thStyle: CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: t.inkFaint,
  padding: "10px 16px",
  textAlign: "left" as const,
  borderBottom: `2px solid ${t.coal}`,
  whiteSpace: "nowrap" as const,
  background: t.creamSoft,
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: `1px solid ${t.line}`,
  verticalAlign: "top",
  fontSize: 14,
  color: t.coal,
  lineHeight: 1.5,
};

const tdFaint: CSSProperties = {
  ...tdStyle,
  color: t.inkSoft,
  fontSize: 13,
};

const tdMono: CSSProperties = {
  ...tdStyle,
  fontFamily: fonts.mono,
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
};

/* Surfaces dataConfidenceTier (already used to hedge the LLM negotiation
   prompt) as a visible trust signal, so a "low" cell — a directional
   estimate synthesized from tier benchmarks, not a company-verified
   figure — reads as such instead of sitting next to a "verified" row
   with identical styling. */
function ConfidenceBadge({ tier }: { tier?: "high" | "medium" | "low" }) {
  const config = {
    high: { label: "Verified", color: t.success, background: t.success100 },
    medium: { label: "Est.", color: t.inkFaint, background: t.creamSoft },
    low: { label: "Directional", color: t.warning, background: t.warning100 },
  }[tier ?? "high"];

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: fonts.sans,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        color: config.color,
        background: config.background,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

const chipStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: fonts.mono,
  letterSpacing: "0.04em",
  fontWeight: 600,
};

/* ─── Component ──────────────────────────────────────────────────── */

export function SalaryCompanyPage({
  companySlug,
  companyLabel,
  companyDescription,
  roles,
  questionPageSlug,
  blogPostSlug,
  noticePeriodDays,
  bondPenaltyLpa,
  calibrationDate,
  faqs = [],
  scale,
  products,
  interviewNotes,
  peerComparisons,
  interviewTeaser,
}: SalaryPageProps) {
  const hasSnapshot = Boolean(scale || interviewNotes || (products && products.length > 0));
  const hasRoles = roles.length > 0;
  const questionHref = questionPageSlug
    ? `/questions/${questionPageSlug}`
    : "/questions";

  /* Headline figure — the single number visitors came for, surfaced in the
     hero instead of buried below the fold in the first table. */
  const headlineRole = roles[0];
  const headlineBand = headlineRole?.bands[headlineRole.bands.length - 1];

  return (
    <>
      <style>{editorialCSS}</style>
      <style>{`
        .sal-table { width: 100%; border-collapse: collapse; }
        .sal-table tr:last-child td { border-bottom: none; }
        .sal-table tr:hover td { background: ${t.creamSoft}; }
        .sal-h1::first-letter { text-transform: uppercase; }

        @media (max-width: 640px) {
          .sal-container { padding: 0 16px !important; }
          .sal-header { padding: 40px 16px 32px !important; }
          .sal-hide-sm { display: none !important; }
        }
      `}</style>

      <div style={wrap}>
        {/* ── Hero ── */}
        <div
          className="sal-header"
          style={{
            paddingTop: ED_PADDING.heroTop,
            paddingBottom: ED_PADDING.heroBottom,
            borderBottom: `1px solid ${t.line}`,
            background: t.creamRaised,
          }}
        >
          <div className="sal-container" style={containerNarrow}>
            <p className="ed-rise" style={eyebrow}>
              Salary Guide · India 2026
            </p>
            <h1 className="ed-rise ed-d1 sal-h1" style={h1Style}>
              {companyLabel} Salary Guide India 2026
            </h1>
            <p className="ed-rise ed-d2" style={leadStyle}>
              {companyDescription}{" "}
              {pickVariant(companySlug, INTRO_SOURCING_VARIANTS)(companyLabel)}
            </p>

            {/* Quick meta chips */}
            <div
              className="ed-rise ed-d3"
              style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}
            >
              <span
                style={{
                  ...chipStyle,
                  background: t.copperWash,
                  color: t.copper,
                  border: `1px solid ${t.copperBorder}`,
                }}
              >
                Total CTC in LPA
              </span>
              <span
                style={{
                  ...chipStyle,
                  background: t.creamSoft,
                  color: t.inkSoft,
                  border: `1px solid ${t.line}`,
                }}
              >
                Verified {calibrationDate} · rechecked quarterly
              </span>
              {noticePeriodDays && (
                <span
                  style={{
                    ...chipStyle,
                    background: t.creamSoft,
                    color: t.inkSoft,
                    border: `1px solid ${t.line}`,
                  }}
                >
                  {noticePeriodDays}-day notice period
                </span>
              )}
              {bondPenaltyLpa && bondPenaltyLpa > 0 && (
                <span
                  style={{
                    ...chipStyle,
                    background: t.error100,
                    color: t.error,
                    border: "1px solid rgba(185,28,28,0.15)",
                  }}
                >
                  ₹{bondPenaltyLpa}L service bond
                </span>
              )}
            </div>

            {/* Headline figure — the number, above the fold, before any table */}
            {headlineRole && headlineBand && (
              <div className="ed-rise ed-d3" style={{ marginTop: 32 }}>
                <p style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: t.inkFaint, margin: "0 0 4px" }}>
                  {headlineRole.roleLabel} · {LEVEL_LABEL[headlineBand.level]}
                </p>
                <p style={{ fontFamily: fonts.mono, fontSize: "clamp(30px, 3.6vw, 44px)", fontWeight: 700, color: t.coal, margin: 0, letterSpacing: "-0.02em" }}>
                  {fmt(headlineBand.totalMin)} – {fmt(headlineBand.totalMax)}
                  <span style={{ fontFamily: fonts.sans, fontSize: 15, fontWeight: 500, color: t.inkSoft, marginLeft: 8 }}>total CTC</span>
                </p>
                {roles.length > 1 && (
                  <p style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, margin: "10px 0 0" }}>
                    Salary bands for {roles.length} roles at {companyLabel}, from {headlineRole.roleLabel} to{" "}
                    {roles[roles.length - 1].roleLabel} — see all below.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Company snapshot — grounded facts, not templated boilerplate.
              Gives each page real per-company substance beyond the table. ── */}
        {hasSnapshot && (
          <div className="sal-container" style={{ ...containerNarrow, paddingTop: 40 }}>
            <p style={eyebrow}>Working at {companyLabel}</p>
            {scale && (
              <p style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.7, color: t.coal, margin: "0 0 12px" }}>
                {scale}
              </p>
            )}
            {products && products.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 16px" }}>
                {products.map((p) => (
                  <span
                    key={p}
                    style={{
                      ...chipStyle,
                      background: t.creamSoft,
                      color: t.inkSoft,
                      border: `1px solid ${t.line}`,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
            {interviewNotes && (
              <div style={{ borderLeft: `3px solid ${t.copper}`, paddingLeft: 16 }}>
                <p style={{ fontFamily: fonts.sans, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: t.copper, margin: "0 0 6px", fontWeight: 700 }}>
                  What the interview actually tests
                </p>
                <p style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.7, color: t.inkSoft, margin: 0 }}>
                  {interviewNotes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Salary tables ── */}
        <div
          className="sal-container"
          style={{ ...containerNarrow, paddingTop: 48 }}
        >
          {/* Jump-to-role nav — on a large roster, a visitor who searched for
              one specific role (not "{companyLabel} salary") needs a way to
              land on that role's table without scrolling past a dozen others.
              The anchor list also gives Google concrete same-page targets for
              each role + company + salary phrase, on top of the H1's generic
              company-salary phrase above. */}
          {hasRoles && roles.length > 3 && (
            <nav
              aria-label={`Jump to a role's salary at ${companyLabel}`}
              style={{ marginBottom: 40 }}
            >
              <p style={eyebrow}>Jump to a role</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {roles.map((role) => (
                  <a
                    key={role.roleKey}
                    href={`#role-${role.roleKey}`}
                    style={{
                      display: "inline-block",
                      padding: "8px 14px",
                      background: t.creamSoft,
                      border: `1px solid ${t.line}`,
                      borderRadius: 8,
                      textDecoration: "none",
                      color: t.coal,
                      fontFamily: fonts.sans,
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {role.roleLabel}
                  </a>
                ))}
              </div>
            </nav>
          )}
          {hasRoles ? (
            roles.map((role, roleIndex) => (
              <section
                key={role.roleKey}
                id={`role-${role.roleKey}`}
                style={{ marginBottom: 48, scrollMarginTop: 24 }}
                aria-label={`${role.roleLabel} salary at ${companyLabel}`}
              >
                <p style={eyebrow}>Role</p>
                <h2 style={sectionTitle}>
                  {pickVariant(`${companySlug}:${role.roleKey}`, ROLE_HEADING_VARIANTS)(role.roleLabel, companyLabel)}
                </h2>
                <p
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    color: t.inkSoft,
                    marginBottom: 20,
                  }}
                >
                  {pickVariant(`${companySlug}:${role.roleKey}`, ROLE_SUBTEXT_VARIANTS)(role.roleLabel, companyLabel)}
                </p>

                <div style={tableWrap}>
                  <table className="sal-table" aria-label={`${role.roleLabel} salary bands`}>
                    <thead>
                      <tr>
                        <th scope="col" style={thStyle}>Experience Level</th>
                        <th scope="col" style={thStyle}>Total CTC (LPA)</th>
                        <th scope="col" style={{ ...thStyle }} className="sal-hide-sm">
                          Base CTC
                        </th>
                        <th scope="col" style={thStyle}>Equity</th>
                        <th scope="col" style={{ ...thStyle }} className="sal-hide-sm">
                          Last Verified
                        </th>
                        <th scope="col" style={{ ...thStyle }} className="sal-hide-sm">
                          Confidence
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {LEVEL_ORDER.filter((lvl) =>
                        role.bands.some((b) => b.level === lvl),
                      ).map((lvl) => {
                        const band = role.bands.find((b) => b.level === lvl);
                        if (!band) return null;
                        return (
                          <tr key={lvl}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>
                              {LEVEL_LABEL[lvl]}
                            </td>
                            <td style={{ ...tdMono, fontWeight: 700, color: t.coal }}>
                              {fmt(band.totalMin)} – {fmt(band.totalMax)}
                            </td>
                            <td style={tdMono} className="sal-hide-sm">
                              {band.baseMin != null && band.baseMax != null
                                ? `${fmt(band.baseMin)} – ${fmt(band.baseMax)}`
                                : "N/A"}
                            </td>
                            <td style={tdFaint}>
                              {band.equityType && band.equityType !== "none" ? (
                                <>
                                  {band.equityType.toUpperCase()}
                                  {band.equityMin != null && band.equityMax != null && (
                                    <span
                                      style={{
                                        display: "block",
                                        fontFamily: fonts.mono,
                                        fontSize: 12,
                                        marginTop: 2,
                                      }}
                                    >
                                      {fmt(band.equityMin)} – {fmt(band.equityMax)}/yr
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: t.inkFaint }}>None</span>
                              )}
                            </td>
                            <td style={tdFaint} className="sal-hide-sm">
                              {band.lastVerified}
                            </td>
                            <td style={tdFaint} className="sal-hide-sm">
                              <ConfidenceBadge tier={band.dataConfidenceTier} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Notes for the role — show first band's notes as a tip */}
                {role.bands[0]?.notes && (
                  <div
                    style={{
                      borderLeft: `3px solid ${t.copper}`,
                      paddingLeft: 16,
                      marginTop: 8,
                      marginBottom: 24,
                    }}
                  >
                    <p
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 13,
                        color: t.inkSoft,
                        lineHeight: 1.6,
                      }}
                    >
                      {role.bands[0].notes}
                    </p>
                  </div>
                )}

                {peerComparisons?.[roleIndex] && (
                  <div style={{ ...tableWrap, padding: "16px 20px", marginTop: 8 }}>
                    <p style={{ fontFamily: fonts.sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: t.inkFaint, margin: "0 0 6px" }}>
                      How this compares
                    </p>
                    <p style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.6, color: t.coal, margin: 0 }}>
                      The {LEVEL_PHRASE[peerComparisons[roleIndex]!.level] ?? peerComparisons[roleIndex]!.level} {role.roleLabel} band above sits against a{" "}
                      {peerComparisons[roleIndex]!.groupLabel} peer median of{" "}
                      <strong>{fmt(peerComparisons[roleIndex]!.peerMedianMin)} – {fmt(peerComparisons[roleIndex]!.peerMedianMax)} LPA</strong>
                      {" "}across {peerComparisons[roleIndex]!.peerCount} other {peerComparisons[roleIndex]!.groupLabel} companies we track.
                    </p>
                  </div>
                )}
              </section>
            ))
          ) : (
            <div style={{ padding: "32px 0 8px" }}>
              <p style={{ fontFamily: fonts.sans, fontSize: 16, fontWeight: 600, color: t.coal, margin: "0 0 8px" }}>
                We don&apos;t have verified {companyLabel} salary data yet.
              </p>
              <p style={{ fontFamily: fonts.sans, fontSize: 14, color: t.inkSoft, margin: "0 0 20px", maxWidth: "56ch", lineHeight: 1.6 }}>
                We only publish ranges once we have enough sourced offers to report a
                real percentile, not a guess. In the meantime, practice the actual
                interview so you walk in ready regardless of the number.
              </p>
              <a href={questionHref} className="ed-cta" style={ctaPrimaryStyle("md")}>
                Practice {companyLabel} interview questions <span className="ed-cta-arrow" aria-hidden>→</span>
              </a>
            </div>
          )}

          {/* Interview-process teaser — real recruitment-step lines pulled
              from the linked /questions/[slug] page, not a generic blurb. */}
          {interviewTeaser && (
            <div style={{ marginTop: 40, paddingTop: 40, borderTop: `1px solid ${t.line}` }}>
              <p style={eyebrow}>What the {companyLabel} interview actually looks like</p>
              <ol style={{ margin: "16px 0 20px", paddingLeft: 20 }}>
                {interviewTeaser.items.map((step, i) => (
                  <li
                    key={i}
                    style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.7, color: t.inkSoft, marginBottom: 8 }}
                  >
                    {step}
                  </li>
                ))}
              </ol>
              <a href={`/questions/${interviewTeaser.questionSlug}`} style={ctaGhostStyle("md")}>
                Full {companyLabel} interview guide →
              </a>
            </div>
          )}

          {/* Cross-links */}
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 40,
              paddingTop: 40,
              borderTop: `1px solid ${t.line}`,
            }}
          >
            <a
              href={questionHref}
              style={ctaPrimaryStyle("md")}
            >
              Practice {companyLabel} Interview Questions →
            </a>
            {blogPostSlug && (
              <a href={`/blog/${blogPostSlug}`} style={ctaGhostStyle("md")}>
                {companyLabel} Interview Guide
              </a>
            )}
            <a href="/salary" style={ctaGhostStyle("md")}>
              All Company Salaries
            </a>
          </div>
        </div>

        {/* ── FAQ — mirrors the FAQPage JSON-LD schema so what Google indexes
              as structured data matches the visible page. ── */}
        {faqs.length > 0 && (
          <div className="sal-container" style={{ ...containerNarrow, marginTop: 64 }}>
            <h2
              style={{
                fontFamily: fonts.serif,
                fontSize: "clamp(26px, 3vw, 34px)",
                fontWeight: 400,
                letterSpacing: "-0.02em",
                color: t.coal,
                margin: "0 0 24px",
              }}
            >
              {companyLabel} salary FAQs
            </h2>
            <div style={{ background: t.creamSoft, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
              {faqs.map((faq, i) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} first={i === 0} />
              ))}
            </div>
          </div>
        )}

        {/* ── CTA band ── */}
        <div style={{ marginTop: 64 }}>
          <DarkBand
            eyebrow="Practice rounds"
            title="Prepare for your"
            accent={`${companyLabel} interview`}
          >
            <p
              style={{
                fontFamily: fonts.sans,
                fontSize: 16,
                lineHeight: 1.7,
                color: "rgba(245,242,237,0.8)",
                marginBottom: 28,
                maxWidth: "52ch",
              }}
            >
              HireStepX gives you AI voice mock interviews scored on the STAR
              framework. Know what the interviewer is actually evaluating before
              you walk in.
            </p>
            <a
              href={`/signup?source=salary-seo&company=${encodeURIComponent(companySlug)}&next=${encodeURIComponent(`/interview${headlineRole ? `?role=${encodeURIComponent(headlineRole.roleLabel)}` : ""}`)}`}
              className="ed-cta"
              style={ctaPrimaryStyle("lg")}
            >
              Start free practice <span className="ed-cta-arrow" aria-hidden>→</span>
            </a>
          </DarkBand>
        </div>
      </div>
    </>
  );
}

/* ─── Hub / index page ───────────────────────────────────────────── */

export interface SalaryHubEntry {
  slug: string;
  label: string;
  hubNote: string;
  topRoleLabel: string;
  entryMin?: number;
  entryMax?: number;
}

/* Derive a tier badge from the entry-level max CTC */
function tierBadge(entryMax?: number): { label: string; tier: "faang" | "startup" | "service" | "none"; color: string; bg: string; border: string } {
  if (entryMax == null) return { label: "–", tier: "none", color: t.inkFaint, bg: t.creamSoft, border: t.line };
  if (entryMax >= 45) return { label: "FAANG", tier: "faang", color: "#1d4ed8", bg: "#EEF3FF", border: "rgba(29,78,216,0.20)" };
  if (entryMax >= 15) return { label: "Startup", tier: "startup", color: t.copper, bg: t.copperWash, border: t.copperBorder };
  return { label: "Service", tier: "service", color: t.inkFaint, bg: t.creamSoft, border: t.line };
}

const MAX_CTC_SCALE = 70; // LPA — bar fills at ₹70L+
const CARDS_PER_PAGE = 30;
const TIER_TABS = ["All", "FAANG", "Startup", "Service"] as const;

/* Curated "in-demand" rail. The hub grid sorts by pay and paginates, which
   buries our lowest-competition, highest-opportunity pages (AI-frontier +
   niche startups) below the fold and off page 1 — starving them of internal
   links. This strip hard-links them from the top of the hub regardless of
   pay rank, concentrating internal PageRank where GSC shows we rank page-1
   on long-tail queries and are one nudge from breaking into the top 5. */
const FEATURED_SLUGS = [
  "sarvam-ai", "krutrim", "perplexity",
  "databricks", "openai", "moglix", "zepto",
] as const;

export function SalaryHubPage({
  entries,
  faqs = [],
  initialPage,
}: {
  entries: SalaryHubEntry[];
  faqs?: { q: string; a: string }[];
  initialPage?: number;
}) {
  const [search, setSearch] = useState("");
  const [activeTier, setActiveTier] = useState<typeof TIER_TABS[number]>("All");
  const [page, setPage] = useState(initialPage ?? 1);

  useEffect(() => {
    setPage(initialPage ?? 1);
  }, [initialPage]);

  /* Only the unfiltered hub has real /salary?page=N URLs (see
     app/(marketing)/salary/page.tsx) — that's the state Google can discover,
     so only it gets crawlable <Link> pagination. Search/tier filters stay
     client-only; those states aren't in the sitemap and shouldn't be indexed
     as separate search-result pages. */
  const isDefaultView = !search.trim() && activeTier === "All";
  const pageHref = (p: number) => (p > 1 ? `/salary?page=${p}` : "/salary");

  /* Filter + sort */
  const q = search.trim().toLowerCase();
  const filtered = entries
    .filter((e) => {
      if (q && !e.label.toLowerCase().includes(q) && !e.hubNote.toLowerCase().includes(q)) return false;
      if (activeTier !== "All") {
        const badge = tierBadge(e.entryMax);
        if (badge.label !== activeTier) return false;
      }
      return true;
    })
    .sort((a, b) => (b.entryMax ?? 0) - (a.entryMax ?? 0));

  const totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * CARDS_PER_PAGE, safePage * CARDS_PER_PAGE);

  const resetPage = () => setPage(1);

  /* Featured rail — resolved from the entries we were handed, in curated
     order, silently skipping any slug without a live page. Shown only in the
     default (unfiltered) view so it never competes with an active search. */
  const featured = FEATURED_SLUGS
    .map((slug) => entries.find((e) => e.slug === slug))
    .filter((e): e is SalaryHubEntry => e != null);
  const showFeatured = !q && activeTier === "All" && featured.length > 0;

  /* Page number buttons — up to 7 slots with ellipsis */
  const pageNumbers: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (safePage > 3) pageNumbers.push("…");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pageNumbers.push(i);
    if (safePage < totalPages - 2) pageNumbers.push("…");
    pageNumbers.push(totalPages);
  }

  return (
    <>
      <style>{editorialCSS}</style>
      <style>{`
        .sal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 14px;
        }
        .sal-card {
          display: block;
          background: #FFFFFF;
          border: 1px solid ${t.line};
          border-radius: 10px;
          padding: 18px 20px 16px;
          text-decoration: none;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .sal-card:hover {
          border-color: ${t.copper};
          box-shadow: 0 2px 16px rgba(180,83,9,0.09);
          transform: translateY(-1px);
        }
        .sal-range-track {
          height: 3px;
          background: ${t.line};
          border-radius: 2px;
          margin-top: 10px;
          position: relative;
          overflow: visible;
        }
        .sal-range-fill {
          position: absolute;
          top: 0;
          height: 100%;
          border-radius: 2px;
          background: ${t.copper};
          opacity: 0.65;
        }
        .sal-tier-tab {
          background: none;
          border: 1.5px solid ${t.line};
          border-radius: 99px;
          fontFamily: ${fonts.sans};
          font-size: 13px;
          font-weight: 500;
          color: ${t.inkSoft};
          padding: 7px 18px;
          cursor: pointer;
          transition: border-color 140ms, background 140ms, color 140ms;
          white-space: nowrap;
        }
        .sal-tier-tab:hover {
          border-color: ${t.copper};
          color: ${t.copper};
        }
        .sal-tier-tab.active {
          background: ${t.coal};
          border-color: ${t.coal};
          color: #fff;
          font-weight: 700;
        }
        .sal-feat-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #fff;
          border: 1.5px solid ${t.copperBorder};
          border-radius: 99px;
          padding: 8px 15px;
          text-decoration: none;
          font-family: ${fonts.sans};
          font-size: 13.5px;
          font-weight: 600;
          color: ${t.coal};
          white-space: nowrap;
          transition: border-color 140ms, background 140ms, transform 140ms, box-shadow 140ms;
        }
        .sal-feat-chip:hover {
          border-color: ${t.copper};
          background: ${t.copperWash};
          transform: translateY(-1px);
          box-shadow: 0 2px 12px rgba(180,83,9,0.10);
        }
        .sal-feat-chip img {
          width: 18px; height: 18px; border-radius: 4px;
          object-fit: contain; background: #fff; flex-shrink: 0;
        }
        @media (max-width: 640px) {
          .sal-grid { grid-template-columns: 1fr !important; }
          .sal-hub-header { padding: 44px 16px 28px !important; }
          .sal-hub-container { padding: 0 16px !important; }
        }
      `}</style>

      <div style={{ ...wrap, paddingBottom: 80 }}>
        {/* ── Hero ── */}
        <div
          className="sal-hub-header"
          style={{
            paddingTop: 52,
            paddingBottom: 52,
            borderBottom: `1px solid ${t.line}`,
            background: t.creamRaised,
          }}
        >
          <div style={{ ...container, textAlign: "center" }}>
            <p className="ed-rise" style={{ ...eyebrow, marginBottom: 14 }}>
              Salary Guides · India 2026
            </p>
            <h1 className="ed-rise ed-d1" style={{
              fontFamily: fonts.serif,
              fontSize: "clamp(36px, 4.8vw, 64px)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: t.coal,
              margin: "0 0 20px",
              textWrap: "balance" as never,
            }}>
              Know the number{" "}
              <em style={{ fontStyle: "italic", color: t.copper }}>before the offer.</em>
            </h1>
            <p className="ed-rise ed-d2" style={{ ...leadStyle, margin: "0 auto 28px", textAlign: "center" }}>
              CTC ranges across India's top companies, from TCS to Goldman Sachs,
              freshers to senior engineers.
            </p>

            {/* Search bar — centered */}
            <div style={{ maxWidth: 520, margin: "0 auto", position: "relative" }}>
              <svg
                aria-hidden="true"
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={t.inkFaint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              >
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                value={search}
                placeholder="Search company…"
                aria-label="Search company"
                onChange={e => { setSearch(e.target.value); resetPage(); }}
                style={{
                  width: "100%", boxSizing: "border-box" as const,
                  fontFamily: fonts.sans, fontSize: 15, color: t.coal,
                  background: "#fff", border: `1.5px solid ${t.line}`,
                  borderRadius: 999, padding: "13px 18px 13px 44px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  transition: "border-color 180ms, box-shadow 180ms",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = t.indigo; e.currentTarget.style.boxShadow = `0 0 0 3px ${t.indigo}33`; }}
                onBlur={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); resetPage(); }}
                  aria-label="Clear search"
                  style={{
                    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    color: t.inkFaint, display: "flex", alignItems: "center",
                  }}
                >
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Company grid ── */}
        <div
          className="sal-hub-container"
          style={{ ...container, paddingTop: 28 }}
        >
          {/* Tier filter tabs */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
            {TIER_TABS.map(tier => (
              <button
                key={tier}
                className={`sal-tier-tab${activeTier === tier ? " active" : ""}`}
                onClick={() => { setActiveTier(tier); resetPage(); }}
                aria-pressed={activeTier === tier}
              >
                {tier}
              </button>
            ))}
          </div>

          {/* ── In-demand rail — curated internal links to our lowest-
                competition, highest-opportunity salary pages, kept above
                the pay-sorted grid so they're never buried by pagination. ── */}
          {showFeatured && (
            <div style={{ marginBottom: 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span aria-hidden="true" style={{ fontSize: 15 }}>🔥</span>
                <h2 style={{
                  fontFamily: fonts.mono, fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase" as const,
                  color: t.copper, margin: 0,
                }}>
                  In-demand salary searches
                </h2>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {featured.map((entry) => {
                  const logoUrl = companyLogoUrl(entry.slug);
                  return (
                    <a key={entry.slug} href={`/salary/${entry.slug}`} className="sal-feat-chip">
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt=""
                          width={18}
                          height={18}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {entry.label}
                      {entry.entryMax != null && (
                        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: t.inkFaint, fontWeight: 500 }}>
                          {fmt(entry.entryMax)}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {paginated.length > 0 ? (
            <div className="sal-grid">
              {paginated.map((entry) => {
                const badge = tierBadge(entry.entryMax);
                const barMin = entry.entryMin != null
                  ? Math.min((entry.entryMin / MAX_CTC_SCALE) * 100, 100)
                  : 0;
                const barMax = entry.entryMax != null
                  ? Math.min((entry.entryMax / MAX_CTC_SCALE) * 100, 100)
                  : 0;
                const hasBar = entry.entryMax != null;

                const logoUrl = companyLogoUrl(entry.slug);
                return (
                  <a key={entry.slug} href={`/salary/${entry.slug}`} className="sal-card">
                    {/* Logo + company name + tier badge */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={`${entry.label} logo`}
                            width={28}
                            height={28}
                            style={{
                              borderRadius: 6,
                              border: `1px solid ${t.line}`,
                              objectFit: "contain",
                              flexShrink: 0,
                              background: "#fff",
                              padding: 2,
                            }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <p style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: 16, color: t.coal, margin: 0, lineHeight: 1.2 }}>
                          {entry.label}
                        </p>
                      </div>
                      <span style={{
                        fontFamily: fonts.mono, fontSize: 9, fontWeight: 700,
                        letterSpacing: "0.10em", textTransform: "uppercase" as const,
                        color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                        borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginTop: 1,
                      }}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Role + salary range */}
                    <p style={{
                      fontFamily: fonts.mono, fontSize: 10, letterSpacing: "0.07em",
                      textTransform: "uppercase" as const, color: t.copper, margin: "6px 0 0",
                    }}>
                      {entry.topRoleLabel}
                      {entry.entryMin != null && entry.entryMax != null && (
                        <> · {fmt(entry.entryMin)}–{fmt(entry.entryMax)}</>
                      )}
                    </p>

                    {/* Range bar — visual salary encoding */}
                    {hasBar && (
                      <div className="sal-range-track">
                        <div
                          className="sal-range-fill"
                          style={{ left: `${barMin}%`, width: `${Math.max(barMax - barMin, 3)}%` }}
                        />
                      </div>
                    )}

                    {/* Hub note */}
                    <p style={{
                      fontFamily: fonts.sans, fontSize: 12, color: t.inkSoft,
                      lineHeight: 1.55, margin: "12px 0 0",
                    }}>
                      {entry.hubNote}
                    </p>
                  </a>
                );
              })}
            </div>
          ) : (
            /* Empty state */
            <div style={{ textAlign: "center", padding: "72px 0", fontFamily: fonts.sans }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>🔍</p>
              <p style={{ fontSize: 16, color: t.coal, fontWeight: 600, marginBottom: 8 }}>No companies found</p>
              <p style={{ fontSize: 13, color: t.inkSoft, marginBottom: 20 }}>
                Try a different keyword or clear the filter
              </p>
              <button
                onClick={() => { setSearch(""); setActiveTier("All"); resetPage(); }}
                style={{
                  fontFamily: fonts.sans, fontSize: 13, fontWeight: 600,
                  background: t.coal, color: "#fff", border: "none",
                  borderRadius: 8, padding: "10px 22px", cursor: "pointer",
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 48 }}>
              {/* Count label */}
              <span style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, marginRight: 10, whiteSpace: "nowrap" as const }}>
                {filtered.length === entries.length
                  ? `${entries.length} companies`
                  : `${filtered.length} of ${entries.length} companies`}
                {` · page ${safePage} of ${totalPages}`}
              </span>

              {/* Prev */}
              {isDefaultView ? (
                <Link
                  href={pageHref(safePage - 1)}
                  aria-label="Previous page"
                  aria-disabled={safePage === 1}
                  onClick={e => { if (safePage === 1) e.preventDefault(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, textDecoration: "none",
                    fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                    background: safePage === 1 ? t.creamSoft : "#fff",
                    color: safePage === 1 ? t.inkFaint : t.coal,
                    cursor: safePage === 1 ? "default" : "pointer",
                    opacity: safePage === 1 ? 0.45 : 1,
                    transition: "border-color 150ms, background 150ms",
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Prev
                </Link>
              ) : (
                <button
                  onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                    background: safePage === 1 ? t.creamSoft : "#fff",
                    color: safePage === 1 ? t.inkFaint : t.coal,
                    cursor: safePage === 1 ? "default" : "pointer",
                    opacity: safePage === 1 ? 0.45 : 1,
                    transition: "border-color 150ms, background 150ms",
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Prev
                </button>
              )}

              {/* Page numbers */}
              {pageNumbers.map((n, i) =>
                n === "…" ? (
                  <span key={`ellipsis-${i}`} style={{ fontFamily: fonts.sans, fontSize: 13, color: t.inkFaint, padding: "8px 4px" }}>…</span>
                ) : isDefaultView ? (
                  <Link
                    key={n}
                    href={pageHref(n as number)}
                    aria-current={safePage === n ? "page" : undefined}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                      fontFamily: fonts.sans, fontSize: 13, fontWeight: safePage === n ? 700 : 400,
                      minWidth: 36, height: 36, borderRadius: 8, border: `1.5px solid ${safePage === n ? t.indigo : t.line}`,
                      background: safePage === n ? t.indigo : "#fff",
                      color: safePage === n ? "#fff" : t.coal,
                      cursor: "pointer", transition: "all 150ms",
                    }}
                  >
                    {n}
                  </Link>
                ) : (
                  <button
                    key={n}
                    onClick={() => { setPage(n as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    aria-current={safePage === n ? "page" : undefined}
                    style={{
                      fontFamily: fonts.sans, fontSize: 13, fontWeight: safePage === n ? 700 : 400,
                      minWidth: 36, height: 36, borderRadius: 8, border: `1.5px solid ${safePage === n ? t.indigo : t.line}`,
                      background: safePage === n ? t.indigo : "#fff",
                      color: safePage === n ? "#fff" : t.coal,
                      cursor: "pointer", transition: "all 150ms",
                    }}
                  >
                    {n}
                  </button>
                )
              )}

              {/* Next */}
              {isDefaultView ? (
                <Link
                  href={pageHref(safePage + 1)}
                  aria-label="Next page"
                  aria-disabled={safePage === totalPages}
                  onClick={e => { if (safePage === totalPages) e.preventDefault(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, textDecoration: "none",
                    fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                    background: safePage === totalPages ? t.creamSoft : "#fff",
                    color: safePage === totalPages ? t.inkFaint : t.coal,
                    cursor: safePage === totalPages ? "default" : "pointer",
                    opacity: safePage === totalPages ? 0.45 : 1,
                    transition: "border-color 150ms, background 150ms",
                  }}
                >
                  Next
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              ) : (
                <button
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === totalPages}
                  aria-label="Next page"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontFamily: fonts.sans, fontSize: 13, fontWeight: 500,
                    padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${t.line}`,
                    background: safePage === totalPages ? t.creamSoft : "#fff",
                    color: safePage === totalPages ? t.inkFaint : t.coal,
                    cursor: safePage === totalPages ? "default" : "pointer",
                    opacity: safePage === totalPages ? 0.45 : 1,
                    transition: "border-color 150ms, background 150ms",
                  }}
                >
                  Next
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* ── FAQ — mirrors the FAQPage JSON-LD schema so what Google
                indexes as structured data matches the visible page. ── */}
          {faqs.length > 0 && (
            <div style={{ marginTop: 64 }}>
              <h2
                style={{
                  fontFamily: fonts.serif,
                  fontSize: "clamp(26px, 3vw, 34px)",
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  color: t.coal,
                  margin: "0 0 24px",
                }}
              >
                Salary FAQs
              </h2>
              <div style={{ background: t.white, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
                {faqs.map((faq, i) => (
                  <FAQItem key={faq.q} q={faq.q} a={faq.a} first={i === 0} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

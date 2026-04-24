import React, { memo, useState } from "react";
import { c, font } from "./tokens";

/* ═══════════════════════════════════════════════════════════════════
   Salary-negotiation presentational components.

   Extracted from InterviewPanels.tsx to separate the negotiation-specific
   UI (~780 lines, 4 components) from the general interview chrome
   (header/avatars/cards/controls). The two surfaces share no state and
   were co-located only by history. Splitting makes both files single-
   responsibility and easier to test in isolation.

   Public API: NegotiationCoachingCard, DealSummaryCard,
   NegotiationLiveDashboard, AnnotatedReplayPanel — all imported via
   InterviewPanels.tsx which re-exports them for call-site compatibility.
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Salary Negotiation Coaching Card (shown before session starts) ─── */

export const NegotiationCoachingCard = memo(function NegotiationCoachingCard({ onDismiss, negotiationStyle, onSetTarget, targetRole, industry, scenarioRound, onSelectScenario }: {
  onDismiss: () => void;
  negotiationStyle?: string;
  onSetTarget?: (salary: number) => void;
  targetRole?: string;
  industry?: string;
  scenarioRound?: number;
  onSelectScenario?: (scenario: string) => void;
}) {
  const [targetInput, setTargetInput] = useState("");
  const styleLabel = negotiationStyle === "aggressive" ? "Aggressive" : negotiationStyle === "defensive" ? "Defensive" : "Cooperative";
  const styleDesc = negotiationStyle === "aggressive"
    ? "The hiring manager will be budget-conscious and push back hard. Practice holding your ground."
    : negotiationStyle === "defensive"
    ? "The hiring manager will deflect and avoid committing. Practice being persistent."
    : "The hiring manager will be collaborative. Practice maximizing value through creative trade-offs.";

  // Dynamic playbook: role/industry-aware tips
  const isEngineering = /engineer|developer|sde|swe|tech|software|backend|frontend|fullstack/i.test(targetRole || "");
  const isStartup = /startup|early.?stage|seed|series/i.test(industry || "");
  const isFintech = /fintech|payments|banking|financial/i.test(industry || "");
  const isConsulting = /consult|advisory|strategy|management/i.test(industry || "");

  const tips = [
    { icon: "1", title: "Don't accept immediately", desc: "Thank them, express interest, then ask for details before responding." },
    { icon: "2", title: "Anchor high with reasoning", desc: isEngineering
      ? "Reference levels.fyi or Glassdoor data for your level. Anchor to the market, not your current CTC."
      : "State your target range backed by market data, not your current salary." },
    { icon: "3", title: "Think total comp", desc: isStartup
      ? "Equity is key in startups — ask about ESOP pool %, vesting schedule, cliff period, and strike price."
      : isFintech
      ? "Fintech often has strong variable pay — ask about performance bonus structure, RSUs, and retention bonuses."
      : "Negotiate equity, joining bonus, flexibility, and learning budget — not just base." },
    { icon: "4", title: "Trade, don't just ask", desc: isConsulting
      ? "Trade flexibility for base: 'I'll commit to weekend travel if we can agree on ₹X base + quarterly bonuses.'"
      : "\"I can accept ₹X base if you add a ₹Y joining bonus\" — give something to get something." },
    { icon: "5", title: "Close with next steps", desc: "Ask about timeline, offer letter, and start date. Don't leave it open-ended." },
  ];

  const handleStart = () => {
    const num = parseFloat(targetInput);
    if (onSetTarget && num > 0) onSetTarget(num);
    onDismiss();
  };

  return (
    <div style={{
      width: "100%", maxWidth: 480, borderRadius: 16,
      background: "rgba(212,179,127,0.04)",
      border: "1px solid rgba(212,179,127,0.15)",
      padding: "24px", display: "flex", flexDirection: "column", gap: 16,
      animation: "slideUp 0.5s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, color: c.ivory }}>Negotiation Playbook</span>
        {negotiationStyle && (
          <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, padding: "2px 8px", borderRadius: 6, background: "rgba(212,179,127,0.1)", marginLeft: "auto" }}>
            {styleLabel} Manager
          </span>
        )}
      </div>

      {negotiationStyle && (
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0, lineHeight: 1.5 }}>
          {styleDesc}
        </p>
      )}

      {/* Warm-up calibration: target salary input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="target-salary-input" style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Your target salary (optional)
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>₹</span>
          <input
            id="target-salary-input"
            type="number"
            placeholder="e.g. 25"
            value={targetInput}
            onChange={e => setTargetInput(e.target.value)}
            style={{
              flex: 1, fontFamily: font.ui, fontSize: 13, padding: "8px 12px",
              borderRadius: 8, background: "rgba(245,242,237,0.04)",
              border: "1px solid rgba(245,242,237,0.1)", color: c.ivory,
              outline: "none",
            }}
          />
          <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>LPA</span>
        </div>
        <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0 }}>
          Setting a target helps us coach you on whether you anchored high enough.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tips.map(tip => (
          <div key={tip.icon} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 700, color: c.gilt, minWidth: 20, height: 20, borderRadius: "50%", background: "rgba(212,179,127,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{tip.icon}</span>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory }}>{tip.title}</span>
              <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "2px 0 0", lineHeight: 1.4 }}>{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Multi-round scenario selection */}
      {onSelectScenario && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Scenario {scenarioRound ? `(Round ${scenarioRound})` : ""}
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {([
              { id: "standard", label: "Standard Offer", desc: "Typical negotiation from initial offer" },
              { id: "lowball", label: "Lowball Recovery", desc: "Offer 20-30% below market — fight back" },
              { id: "exploding", label: "Exploding Offer", desc: "24-hour deadline — handle pressure" },
              { id: "competing", label: "Competing Offers", desc: "Use multiple offers as leverage" },
            ]).map(s => (
              <button
                key={s.id}
                onClick={() => onSelectScenario(s.id)}
                title={s.desc}
                style={{
                  flex: 1, minWidth: 100, fontFamily: font.ui, fontSize: 10, fontWeight: 500,
                  padding: "6px 8px", borderRadius: 8,
                  background: "rgba(245,242,237,0.04)",
                  border: "1px solid rgba(245,242,237,0.08)",
                  color: c.chalk, cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleStart}
        style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 600,
          padding: "10px 20px", borderRadius: 10, marginTop: 4,
          background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
          border: "none", color: c.obsidian, cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        Got it — start negotiation
      </button>
    </div>
  );
});

/* ─── Post-Interview Deal Summary (shown after salary negotiation) ─── */

export const DealSummaryCard = memo(function DealSummaryCard({ transcript, negotiationBand, onReplay, negotiationStyle }: {
  transcript: { speaker: string; text: string; time: string }[];
  negotiationBand?: { initialOffer: number; maxStretch: number; walkAway: number } | null;
  onReplay?: (style: string) => void;
  negotiationStyle?: string;
}) {
  // Extract key numbers from the conversation
  const aiTexts = transcript.filter(t => t.speaker === "ai").map(t => t.text);
  const userTexts = transcript.filter(t => t.speaker === "user").map(t => t.text);
  const allText = [...aiTexts, ...userTexts].join(" ");

  // Extract salary numbers from conversation
  // Matches: ₹25 LPA, 25 lakhs, 25L, 25l, 25 lakh, ₹25.5 lpa, 12,00,000, 1200000, ₹25 per annum
  const salaryRe = /₹?\s*(\d+(?:[,.]\d+)*)\s*(?:l?pa|lakh|lakhs|[lL]\b|crore|crores|cr\b|per\s*annum)/gi;
  const userNumbers = userTexts.join(" ").match(salaryRe) || [];

  const parseNum = (s: string) => {
    const m = s.match(/(\d+(?:[,.]\d+)*)/);
    if (!m) return 0;
    const cleaned = m[1].replace(/,/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    // Convert crores to LPA (1 crore = 100 lakhs)
    if (/crore|cr\b/i.test(s)) return num * 100;
    // If suffix is explicitly lpa/lakh/L, the number IS in lakhs — return as-is
    if (/l?pa|lakh|lakhs|[lL]\b/i.test(s) && num < 1000) return num;
    // Large raw numbers (e.g. Indian format 12,50,000 or 1250000) — convert rupees to LPA
    if (num >= 100000) return Math.round(num / 100000 * 10) / 10;
    return num;
  };

  // Remove non-offer contexts from AI text before extracting salary numbers:
  // 1. Clauses where AI quotes the candidate ("you asked", "you mentioned", "your expectation", "you're expecting")
  // 2. Gap/difference/hike references ("₹34 LPA gap", "₹10 LPA difference", "₹15 LPA hike")
  // Strip candidate-reference clauses: stop at "and/but/," boundaries to avoid eating the whole sentence
  const candidateQuoteRe = /(?:(?:you(?:'re)?|your)\s+(?:asked?|mentioned?|wanted?|said|expect\w*|were\s+looking|requested|looking\s+for|targeting|counter\w*)[^.!?,;-]*?)(?=[.,;!?-]|\s+(?:and|but|however|we|I|let|our)\b|$)/gi;
  const gapContextRe = /₹?\s*\d+(?:[,.]\d+)*\s*(?:l?pa|lakh|lakhs|[lL]\b)[^.!?,;]*?(?:gap|difference|hike|increase|raise|jump|more\s+than)/gi;
  // Strip numbers that appear BEFORE a candidate-reference pattern (e.g. "₹50 LPA that you mentioned")
  const numBeforeQuoteRe = /₹?\s*\d+(?:[,.]\d+)*\s*(?:l?pa|lakh|lakhs|[lL]\b)\s*(?:that\s+|which\s+)?(?:you(?:'re)?|your)\s+(?:asked?|mentioned?|wanted?|expect\w*|were\s+looking|requested|targeting|said|looking)/gi;

  // Order matters: strip "₹X that you mentioned" FIRST, then "you wanted ₹X", then gap contexts
  const cleanAiText = (text: string) =>
    text.replace(numBeforeQuoteRe, "").replace(candidateQuoteRe, "").replace(gapContextRe, "");

  // Extract initial offer: prefer negotiationBand, else find the first AI "offer" context
  // Look for patterns like "offer of ₹X", "total of ₹X", "we can offer ₹X", "package of ₹X"
  let extractedInitialOffer = 0;
  if (!negotiationBand?.initialOffer) {
    const offerContextRe = /(?:offer(?:ing)?|total|package|ctc|compensation)\s+(?:of\s+|is\s+|at\s+|worth\s+)?₹?\s*(\d+(?:[,.]\d+)*)\s*(?:l?pa|lakh|lakhs|[lL]\b)/gi;
    for (const aiText of aiTexts) {
      const cleaned = cleanAiText(aiText);
      let m: RegExpExecArray | null;
      offerContextRe.lastIndex = 0;
      while ((m = offerContextRe.exec(cleaned)) !== null) {
        const num = parseNum(m[0]);
        if (num > 0 && extractedInitialOffer === 0) {
          extractedInitialOffer = num; // Take the FIRST offer-context number from AI
          break;
        }
      }
      if (extractedInitialOffer > 0) break;
    }
    // Fallback: if no offer-context found, take the first clean AI number
    if (extractedInitialOffer === 0) {
      for (const aiText of aiTexts) {
        const cleaned = cleanAiText(aiText);
        const nums = cleaned.match(salaryRe) || [];
        if (nums.length > 0) {
          extractedInitialOffer = parseNum(nums[0] ?? "");
          break;
        }
      }
    }
  }
  const initialOffer = negotiationBand?.initialOffer ?? extractedInitialOffer;

  // Final offer: scan AI messages backwards for the last offer (with non-offer contexts stripped)
  // Do NOT use an initialOffer floor — if the initial offer extraction was wrong, the floor propagates the error
  let finalOffer = initialOffer;
  let foundFinal = false;
  for (let i = aiTexts.length - 1; i >= 0; i--) {
    const cleaned = cleanAiText(aiTexts[i]);
    const nums = cleaned.match(salaryRe) || [];
    if (nums.length > 0) {
      const maxInMessage = Math.max(...nums.map(parseNum));
      // Only apply initialOffer floor when negotiationBand is available (trustworthy)
      finalOffer = negotiationBand ? Math.max(maxInMessage, initialOffer) : maxInMessage;
      foundFinal = true;
      break;
    }
  }
  // Fallback: if quote-stripping removed all numbers, try unfiltered as last resort
  if (!foundFinal && finalOffer === 0) {
    for (let i = aiTexts.length - 1; i >= 0; i--) {
      const nums = aiTexts[i].match(salaryRe) || [];
      if (nums.length > 0) {
        finalOffer = Math.max(...nums.map(parseNum));
        break;
      }
    }
  }
  // Safety: final offer should be at least as high as initial when negotiationBand confirms the initial
  if (negotiationBand && finalOffer < initialOffer) finalOffer = initialOffer;

  const candidateAsk = userNumbers.length > 0 ? Math.max(...userNumbers.map(parseNum)) : 0;

  const improvement = initialOffer > 0 ? Math.round(((finalOffer - initialOffer) / initialOffer) * 100) : 0;

  // Detect benefits negotiated — only count if discussed positively (not rejected/negated)
  const benefits: string[] = [];
  const benefitTest = (pattern: RegExp, negPattern?: RegExp) => {
    if (!pattern.test(allText)) return false;
    if (negPattern && negPattern.test(allText)) return false;
    return true;
  };
  if (benefitTest(/joining bonus|sign.?on bonus/i)) benefits.push("Joining Bonus");
  if (benefitTest(/esop|equity|stock option|rsu/i)) benefits.push("Equity/ESOPs");
  if (benefitTest(/work from home|remote work|wfh|hybrid work/i, /no (?:remote|wfh|work from home)/i)) benefits.push("Flexible Work");
  if (benefitTest(/learning (?:budget|allowance)|training budget|upskilling/i)) benefits.push("Learning Budget");
  if (benefitTest(/health (?:insurance|cover)|medical (?:insurance|cover)/i)) benefits.push("Health Insurance");
  if (benefitTest(/relocation (?:bonus|support|allowance|package)/i)) benefits.push("Relocation Support");
  if (benefitTest(/notice.*buyout|early.*joining/i)) benefits.push("Notice Buyout");

  // Grade: price improvement + benefits breadth (each benefit adds ~2.5% equivalent)
  const effectiveImprovement = improvement + benefits.length * 2.5;
  const grade = effectiveImprovement >= 15 ? "A" : effectiveImprovement >= 10 ? "B+" : effectiveImprovement >= 5 ? "B" : effectiveImprovement > 0 ? "C+" : "C";
  const gradeColor = grade.startsWith("A") ? c.sage : grade.startsWith("B") ? c.gilt : c.ember;

  // If no salary numbers could be extracted, show a simplified card with benefits + replay
  if (initialOffer === 0) {
    return (
      <div style={{
        width: "100%", borderRadius: 16,
        background: "rgba(212,179,127,0.03)",
        border: "1px solid rgba(212,179,127,0.12)",
        padding: "20px", display: "flex", flexDirection: "column", gap: 14,
        animation: "slideUp 0.5s ease",
      }}>
        <span style={{ fontFamily: font.display, fontSize: 14, fontWeight: 600, color: c.ivory }}>Negotiation Complete</span>
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0, lineHeight: 1.5 }}>
          We couldn't extract specific offer numbers from this session. This can happen when the conversation focused on non-salary aspects or when using fallback questions.
        </p>
        {benefits.length > 0 && (
          <div>
            <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Topics Discussed</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {benefits.map(b => (
                <span key={b} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, padding: "3px 8px", borderRadius: 6, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.12)" }}>{b}</span>
              ))}
            </div>
          </div>
        )}
        {onReplay && (
          <div>
            <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Try again with a different style</p>
            <div style={{ display: "flex", gap: 8 }}>
              {([{ style: "cooperative", label: "Friendly" }, { style: "aggressive", label: "Tough" }, { style: "defensive", label: "Evasive" }] as const).map(s => (
                <button key={s.style} onClick={() => onReplay(s.style)} style={{ flex: 1, fontFamily: font.ui, fontSize: 11, fontWeight: 500, padding: "8px 10px", borderRadius: 8, background: "rgba(245,242,237,0.04)", border: "1px solid rgba(245,242,237,0.08)", color: c.chalk, cursor: "pointer" }}>{s.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", borderRadius: 16,
      background: "rgba(212,179,127,0.03)",
      border: "1px solid rgba(212,179,127,0.12)",
      padding: "20px", display: "flex", flexDirection: "column", gap: 14,
      animation: "slideUp 0.5s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: font.display, fontSize: 14, fontWeight: 600, color: c.ivory }}>Deal Summary</span>
        <span style={{ fontFamily: font.ui, fontSize: 20, fontWeight: 700, color: gradeColor }}>{grade}</span>
      </div>

      {/* Numbers row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Initial Offer", value: `₹${initialOffer} LPA`, color: c.stone },
          ...(candidateAsk > 0 ? [{ label: "Your Ask", value: `₹${candidateAsk} LPA`, color: c.chalk }] : []),
          { label: "Final Package", value: `₹${finalOffer} LPA`, color: c.gilt },
        ].map(item => (
          <div key={item.label} style={{ flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 10, background: "rgba(245,242,237,0.03)", border: "1px solid rgba(245,242,237,0.06)" }}>
            <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
            <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: item.color, margin: "4px 0 0" }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Improvement */}
      {improvement !== 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: improvement > 0 ? "rgba(122,158,126,0.06)" : "rgba(196,112,90,0.06)", border: `1px solid ${improvement > 0 ? "rgba(122,158,126,0.15)" : "rgba(196,112,90,0.15)"}` }}>
          <span style={{ fontFamily: font.ui, fontSize: 18, fontWeight: 700, color: improvement > 0 ? c.sage : c.ember }}>
            {improvement > 0 ? "+" : ""}{improvement}%
          </span>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
            {improvement > 0 ? "improvement from initial offer" : "below initial offer"}
          </span>
        </div>
      )}

      {/* Benefits negotiated */}
      {benefits.length > 0 && (
        <div>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Benefits Discussed</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {benefits.map(b => (
              <span key={b} style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, padding: "3px 8px", borderRadius: 6, background: "rgba(212,179,127,0.08)", border: "1px solid rgba(212,179,127,0.12)" }}>{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Negotiation Insights — band capture, style faced, coaching */}
      {negotiationBand && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Negotiation Insights</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Band capture: how much of the available range did they get? */}
            {(() => {
              const bandRange = negotiationBand.maxStretch - negotiationBand.initialOffer;
              const captured = bandRange > 0 ? Math.round(((finalOffer - negotiationBand.initialOffer) / bandRange) * 100) : 0;
              const captureColor = captured >= 70 ? c.sage : captured >= 40 ? c.gilt : c.ember;
              return (
                <div style={{ flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, background: "rgba(245,242,237,0.03)", border: "1px solid rgba(245,242,237,0.06)" }}>
                  <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Band Captured</p>
                  <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 700, color: captureColor, margin: "2px 0 0" }}>{Math.max(0, captured)}%</p>
                  <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: "2px 0 0" }}>of ₹{negotiationBand.initialOffer}–₹{negotiationBand.maxStretch} range</p>
                </div>
              );
            })()}
            {/* Manager style faced */}
            {negotiationStyle && (
              <div style={{ flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, background: "rgba(245,242,237,0.03)", border: "1px solid rgba(245,242,237,0.06)" }}>
                <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Manager Style</p>
                <p style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, margin: "2px 0 0" }}>
                  {negotiationStyle === "aggressive" ? "Tough" : negotiationStyle === "defensive" ? "Evasive" : "Collaborative"}
                </p>
                <p style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, margin: "2px 0 0" }}>
                  {negotiationStyle === "aggressive" ? "Budget-conscious pushback" : negotiationStyle === "defensive" ? "Deflects & delays" : "Open to trade-offs"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Negotiation Replay — try again with a different hiring manager style */}
      {onReplay && (
        <div>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Replay with different style</p>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { style: "cooperative", label: "Friendly", emoji: "" },
              { style: "aggressive", label: "Tough", emoji: "" },
              { style: "defensive", label: "Evasive", emoji: "" },
            ] as const).map(s => (
              <button
                key={s.style}
                onClick={() => onReplay(s.style)}
                style={{
                  flex: 1, fontFamily: font.ui, fontSize: 11, fontWeight: 500,
                  padding: "8px 10px", borderRadius: 8,
                  background: "rgba(245,242,237,0.04)",
                  border: "1px solid rgba(245,242,237,0.08)",
                  color: c.chalk, cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* ─── Live Negotiation Dashboard (shown during salary negotiation) ─── */

export const NegotiationLiveDashboard = memo(function NegotiationLiveDashboard({ liveState, negotiationBand, highestOffer, targetSalary, voiceConfidence, negotiationStyle }: {
  liveState: {
    facts: { candidateCounter: string | null; hasCompetingOffers: boolean; topicsRaised: string[]; acceptedImmediately: boolean; mentionedBATNA: boolean };
    phase: string;
    leverage: number;
    topicsCovered: { topic: string; covered: boolean }[];
    phaseIdx: number;
    totalPhases: number;
  };
  negotiationBand?: { initialOffer: number; maxStretch: number; walkAway: number } | null;
  highestOffer: number;
  targetSalary: number | null;
  voiceConfidence?: { score: number; volume: number; variability: number } | null;
  negotiationStyle?: string;
}) {
  const styleMap: Record<string, { label: string; color: string; icon: string }> = {
    cooperative: { label: "Friendly", color: c.sage, icon: "🤝" },
    aggressive: { label: "Tough", color: c.ember, icon: "💪" },
    defensive: { label: "Evasive", color: c.gilt, icon: "🛡" },
  };
  const styleInfo = negotiationStyle ? styleMap[negotiationStyle] || { label: negotiationStyle, color: c.stone, icon: "👤" } : null;
  const phaseLabels: Record<string, string> = {
    "offer-reaction": "React to Offer",
    "probe-expectations": "Share Expectations",
    "counter-offer": "Counter-Offer",
    "benefits-discussion": "Negotiate Benefits",
    "closing-pressure": "Handle Pressure",
    "closing": "Close the Deal",
  };
  const phaseGuidance: Record<string, string> = {
    "offer-reaction": "Don't accept yet. Thank them, show interest, and ask for details.",
    "probe-expectations": "Share your research-backed expectations. Anchor high with reasoning.",
    "counter-offer": "State your specific number. Trade concessions — don't just ask.",
    "benefits-discussion": "Think total comp: equity, bonus, flexibility, learning budget.",
    "closing-pressure": "Use competing offers or BATNA. Don't fold under deadline pressure.",
    "closing": "Confirm all terms explicitly. Set clear next steps and timelines.",
  };
  const leverageColor = liveState.leverage >= 70 ? c.sage : liveState.leverage >= 40 ? c.gilt : c.ember;
  const coveredCount = liveState.topicsCovered.filter(t => t.covered).length;

  return (
    <div style={{
      width: "100%", borderRadius: 14,
      background: "rgba(212,179,127,0.03)",
      border: "1px solid rgba(212,179,127,0.1)",
      padding: "16px", display: "flex", flexDirection: "column", gap: 12,
      animation: "fadeUp 0.3s ease",
    }}>
      {/* Phase Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Phase</span>
        <div style={{ flex: 1, display: "flex", gap: 3 }}>
          {Array.from({ length: liveState.totalPhases }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= liveState.phaseIdx ? c.gilt : "rgba(245,242,237,0.08)",
              transition: "background 0.3s ease",
            }} />
          ))}
        </div>
        <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.gilt, flexShrink: 0 }}>
          {phaseLabels[liveState.phase] || liveState.phase}
        </span>
      </div>

      {/* Manager Style + Phase Guidance */}
      <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(212,179,127,0.06)", border: "1px solid rgba(212,179,127,0.08)" }}>
        {styleInfo && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11 }}>{styleInfo.icon}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: styleInfo.color }}>
              {styleInfo.label} Manager
            </span>
          </div>
        )}
        <p style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk, margin: 0, lineHeight: 1.4 }}>
          {phaseGuidance[liveState.phase] || "Stay composed and negotiate professionally."}
        </p>
      </div>

      {/* Position vs Band */}
      {negotiationBand && negotiationBand.initialOffer > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Walk-away ₹{negotiationBand.walkAway}</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Max ₹{negotiationBand.maxStretch}</span>
          </div>
          <div style={{ position: "relative", height: 20, borderRadius: 10, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
            {/* Band range */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: "100%", borderRadius: 10,
              background: "linear-gradient(90deg, rgba(196,112,90,0.2), rgba(212,179,127,0.2), rgba(122,158,126,0.2))",
            }} />
            {/* Highest offer marker */}
            {highestOffer > 0 && (() => {
              const range = negotiationBand.maxStretch - negotiationBand.walkAway;
              const pos = range > 0 ? Math.max(0, Math.min(100, ((highestOffer - negotiationBand.walkAway) / range) * 100)) : 50;
              return (
                <div style={{
                  position: "absolute", left: `${pos}%`, top: 0, bottom: 0,
                  width: 3, background: c.gilt, borderRadius: 2,
                  transform: "translateX(-50%)", zIndex: 2,
                }}>
                  <div style={{
                    position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap",
                    fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: c.gilt,
                  }}>₹{highestOffer}</div>
                </div>
              );
            })()}
            {/* Target marker */}
            {targetSalary && (() => {
              const range = negotiationBand.maxStretch - negotiationBand.walkAway;
              const pos = range > 0 ? Math.max(0, Math.min(100, ((targetSalary - negotiationBand.walkAway) / range) * 100)) : 50;
              return (
                <div style={{
                  position: "absolute", left: `${pos}%`, top: 0, bottom: 0,
                  width: 2, background: c.sage, borderRadius: 1,
                  transform: "translateX(-50%)", zIndex: 1,
                  borderLeft: `1px dashed ${c.sage}`,
                }}>
                  <div style={{
                    position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap",
                    fontFamily: font.ui, fontSize: 9, fontWeight: 600, color: c.sage,
                  }}>Target</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Leverage Meter + Voice Confidence (side by side) */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, textTransform: "uppercase", letterSpacing: "0.04em" }}>Leverage</span>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: leverageColor }}>{liveState.leverage}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${liveState.leverage}%`, background: leverageColor, transition: "width 0.5s ease, background 0.3s ease" }} />
          </div>
        </div>
        {voiceConfidence && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, textTransform: "uppercase", letterSpacing: "0.04em" }}>Voice</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 700, color: voiceConfidence.score >= 60 ? c.sage : voiceConfidence.score >= 35 ? c.gilt : c.ember }}>{voiceConfidence.score}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(245,242,237,0.06)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, width: `${voiceConfidence.score}%`,
                background: voiceConfidence.score >= 60 ? c.sage : voiceConfidence.score >= 35 ? c.gilt : c.ember,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Topics Checklist (compact) */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, textTransform: "uppercase", letterSpacing: "0.04em" }}>Topics Discussed</span>
          <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{coveredCount}/{liveState.topicsCovered.length}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {liveState.topicsCovered.map(t => (
            <span key={t.topic} style={{
              fontFamily: font.ui, fontSize: 9, padding: "2px 6px", borderRadius: 4,
              background: t.covered ? "rgba(122,158,126,0.12)" : "rgba(245,242,237,0.04)",
              color: t.covered ? c.sage : c.stone,
              border: `1px solid ${t.covered ? "rgba(122,158,126,0.2)" : "rgba(245,242,237,0.06)"}`,
              textDecoration: t.covered ? "none" : "none",
              opacity: t.covered ? 1 : 0.6,
            }}>
              {t.covered ? "\u2713 " : ""}{t.topic}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});

/* ─── Annotated Replay Panel (post-session negotiation transcript with turn-by-turn annotations) ─── */

export const AnnotatedReplayPanel = memo(function AnnotatedReplayPanel({ transcript, negotiationBand }: {
  transcript: { speaker: string; text: string; time?: string }[];
  negotiationBand?: { initialOffer: number; maxStretch: number; walkAway: number } | null;
}) {
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);

  // Generate per-turn annotations
  const annotatedTurns = React.useMemo(() => {
    return transcript.map((turn, idx) => {
      const annotations: { type: "positive" | "negative" | "neutral"; text: string }[] = [];
      const text = turn.text;
      if (turn.speaker === "user") {
        // Check for salary numbers
        if (/₹?\s*\d+(?:\.\d+)?\s*(?:lpa|lakh)/i.test(text)) {
          annotations.push({ type: "positive", text: "Named a specific number — anchoring." });
        }
        if (/(?:equity|esop|stock|rsu)/i.test(text)) {
          annotations.push({ type: "positive", text: "Explored equity/ESOPs — thinking total comp." });
        }
        if (/(?:other offer|competing|another company)/i.test(text)) {
          annotations.push({ type: "positive", text: "Mentioned competing offers — building leverage." });
        }
        if (/(?:joining bonus|sign.?on|bonus)/i.test(text)) {
          annotations.push({ type: "positive", text: "Asked about joining bonus." });
        }
        if (/(?:remote|wfh|flexible|hybrid)/i.test(text)) {
          annotations.push({ type: "positive", text: "Negotiated flexibility — total package thinking." });
        }
        if (/(?:i accept|sounds good|that works|it.?s a deal|fine with me)/i.test(text) && idx < transcript.length - 2) {
          annotations.push({ type: "negative", text: "Accepted early — may have left value on the table." });
        }
        if (/(?:current(?:ly)?\s+(?:earning|getting|making|drawing)|my ctc)/i.test(text)) {
          annotations.push({ type: "negative", text: "Revealed current salary — weaker bargaining position." });
        }
        if (text.trim().split(/\s+/).length < 8 && idx > 0) {
          annotations.push({ type: "neutral", text: "Short response — could be tactical silence or missed opportunity." });
        }
        if (/(?:market.*data|glassdoor|levels\.fyi|benchmark|ambition\s*box)/i.test(text)) {
          annotations.push({ type: "positive", text: "Referenced market data — strong justification." });
        }
        if (/(?:walk away|alternative|plan b|other option)/i.test(text)) {
          annotations.push({ type: "positive", text: "Mentioned BATNA — strong leverage signal." });
        }
        if (/(?:need time|think about|sleep on|let me think|get back to you)/i.test(text)) {
          annotations.push({ type: "positive", text: "Asked for time — prevents pressure-driven decisions." });
        }
        if (annotations.length === 0 && text.length > 20) {
          annotations.push({ type: "neutral", text: "General response — consider adding specific numbers or trade-offs." });
        }
      } else {
        // AI turn annotations
        const offerMatch = text.match(/₹\s*(\d+(?:\.\d+)?)\s*(?:LPA|lpa|lakh)/);
        if (offerMatch) {
          const offer = parseFloat(offerMatch[1]);
          if (negotiationBand) {
            const bandPos = ((offer - negotiationBand.walkAway) / (negotiationBand.maxStretch - negotiationBand.walkAway)) * 100;
            annotations.push({ type: "neutral", text: `Offered ₹${offer} LPA (${Math.round(bandPos)}% of their range).` });
          }
        }
        if (/(?:can'?t|unable|not possible|budget|constraint|limit)/i.test(text)) {
          annotations.push({ type: "neutral", text: "Pushback — test your composure. Counter with reasoning." });
        }
        if (/(?:final|last|best|take it or leave)/i.test(text)) {
          annotations.push({ type: "neutral", text: "Closing pressure — don't cave. Explore other components." });
        }
      }
      return { ...turn, annotations };
    });
  }, [transcript, negotiationBand]);

  return (
    <div style={{
      width: "100%", borderRadius: 14,
      background: "rgba(245,242,237,0.02)",
      border: `1px solid ${c.border}`,
      padding: "16px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span style={{ fontFamily: font.display, fontSize: 13, fontWeight: 600, color: c.ivory }}>Negotiation Replay</span>
        <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone, marginLeft: "auto" }}>Click any turn for annotations</span>
      </div>

      {annotatedTurns.map((turn, idx) => {
        const isUser = turn.speaker === "user";
        const isExpanded = expandedTurn === idx;
        const hasAnnotations = turn.annotations.length > 0;
        return (
          <div
            key={idx}
            role={hasAnnotations ? "button" : undefined}
            tabIndex={hasAnnotations ? 0 : undefined}
            onClick={() => hasAnnotations && setExpandedTurn(isExpanded ? null : idx)}
            onKeyDown={(e) => { if (hasAnnotations && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setExpandedTurn(isExpanded ? null : idx); } }}
            style={{
              padding: "8px 12px", borderRadius: 10,
              background: isUser ? "rgba(212,179,127,0.04)" : "rgba(245,242,237,0.02)",
              border: `1px solid ${isExpanded ? "rgba(212,179,127,0.2)" : "rgba(245,242,237,0.05)"}`,
              cursor: hasAnnotations ? "pointer" : "default",
              transition: "border-color 0.2s ease",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                fontFamily: font.ui, fontSize: 9, fontWeight: 700, color: isUser ? c.gilt : c.stone,
                textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, marginTop: 2,
              }}>
                {isUser ? "You" : "HR"}
              </span>
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, margin: 0, lineHeight: 1.5, flex: 1 }}>
                {turn.text.length > 200 ? turn.text.slice(0, 200) + "..." : turn.text}
              </p>
              {hasAnnotations && (
                <span style={{ fontFamily: font.ui, fontSize: 9, color: c.stone, flexShrink: 0, marginTop: 2 }}>
                  {turn.annotations.length}
                </span>
              )}
            </div>
            {isExpanded && turn.annotations.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(245,242,237,0.06)", display: "flex", flexDirection: "column", gap: 4 }}>
                {turn.annotations.map((a, ai) => (
                  <div key={ai} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: a.type === "positive" ? c.sage : a.type === "negative" ? c.ember : c.stone,
                    }} />
                    <span style={{
                      fontFamily: font.ui, fontSize: 11,
                      color: a.type === "positive" ? c.sage : a.type === "negative" ? c.ember : c.stone,
                      lineHeight: 1.4,
                    }}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

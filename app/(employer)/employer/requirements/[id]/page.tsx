"use client";

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEmployerData, Requirement } from "@/employer/EmployerDataContext";
import { useToast } from "@/Toast";
import { Candidate } from "@/employer/mockData";
import { tokens as t, fonts as f } from "@/auth/_tokens";
import {
  Card,
  Eyebrow,
  EmployerIcon,
  HelpText,
  OutlineCta,
  Pill,
  PrimaryCta,
  ScoreChip,
  SkillTag,
  StatCell,
  StatusChip,
} from "@/employer/_atoms";

function experienceLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} yrs experience`;
  if (min != null) return `${min}+ yrs experience`;
  return `Up to ${max} yrs experience`;
}

function daysUntil(dueDate: string): number {
  return Math.round((new Date(`${dueDate}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

// Real match-score tiers (mirrors the >=85 / >=70 thresholds ScoreChip already
// uses) standing in for the reference layout's interview-round pipeline —
// HireStepX has no interview-round data, but this is the closest genuine
// equivalent: how many shared candidates land in each match-quality band.
const scoreTiers: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "strong", label: "Strong match", min: 85, max: 101 },
  { key: "good", label: "Good match", min: 70, max: 85 },
  { key: "fair", label: "Fair match", min: 50, max: 70 },
  { key: "low", label: "Low match", min: 0, max: 50 },
];

const tierColors: Record<string, string> = {
  strong: t.success,
  good: t.indigo,
  fair: t.warning,
  low: t.inkFaintWeak,
};

const th: CSSProperties = {
  textAlign: "left",
  fontFamily: f.sans,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: t.inkFaint,
  padding: "0 14px 12px",
};

// Mirrors the search/filter toolbar on /employer/jobs (selectStyle) so the
// two candidate-facing tables in the console share one input language.
const toolbarInputStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: `1px solid ${t.line}`,
  background: t.white,
  fontFamily: f.sans,
  fontSize: 13,
  color: t.coal,
};

type ContactFilter = "all" | "locked" | "unlocked";
type SortKey = "match" | "recent";

const contactFilterOptions: Array<{ value: ContactFilter; label: string }> = [
  { value: "all", label: "All candidates" },
  { value: "unlocked", label: "Unlocked" },
  { value: "locked", label: "Locked" },
];

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "match", label: "Best match" },
  { value: "recent", label: "Most recently active" },
];

const td: CSSProperties = {
  padding: "14px",
  borderTop: `1px solid ${t.line}`,
  fontFamily: f.sans,
  fontSize: 13.5,
  color: t.coal,
  verticalAlign: "top",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function CandidateAvatar({ name, unlocked }: { name: string; unlocked: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: unlocked ? t.indigo100 : t.creamSoft,
        color: unlocked ? t.indigoDeep : t.inkFaint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: f.sans,
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {unlocked ? initials(name) : "?"}
    </div>
  );
}

function GeneratingState() {
  return (
    <div style={{ textAlign: "center", padding: "80px 0" }}>
      <div style={{ width: 40, height: 40, margin: "0 auto 20px", border: `3px solid ${t.indigo100}`, borderTopColor: t.indigo, borderRadius: "50%", animation: "hsx-emp-spin 0.8s linear infinite" }} />
      <style>{`@keyframes hsx-emp-spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ fontFamily: f.serif, fontSize: 22, color: t.coal, margin: "0 0 8px" }}>Matching candidates…</h2>
      <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft }}>
        We're scoring active candidates against this requirement. This usually takes under a minute.
      </p>
    </div>
  );
}

function ZeroMatchState() {
  return (
    <Card style={{ textAlign: "center", padding: 48 }}>
      <h2 style={{ fontFamily: f.serif, fontSize: 22, color: t.coal, margin: "0 0 8px" }}>No matches yet</h2>
      <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, marginBottom: 20 }}>
        No candidates currently practicing on HireStepX match this requirement closely enough to shortlist.
        Try widening the location or notice period, or check back as more candidates practice this week.
      </p>
      <Link href="/employer/requirements/new" style={{ textDecoration: "none" }}>
        <OutlineCta>Post a broader requirement</OutlineCta>
      </Link>
    </Card>
  );
}

function FailedState() {
  return (
    <Card style={{ textAlign: "center", padding: 48 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: t.error100, color: t.error, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <EmployerIcon.Alert />
      </div>
      <h2 style={{ fontFamily: f.serif, fontSize: 22, color: t.coal, margin: "0 0 8px" }}>Matching failed</h2>
      <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, marginBottom: 20 }}>
        Something went wrong generating this shortlist. No charge was made — you can safely try again.
      </p>
      <Link href="/employer/requirements/new" style={{ textDecoration: "none" }}>
        <PrimaryCta icon={<EmployerIcon.Refresh />}>Try again</PrimaryCta>
      </Link>
    </Card>
  );
}

// Dynamically loads the Razorpay checkout script with a CSP nonce — see
// handleCheckout in src/dashboardComponents.tsx for the original pattern
// this mirrors (strict-dynamic CSP means a script tag without the nonce
// is silently blocked, not rejected).
function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    const nonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute("content");
    if (nonce) s.nonce = nonce;
    const timer = setTimeout(() => { s.remove(); reject(new Error("timeout")); }, 10_000);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
}

function CandidateTableRow({
  candidate,
  requirementId,
  readOnly,
  compareChecked,
  onToggleCompare,
  compareDisabled,
  onUnlocked,
}: {
  candidate: Candidate;
  requirementId: string;
  readOnly: boolean;
  compareChecked: boolean;
  onToggleCompare: () => void;
  compareDisabled: boolean;
  onUnlocked: (candidateId: string, name: string, email: string) => void;
}) {
  const { createUnlockOrder, verifyUnlockPayment } = useEmployerData();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Display-only — mirrors the >= 60 threshold in
  // server-handlers/_unlock-pricing.ts, which is the sole source of truth
  // for the amount actually charged.
  const displayPrice = candidate.matchScore >= 60 ? "₹1,999" : "₹999";

  const handleConfirmUnlock = async () => {
    setUnlocking(true);
    const order = await createUnlockOrder(candidate.id);
    if (!order) {
      setUnlocking(false);
      toast("Couldn't start payment — please try again", "error");
      return;
    }

    try {
      await loadRazorpayScript();
    } catch {
      setUnlocking(false);
      toast("Payment system failed to load. Check your connection and try again.", "error");
      return;
    }
    if (!window.Razorpay) {
      setUnlocking(false);
      toast("Payment system not available. Please refresh and try again.", "error");
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      order_id: order.orderId,
      theme: { color: t.indigo },
      method: { upi: true, card: true, netbanking: true, wallet: true },
      handler: async function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
        const result = await verifyUnlockPayment({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
        setUnlocking(false);
        setConfirming(false);
        if (!result) {
          toast("Payment received but unlock failed — contact support@hirestepx.com", "error");
          return;
        }
        onUnlocked(candidate.id, result.name, result.contact.email);
        toast(`Unlocked ${result.name}'s contact details`, "success");
      },
      modal: {
        ondismiss: function () { setUnlocking(false); },
      },
    });
    (rzp as unknown as { on(event: string, cb: (r: unknown) => void): void }).on("payment.failed", function (response: unknown) {
      const errDetail = (response as { error?: { description?: string; reason?: string } })?.error;
      toast(errDetail?.description || errDetail?.reason || "Payment failed. Please try again.", "error");
      setUnlocking(false);
    });
    rzp.open();
  };

  return (
    <tr>
      {!readOnly && (
        <td style={{ ...td, width: 32 }}>
          <input
            type="checkbox"
            checked={compareChecked}
            disabled={compareDisabled && !compareChecked}
            onChange={onToggleCompare}
            title="Select to compare"
            style={{ width: 16, height: 16 }}
          />
        </td>
      )}
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CandidateAvatar name={candidate.name} unlocked={candidate.unlocked} />
          <div>
            <Link
              href={`/employer/requirements/${requirementId}/candidates/${candidate.id}`}
              style={{ fontWeight: 700, fontSize: 14, color: t.coal, textDecoration: "none" }}
              onMouseOver={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseOut={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              {candidate.unlocked ? candidate.name : `Candidate #${candidate.id.slice(0, 6)}`}
            </Link>
            <div style={{ fontSize: 12.5, color: t.inkFaint, marginTop: 2 }}>
              {candidate.targetRole} · {candidate.city}
            </div>
          </div>
        </div>
      </td>
      <td style={td}>
        <ScoreChip score={candidate.matchScore} />
      </td>
      <td style={{ ...td, color: t.inkSoft }}>
        {candidate.rosterScore} roster · {candidate.sessionsCompleted} sessions
      </td>
      <td style={{ ...td, color: t.inkSoft }}>
        {candidate.lastActiveDaysAgo < 0 ? "—" : `${candidate.lastActiveDaysAgo}d ago`}
      </td>
      <td style={{ ...td, color: t.inkSoft }}>
        {candidate.resume?.noticePeriod || <span style={{ color: t.inkFaint }}>—</span>}
      </td>
      <td style={{ ...td, color: t.inkSoft }}>
        {candidate.resume?.currentCtc ? (
          <>
            {candidate.resume.currentCtc}
            <div style={{ fontFamily: f.sans, fontSize: 10.5, color: t.inkFaint, marginTop: 2 }}>self-reported</div>
          </>
        ) : (
          <span style={{ color: t.inkFaint }}>—</span>
        )}
      </td>
      <td style={{ ...td, maxWidth: 220 }}>
        {candidate.skills.length ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {candidate.skills.slice(0, 3).map((s) => (
              <SkillTag key={s}>{s}</SkillTag>
            ))}
            {candidate.skills.length > 3 && (
              <span style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint, alignSelf: "center" }}>
                +{candidate.skills.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: t.inkFaint }}>—</span>
        )}
      </td>
      <td style={td}>
        <Pill tone={candidate.unlocked ? "success" : "neutral"}>{candidate.unlocked ? "Unlocked" : "Locked"}</Pill>
      </td>
      <td style={{ ...td, minWidth: 200 }}>
        {candidate.unlocked ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <span style={{ fontFamily: f.sans, fontSize: 12.5, color: t.coal }}>{candidate.contact?.email}</span>
            {!readOnly && (
              <Link href={`/employer/requirements/${requirementId}/outcome?candidate=${candidate.id}`} style={{ textDecoration: "none" }}>
                <OutlineCta size="sm">How did it go?</OutlineCta>
              </Link>
            )}
          </div>
        ) : readOnly ? (
          <HelpText>Unlocking closed</HelpText>
        ) : confirming ? (
          <div style={{ background: t.creamSoft, borderRadius: 10, padding: 10 }}>
            <div style={{ fontFamily: f.sans, fontSize: 12.5, color: t.coal, marginBottom: 8 }}>
              Unlock for <strong>{displayPrice}</strong>?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <PrimaryCta size="sm" onClick={handleConfirmUnlock} disabled={unlocking}>
                {unlocking ? "Unlocking…" : "Confirm"}
              </PrimaryCta>
              <OutlineCta size="sm" onClick={() => setConfirming(false)}>Cancel</OutlineCta>
            </div>
          </div>
        ) : (
          <PrimaryCta size="sm" icon={<EmployerIcon.Lock />} onClick={() => setConfirming(true)}>
            Unlock — {displayPrice}
          </PrimaryCta>
        )}
      </td>
    </tr>
  );
}

export default function RequirementDetailPage() {
  const params = useParams<{ id: string }>();
  const { fetchRequirementDetail } = useEmployerData();
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [descExpanded, setDescExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"candidates" | "description">("candidates");
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("match");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetchRequirementDetail(params.id);
    setRequirement(r);
    setLoading(false);
  }, [fetchRequirementDetail, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // A freshly created requirement matches synchronously on the server, so
  // by the time this page loads it's already past "generating" in
  // practice — this poll only covers the rare case of a stale fetch.
  useEffect(() => {
    if (requirement?.status !== "generating") return;
    const timer = setTimeout(load, 2500);
    return () => clearTimeout(timer);
  }, [requirement?.status, load]);

  const locationOptions = useMemo(() => {
    const cities = new Set((requirement?.candidates ?? []).map((c) => c.city).filter((c) => c && c !== "Not specified"));
    return Array.from(cities).sort();
  }, [requirement]);

  const filteredSorted = useMemo(() => {
    const candidates = requirement?.candidates ?? [];
    const q = search.trim().toLowerCase();
    const filtered = candidates.filter((c) => {
      if (contactFilter === "locked" && c.unlocked) return false;
      if (contactFilter === "unlocked" && !c.unlocked) return false;
      if (locationFilter !== "all" && c.city !== locationFilter) return false;
      if (!q) return true;
      const haystack = [c.unlocked ? c.name : "", c.targetRole, c.city, c.resume?.noticePeriod || "", ...c.skills].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const recency = (c: Candidate) => (c.lastActiveDaysAgo < 0 ? Number.POSITIVE_INFINITY : c.lastActiveDaysAgo);
    return filtered.sort((a, b) => (sortKey === "match" ? b.matchScore - a.matchScore : recency(a) - recency(b)));
  }, [requirement, search, contactFilter, locationFilter, sortKey]);

  const handleUnlocked = (candidateId: string, name: string, email: string) => {
    setRequirement((prev) =>
      prev
        ? {
            ...prev,
            candidates: prev.candidates.map((c) =>
              c.id !== candidateId ? c : { ...c, unlocked: true, name, contact: { email } }
            ),
          }
        : prev
    );
  };

  if (loading) {
    return (
      <Card style={{ textAlign: "center", padding: 48 }}>
        <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft }}>Loading…</p>
      </Card>
    );
  }

  if (!requirement) {
    return (
      <Card style={{ textAlign: "center", padding: 48 }}>
        <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft }}>Requirement not found.</p>
      </Card>
    );
  }

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : prev.length < 2 ? [...prev, id] : prev));
  };

  const readOnly = requirement.status === "closed";
  const unlockedCount = requirement.candidates.filter((c) => c.unlocked).length;
  const avgMatch = requirement.candidates.length
    ? Math.round(requirement.candidates.reduce((sum, c) => sum + c.matchScore, 0) / requirement.candidates.length)
    : 0;
  const expLabel = experienceLabel(requirement.experienceMin, requirement.experienceMax);
  const dueDaysLeft = requirement.dueDate ? daysUntil(requirement.dueDate) : null;
  const tierCounts = scoreTiers.map((tier) => ({
    ...tier,
    count: requirement.candidates.filter((c) => c.matchScore >= tier.min && c.matchScore < tier.max).length,
  }));
  const hasCandidates = requirement.candidates.length > 0 && requirement.status !== "generating";

  return (
    <div>
      {/* Mirrors the back-link on the candidate-detail page (rotated
          EmployerIcon.Arrow) so both detail surfaces share one breadcrumb
          language instead of a one-off pattern here. */}
      <Link
        href="/employer/jobs"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: f.sans, fontSize: 12.5, fontWeight: 600, color: t.inkSoft, textDecoration: "none", marginBottom: 16 }}
      >
        <span style={{ display: "inline-block", transform: "rotate(180deg)" }}>
          <EmployerIcon.Arrow />
        </span>
        Jobs
      </Link>

      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <Eyebrow tone="indigo">
              {(requirement.locations.length > 0 ? requirement.locations.join(", ") : requirement.location)} · {requirement.noticePeriodPref} notice
            </Eyebrow>
            <h1 style={{ fontFamily: f.serif, fontSize: 28, color: t.coal, margin: "6px 0 0" }}>{requirement.title}</h1>
          </div>
          <StatusChip status={requirement.status} />
        </div>

        {requirement.description && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
            <p
              style={{
                fontFamily: f.sans,
                fontSize: 13.5,
                color: t.inkSoft,
                lineHeight: 1.6,
                margin: 0,
                display: descExpanded ? "block" : "-webkit-box",
                WebkitLineClamp: descExpanded ? undefined : 2,
                WebkitBoxOrient: "vertical",
                overflow: descExpanded ? "visible" : "hidden",
              }}
            >
              {requirement.description}
            </p>
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, marginTop: 6, fontFamily: f.sans, fontSize: 12.5, fontWeight: 600, color: t.indigo, cursor: "pointer" }}
            >
              {descExpanded ? "Show less" : "Read more"}
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
          {expLabel && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: f.sans, fontSize: 12.5, color: t.inkFaint }}>
              <EmployerIcon.Clock /> {expLabel}
            </span>
          )}
          {dueDaysLeft != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: f.sans, fontSize: 12.5, color: t.inkFaint }}>
              <EmployerIcon.Clock /> {dueDaysLeft < 0 ? `${Math.abs(dueDaysLeft)}d overdue` : dueDaysLeft === 0 ? "Due today" : `${dueDaysLeft}d until due`}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: f.sans, fontSize: 12.5, color: t.inkFaint }}>
            <EmployerIcon.Building /> Posted {requirement.createdAt}
          </span>
        </div>

        {hasCandidates ? (
          <>
            <div style={{ display: "flex", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
              <StatCell label="Candidates shared" value={String(requirement.candidates.length)} unit="" />
              <StatCell label="Contacts unlocked" value={String(unlockedCount)} unit="" />
              <StatCell label="Avg match score" value={String(avgMatch)} unit="/ 100" />
            </div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", background: t.line }}>
                {tierCounts.map((tier) => (
                  tier.count > 0 && (
                    <div
                      key={tier.key}
                      title={tier.label}
                      style={{ width: `${(tier.count / requirement.candidates.length) * 100}%`, background: tierColors[tier.key] }}
                    />
                  )
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
                {tierCounts.map((tier) => (
                  <span key={tier.key} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: f.sans, fontSize: 12.5, color: t.inkFaint }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: tierColors[tier.key], flexShrink: 0 }} />
                    {tier.count} {tier.label.toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
            <HelpText>
              {requirement.status === "generating" ? "Scoring candidates…" : "No candidates shared yet."}
            </HelpText>
          </div>
        )}
      </Card>

      <div role="tablist" style={{ display: "flex", gap: 24, borderBottom: `1px solid ${t.line}`, margin: "20px 0 16px" }}>
        {(["candidates", "description"] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
            style={{
              padding: "10px 2px",
              border: "none",
              borderBottom: `2px solid ${activeTab === tabKey ? t.indigo : "transparent"}`,
              background: "transparent",
              color: activeTab === tabKey ? t.coal : t.inkSoft,
              fontFamily: f.sans,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tabKey === "candidates" ? "Candidates" : "Job Description"}
          </button>
        ))}
      </div>

      {activeTab === "description" && (
        <Card>
          <h2 style={{ fontFamily: f.serif, fontSize: 18, color: t.coal, margin: "0 0 10px" }}>Description</h2>
          <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
            {requirement.description || "No description was added for this requirement."}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Location</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>
                {requirement.locations.length > 0 ? requirement.locations.join(", ") : requirement.location}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Work mode</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4, textTransform: "capitalize" }}>{requirement.workMode || "Not specified"}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Open positions</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{requirement.openPositions ?? "Not specified"}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Experience</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{expLabel || "Any"}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Notice period</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{requirement.noticePeriodPref}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Preferred industry</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{requirement.preferredIndustry || "Not specified"}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Due date</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{requirement.dueDate || "No due date set"}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Posted</div>
              <div style={{ fontFamily: f.sans, fontSize: 13.5, color: t.coal, marginTop: 4 }}>{requirement.createdAt}</div>
            </div>
            <div>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint }}>Status</div>
              <div style={{ marginTop: 4 }}><StatusChip status={requirement.status} /></div>
            </div>
          </div>

          {requirement.skills.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {requirement.skills.map((s) => <SkillTag key={s}>{s}</SkillTag>)}
              </div>
            </div>
          )}

          {requirement.responsibilities && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Responsibilities</div>
              <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{requirement.responsibilities}</p>
            </div>
          )}

          {requirement.niceToHave && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Nice to have</div>
              <p style={{ fontFamily: f.sans, fontSize: 13.5, color: t.inkSoft, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{requirement.niceToHave}</p>
            </div>
          )}

          {requirement.preferredColleges.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Preferred colleges</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {requirement.preferredColleges.map((c) => <Pill key={c} tone="indigo">{c}</Pill>)}
              </div>
            </div>
          )}

          {requirement.targetCompanies.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Target companies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {requirement.targetCompanies.map((c) => <Pill key={c} tone="copper">{c}</Pill>)}
              </div>
            </div>
          )}

          {requirement.perksAndBenefits.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: f.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkFaint, marginBottom: 8 }}>Perks and benefits</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {requirement.perksAndBenefits.map((p) => <Pill key={p} tone="success">{p}</Pill>)}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === "candidates" && (
        <>
          {requirement.status === "generating" && <GeneratingState />}
          {requirement.status === "failed" && <FailedState />}
          {requirement.status === "zero" && <ZeroMatchState />}

          {(requirement.status === "ready" || requirement.status === "partial" || requirement.status === "closed") && (
            <>
              {readOnly && (
                <Card style={{ background: t.creamSoft, marginBottom: 16 }}>
                  <span style={{ fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}>
                    This requirement is closed. Candidate details are read-only.
                  </span>
                </Card>
              )}
              {!readOnly && compareIds.length === 2 && (
                <div style={{ marginBottom: 16 }}>
                  <Link
                    href={`/employer/requirements/${requirement.id}/compare?a=${compareIds[0]}&b=${compareIds[1]}`}
                    style={{ textDecoration: "none" }}
                  >
                    <PrimaryCta size="sm">Compare selected candidates</PrimaryCta>
                  </Link>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, role, skill, or notice period…"
                  style={{ ...toolbarInputStyle, flex: "1 1 220px", minWidth: 200 }}
                  aria-label="Search candidates"
                />
                <select
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value as ContactFilter)}
                  style={toolbarInputStyle}
                  aria-label="Filter by contact status"
                >
                  {contactFilterOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {locationOptions.length > 1 && (
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    style={toolbarInputStyle}
                    aria-label="Filter by location"
                  >
                    <option value="all">All locations</option>
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  style={toolbarInputStyle}
                  aria-label="Sort candidates"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {(search.trim() !== "" || contactFilter !== "all" || locationFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setContactFilter("all"); setLocationFilter("all"); }}
                    style={{ ...toolbarInputStyle, background: "transparent", border: "none", color: t.indigo, fontWeight: 600, cursor: "pointer" }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {filteredSorted.length === 0 ? (
                <Card style={{ textAlign: "center", padding: 48 }}>
                  <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft, margin: 0 }}>
                    No candidates match your search or filters.
                  </p>
                </Card>
              ) : (
                <Card pad={0} style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                      <thead>
                        <tr>
                          {!readOnly && <th style={{ ...th, paddingTop: 20 }}></th>}
                          <th style={{ ...th, paddingTop: 20 }}>Candidate</th>
                          <th style={{ ...th, paddingTop: 20 }}>Match</th>
                          <th style={{ ...th, paddingTop: 20 }}>Practice history</th>
                          <th style={{ ...th, paddingTop: 20 }}>Last active</th>
                          <th style={{ ...th, paddingTop: 20 }}>Notice period</th>
                          <th style={{ ...th, paddingTop: 20 }}>Current CTC</th>
                          <th style={{ ...th, paddingTop: 20 }}>Skills</th>
                          <th style={{ ...th, paddingTop: 20 }}>Status</th>
                          <th style={{ ...th, paddingTop: 20 }}>Contact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSorted.map((c) => (
                          <CandidateTableRow
                            key={c.id}
                            candidate={c}
                            requirementId={requirement.id}
                            readOnly={readOnly}
                            compareChecked={compareIds.includes(c.id)}
                            compareDisabled={compareIds.length >= 2}
                            onToggleCompare={() => toggleCompare(c.id)}
                            onUnlocked={handleUnlocked}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

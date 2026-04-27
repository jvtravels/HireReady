"use client";
import { useCallback, useEffect, useState } from "react";
import { c, font } from "./tokens";

/**
 * Voluntary outcome self-report banner.
 * Drop this anywhere in the authenticated app (Dashboard top, SessionReport
 * footer, Sessions list header) and it'll lazily check whether the user
 * has already reported. If they have, it renders nothing. If they haven't,
 * it shows a low-friction "Did you land a role?" prompt with a 30-second
 * report flow.
 *
 * Privacy posture: every field is optional and there's an explicit
 * "may we share publicly?" toggle (default off).
 */

interface ExistingOutcome {
  applied: boolean | null;
  interviewed: boolean | null;
  offer: boolean | null;
  accepted: boolean | null;
  company: string | null;
  role_landed: string | null;
  testimonial: string | null;
  may_share_publicly: boolean;
}

type Stage = "loading" | "prompt" | "filling" | "submitted" | "skipped" | "hidden";

const SKIP_KEY = "hirestepx_outcome_skip_until";
const SKIP_DAYS = 30;

export default function OutcomePromptBanner() {
  const [stage, setStage] = useState<Stage>("loading");
  const [applied, setApplied] = useState(false);
  const [interviewed, setInterviewed] = useState(false);
  const [offer, setOffer] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [company, setCompany] = useState("");
  const [roleLanded, setRoleLanded] = useState("");
  const [testimonial, setTestimonial] = useState("");
  const [mayShare, setMayShare] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Respect a "skip for 30 days" pref so we don't nag users daily.
    try {
      const skipUntil = localStorage.getItem(SKIP_KEY);
      if (skipUntil && Date.now() < parseInt(skipUntil, 10)) {
        setStage("hidden");
        return;
      }
    } catch { /* ignore */ }

    fetch("/api/user-outcome", { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) { setStage("hidden"); return; }
        const data = await res.json();
        const existing = data?.outcome as ExistingOutcome | null;
        if (existing && existing.offer === true) {
          // Already reported a positive outcome — don't pester them.
          setStage("hidden");
          return;
        }
        setStage("prompt");
      })
      .catch(() => { if (!cancelled) setStage("hidden"); });
    return () => { cancelled = true; };
  }, []);

  const onSkip = useCallback(() => {
    try { localStorage.setItem(SKIP_KEY, String(Date.now() + SKIP_DAYS * 86400_000)); } catch { /* ignore */ }
    setStage("skipped");
    setTimeout(() => setStage("hidden"), 250);
  }, []);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/user-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applied, interviewed, offer, accepted,
          company: company.trim() || undefined,
          roleLanded: roleLanded.trim() || undefined,
          testimonial: testimonial.trim() || undefined,
          mayShare: mayShare && offer,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStage("submitted");
      // Clear skip pref since they engaged.
      try { localStorage.removeItem(SKIP_KEY); } catch { /* ignore */ }
    } catch (err) {
      console.warn("[outcome] submit failed:", err instanceof Error ? err.message : err);
    } finally {
      setSubmitting(false);
    }
  }, [applied, interviewed, offer, accepted, company, roleLanded, testimonial, mayShare]);

  if (stage === "hidden" || stage === "loading" || stage === "skipped") return null;

  if (stage === "submitted") {
    return (
      <div style={{
        background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.22)`,
        borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>🎉</span>
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, margin: 0, flex: 1 }}>
          Thanks for sharing. {offer ? "Best of luck on the next chapter — or come back to keep your skills sharp." : "Keep practicing, you'll land it."}
        </p>
      </div>
    );
  }

  if (stage === "prompt") {
    return (
      <div style={{
        background: "rgba(212,179,127,0.04)", border: `1px solid rgba(212,179,127,0.22)`,
        borderRadius: 12, padding: "14px 18px",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 18 }}>📈</span>
        <p style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk, margin: 0, flex: 1, minWidth: 220 }}>
          <strong style={{ color: c.ivory }}>How&apos;s your job search going?</strong> 30-second update — helps us show real outcomes (and the next person practicing what you did).
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSkip} style={{
            fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent",
            border: `1px solid ${c.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          }}>Not now</button>
          <button onClick={() => setStage("filling")} style={{
            fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.obsidian,
            background: c.gilt, border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer",
          }}>Share update</button>
        </div>
      </div>
    );
  }

  // stage === "filling"
  return (
    <div style={{
      background: c.graphite, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px",
    }}>
      <h3 style={{ fontFamily: font.display, fontSize: 18, fontWeight: 400, color: c.ivory, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
        Quick outcome update
      </h3>
      <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "0 0 14px" }}>
        Every field is optional. Helps us build real case studies (with your permission only).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        <Toggle label="I applied to roles" checked={applied} onChange={setApplied} />
        <Toggle label="I had at least one interview" checked={interviewed} onChange={setInterviewed} />
        <Toggle label="I received an offer" checked={offer} onChange={setOffer} />
        <Toggle label="I accepted an offer" checked={accepted} onChange={setAccepted} />
      </div>

      {(offer || accepted) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Company (optional)" value={company} onChange={setCompany} placeholder="e.g. Stripe" />
          <Field label="Role landed (optional)" value={roleLanded} onChange={setRoleLanded} placeholder="e.g. Senior PM" />
        </div>
      )}

      {offer && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="outcome-testimonial" style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, display: "block", marginBottom: 4 }}>
            Anything you want to say about your experience? (optional, ≤ 500 chars)
          </label>
          <textarea
            id="outcome-testimonial"
            value={testimonial}
            onChange={(e) => setTestimonial(e.target.value.slice(0, 500))}
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
              background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory,
              fontFamily: font.ui, fontSize: 13, lineHeight: 1.5, resize: "vertical",
            }}
            placeholder="The structured-feedback section was the thing that finally moved my offer rate."
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={mayShare}
              onChange={(e) => setMayShare(e.target.checked)}
              style={{ accentColor: c.gilt }}
            />
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>
              You may share my first name + role + company with this quote on the website.
            </span>
          </label>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onSkip} style={{
          fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent",
          border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer",
        }}>Cancel</button>
        <button onClick={onSubmit} disabled={submitting} style={{
          fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.obsidian,
          background: submitting ? "rgba(212,179,127,0.4)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
          border: "none", borderRadius: 6, padding: "8px 18px",
          cursor: submitting ? "default" : "pointer",
        }}>
          {submitting ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: c.gilt }} />
      <span style={{ fontFamily: font.ui, fontSize: 13, color: c.chalk }}>{label}</span>
    </label>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  // Wrap the input in the label so screen readers associate them without
  // needing a unique htmlFor/id pair on every render.
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 120))}
        placeholder={placeholder}
        style={{
          padding: "8px 10px", borderRadius: 6, background: c.obsidian, color: c.ivory,
          border: `1px solid ${c.border}`, fontFamily: font.ui, fontSize: 13,
        }}
      />
    </label>
  );
}

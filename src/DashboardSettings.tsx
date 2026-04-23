"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { authHeaders, getPaymentHistory, type PaymentRecord } from "./supabase";
import type { PersistedState } from "./dashboardTypes";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton } from "./dashboardComponents";
import {
  icons,
  focusOutBase,
  AccountSection,
  InterviewSection,
  NotificationsSection,
  PlanSection,
} from "./settingsSections";

const ALL_SECTIONS = [
  { id: "account", label: "Account", icon: icons.account },
  { id: "interview", label: "Interview", icon: icons.interview },
  // Hidden until fully implemented:
  // { id: "notifications", label: "Notifications", icon: icons.notifications },
  { id: "plan", label: "Plan & Data", icon: icons.plan },
  { id: "referral", label: "Referral", icon: icons.referral },
] as const;

const SECTIONS = ALL_SECTIONS;

export default function SettingsPage() {
  useDocTitle("Settings");
  const { user: authUser, logout: authLogout, updateUser: authUpdateUser, resetPassword } = useAuth();
  const { persisted, updatePersisted: onUpdate, handleExportCSV: onExportCSV, dataLoading, showToast, setShowUpgradeModal, calendarEvents } = useDashboard();
  const onLogout = () => { authLogout(); };

  // Profile
  const [editName, setEditName] = useState(persisted.userName);
  const [editRole, setEditRole] = useState(persisted.targetRole);
  const [editCompany, setEditCompany] = useState(authUser?.targetCompany || "");
  const [editIndustry, setEditIndustry] = useState(authUser?.industry || "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Danger zone
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");


  // Password
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Section nav
  const pillsRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>("account");

  // Billing history
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const paymentsLoadedRef = useRef(false);
  useEffect(() => {
    if (activeSection !== "plan" || paymentsLoadedRef.current || !authUser?.id) return;
    paymentsLoadedRef.current = true;
    setPaymentsLoading(true);
    getPaymentHistory(authUser.id).then(setPayments).finally(() => setPaymentsLoading(false));
  }, [activeSection, authUser?.id]);

  const isDirty = editName !== persisted.userName || editRole !== persisted.targetRole || editCompany !== (authUser?.targetCompany || "") || editIndustry !== (authUser?.industry || "");

  // Auto-save on blur for text fields
  const focusOut = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    focusOutBase(e);
    setTimeout(() => {
      if (editName !== persisted.userName || editRole !== persisted.targetRole || editCompany !== (authUser?.targetCompany || "") || editIndustry !== (authUser?.industry || "")) {
        onUpdate({ userName: editName, targetRole: editRole });
        authUpdateUser({ name: editName, targetRole: editRole, targetCompany: editCompany, industry: editIndustry });
        showToast("Saved");
      }
    }, 0);
  }, [editName, editRole, editCompany, editIndustry, persisted.userName, persisted.targetRole, authUser?.targetCompany, authUser?.industry, onUpdate, authUpdateUser, showToast]);

  // Auto-save dirty profile fields when switching tabs
  const switchSection = useCallback((id: string) => {
    if (isDirty) {
      onUpdate({ userName: editName, targetRole: editRole });
      authUpdateUser({ name: editName, targetRole: editRole, targetCompany: editCompany, industry: editIndustry });
      showToast("Profile saved");
    }
    setActiveSection(id);
  }, [isDirty, editName, editRole, editCompany, editIndustry, onUpdate, authUpdateUser, showToast]);

  // Keyboard navigation for pills
  const handlePillKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); next = (idx + 1) % SECTIONS.length; }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); next = (idx - 1 + SECTIONS.length) % SECTIONS.length; }
    if (next >= 0) {
      switchSection(SECTIONS[next].id);
      const buttons = pillsRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[next]?.focus();
    }
  };

  // beforeunload guard
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);



  if (dataLoading) return <DataLoadingSkeleton />;

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    onUpdate({ userName: editName, targetRole: editRole });
    await authUpdateUser({ name: editName, targetRole: editRole, targetCompany: editCompany, industry: editIndustry });
    setSaving(false); setSaved(true);
    showToast("Profile saved");
    setTimeout(() => setSaved(false), 3000);
  };

  const autoSave = (updates: Partial<PersistedState>) => onUpdate(updates);

  const handlePasswordReset = async () => {
    if (!authUser?.email) return;
    setResetLoading(true);
    const result = await resetPassword(authUser.email);
    setResetLoading(false);
    if (result.success) { setResetSent(true); showToast("Password reset email sent"); setTimeout(() => setResetSent(false), 10000); }
    else showToast(result.error || "Failed to send reset email");
  };

  const difficultyVal = persisted.defaultDifficulty || "standard";
  const learningVal = authUser?.learningStyle || "direct";
  const experienceVal = authUser?.experienceLevel || "";
  const tierLabel = (authUser?.subscriptionTier || "free").charAt(0).toUpperCase() + (authUser?.subscriptionTier || "free").slice(1);

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 36 }}>
        <h2 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 400, color: c.ivory, marginBottom: 6, letterSpacing: "0.01em" }}>Settings</h2>
        <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, lineHeight: 1.5 }}>
          Manage your account, interview preferences, and subscription
        </p>
      </div>

      {/* ── Section Navigation ── */}
      <div ref={pillsRef} role="tablist" aria-label="Settings sections" className="settings-pills" style={{
        display: "flex", gap: 4, marginBottom: 32, overflowX: "auto", paddingBottom: 2,
        borderBottom: `1px solid ${c.border}`, paddingRight: 2,
      }}>
        {SECTIONS.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={activeSection === s.id} tabIndex={activeSection === s.id ? 0 : -1}
            onClick={() => switchSection(s.id)} onKeyDown={(e) => handlePillKeyDown(e, i)}
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
              padding: "10px 16px", cursor: "pointer", transition: "all 0.2s ease",
              background: "transparent", borderRadius: 0,
              border: "none", borderBottom: `2px solid ${activeSection === s.id ? c.gilt : "transparent"}`,
              color: activeSection === s.id ? c.ivory : c.stone,
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: -1,
            }}
            onMouseEnter={(e) => { if (activeSection !== s.id) e.currentTarget.style.color = c.chalk; }}
            onMouseLeave={(e) => { if (activeSection !== s.id) e.currentTarget.style.color = c.stone; }}
          >
            <span style={{ opacity: activeSection === s.id ? 1 : 0.5, transition: "opacity 0.2s", color: activeSection === s.id ? c.gilt : "currentColor" }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ ACCOUNT ═══════════════════ */}
      {activeSection === "account" && (
        <AccountSection
          editName={editName} setEditName={setEditName}
          editCompany={editCompany} setEditCompany={setEditCompany}
          editIndustry={editIndustry} setEditIndustry={setEditIndustry}
          userName={persisted.userName} email={authUser?.email || ""}
          tierLabel={tierLabel} subscriptionTier={authUser?.subscriptionTier}
          isDirty={isDirty} saving={saving} saved={saved}
          handleSave={handleSave}
          resetLoading={resetLoading} resetSent={resetSent}
          handlePasswordReset={handlePasswordReset}
          focusOut={focusOut}
        />
      )}

      {/* ═══════════════════ INTERVIEW ═══════════════════ */}
      {activeSection === "interview" && (
        <InterviewSection
          editRole={editRole} setEditRole={setEditRole}
          isDirty={isDirty} saving={saving}
          handleSave={handleSave} focusOut={focusOut}
          difficultyVal={difficultyVal} learningVal={learningVal} experienceVal={experienceVal}
          autoSave={autoSave} authUpdateUser={authUpdateUser} showToast={showToast}
        />
      )}

      {/* ═══════════════════ NOTIFICATIONS ═══════════════════ */}
      {activeSection === "notifications" && (
        <NotificationsSection
          persisted={persisted} autoSave={autoSave}
          showToast={showToast} calendarEvents={calendarEvents}
        />
      )}

      {/* ═══════════════════ PLAN & BILLING ═══════════════════ */}
      {activeSection === "plan" && (
        <PlanSection
          authUser={authUser} tierLabel={tierLabel}
          confirmCancel={confirmCancel} setConfirmCancel={setConfirmCancel}
          cancelLoading={cancelLoading} setCancelLoading={setCancelLoading}
          cancelMsg={cancelMsg} setCancelMsg={setCancelMsg}
          confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
          deleteEmailInput={deleteEmailInput} setDeleteEmailInput={setDeleteEmailInput}
          deleteLoading={deleteLoading} setDeleteLoading={setDeleteLoading}
          deleteMsg={deleteMsg} setDeleteMsg={setDeleteMsg}
          exporting={exporting} setExporting={setExporting}
          onExportCSV={onExportCSV}
          payments={payments} paymentsLoading={paymentsLoading}
          authUpdateUser={authUpdateUser} showToast={showToast}
          setShowUpgradeModal={setShowUpgradeModal} onLogout={onLogout}
          authHeaders={authHeaders}
        />
      )}

      {/* ═══════════════════ REFERRAL ═══════════════════ */}
      {activeSection === "referral" && <ReferralSection showToast={showToast} />}
    </div>
  );
}

/* ─── Referral Section Component (self-contained with its own state) ─── */

function ReferralSection({ showToast }: { showToast: (msg: string) => void }) {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, redeemed: 0, rewarded: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { authHeaders: getHeaders } = await import("./supabase");
        const headers = await getHeaders();
        const res = await fetch("/api/referral", { headers });
        if (res.ok) {
          const data = await res.json();
          setReferralCode(data.code);
          setStats(data.stats);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const referralLink = referralCode ? `${window.location.origin}/signup?ref=${referralCode}` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    showToast("Referral link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = `Hey! I've been using HireStepX to practice for interviews with AI - it's really helped me improve. Try it out: ${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const localCardStyle: React.CSSProperties = {
    position: "relative", borderRadius: 16, padding: "32px 28px",
    background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`,
    boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
  };
  const localLabelStyle: React.CSSProperties = { fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase" as const, display: "block", marginBottom: 10 };
  const localSectionHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, marginBottom: 28 };

  if (loading) {
    return <div style={localCardStyle}><span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Loading referral info...</span></div>;
  }

  return (
    <div style={localCardStyle}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(122,158,126,0.2), transparent)` }} />

      <div style={localSectionHeader}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.sage }}>
          {icons.referral}
        </div>
        <div>
          <h3 style={{ fontFamily: font.display, fontSize: 20, color: c.ivory, margin: 0 }}>Invite Friends</h3>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "2px 0 0" }}>Share your referral link and earn rewards</p>
        </div>
      </div>

      {/* Referral Code Display */}
      <span style={localLabelStyle}>Your Referral Code</span>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 24,
        padding: "16px 20px", borderRadius: 12,
        background: "rgba(122,158,126,0.04)", border: `1px solid rgba(122,158,126,0.12)`,
      }}>
        <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, color: c.sage, letterSpacing: "0.08em", flex: 1 }}>
          {referralCode || "---"}
        </span>
        <button onClick={handleCopy} style={{
          fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: copied ? c.sage : c.gilt,
          background: copied ? "rgba(122,158,126,0.1)" : "rgba(212,179,127,0.06)",
          border: `1px solid ${copied ? "rgba(122,158,126,0.2)" : "rgba(212,179,127,0.15)"}`,
          borderRadius: 8, padding: "8px 16px", cursor: "pointer", transition: "all 0.15s",
        }}>
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      {/* Share Buttons */}
      <span style={localLabelStyle}>Share via</span>
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        <button onClick={handleShareWhatsApp} style={{
          fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: "#25D366",
          background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)",
          borderRadius: 10, padding: "12px 20px", cursor: "pointer", transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .611.611l4.458-1.495A11.948 11.948 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.316 0-4.473-.754-6.217-2.03l-.352-.264-3.652 1.224 1.224-3.652-.264-.352A9.954 9.954 0 0 1 2 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
          WhatsApp
        </button>
        <button onClick={() => {
          const subject = "Try HireStepX - AI Mock Interviews";
          const body = `Hey!\n\nI've been using HireStepX to practice for interviews with AI interviewers. It gives detailed feedback on STAR method, speech analytics, and more.\n\nSign up with my referral link: ${referralLink}`;
          window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
        }} style={{
          fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.chalk,
          background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`,
          borderRadius: 10, padding: "12px 20px", cursor: "pointer", transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Email
        </button>
      </div>

      {/* Stats */}
      <span style={localLabelStyle}>Referral Stats</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          { label: "Invited", value: stats.total, color: c.chalk },
          { label: "Signed Up", value: stats.redeemed, color: c.sage },
          { label: "Rewards", value: stats.rewarded, color: c.gilt },
        ].map(s => (
          <div key={s.label} style={{
            textAlign: "center", padding: "20px 12px", borderRadius: 12,
            background: "rgba(6,6,7,0.5)", border: `1px solid ${c.border}`,
          }}>
            <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 600, color: s.color, display: "block", marginBottom: 4 }}>{s.value}</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

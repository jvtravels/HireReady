import { useState, useEffect, useRef, useCallback } from "react";
import { c, font, shadow, gradient } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { authHeaders, supabaseConfigured, getSupabase, getPaymentHistory, type PaymentRecord } from "./supabase";
import type { PersistedState } from "./dashboardTypes";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton } from "./dashboardComponents";
import { notificationsSupported, getNotifPermission, requestNotifPermission, getNotifPreference, setNotifPreference, scheduleEventNotifications } from "./interviewNotifications";

/* ─── Section Icons ─── */
const icons = {
  account: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  interview: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>,
  notifications: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  plan: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  referral: <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
};

const SECTIONS = [
  { id: "account", label: "Account", icon: icons.account },
  { id: "interview", label: "Interview", icon: icons.interview },
  { id: "notifications", label: "Notifications", icon: icons.notifications },
  { id: "plan", label: "Plan & Data", icon: icons.plan },
  { id: "referral", label: "Referral", icon: icons.referral },
] as const;


/* ─── Premium Shared Styles ─── */
const cardStyle: React.CSSProperties = {
  background: `linear-gradient(180deg, ${c.graphite} 0%, rgba(14,14,16,0.98) 100%)`,
  borderRadius: 16,
  border: `1px solid ${c.border}`,
  padding: "32px 36px",
  marginBottom: 24,
  boxShadow: shadow.sm,
  position: "relative",
  overflow: "hidden",
};

const sectionHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, marginBottom: 8,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: font.display, fontSize: 22, fontWeight: 400, color: c.ivory, letterSpacing: "0.01em",
};

const sectionDesc: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 32, lineHeight: 1.6, paddingLeft: 50,
};

const labelStyle: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, display: "block", marginBottom: 8,
  letterSpacing: "0.04em", textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 16px", borderRadius: 10,
  background: c.obsidian, border: `1px solid ${c.border}`,
  color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
};

const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "rgba(212,179,127,0.4)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(212,179,127,0.08)";
};
const focusOutBase = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = c.border;
  e.currentTarget.style.boxShadow = "none";
};

const chipBtn = (active: boolean): React.CSSProperties => ({
  padding: "14px 16px", borderRadius: 12, cursor: "pointer",
  background: active ? "rgba(212,179,127,0.06)" : "rgba(6,6,7,0.6)",
  border: `1.5px solid ${active ? "rgba(212,179,127,0.35)" : c.border}`,
  textAlign: "left", transition: "all 0.2s ease",
  boxShadow: active ? "0 0 0 1px rgba(212,179,127,0.08)" : "none",
  position: "relative",
});

const chipLabel = (active: boolean): React.CSSProperties => ({
  fontFamily: font.ui, fontSize: 12, fontWeight: 600,
  color: active ? c.gilt : c.chalk, display: "flex", alignItems: "center", gap: 8, marginBottom: 3,
});

const chipDesc: React.CSSProperties = { fontFamily: font.ui, fontSize: 10, color: c.stone, paddingLeft: 22 };

/* ─── Radio Dot for chips ─── */
function RadioDot({ active }: { active: boolean }) {
  return (
    <span style={{
      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
      border: `1.5px solid ${active ? c.gilt : "rgba(255,255,255,0.12)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "border-color 0.2s ease",
    }}>
      {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.gilt }} />}
    </span>
  );
}

/* ─── Decorative line ─── */
function Divider() {
  return (
    <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${c.border}, transparent)`, margin: "28px 0" }} />
  );
}

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

  // Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (isDirty) handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, editName, editRole, editCompany, editIndustry]);


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

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} aria-pressed={on} style={{
      width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
      background: on ? `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})` : "rgba(255,255,255,0.06)",
      padding: 3, transition: "background 0.25s ease", position: "relative",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: on ? c.obsidian : c.stone,
        transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        transform: on ? "translateX(20px)" : "translateX(0)",
        boxShadow: on ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
      }} />
    </button>
  );

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
      {activeSection === "account" && <div style={cardStyle}>
        {/* Decorative gradient accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(212,179,127,0.2), transparent)` }} />

        <div style={sectionHeader}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.gilt }}>
            {icons.account}
          </div>
          <h3 style={sectionTitle}>Account</h3>
        </div>
        <p style={sectionDesc}>Your personal details and login credentials</p>

        {/* User identity card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20, marginBottom: 32,
          padding: "20px 24px", borderRadius: 14,
          background: gradient.surfaceCard,
          border: `1px solid ${c.border}`,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: font.display, fontSize: 24, color: c.gilt }}>{(persisted.userName || "?")[0].toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{persisted.userName}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{authUser?.email}</p>
          </div>
          <div style={{
            padding: "5px 12px", borderRadius: 8,
            background: authUser?.subscriptionTier === "pro" ? "rgba(122,158,126,0.08)" : "rgba(212,179,127,0.08)",
            border: `1px solid ${authUser?.subscriptionTier === "pro" ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: authUser?.subscriptionTier === "pro" ? c.sage : c.gilt, letterSpacing: "0.04em", textTransform: "uppercase" }}>{tierLabel}</span>
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="settings-form-grid">
          <div>
            <label htmlFor="settings-name" style={labelStyle}>Full Name</label>
            <input id="settings-name" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60}
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label htmlFor="settings-email" style={labelStyle}>Email</label>
            <input id="settings-email" type="email" value={authUser?.email || ""} readOnly
              style={{ ...inputStyle, color: c.stone, cursor: "default", opacity: 0.7 }} />
          </div>
          <div>
            <label htmlFor="settings-company" style={labelStyle}>Target Company</label>
            <input id="settings-company" type="text" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} maxLength={60} placeholder="e.g. Google"
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label htmlFor="settings-industry" style={labelStyle}>Industry</label>
            <input id="settings-industry" type="text" value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} maxLength={60} placeholder="e.g. FinTech"
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
        </div>

        {/* Save bar */}
        <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
          <button onClick={handleSave} disabled={saving || !isDirty} className="shimmer-btn"
            style={{
              fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "11px 32px", borderRadius: 10,
              border: "none", cursor: (saving || !isDirty) ? "not-allowed" : "pointer",
              background: (saving || !isDirty) ? "rgba(212,179,127,0.15)" : `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
              color: (saving || !isDirty) ? c.stone : c.obsidian,
              transition: "all 0.2s ease", letterSpacing: "0.02em",
            }}>
            {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
          </button>
          {isDirty && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.gilt }} />Unsaved changes
          </span>}
          {saved && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 4 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </span>}
          <kbd style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 10, color: c.stone, background: "rgba(245,242,237,0.03)", border: `1px solid ${c.border}`, borderRadius: 6, padding: "3px 8px" }}>&#8984;S</kbd>
        </div>

        <Divider />

        {/* Password */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 3 }}>Password</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Reset via email link</span>
          </div>
          <button onClick={handlePasswordReset} disabled={resetLoading || resetSent}
            style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
              color: resetSent ? c.sage : c.ivory,
              background: resetSent ? "rgba(122,158,126,0.08)" : "rgba(245,242,237,0.04)",
              border: `1px solid ${resetSent ? "rgba(122,158,126,0.2)" : c.border}`,
              borderRadius: 10, padding: "9px 20px", cursor: (resetLoading || resetSent) ? "default" : "pointer",
              opacity: resetLoading ? 0.6 : 1, transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => { if (!resetLoading && !resetSent) e.currentTarget.style.background = "rgba(245,242,237,0.06)"; }}
            onMouseLeave={(e) => { if (!resetLoading && !resetSent) e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
          >
            {resetLoading ? "Sending..." : resetSent ? "Email Sent" : "Reset Password"}
          </button>
        </div>
      </div>}

      {/* ═══════════════════ INTERVIEW ═══════════════════ */}
      {activeSection === "interview" && <div style={cardStyle}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(212,179,127,0.2), transparent)` }} />

        <div style={sectionHeader}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.gilt }}>
            {icons.interview}
          </div>
          <h3 style={sectionTitle}>Interview Preferences</h3>
        </div>
        <p style={sectionDesc}>Configure your target role and interview difficulty</p>

        {/* Target role + Feedback style — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }} className="settings-form-grid">
          <div>
            <label htmlFor="settings-role" style={labelStyle}>Target Role</label>
            <input id="settings-role" type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)} maxLength={80}
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>Feedback Style</label>
            <div style={{ display: "flex", gap: 10 }}>
              {([
                { id: "direct" as const, label: "Direct" },
                { id: "encouraging" as const, label: "Encouraging" },
              ]).map(s => (
                <button key={s.id} onClick={() => { authUpdateUser({ learningStyle: s.id }); showToast("Feedback style updated"); }}
                  style={{ ...chipBtn(learningVal === s.id), flex: 1, padding: "11px 14px" }}
                  onMouseEnter={(e) => { if (learningVal !== s.id) e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                  onMouseLeave={(e) => { if (learningVal !== s.id) e.currentTarget.style.borderColor = c.border; }}>
                  <span style={{ ...chipLabel(learningVal === s.id), marginBottom: 0 }}><RadioDot active={learningVal === s.id} />{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {isDirty && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
            <button onClick={handleSave} disabled={saving}
              style={{
                fontFamily: font.ui, fontSize: 13, fontWeight: 600, padding: "11px 32px", borderRadius: 10,
                border: "none", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                color: c.obsidian, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
              }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.gilt }} />Unsaved changes
            </span>
          </div>
        )}

        {/* Difficulty + Experience — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="settings-form-grid">
          <div>
            <label style={labelStyle}>Difficulty</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "warmup", label: "Warm-up", desc: "Confidence-building" },
                { id: "standard", label: "Standard", desc: "Realistic pacing" },
                { id: "intense", label: "Intense", desc: "High pressure" },
              ].map(d => (
                <button key={d.id} onClick={() => { autoSave({ defaultDifficulty: d.id }); showToast("Difficulty updated"); }} style={chipBtn(difficultyVal === d.id)}
                  onMouseEnter={(e) => { if (difficultyVal !== d.id) e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                  onMouseLeave={(e) => { if (difficultyVal !== d.id) e.currentTarget.style.borderColor = c.border; }}>
                  <span style={chipLabel(difficultyVal === d.id)}><RadioDot active={difficultyVal === d.id} />{d.label}</span>
                  <span style={chipDesc}>{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Experience Level</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "entry", label: "Entry", desc: "0-2 years" },
                { id: "mid", label: "Mid", desc: "3-5 years" },
                { id: "senior", label: "Senior", desc: "6-10 years" },
                { id: "lead", label: "Lead+", desc: "10+ years" },
              ].map(d => (
                <button key={d.id} onClick={() => { authUpdateUser({ experienceLevel: d.id }); showToast("Experience level updated"); }} style={chipBtn(experienceVal === d.id)}
                  onMouseEnter={(e) => { if (experienceVal !== d.id) e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                  onMouseLeave={(e) => { if (experienceVal !== d.id) e.currentTarget.style.borderColor = c.border; }}>
                  <span style={chipLabel(experienceVal === d.id)}><RadioDot active={experienceVal === d.id} />{d.label}</span>
                  <span style={chipDesc}>{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>}


      {/* ═══════════════════ NOTIFICATIONS ═══════════════════ */}
      {activeSection === "notifications" && <div style={cardStyle}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(212,179,127,0.2), transparent)` }} />

        <div style={sectionHeader}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.gilt }}>
            {icons.notifications}
          </div>
          <h3 style={sectionTitle}>Notifications</h3>
        </div>
        <p style={sectionDesc}>Control how and when HireStepX reaches out to you</p>

        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 24,
          background: "rgba(212,179,127,0.03)", border: `1px solid rgba(212,179,127,0.1)`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontFamily: font.ui, fontSize: 12, color: c.gilt, lineHeight: 1.5 }}>Email delivery coming soon. Your preferences will be saved for when notifications launch.</span>
        </div>

        {/* ─── Push notifications for upcoming interviews ─── */}
        {notificationsSupported() && (() => {
          const pushOn = getNotifPreference();
          const perm = getNotifPermission();
          return (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 0", borderBottom: `1px solid ${c.border}`,
            }}>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 3 }}>Interview reminders</span>
                <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>
                  {perm === "denied" ? "Browser notifications blocked — enable in browser settings" : "Push notification 30 min before scheduled interviews"}
                </span>
              </div>
              <Toggle on={pushOn && perm === "granted"} onToggle={async () => {
                if (pushOn) {
                  setNotifPreference(false);
                  showToast("Interview reminders off");
                } else {
                  const granted = await requestNotifPermission();
                  if (granted) {
                    setNotifPreference(true);
                    scheduleEventNotifications(calendarEvents);
                    showToast("Interview reminders on — you'll be notified 30 min before");
                  } else {
                    showToast("Notification permission denied by browser");
                  }
                }
              }} />
            </div>
          );
        })()}

        {[
          { label: "Email notifications", desc: "Session reminders and progress updates", key: "emailNotifs" as const, on: persisted.emailNotifs !== false },
          { label: "Streak reminders", desc: "Get nudged before you lose your streak", key: "streakReminder" as const, on: persisted.streakReminder !== false },
          { label: "Weekly digest", desc: "Summary of your weekly progress every Monday", key: "weeklyDigest" as const, on: persisted.weeklyDigest || false },
        ].map((item, i, arr) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 0",
            borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : "none",
          }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 3 }}>{item.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{item.desc}</span>
            </div>
            <Toggle on={item.on} onToggle={() => { autoSave({ [item.key]: !item.on }); showToast(`${item.label} ${item.on ? "off" : "on"}`); }} />
          </div>
        ))}
      </div>}

      {/* ═══════════════════ PLAN & BILLING ═══════════════════ */}
      {activeSection === "plan" && <div style={cardStyle}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(212,179,127,0.2), transparent)` }} />

        <div style={sectionHeader}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.gilt }}>
            {icons.plan}
          </div>
          <h3 style={sectionTitle}>Plan & Billing</h3>
        </div>
        <p style={sectionDesc}>Manage your subscription, export data, or delete your account</p>

        {/* Subscription card */}
        <div style={{
          padding: "24px 28px", borderRadius: 14, marginBottom: 32,
          background: gradient.surfaceCard, border: `1px solid ${c.border}`,
        }}>
          {/* Plan name + badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: authUser?.subscriptionTier === "pro" ? "rgba(122,158,126,0.06)" : "rgba(212,179,127,0.06)",
              border: `1px solid ${authUser?.subscriptionTier === "pro" ? "rgba(122,158,126,0.15)" : "rgba(212,179,127,0.15)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: font.display, fontSize: 20, color: authUser?.subscriptionTier === "pro" ? c.sage : c.gilt }}>{tierLabel[0]}</span>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{
                fontFamily: font.display, fontSize: 22, fontWeight: 400, letterSpacing: "0.01em",
                color: authUser?.subscriptionTier === "pro" ? c.sage : authUser?.subscriptionTier === "starter" ? c.gilt : c.chalk,
              }}>
                {tierLabel}
              </span>
              {authUser?.cancelAtPeriodEnd && (
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "rgba(196,112,90,0.08)", color: c.ember, letterSpacing: "0.02em", marginLeft: 10, verticalAlign: "middle" }}>Cancelling</span>
              )}
              {!authUser?.cancelAtPeriodEnd && authUser?.subscriptionPaused && (
                <span style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "rgba(212,179,127,0.08)", color: c.gilt, letterSpacing: "0.02em", marginLeft: 10, verticalAlign: "middle" }}>Paused</span>
              )}
            </div>
            {(!authUser?.subscriptionTier || authUser.subscriptionTier !== "pro") && !confirmCancel && (
              <button onClick={() => setShowUpgradeModal(true)}
                style={{
                  padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
                  color: c.obsidian, fontFamily: font.ui, fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
                  boxShadow: shadow.glow, transition: "all 0.2s ease", flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadow.glowStrong; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = shadow.glow; }}>
                {authUser?.subscriptionTier === "starter" ? "Upgrade to Pro" : "Upgrade Plan"}
              </button>
            )}
          </div>

          {authUser?.subscriptionTier && authUser.subscriptionTier !== "free" && authUser.subscriptionStart && authUser.subscriptionEnd && (() => {
            const start = new Date(authUser.subscriptionStart!).getTime();
            const end = new Date(authUser.subscriptionEnd!).getTime();
            const now = Date.now();
            const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
            const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
            return (
              <>
                {/* Progress bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, fontWeight: 500 }}>
                      {new Date(authUser.subscriptionStart!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(authUser.subscriptionEnd!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: authUser?.subscriptionPaused ? c.gilt : daysLeft <= 3 ? c.ember : c.gilt }}>
                      {authUser?.subscriptionPaused ? "Paused" : daysLeft > 0 ? `${daysLeft} days left` : "Expired"}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: authUser?.subscriptionPaused ? c.stone : daysLeft <= 3 ? c.ember : `linear-gradient(90deg, ${c.gilt}, ${c.giltDark})`, width: `${progress}%`, transition: "width 0.3s" }} />
                  </div>
                </div>

                {/* Cancel / Reactivate actions */}
                {authUser.cancelAtPeriodEnd ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(196,112,90,0.03)", border: `1px solid rgba(196,112,90,0.08)` }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember }}>
                      Cancels {authUser.subscriptionEnd ? new Date(authUser.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "at period end"}
                    </span>
                    <button disabled={cancelLoading} onClick={async () => {
                      setCancelLoading(true); setCancelMsg("");
                      try {
                        const hdrs = await Promise.race([authHeaders(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Auth timeout")), 5000))]);
                        const ctrl = new AbortController();
                        const timer = setTimeout(() => ctrl.abort(), 15000);
                        const res = await fetch("/api/reactivate-subscription", { method: "POST", headers: hdrs, signal: ctrl.signal });
                        clearTimeout(timer);
                        if (res.ok) { const data = await res.json(); if (data.success) { authUpdateUser({ cancelAtPeriodEnd: false }); setCancelMsg(""); showToast("Plan reactivated"); } else { showToast(data.error || "Failed"); } }
                        else { const d = await res.json().catch(() => ({})); showToast(d.error || `Failed (${res.status})`); }
                      } catch (err) { const msg = err instanceof DOMException && err.name === "AbortError" ? "Request timed out." : (err instanceof Error ? err.message : "Network error."); setCancelMsg(msg); showToast(msg); } finally { setCancelLoading(false); }
                    }}
                      style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: c.sage, color: "#fff", fontFamily: font.ui, fontSize: 12, fontWeight: 600, opacity: cancelLoading ? 0.6 : 1, transition: "opacity 0.2s", flexShrink: 0 }}>
                      {cancelLoading ? "Reactivating..." : "Reactivate Plan"}
                    </button>
                  </div>
                ) : !confirmCancel ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                    <button onClick={async () => {
                      setCancelLoading(true);
                      try {
                        const hdrs = await Promise.race([authHeaders(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Auth timeout")), 5000))]);
                        const isPaused = !!authUser?.subscriptionPaused;
                        const action = isPaused ? "resume" : "pause";
                        const res = await fetch("/api/pause-subscription", { method: "POST", headers: hdrs, body: JSON.stringify({ action }) });
                        if (res.ok) { const data = await res.json(); if (data.success) { authUpdateUser({ subscriptionPaused: action === "pause" });showToast(action === "pause" ? "Subscription paused" : "Subscription resumed"); } else { showToast(data.error || "Failed"); } }
                        else { const d = await res.json().catch(() => ({})); showToast(d.error || "Failed"); }
                      } catch { showToast("Network error"); } finally { setCancelLoading(false); }
                    }}
                      style={{ padding: "8px 18px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${c.border}`, color: c.stone, fontFamily: font.ui, fontSize: 11, fontWeight: 500, transition: "all 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      {authUser?.subscriptionPaused ? "Resume Plan" : "Pause Plan"}
                    </button>
                    <button onClick={() => setConfirmCancel(true)}
                      style={{ padding: "8px 18px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid rgba(196,112,90,0.12)`, color: c.ember, fontFamily: font.ui, fontSize: 11, fontWeight: 500, transition: "all 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      Cancel Plan
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(196,112,90,0.03)", border: `1px solid rgba(196,112,90,0.08)` }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, lineHeight: 1.4 }}>You'll keep benefits until your plan expires.</span>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setConfirmCancel(false)}
                        style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid ${c.border}`, color: c.stone, fontFamily: font.ui, fontSize: 11, transition: "background 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        Keep Plan
                      </button>
                      <button disabled={cancelLoading} onClick={async () => {
                        setCancelLoading(true); setCancelMsg("");
                        try {
                          const hdrs = await Promise.race([authHeaders(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Auth timeout")), 5000))]);
                          const ctrl = new AbortController();
                          const timer = setTimeout(() => ctrl.abort(), 15000);
                          const res = await fetch("/api/cancel-subscription", { method: "POST", headers: hdrs, signal: ctrl.signal });
                          clearTimeout(timer);
                          if (res.ok) { const data = await res.json(); if (data.success) { authUpdateUser({ cancelAtPeriodEnd: true }); setCancelMsg(""); setConfirmCancel(false); showToast("Plan will cancel at end of period"); } else { setCancelMsg(data.error || "Failed."); showToast(data.error || "Cancellation failed"); } }
                          else { const d = await res.json().catch(() => ({})); setCancelMsg(d.error || `Error (${res.status}).`); showToast(d.error || "Cancellation failed"); }
                        } catch (err) { const msg = err instanceof DOMException && err.name === "AbortError" ? "Request timed out." : "Network error."; setCancelMsg(msg); showToast(msg); } finally { setCancelLoading(false); }
                      }}
                        style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: c.ember, color: "#fff", fontFamily: font.ui, fontSize: 11, fontWeight: 600, opacity: cancelLoading ? 0.6 : 1 }}>
                        {cancelLoading ? "Cancelling..." : "Yes, Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Payment method management link */}
          {authUser?.subscriptionTier && authUser.subscriptionTier !== "free" && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <a href="https://razorpay.com/support/#request/merchant" target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.stone, textDecoration: "none", display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = c.gilt; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = c.stone; }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Manage Payment Method
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          )}

          {(!authUser?.subscriptionTier || authUser.subscriptionTier === "free") && (
            <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, margin: 0, lineHeight: 1.5 }}>Free plan — 3 total sessions. Upgrade for unlimited practice.</p>
          )}
        </div>
        {cancelMsg && <p style={{ fontFamily: font.ui, fontSize: 12, color: cancelMsg.includes("ancelled") ? c.sage : c.ember, marginTop: -24, marginBottom: 24 }}>{cancelMsg}</p>}

        {/* Billing History */}
        <label style={{ ...labelStyle, marginBottom: 14 }}>Billing History</label>
        <div style={{ borderRadius: 14, background: "rgba(6,6,7,0.5)", border: `1px solid ${c.border}`, overflow: "hidden", marginBottom: 32 }}>
          {paymentsLoading ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Loading payment history...</span>
            </div>
          ) : payments.length > 0 ? (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ minWidth: 480 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 70px", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${c.border}` }}>
                {["Date", "Period", "Plan", "Amount", "Status"].map(h => (
                  <span key={h} style={{ fontFamily: font.ui, fontSize: 10, fontWeight: 600, color: c.stone, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                ))}
              </div>
              {payments.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 70px", gap: 8, padding: "14px 20px", borderBottom: i < payments.length - 1 ? `1px solid ${c.border}` : "none", alignItems: "center" }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>
                    {new Date(p.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
                    {p.subscription_start ? new Date(p.subscription_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "\u2014"}
                    {p.subscription_end ? ` \u2013 ${new Date(p.subscription_end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </span>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.ivory, fontWeight: 500 }}>
                    {p.tier ? p.tier.charAt(0).toUpperCase() + p.tier.slice(1) : p.plan}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.chalk }}>
                    \u20B9{Math.round(p.amount / 100)}
                  </span>
                  <span style={{
                    fontFamily: font.ui, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, display: "inline-block", textAlign: "center",
                    color: p.status === "completed" ? c.sage : c.ember,
                    background: p.status === "completed" ? "rgba(122,158,126,0.08)" : "rgba(196,112,90,0.08)",
                  }}>
                    {p.status === "completed" ? "Paid" : p.status}
                  </span>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>No payment history yet</span>
            </div>
          )}
        </div>

        {/* Data & Privacy */}
        <label style={{ ...labelStyle, marginBottom: 14 }}>Data & Privacy</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }} className="settings-form-grid">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderRadius: 12,
            background: "rgba(6,6,7,0.5)", border: `1px solid ${c.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.12)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 1 }}>Resume data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Row-level security</span>
              </div>
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: c.sage, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Protected</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderRadius: 12,
            background: "rgba(6,6,7,0.5)", border: `1px solid ${c.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.12)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 1 }}>Export all data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Sessions & transcripts</span>
              </div>
            </div>
            <button disabled={exporting} onClick={async () => { setExporting(true); try { await onExportCSV(); } finally { setExporting(false); } }}
              style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.gilt, letterSpacing: "0.02em",
                background: "rgba(212,179,127,0.06)", border: `1px solid rgba(212,179,127,0.15)`,
                borderRadius: 8, padding: "7px 16px", cursor: exporting ? "default" : "pointer",
                opacity: exporting ? 0.6 : 1, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = "rgba(212,179,127,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(212,179,127,0.06)"; }}>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </div>

        <Divider />

        {/* Log out */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, display: "block", marginBottom: 3 }}>Log out</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Sign out on this device</span>
          </div>
          <button onClick={onLogout} style={{
            fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.chalk, letterSpacing: "0.02em",
            background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`,
            borderRadius: 10, padding: "10px 24px", cursor: "pointer", transition: "all 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.06)"; e.currentTarget.style.color = c.ivory; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; e.currentTarget.style.color = c.chalk; }}>
            Log out
          </button>
        </div>

        {/* Delete account */}
        <div style={{
          padding: "20px 24px", borderRadius: 12, marginTop: 12,
          background: "rgba(196,112,90,0.02)", border: `1px solid rgba(196,112,90,0.08)`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, display: "block", marginBottom: 3 }}>Delete account</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Permanently remove all data. This cannot be undone.</span>
          </div>
          {!confirmDelete ? (
            <button onClick={() => { setConfirmDelete(true); setDeleteEmailInput(""); setDeleteMsg(""); }}
              style={{
                fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: c.ember, letterSpacing: "0.02em",
                background: "transparent", border: `1px solid rgba(196,112,90,0.2)`,
                borderRadius: 10, padding: "10px 24px", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              Delete Account
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
              <input type="email" value={deleteEmailInput} onChange={(e) => setDeleteEmailInput(e.target.value)}
                placeholder="Type your email to confirm" aria-label="Confirm email for account deletion"
                style={{
                  fontFamily: font.ui, fontSize: 12, color: c.chalk, background: c.obsidian,
                  border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 10, padding: "10px 14px", outline: "none", minWidth: 220,
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = c.ember; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,112,90,0.08)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(196,112,90,0.2)"; e.currentTarget.style.boxShadow = "none"; }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setConfirmDelete(false); setDeleteEmailInput(""); }}
                  style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 10, padding: "9px 18px", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,242,237,0.04)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  Cancel
                </button>
                <button disabled={deleteLoading || deleteEmailInput.toLowerCase() !== (authUser?.email || "").toLowerCase()} onClick={async () => {
                  setDeleteLoading(true); setDeleteMsg("");
                  try {
                    const hdrs = await Promise.race([authHeaders(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Auth timeout")), 5000))]);
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 15000);
                    const res = await fetch("/api/delete-account", { method: "POST", headers: hdrs, signal: ctrl.signal });
                    clearTimeout(t);
                    if (res.ok || res.status === 207) { localStorage.clear(); onLogout(); }
                    else { const d = await res.json().catch(() => ({})); setDeleteMsg(d.error || "Failed. Try again."); setDeleteLoading(false); }
                  } catch (err) {
                    setDeleteMsg(err instanceof DOMException && err.name === "AbortError" ? "Timed out. Try again." : "Network error.");
                    setDeleteLoading(false);
                  }
                }}
                  style={{
                    fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: "#fff", background: c.ember,
                    border: "none", borderRadius: 10, padding: "9px 24px", cursor: "pointer",
                    opacity: (deleteLoading || deleteEmailInput.toLowerCase() !== (authUser?.email || "").toLowerCase()) ? 0.4 : 1,
                    transition: "opacity 0.15s",
                  }}>
                  {deleteLoading ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
        {deleteMsg && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, marginTop: 12 }}>{deleteMsg}</p>}
      </div>}

      {/* ═══════════════════ REFERRAL ═══════════════════ */}
      {activeSection === "referral" && <ReferralSection showToast={showToast} />}
    </div>
  );
}

/* ─── Referral Section Component ─── */

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

  const cardStyle: React.CSSProperties = {
    position: "relative", borderRadius: 16, padding: "32px 28px",
    background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`,
    boxShadow: shadow.md,
  };
  const labelStyle: React.CSSProperties = { fontFamily: font.ui, fontSize: 11, fontWeight: 600, color: c.stone, letterSpacing: "0.06em", textTransform: "uppercase" as const, display: "block", marginBottom: 10 };
  const sectionHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, marginBottom: 28 };

  if (loading) {
    return <div style={cardStyle}><span style={{ fontFamily: font.ui, fontSize: 13, color: c.stone }}>Loading referral info...</span></div>;
  }

  return (
    <div style={cardStyle}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(122,158,126,0.2), transparent)` }} />

      <div style={sectionHeader}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(122,158,126,0.06)", border: `1px solid rgba(122,158,126,0.12)`, display: "flex", alignItems: "center", justifyContent: "center", color: c.sage }}>
          {icons.referral}
        </div>
        <div>
          <h3 style={{ fontFamily: font.display, fontSize: 20, color: c.ivory, margin: 0 }}>Invite Friends</h3>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: "2px 0 0" }}>Share your referral link and earn rewards</p>
        </div>
      </div>

      {/* Referral Code Display */}
      <label style={labelStyle}>Your Referral Code</label>
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
      <label style={labelStyle}>Share via</label>
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
      <label style={labelStyle}>Referral Stats</label>
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

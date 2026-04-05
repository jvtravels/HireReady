import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { useDocTitle } from "./useDocTitle";
import { authHeaders } from "./supabase";
import { loadTTSSettings, saveTTSSettings, GOOGLE_VOICES, speak, type TTSSettings } from "./tts";
import type { PersistedState } from "./dashboardTypes";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton } from "./dashboardComponents";

/* ─── Shared Styles ─── */
const sectionStyle = {
  background: c.graphite,
  borderRadius: 14,
  border: `1px solid ${c.border}`,
  padding: "28px 32px",
  marginBottom: 20,
} as const;

const sectionTitle: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory, marginBottom: 4,
};

const sectionDesc: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 24, lineHeight: 1.5,
};

const labelStyle: React.CSSProperties = {
  fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: c.obsidian, border: `1px solid ${c.border}`,
  color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box",
};

const focusIn = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = c.gilt; };
const focusOut = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = c.border; };

const chipBtn = (active: boolean): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: 8, cursor: "pointer",
  background: active ? "rgba(201,169,110,0.08)" : c.obsidian,
  border: `1.5px solid ${active ? c.gilt : c.border}`,
  textAlign: "left", transition: "all 0.15s ease",
});

const chipLabel = (active: boolean): React.CSSProperties => ({
  fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: active ? c.ivory : c.chalk, display: "block", marginBottom: 2,
});

const chipDesc: React.CSSProperties = { fontFamily: font.ui, fontSize: 10, color: c.stone };

const PREVIEW_TEXT = "Tell me about a time you led a cross-functional team through a challenging project.";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "interview", label: "Interview" },
  { id: "voice", label: "AI Voice" },
  { id: "notifications", label: "Notifications" },
  { id: "plan", label: "Plan & Data" },
] as const;

export default function SettingsPage() {
  useDocTitle("Settings");
  const nav = useNavigate();
  const { user: authUser, logout: authLogout, updateUser: authUpdateUser, resetPassword } = useAuth();
  const { persisted, updatePersisted: onUpdate, handleExportCSV: onExportCSV, dataLoading, showToast } = useDashboard();
  const onLogout = () => { authLogout(); };

  // Profile
  const [editName, setEditName] = useState(persisted.userName);
  const [editRole, setEditRole] = useState(persisted.targetRole);
  const [editDate, setEditDate] = useState(persisted.interviewDate);
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

  // TTS
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [previewCancel, setPreviewCancel] = useState<{ cancel: () => void } | null>(null);

  // Referral
  const [copied, setCopied] = useState(false);

  // Password
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Section nav
  const [activeSection, setActiveSection] = useState("account");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDirty = editName !== persisted.userName || editRole !== persisted.targetRole || editDate !== persisted.interviewDate || editCompany !== (authUser?.targetCompany || "") || editIndustry !== (authUser?.industry || "");

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
  }, [isDirty, editName, editRole, editDate, editCompany, editIndustry]);

  // Scroll spy for active section
  useEffect(() => {
    const main = document.getElementById("dashboard-main");
    if (!main) return;
    const handler = () => {
      for (const s of [...SECTIONS].reverse()) {
        const el = document.getElementById(`settings-${s.id}`);
        if (el && el.getBoundingClientRect().top < 180) { setActiveSection(s.id); break; }
      }
    };
    main.addEventListener("scroll", handler, { passive: true });
    return () => main.removeEventListener("scroll", handler);
  }, []);

  // Cleanup voice preview
  useEffect(() => { return () => { previewCancel?.cancel(); }; }, [previewCancel]);

  if (dataLoading) return <DataLoadingSkeleton />;

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    onUpdate({ userName: editName, targetRole: editRole, interviewDate: editDate });
    await authUpdateUser({ name: editName, targetRole: editRole, interviewDate: editDate, targetCompany: editCompany, industry: editIndustry });
    setSaving(false); setSaved(true);
    showToast("Profile saved");
    setTimeout(() => setSaved(false), 3000);
  };

  const autoSave = (updates: Partial<PersistedState>) => onUpdate(updates);

  const handlePreviewVoice = async (voiceId: string) => {
    previewCancel?.cancel();
    if (previewVoice === voiceId) { setPreviewVoice(null); setPreviewCancel(null); return; }
    setPreviewVoice(voiceId);
    const original = loadTTSSettings();
    saveTTSSettings({ ...original, provider: "google", voiceId });
    const handle = await speak(PREVIEW_TEXT, () => { setPreviewVoice(null); setPreviewCancel(null); }, () => { setPreviewVoice(null); setPreviewCancel(null); });
    saveTTSSettings(original);
    setPreviewCancel(handle);
  };

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
      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      background: on ? c.gilt : c.border, padding: 2, transition: "background 0.2s ease", position: "relative",
    }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: on ? c.obsidian : c.stone, transition: "transform 0.2s ease", transform: on ? "translateX(18px)" : "translateX(0)" }} />
    </button>
  );

  const scrollTo = (id: string) => {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  };

  const difficultyVal = persisted.defaultDifficulty || "standard";
  const learningVal = authUser?.learningStyle || "direct";
  const sessionLenVal = authUser?.preferredSessionLength || 15;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} ref={scrollRef}>
      {/* Header */}
      <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Settings</h2>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 20 }}>Manage your account, preferences, and subscription</p>

      {/* Section pills */}
      <div className="settings-pills" style={{ display: "flex", gap: 6, marginBottom: 28, overflowX: "auto", paddingBottom: 2 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            style={{
              fontFamily: font.ui, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
              padding: "7px 16px", borderRadius: 20, cursor: "pointer", transition: "all 0.15s",
              background: activeSection === s.id ? "rgba(201,169,110,0.1)" : "transparent",
              border: `1px solid ${activeSection === s.id ? "rgba(201,169,110,0.25)" : c.border}`,
              color: activeSection === s.id ? c.gilt : c.stone,
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ ACCOUNT ═══════════════════ */}
      <div id="settings-account" style={sectionStyle}>
        <h3 style={sectionTitle}>Account</h3>
        <p style={sectionDesc}>Your profile photo, name, and login credentials</p>

        {/* Avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {authUser?.avatarUrl ? (
              <img src={authUser.avatarUrl} alt="Profile" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: `2px solid ${c.border}` }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(201,169,110,0.08)", border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: font.display, fontSize: 26, color: c.gilt }}>{(persisted.userName || "?")[0].toUpperCase()}</span>
              </div>
            )}
            <label title="Upload avatar" style={{
              position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%",
              background: c.graphite, border: `1.5px solid ${c.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.chalk} strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { showToast("Image must be under 2 MB"); return; }
                const reader = new FileReader();
                reader.onload = () => { authUpdateUser({ avatarUrl: reader.result as string }); showToast("Avatar updated"); };
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: font.ui, fontSize: 16, fontWeight: 600, color: c.ivory }}>{persisted.userName}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{authUser?.email}</p>
          </div>
        </div>

        {/* Form fields — 2-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="settings-form-grid">
          <div>
            <label style={labelStyle}>Full Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60}
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={authUser?.email || ""} readOnly
              style={{ ...inputStyle, color: c.stone, cursor: "default" }} />
          </div>
          <div>
            <label style={labelStyle}>Target Company</label>
            <input type="text" value={editCompany} onChange={(e) => setEditCompany(e.target.value)} maxLength={60} placeholder="e.g. Google"
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>Industry</label>
            <input type="text" value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} maxLength={60} placeholder="e.g. FinTech"
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
        </div>

        {/* Save bar */}
        <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
          <button onClick={handleSave} disabled={saving || !isDirty} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 28px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: (saving || !isDirty) ? "not-allowed" : "pointer", opacity: (saving || !isDirty) ? 0.45 : 1, transition: "opacity 0.15s" }}>
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
          </button>
          {isDirty && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.gilt }}>Unsaved changes</span>}
          {saved && <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, display: "flex", alignItems: "center", gap: 4 }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved
          </span>}
          <kbd style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 10, color: c.stone, background: "rgba(240,237,232,0.04)", border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 6px" }}>⌘S</kbd>
        </div>

        {/* Password */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Password</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Reset via email link</span>
          </div>
          <button onClick={handlePasswordReset} disabled={resetLoading || resetSent}
            style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: resetSent ? c.sage : c.gilt, background: resetSent ? "rgba(122,158,126,0.06)" : "rgba(201,169,110,0.06)", border: `1px solid ${resetSent ? "rgba(122,158,126,0.15)" : "rgba(201,169,110,0.15)"}`, borderRadius: 6, padding: "8px 18px", cursor: (resetLoading || resetSent) ? "default" : "pointer", opacity: resetLoading ? 0.6 : 1 }}>
            {resetLoading ? "Sending..." : resetSent ? "Email Sent ✓" : "Reset Password"}
          </button>
        </div>
      </div>

      {/* ═══════════════════ INTERVIEW ═══════════════════ */}
      <div id="settings-interview" style={sectionStyle}>
        <h3 style={sectionTitle}>Interview Preferences</h3>
        <p style={sectionDesc}>Configure your target role, difficulty, and session format. Changes save automatically.</p>

        {/* Target role + date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }} className="settings-form-grid">
          <div>
            <label style={labelStyle}>Target Role</label>
            <input type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)} maxLength={80}
              style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>Interview Date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }} onFocus={focusIn} onBlur={focusOut} />
          </div>
        </div>

        {/* Difficulty */}
        <label style={{ ...labelStyle, marginBottom: 10 }}>Default Difficulty</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }} className="settings-chip-grid">
          {[
            { id: "warmup", label: "Warm-up", desc: "Confidence-building" },
            { id: "standard", label: "Standard", desc: "Realistic pacing" },
            { id: "intense", label: "Intense", desc: "High pressure" },
          ].map(d => (
            <button key={d.id} onClick={() => autoSave({ defaultDifficulty: d.id })} style={chipBtn(difficultyVal === d.id)}>
              <span style={chipLabel(difficultyVal === d.id)}>{d.label}</span>
              <span style={chipDesc}>{d.desc}</span>
            </button>
          ))}
        </div>

        {/* Feedback style + Session length — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="settings-form-grid">
          <div>
            <label style={{ ...labelStyle, marginBottom: 10 }}>Feedback Style</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([
                { id: "direct" as const, label: "Direct", desc: "Straightforward critique" },
                { id: "encouraging" as const, label: "Encouraging", desc: "Supportive framing" },
              ]).map(s => (
                <button key={s.id} onClick={() => authUpdateUser({ learningStyle: s.id })} style={chipBtn(learningVal === s.id)}>
                  <span style={chipLabel(learningVal === s.id)}>{s.label}</span>
                  <span style={chipDesc}>{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: 10 }}>Session Length</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {([
                { id: 10 as const, label: "10 min", desc: "Quick practice" },
                { id: 15 as const, label: "15 min", desc: "Standard session" },
                { id: 25 as const, label: "25 min", desc: "Deep dive" },
              ]).map(s => (
                <button key={s.id} onClick={() => authUpdateUser({ preferredSessionLength: s.id })} style={chipBtn(sessionLenVal === s.id)}>
                  <span style={chipLabel(sessionLenVal === s.id)}>{s.label}</span>
                  <span style={chipDesc}>{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════ AI VOICE ═══════════════════ */}
      <div id="settings-voice" style={sectionStyle}>
        <h3 style={sectionTitle}>AI Interviewer Voice</h3>
        <p style={sectionDesc}>Premium Neural2 voices included free. Click play to preview before selecting.</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([
            { id: "google" as const, label: "Neural Voice", desc: "Premium, natural" },
            { id: "browser" as const, label: "Browser Voice", desc: "Built-in fallback" },
          ]).map(p => (
            <button key={p.id} onClick={() => { const u = { ...ttsSettings, provider: p.id }; setTtsSettings(u); saveTTSSettings(u); }}
              style={{ ...chipBtn(ttsSettings.provider === p.id), flex: 1 }}>
              <span style={chipLabel(ttsSettings.provider === p.id)}>{p.label}</span>
              <span style={chipDesc}>{p.desc}</span>
            </button>
          ))}
        </div>

        {ttsSettings.provider === "google" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} className="settings-form-grid">
            {GOOGLE_VOICES.map(v => {
              const sel = ttsSettings.voiceId === v.id;
              const playing = previewVoice === v.id;
              return (
                <div key={v.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 8,
                  background: sel ? "rgba(201,169,110,0.08)" : c.obsidian,
                  border: `1px solid ${sel ? c.gilt : c.border}`,
                  transition: "all 0.15s",
                }}>
                  <button onClick={() => handlePreviewVoice(v.id)} aria-label={playing ? `Stop ${v.name}` : `Preview ${v.name}`}
                    style={{
                      width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
                      background: playing ? "rgba(201,169,110,0.15)" : "rgba(240,237,232,0.04)",
                      display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s",
                    }}>
                    {playing
                      ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill={c.gilt}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                      : <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill={c.chalk}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    }
                  </button>
                  <button onClick={() => { const u = { ...ttsSettings, voiceId: v.id, voiceName: v.name }; setTtsSettings(u); saveTTSSettings(u); }}
                    style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: sel ? c.ivory : c.chalk, display: "block", marginBottom: 1 }}>{v.name}</span>
                    <span style={chipDesc}>{v.desc}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {ttsSettings.provider === "browser" && (
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, padding: "14px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, lineHeight: 1.6 }}>
            Using your browser's built-in speech. Quality varies by browser and OS. Switch to Neural Voice for premium voices — free with your account.
          </p>
        )}
      </div>

      {/* ═══════════════════ NOTIFICATIONS ═══════════════════ */}
      <div id="settings-notifications" style={sectionStyle}>
        <h3 style={sectionTitle}>Notifications</h3>
        <p style={sectionDesc}>Control how and when HireReady reaches out to you</p>

        {[
          { label: "Email notifications", desc: "Session reminders and progress updates", key: "emailNotifs" as const, on: persisted.emailNotifs !== false },
          { label: "Streak reminders", desc: "Get nudged before you lose your streak", key: "streakReminder" as const, on: persisted.streakReminder !== false },
          { label: "Weekly digest", desc: "Summary of your weekly progress every Monday", key: "weeklyDigest" as const, on: persisted.weeklyDigest || false },
        ].map((item, i, arr) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : "none" }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>{item.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{item.desc}</span>
            </div>
            <Toggle on={item.on} onToggle={() => autoSave({ [item.key]: !item.on })} />
          </div>
        ))}

        {/* Referral */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory }}>Refer a Friend</span>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 12, lineHeight: 1.5 }}>Share your link — you both get a bonus free session.</p>
          {(() => {
            const code = authUser?.id ? authUser.id.slice(0, 8).toUpperCase() : "SHARE";
            const link = `${window.location.origin}/signup?ref=${code}`;
            return (
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={link} style={{ flex: 1, fontFamily: font.mono, fontSize: 11, color: c.chalk, background: c.obsidian, border: `1px solid ${c.border}`, borderRadius: 6, padding: "10px 12px", outline: "none", minWidth: 0 }} onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); showToast("Referral link copied"); setTimeout(() => setCopied(false), 2000); }}
                  style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: copied ? c.sage : c.obsidian, background: copied ? "rgba(122,158,126,0.12)" : c.gilt, border: copied ? `1px solid rgba(122,158,126,0.2)` : "none", borderRadius: 6, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }}>
                  {copied ? "Copied ✓" : "Copy Link"}
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ═══════════════════ PLAN & DATA ═══════════════════ */}
      <div id="settings-plan" style={sectionStyle}>
        <h3 style={sectionTitle}>Plan & Data</h3>
        <p style={sectionDesc}>Manage your subscription, export data, or delete your account</p>

        {/* Subscription */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "start", marginBottom: 24 }} className="settings-form-grid">
          <div style={{ padding: "16px 20px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory }}>Current Plan</span>
              <span style={{
                fontFamily: font.ui, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                background: authUser?.subscriptionTier === "pro" ? "rgba(122,158,126,0.12)" : authUser?.subscriptionTier === "starter" ? "rgba(201,169,110,0.12)" : "rgba(240,237,232,0.06)",
                color: authUser?.subscriptionTier === "pro" ? c.sage : authUser?.subscriptionTier === "starter" ? c.gilt : c.stone,
              }}>
                {(authUser?.subscriptionTier || "free").charAt(0).toUpperCase() + (authUser?.subscriptionTier || "free").slice(1)}
              </span>
            </div>

            {authUser?.subscriptionTier && authUser.subscriptionTier !== "free" && authUser.subscriptionStart && authUser.subscriptionEnd && (() => {
              const start = new Date(authUser.subscriptionStart!).getTime();
              const end = new Date(authUser.subscriptionEnd!).getTime();
              const now = Date.now();
              const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
              const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Started</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{new Date(authUser.subscriptionStart!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Expires</span>
                    <span style={{ fontFamily: font.ui, fontSize: 11, color: c.chalk }}>{new Date(authUser.subscriptionEnd!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: c.border, marginBottom: 6 }}>
                    <div style={{ height: "100%", borderRadius: 2, background: daysLeft <= 3 ? c.ember : c.gilt, width: `${progress}%`, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: daysLeft <= 3 ? c.ember : c.stone }}>
                    {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Expired"}
                  </span>
                </>
              );
            })()}

            {(!authUser?.subscriptionTier || authUser.subscriptionTier === "free") && (
              <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0 }}>Free plan — 3 total sessions. Upgrade for more.</p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
            {(!authUser?.subscriptionTier || authUser.subscriptionTier !== "pro") && (
              <button onClick={() => nav("/dashboard?plan=monthly")}
                style={{ padding: "11px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`, color: c.obsidian, fontFamily: font.ui, fontSize: 13, fontWeight: 600 }}>
                {authUser?.subscriptionTier === "starter" ? "Upgrade to Pro" : "Upgrade Plan"}
              </button>
            )}
            {authUser?.subscriptionTier && authUser.subscriptionTier !== "free" && (
              !confirmCancel ? (
                <button onClick={() => setConfirmCancel(true)}
                  style={{ padding: "10px 20px", borderRadius: 8, cursor: "pointer", background: "transparent", border: `1px solid rgba(196,112,90,0.2)`, color: c.ember, fontFamily: font.ui, fontSize: 12, fontWeight: 500 }}>
                  Cancel Plan
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.ember }}>Are you sure?</span>
                  <button disabled={cancelLoading} onClick={async () => {
                    setCancelLoading(true); setCancelMsg("");
                    try {
                      const { supabase, supabaseConfigured } = await import("./supabase");
                      if (supabaseConfigured) await supabase.auth.getSession();
                      const hdrs = await authHeaders();
                      const res = await fetch("/api/cancel-subscription", { method: "POST", headers: hdrs });
                      if (res.ok) { const data = await res.json(); if (data.success) { authUpdateUser({ subscriptionTier: "free", subscriptionEnd: new Date().toISOString() }); setCancelMsg("Cancelled."); setConfirmCancel(false); } else setCancelMsg(data.error || "Failed."); }
                      else { const d = await res.json().catch(() => ({})); setCancelMsg(d.error || `Error (${res.status}).`); }
                    } catch { setCancelMsg("Network error."); } finally { setCancelLoading(false); }
                  }}
                    style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", background: c.ember, color: "#fff", fontFamily: font.ui, fontSize: 11, fontWeight: 600, opacity: cancelLoading ? 0.6 : 1 }}>
                    {cancelLoading ? "Cancelling..." : "Yes, Cancel"}
                  </button>
                  <button onClick={() => setConfirmCancel(false)}
                    style={{ padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${c.border}`, color: c.stone, fontFamily: font.ui, fontSize: 11 }}>
                    Keep Plan
                  </button>
                </div>
              )
            )}
          </div>
        </div>
        {cancelMsg && <p style={{ fontFamily: font.ui, fontSize: 12, color: cancelMsg.includes("ancelled") ? c.sage : c.ember, marginTop: -16, marginBottom: 16 }}>{cancelMsg}</p>}

        {/* Payment History */}
        <label style={{ ...labelStyle, marginBottom: 12, fontSize: 13, fontWeight: 600, color: c.ivory }}>Payment History</label>
        <div style={{ borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}`, overflow: "hidden", marginBottom: 28 }}>
          {authUser?.subscriptionTier && authUser.subscriptionTier !== "free" && authUser.subscriptionStart ? (
            <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(122,158,126,0.08)", border: `1px solid rgba(122,158,126,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>
                    {authUser.subscriptionTier.charAt(0).toUpperCase() + authUser.subscriptionTier.slice(1)} Plan
                  </span>
                  <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>
                    {new Date(authUser.subscriptionStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {authUser.subscriptionEnd && ` — ${new Date(authUser.subscriptionEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                  </span>
                </div>
              </div>
              <span style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.sage, background: "rgba(122,158,126,0.08)", padding: "3px 10px", borderRadius: 5 }}>Paid</span>
            </div>
          ) : (
            <div style={{ padding: "20px 18px", textAlign: "center" }}>
              <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>No payments yet. Upgrade your plan to see billing history here.</span>
            </div>
          )}
        </div>

        {/* Data & Privacy */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }} className="settings-form-grid">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Resume data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Encrypted (AES-256)</span>
              </div>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, fontWeight: 500 }}>Protected</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Export all data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Sessions & transcripts</span>
              </div>
            </div>
            <button onClick={onExportCSV} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
              Export CSV
            </button>
          </div>
        </div>

        {/* Danger zone — inline, not a separate card */}
        <div style={{ paddingTop: 20, borderTop: `1px solid rgba(196,112,90,0.15)` }}>
          <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ember, display: "block", marginBottom: 16 }}>Danger Zone</span>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Log out</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Sign out on this device</span>
            </div>
            <button onClick={onLogout} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember, background: "rgba(196,112,90,0.06)", border: `1px solid rgba(196,112,90,0.15)`, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,112,90,0.06)"; }}>
              Log out
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Delete account</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Permanently remove all data</span>
            </div>
            {!confirmDelete ? (
              <button onClick={() => { setConfirmDelete(true); setDeleteEmailInput(""); setDeleteMsg(""); }}
                style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember, background: "transparent", border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
                Delete Account
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                <input type="email" value={deleteEmailInput} onChange={(e) => setDeleteEmailInput(e.target.value)}
                  placeholder="Type your email to confirm" aria-label="Confirm email for account deletion"
                  style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk, background: c.obsidian, border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 6, padding: "8px 12px", outline: "none", minWidth: 200 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = c.ember; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(196,112,90,0.2)"; }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setConfirmDelete(false); setDeleteEmailInput(""); }}
                    style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button disabled={deleteLoading || deleteEmailInput.toLowerCase() !== (authUser?.email || "").toLowerCase()} onClick={async () => {
                    setDeleteLoading(true); setDeleteMsg("");
                    try {
                      const hdrs = await authHeaders();
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
                    style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: "#fff", background: c.ember, border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer", opacity: (deleteLoading || deleteEmailInput.toLowerCase() !== (authUser?.email || "").toLowerCase()) ? 0.4 : 1 }}>
                    {deleteLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {deleteMsg && <p style={{ fontFamily: font.ui, fontSize: 12, color: c.ember, marginTop: 8 }}>{deleteMsg}</p>}
        </div>
      </div>
    </div>
  );
}

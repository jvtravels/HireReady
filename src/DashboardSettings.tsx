import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { c, font } from "./tokens";
import { useAuth } from "./AuthContext";
import { loadTTSSettings, saveTTSSettings, GOOGLE_VOICES, type TTSSettings } from "./tts";
import type { PersistedState } from "./dashboardTypes";
import { useDashboard } from "./DashboardContext";
import { DataLoadingSkeleton } from "./dashboardComponents";

export default function SettingsPage() {
  const nav = useNavigate();
  const { user: authUser, logout: authLogout, updateUser: authUpdateUser } = useAuth();
  const { persisted, updatePersisted: onUpdate, handleExportCSV: onExportCSV, dataLoading } = useDashboard();
  const onLogout = () => { authLogout(); };
  const onSyncToSupabase = (updates: { name?: string; targetRole?: string; interviewDate?: string }) => authUpdateUser(updates);

  if (dataLoading) return <DataLoadingSkeleton />;
  const [editName, setEditName] = useState(persisted.userName);
  const [editRole, setEditRole] = useState(persisted.targetRole);
  const [editDate, setEditDate] = useState(persisted.interviewDate);
  const [saved, setSaved] = useState(false);
  const [difficulty, setDifficulty] = useState(persisted.defaultDifficulty || "standard");
  const [emailNotifs, setEmailNotifs] = useState(persisted.emailNotifs !== false);
  const [streakReminder, setStreakReminder] = useState(persisted.streakReminder !== false);
  const [weeklyDigest, setWeeklyDigest] = useState(persisted.weeklyDigest || false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // TTS Settings
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);

  const handleSave = () => {
    onUpdate({
      userName: editName, targetRole: editRole, interviewDate: editDate,
      defaultDifficulty: difficulty, emailNotifs, streakReminder, weeklyDigest,
    });
    onSyncToSupabase({ name: editName, targetRole: editRole, interviewDate: editDate });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} style={{
      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      background: on ? c.gilt : c.border, padding: 2,
      transition: "background 0.2s ease", position: "relative",
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: on ? c.obsidian : c.stone,
        transition: "transform 0.2s ease", transform: on ? "translateX(18px)" : "translateX(0)",
      }} />
    </button>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{ fontFamily: font.ui, fontSize: 22, fontWeight: 600, color: c.ivory, marginBottom: 4 }}>Settings</h2>
      <p style={{ fontFamily: font.ui, fontSize: 13, color: c.stone, marginBottom: 28 }}>Manage your profile, preferences, and account</p>

      {/* Profile */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Profile</h3>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          {authUser?.avatarUrl ? (
            <img src={authUser.avatarUrl} alt="Profile" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${c.border}` }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(201,169,110,0.1)", border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: font.display, fontSize: 22, color: c.gilt }}>{(persisted.userName || "?")[0].toUpperCase()}</span>
            </div>
          )}
          <div>
            <p style={{ fontFamily: font.ui, fontSize: 15, fontWeight: 600, color: c.ivory }}>{persisted.userName}</p>
            <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>{persisted.targetRole}</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Full Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Target Role</label>
            <input type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
          <div>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 6 }}>Interview Date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}`, color: c.ivory, fontFamily: font.ui, fontSize: 13, outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              onFocus={(e) => e.currentTarget.style.borderColor = c.gilt}
              onBlur={(e) => e.currentTarget.style.borderColor = c.border}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button onClick={handleSave} className="shimmer-btn"
            style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, padding: "10px 24px", borderRadius: 8, border: "none", background: c.gilt, color: c.obsidian, cursor: "pointer" }}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
          {saved && <span style={{ fontFamily: font.ui, fontSize: 12, color: c.sage, display: "flex", alignItems: "center", gap: 4 }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Changes saved
          </span>}
        </div>
      </div>

      {/* Interview Preferences */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Interview Preferences</h3>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10 }}>Default Difficulty</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "warmup", label: "Warm-up", desc: "Conversational, confidence-building" },
              { id: "standard", label: "Standard", desc: "Realistic interview pacing" },
              { id: "intense", label: "Intense", desc: "Rapid-fire, high pressure" },
            ].map(d => (
              <button key={d.id} onClick={() => setDifficulty(d.id)}
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  background: difficulty === d.id ? "rgba(201,169,110,0.08)" : c.obsidian,
                  border: `1.5px solid ${difficulty === d.id ? c.gilt : c.border}`,
                  textAlign: "left", transition: "all 0.2s ease",
                }}>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: difficulty === d.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{d.label}</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{d.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Voice Settings */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 6 }}>AI Interviewer Voice</h3>
        <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, marginBottom: 20 }}>
          Premium Neural2 AI voices are included for all users. You can also switch to your browser's built-in voice.
        </p>

        {/* Provider toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([
            { id: "google" as const, label: "Neural Voice", desc: "Premium, natural (included)" },
            { id: "browser" as const, label: "Browser Voice", desc: "Built-in fallback" },
          ]).map(p => (
            <button key={p.id} onClick={() => {
              const updated = { ...ttsSettings, provider: p.id };
              setTtsSettings(updated);
              saveTTSSettings(updated);
            }}
              style={{
                flex: 1, padding: "14px 16px", borderRadius: 8, cursor: "pointer",
                background: ttsSettings.provider === p.id ? "rgba(201,169,110,0.08)" : c.obsidian,
                border: `1.5px solid ${ttsSettings.provider === p.id ? c.gilt : c.border}`,
                textAlign: "left", transition: "all 0.2s ease",
              }}>
              <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: ttsSettings.provider === p.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{p.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{p.desc}</span>
            </button>
          ))}
        </div>

        {/* Voice selection (Google Neural) */}
        {ttsSettings.provider === "google" && (
          <div style={{ padding: "16px 20px", borderRadius: 10, background: c.obsidian, border: `1px solid ${c.border}`, marginBottom: 16 }}>
            <label style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.chalk, display: "block", marginBottom: 10 }}>Choose Your Interviewer Voice</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {GOOGLE_VOICES.map(v => (
                <button key={v.id} onClick={() => {
                  const updated = { ...ttsSettings, voiceId: v.id, voiceName: v.name };
                  setTtsSettings(updated);
                  saveTTSSettings(updated);
                }}
                  style={{
                    padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                    background: ttsSettings.voiceId === v.id ? "rgba(201,169,110,0.08)" : "transparent",
                    border: `1px solid ${ttsSettings.voiceId === v.id ? c.gilt : c.border}`,
                    textAlign: "left", transition: "all 0.2s ease",
                  }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: ttsSettings.voiceId === v.id ? c.ivory : c.chalk, display: "block", marginBottom: 2 }}>{v.name}</span>
                  <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>{v.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {ttsSettings.provider === "browser" && (
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            Using your browser's built-in text-to-speech. Quality varies by browser and OS. Switch to Neural Voice above for premium, natural-sounding voices — included free with your account.
          </p>
        )}
      </div>

      {/* Notifications */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Notifications</h3>

        {[
          { label: "Email notifications", desc: "Session reminders and progress updates", on: emailNotifs, toggle: () => setEmailNotifs(!emailNotifs) },
          { label: "Streak reminders", desc: "Get nudged when you're about to lose your streak", on: streakReminder, toggle: () => setStreakReminder(!streakReminder) },
          { label: "Weekly digest", desc: "Summary of your weekly progress every Monday", on: weeklyDigest, toggle: () => setWeeklyDigest(!weeklyDigest) },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: i < 2 ? `1px solid ${c.border}` : "none" }}>
            <div>
              <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>{item.label}</span>
              <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>{item.desc}</span>
            </div>
            <Toggle on={item.on} onToggle={item.toggle} />
          </div>
        ))}
      </div>

      {/* Data & Privacy */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid ${c.border}`, padding: "24px 28px", marginBottom: 16 }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ivory, marginBottom: 20 }}>Data & Privacy</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Resume data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Encrypted (AES-256), stored securely</span>
              </div>
            </div>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.sage, fontWeight: 500 }}>Protected</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: c.obsidian, border: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.gilt} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <div>
                <span style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ivory, display: "block" }}>Export all data</span>
                <span style={{ fontFamily: font.ui, fontSize: 10, color: c.stone }}>Download your sessions, scores, and transcripts</span>
              </div>
            </div>
            <button onClick={onExportCSV} style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.gilt, background: "rgba(201,169,110,0.06)", border: `1px solid rgba(201,169,110,0.15)`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ background: c.graphite, borderRadius: 12, border: `1px solid rgba(196,112,90,0.15)`, padding: "24px 28px" }}>
        <h3 style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.ember, marginBottom: 16 }}>Danger Zone</h3>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 500, color: c.ivory, display: "block", marginBottom: 2 }}>Log out</span>
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Sign out of your account on this device</span>
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
            <span style={{ fontFamily: font.ui, fontSize: 11, color: c.stone }}>Permanently delete your account and all data</span>
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 500, color: c.ember, background: "transparent", border: `1px solid rgba(196,112,90,0.2)`, borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
              Delete Account
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, background: "transparent", border: `1px solid ${c.border}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { localStorage.clear(); onLogout(); }} style={{ fontFamily: font.ui, fontSize: 12, fontWeight: 600, color: "#fff", background: c.ember, border: "none", borderRadius: 6, padding: "8px 20px", cursor: "pointer" }}>
                Confirm Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

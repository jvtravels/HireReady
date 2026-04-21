import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { c, font } from "./tokens";

interface ProfileData {
  name: string;
  targetRole: string;
  targetCompany: string;
  memberSince: string;
  stats: {
    totalSessions: number;
    avgScore: number;
    skills: { name: string; score: number }[];
    sessionTypes: Record<string, number>;
  };
}

export default function PublicProfile() {
  const { userId } = useParams() as { userId?: string };
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/public-profile?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setProfile(data);
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#060607", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: font.ui, fontSize: 14, color: c.stone }}>Loading profile...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ minHeight: "100vh", background: "#060607", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <span style={{ fontFamily: font.ui, fontSize: 16, color: c.stone }}>{error || "Profile not found"}</span>
        <Link href="/" style={{ fontFamily: font.ui, fontSize: 13, color: c.gilt, textDecoration: "none" }}>Go to HireStepX</Link>
      </div>
    );
  }

  const initials = profile.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const memberDate = new Date(profile.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const maxSkillScore = Math.max(...profile.stats.skills.map(s => s.score), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#060607", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px",
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: font.ui, fontSize: 24, fontWeight: 700, color: c.obsidian }}>{initials}</span>
          </div>
          <h1 style={{ fontFamily: font.display, fontSize: 28, color: c.ivory, margin: "0 0 4px" }}>{profile.name}</h1>
          {profile.targetRole && (
            <p style={{ fontFamily: font.ui, fontSize: 14, color: c.stone, margin: "0 0 2px" }}>
              Preparing for {profile.targetRole}{profile.targetCompany ? ` at ${profile.targetCompany}` : ""}
            </p>
          )}
          <p style={{ fontFamily: font.ui, fontSize: 12, color: c.stone, margin: 0 }}>Member since {memberDate}</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
          <div style={{ padding: "24px 20px", borderRadius: 14, background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`, textAlign: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 32, fontWeight: 700, color: c.gilt, display: "block" }}>{profile.stats.totalSessions}</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Sessions Completed</span>
          </div>
          <div style={{ padding: "24px 20px", borderRadius: 14, background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`, textAlign: "center" }}>
            <span style={{ fontFamily: font.mono, fontSize: 32, fontWeight: 700, color: c.sage, display: "block" }}>{profile.stats.avgScore}</span>
            <span style={{ fontFamily: font.ui, fontSize: 12, color: c.stone }}>Average Score</span>
          </div>
        </div>

        {/* Skills */}
        {profile.stats.skills.length > 0 && (
          <div style={{ padding: "24px", borderRadius: 14, background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`, marginBottom: 28 }}>
            <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, margin: "0 0 16px", letterSpacing: "0.02em" }}>Skill Breakdown</h3>
            {profile.stats.skills.map(skill => (
              <div key={skill.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: font.ui, fontSize: 12, color: c.chalk }}>{skill.name}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: c.stone }}>{skill.score}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(245,242,237,0.05)" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: skill.score >= 70 ? c.sage : skill.score >= 40 ? c.gilt : c.ember, width: `${(skill.score / maxSkillScore) * 100}%`, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Session Types */}
        {Object.keys(profile.stats.sessionTypes).length > 0 && (
          <div style={{ padding: "24px", borderRadius: 14, background: "rgba(6,6,7,0.6)", border: `1px solid ${c.border}`, marginBottom: 28 }}>
            <h3 style={{ fontFamily: font.ui, fontSize: 13, fontWeight: 600, color: c.ivory, margin: "0 0 16px", letterSpacing: "0.02em" }}>Practice Focus</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(profile.stats.sessionTypes).map(([type, count]) => (
                <span key={type} style={{
                  fontFamily: font.ui, fontSize: 11, fontWeight: 500, color: c.chalk,
                  background: "rgba(245,242,237,0.04)", border: `1px solid ${c.border}`,
                  borderRadius: 8, padding: "6px 12px",
                }}>
                  {type} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/signup" style={{
            fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: c.obsidian,
            background: `linear-gradient(135deg, ${c.gilt}, ${c.giltDark})`,
            padding: "12px 32px", borderRadius: 10, textDecoration: "none", display: "inline-block",
          }}>
            Start Your Interview Prep
          </Link>
          <p style={{ fontFamily: font.ui, fontSize: 11, color: c.stone, marginTop: 10 }}>
            Powered by <span style={{ color: c.gilt }}>HireStepX</span>
          </p>
        </div>
      </div>
    </div>
  );
}

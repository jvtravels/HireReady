"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEmployerData, Requirement } from "@/employer/EmployerDataContext";
import { Candidate } from "@/employer/mockData";
import { tokens as t, fonts as f } from "@/auth/_tokens";
import { Card, Eyebrow, ScoreChip, SkillTag, Divider } from "@/employer/_atoms";

function CompareColumn({ candidate }: { candidate: Candidate }) {
  return (
    <Card style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <ScoreChip score={candidate.matchScore} />
        <div>
          <div style={{ fontFamily: f.sans, fontSize: 15, fontWeight: 700, color: t.coal }}>
            {candidate.unlocked ? candidate.name : `Candidate #${candidate.id.slice(0, 6)}`}
          </div>
          <div style={{ fontFamily: f.sans, fontSize: 12, color: t.inkFaint }}>{candidate.targetRole} · {candidate.city}</div>
        </div>
      </div>
      <Divider />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, fontFamily: f.sans, fontSize: 13, color: t.inkSoft }}>
        <div>Match score for this role: <strong style={{ color: t.coal }}>{candidate.matchScore}</strong></div>
        {candidate.matchBreakdown && (
          <div style={{ fontSize: 12.5, color: t.inkFaint, marginTop: -4 }}>
            Role {candidate.matchBreakdown.roleMatch}% · Skill {candidate.matchBreakdown.skillMatch}% · Location {candidate.matchBreakdown.locationMatch}%
          </div>
        )}
        <div>Roster score (lifetime): <strong style={{ color: t.coal }}>{candidate.rosterScore}</strong></div>
        <div>Practice sessions: <strong style={{ color: t.coal }}>{candidate.sessionsCompleted}</strong> · last active {candidate.lastActiveDaysAgo}d ago</div>
        <div>
          Skills:
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {candidate.skills.map((s) => (
              <SkillTag key={s}>{s}</SkillTag>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ComparePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { fetchRequirementDetail } = useEmployerData();
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRequirementDetail(params.id).then((r) => {
      if (active) {
        setRequirement(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchRequirementDetail, params.id]);

  const aId = searchParams.get("a");
  const bId = searchParams.get("b");
  const a = requirement?.candidates.find((c) => c.id === aId);
  const b = requirement?.candidates.find((c) => c.id === bId);

  if (loading) {
    return (
      <Card style={{ textAlign: "center", padding: 48 }}>
        <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft }}>Loading…</p>
      </Card>
    );
  }

  if (!requirement || !a || !b) {
    return (
      <Card style={{ textAlign: "center", padding: 48 }}>
        <p style={{ fontFamily: f.sans, fontSize: 14, color: t.inkSoft, marginBottom: 16 }}>
          Select two candidates from the shortlist to compare them.
        </p>
        <Link href={`/employer/requirements/${params.id}`} style={{ fontFamily: f.sans, fontSize: 13, fontWeight: 600, color: t.indigo, textDecoration: "none" }}>
          ← Back to shortlist
        </Link>
      </Card>
    );
  }

  return (
    <div>
      <Eyebrow tone="indigo">Comparing candidates</Eyebrow>
      <h1 style={{ fontFamily: f.serif, fontSize: 26, color: t.coal, margin: "6px 0 20px" }}>{requirement.title}</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <CompareColumn candidate={a} />
        <CompareColumn candidate={b} />
      </div>
    </div>
  );
}

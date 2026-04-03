import { useState } from "react";
import { c, font } from "./tokens";
import type { SkillData, TrendPoint } from "./dashboardTypes";

/* ─── Score Trend Chart with tooltips ─── */
export function ScoreTrendChart({ data }: { data: TrendPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const w = 400, h = 140, px = 24, py = 20;
  const scores = data.map(d => d.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const points = scores.map((v, i) => ({
    x: px + (i / (scores.length - 1)) * (w - px * 2),
    y: py + (1 - (v - min) / (max - min)) * (h - py * 2),
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`;

  return (
    <div style={{ position: "relative" }}>
      <svg aria-hidden="true" width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}
        role="img" aria-label={`Score trend from ${scores[0]} to ${scores[scores.length - 1]}`}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.gilt} stopOpacity="0.2" />
            <stop offset="100%" stopColor={c.gilt} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const y = py + (i / 3) * (h - py * 2);
          const val = Math.round(max - (i / 3) * (max - min));
          return (
            <g key={i}>
              <line x1={px} y1={y} x2={w - px} y2={y} stroke={c.border} strokeWidth="1" />
              <text x={px - 4} y={y + 3} textAnchor="end" fontFamily={font.mono} fontSize="8" fill={c.stone}>{val}</text>
            </g>
          );
        })}
        <path d={area} fill="url(#trendGrad)" />
        <path d={line} fill="none" stroke={c.gilt} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" onMouseEnter={() => setHovered(i)} style={{ cursor: "pointer" }} />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : i === points.length - 1 ? 4 : 2.5}
              fill={hovered === i || i === points.length - 1 ? c.gilt : c.graphite}
              stroke={c.gilt} strokeWidth={hovered === i || i === points.length - 1 ? 2 : 1.5} />
          </g>
        ))}
        {hovered !== null && (() => {
          const px2 = points[hovered].x;
          const tooltipW = 84;
          const clampedX = Math.max(tooltipW / 2, Math.min(w - tooltipW / 2, px2));
          return (
            <g>
              <rect x={clampedX - 42} y={points[hovered].y - 44} width={tooltipW} height="34" rx="6" fill={c.graphite} stroke={c.border} strokeWidth="1" />
              <text x={clampedX} y={points[hovered].y - 30} textAnchor="middle" fontFamily={font.mono} fontSize="12" fontWeight="600" fill={c.ivory}>{data[hovered].score}</text>
              <text x={clampedX} y={points[hovered].y - 17} textAnchor="middle" fontFamily={font.ui} fontSize="8" fill={c.stone}>{data[hovered].date} · {data[hovered].type}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ─── Skill Radar ─── */
export function SkillRadar({ skills: s }: { skills: SkillData[] }) {
  const size = 200, cx = size / 2, cy = size / 2, r = 70;
  const n = s.length;
  const getPoint = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  };
  const polygon = s.map((sk, i) => getPoint(i, sk.score)).map(p => `${p.x},${p.y}`).join(" ");
  const prevPolygon = s.map((sk, i) => getPoint(i, sk.prev)).map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} role="img" aria-label="Skill radar chart">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={Array.from({ length: n }).map((_, i) => getPoint(i, v)).map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke={c.border} strokeWidth="1" />
      ))}
      {s.map((_, i) => { const p = getPoint(i, 100); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={c.border} strokeWidth="1" />; })}
      <polygon points={prevPolygon} fill="rgba(201,169,110,0.05)" stroke={c.stone} strokeWidth="1" strokeDasharray="3 3" />
      <polygon points={polygon} fill="rgba(201,169,110,0.1)" stroke={c.gilt} strokeWidth="1.5" />
      {s.map((sk, i) => {
        const p = getPoint(i, sk.score);
        const lp = getPoint(i, 115);
        return (
          <g key={sk.name}>
            <circle cx={p.x} cy={p.y} r="3" fill={c.gilt} />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontFamily={font.ui} fontSize="8" fontWeight="500" fill={c.stone}>{sk.name.split(" ")[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

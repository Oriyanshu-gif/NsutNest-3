"use client";

/**
 * SGPA progression, drawn as an SVG line so the card stays light: no chart
 * dependency, and the line draws itself in on mount.
 */

import { useState } from "react";
import { ROMAN, SEM_COUNT, type SemesterRecord } from "./record";

const W = 340;
const H = 170;
const PAD_X = 26;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

export default function SgpaChart({ semesters }: { semesters: SemesterRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const bySemester = new Map(semesters.map((semester) => [semester.semester, semester]));
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const x = (index: number) => PAD_X + (index * (W - PAD_X * 2)) / (SEM_COUNT - 1);
  const y = (sgpa: number) => PAD_TOP + plotH - (Math.max(0, Math.min(10, sgpa)) / 10) * plotH;

  const points = semesters.map((semester) => ({ ...semester, cx: x(semester.semester - 1), cy: y(semester.sgpa) }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.cx} ${point.cy}`).join(" ");
  const area = points.length > 1
    ? `${line} L${points[points.length - 1].cx} ${PAD_TOP + plotH} L${points[0].cx} ${PAD_TOP + plotH} Z`
    : "";
  const average = semesters.length ? semesters.reduce((sum, item) => sum + item.sgpa, 0) / semesters.length : 0;
  const best = semesters.reduce<SemesterRecord | null>(
    (top, item) => (!top || item.sgpa > top.sgpa ? item : top),
    null,
  );
  const active = hover === null ? null : points.find((point) => point.semester === hover) ?? null;

  return (
    <div className="sgChart">
      <div className="sgChartMeta">
        <span>Best <b>{best ? best.sgpa.toFixed(2) : "—"}</b>{best ? ` · Sem ${ROMAN[best.semester - 1]}` : ""}</span>
        <span>Average <b>{average ? average.toFixed(2) : "—"}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`SGPA by semester: ${semesters.map((item) => `${ROMAN[item.semester - 1]} ${item.sgpa.toFixed(2)}`).join(", ")}`}>
        <defs>
          <linearGradient id="sgArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4a7" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2dd4a7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 2.5, 5, 7.5, 10].map((value) => (
          <g key={value}>
            <line x1={PAD_X} x2={W - PAD_X} y1={y(value)} y2={y(value)} className="sgGrid" />
            <text x={PAD_X - 8} y={y(value) + 3.5} className="sgAxis" textAnchor="end">{value}</text>
          </g>
        ))}

        {average > 0 && (
          <>
            <line x1={PAD_X} x2={W - PAD_X} y1={y(average)} y2={y(average)} className="sgAvg" />
            <text x={W - PAD_X} y={y(average) - 5} className="sgAvgLabel" textAnchor="end">avg {average.toFixed(2)}</text>
          </>
        )}

        {area && <path d={area} fill="url(#sgArea)" />}
        {points.length > 1 && <path d={line} className="sgLine" pathLength={1} />}

        {ROMAN.map((label, index) => (
          <text key={label} x={x(index)} y={H - 8} className="sgAxis" textAnchor="middle">{label}</text>
        ))}

        {points.map((point) => (
          <g
            key={point.semester}
            onMouseEnter={() => setHover(point.semester)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(point.semester)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            className="sgPoint"
          >
            <circle cx={point.cx} cy={point.cy} r={12} fill="transparent" />
            <circle cx={point.cx} cy={point.cy} r={best?.semester === point.semester ? 5 : 3.5} className={best?.semester === point.semester ? "sgDotBest" : "sgDot"} />
          </g>
        ))}

        {active && (
          <g>
            <line x1={active.cx} x2={active.cx} y1={PAD_TOP} y2={PAD_TOP + plotH} className="sgCursor" />
            <text x={Math.min(W - 52, Math.max(46, active.cx))} y={Math.max(14, active.cy - 14)} className="sgTip" textAnchor="middle">
              {ROMAN[active.semester - 1]} · {active.sgpa.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

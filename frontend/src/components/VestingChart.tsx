"use client";

import { formatDate } from "@/lib/utils";

export function VestingChart({ lockType, startTime, endTime }: {
  lockType: number;
  startTime: number;
  endTime: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const W = 500, H = 160;
  const pad = { t: 18, r: 15, b: 28, l: 42 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const tRange = Math.max(endTime - startTime, 1);
  const toX = (t: number) => pad.l + Math.max(0, Math.min(cW, ((t - startTime) / tRange) * cW));
  const toY = (pct: number) => pad.t + cH - Math.max(0, Math.min(cH, pct * cH));

  // Generate data points based on lock type
  let points: [number, number][] = [];

  if (lockType === 0) {
    // Timelock: 0% until end, then 100%
    points = [[startTime, 0], [endTime - 1, 0], [endTime, 1]];
  } else if (lockType === 1) {
    // Linear vesting: straight line from 0 to 100%
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const t = startTime + (tRange * i) / N;
      points.push([t, i / N]);
    }
  } else {
    // Stepped vesting: approximate with 5 equal steps
    const steps = 5;
    points.push([startTime, 0]);
    for (let i = 1; i <= steps; i++) {
      const t = startTime + (tRange * i) / steps;
      points.push([t, (i - 1) / steps]); // flat
      points.push([t, i / steps]); // step up
    }
  }

  // Build SVG paths
  const linePath = points.map((p, i) =>
    `${i === 0 ? "M" : "L"}${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`
  ).join(" ");

  const lastPt = points[points.length - 1];
  const firstPt = points[0];
  const areaPath = `${linePath} L${toX(lastPt[0]).toFixed(1)},${toY(0).toFixed(1)} L${toX(firstPt[0]).toFixed(1)},${toY(0).toFixed(1)} Z`;

  const yLabels = [0, 25, 50, 75, 100];

  const fmtDate = (ts: number) => formatDate(ts);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yLabels.map(pct => (
          <g key={pct}>
            <line x1={pad.l} y1={toY(pct / 100)} x2={pad.l + cW} y2={toY(pct / 100)}
              stroke="var(--card-border)" strokeWidth="0.5" />
            <text x={pad.l - 5} y={toY(pct / 100) + 3} textAnchor="end"
              fill="var(--muted)" fontSize="9">{pct}%</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="var(--primary)" opacity="0.12" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Now marker */}
        {now > startTime && now < endTime && (
          <>
            <line x1={toX(now)} y1={pad.t} x2={toX(now)} y2={pad.t + cH}
              stroke="var(--danger)" strokeWidth="1" strokeDasharray="4,3" />
            <text x={toX(now)} y={pad.t - 4} textAnchor="middle"
              fill="var(--danger)" fontSize="8" fontWeight="bold">NOW</text>
          </>
        )}

        {/* Fully vested marker */}
        {now >= endTime && (
          <text x={pad.l + cW / 2} y={pad.t + cH / 2} textAnchor="middle"
            fill="var(--success)" fontSize="12" fontWeight="bold" opacity="0.6">FULLY VESTED</text>
        )}

        {/* X axis labels */}
        <text x={pad.l} y={H - 4} fill="var(--muted)" fontSize="9">{fmtDate(startTime)}</text>
        <text x={pad.l + cW} y={H - 4} textAnchor="end" fill="var(--muted)" fontSize="9">{fmtDate(endTime)}</text>

        {/* Bottom border */}
        <line x1={pad.l} y1={pad.t + cH} x2={pad.l + cW} y2={pad.t + cH}
          stroke="var(--card-border)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

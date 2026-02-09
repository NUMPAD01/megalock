"use client";

import { useState, useRef, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface Milestone {
  timestamp: number;
  basisPoints: number; // out of 10000
}

interface VestingChartProps {
  lockType: number;
  startTime: number;
  endTime: number;
  cliffTime?: number;
  milestones?: Milestone[];
}

export function VestingChart({ lockType, startTime, endTime, cliffTime, milestones }: VestingChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; t: number; pct: number } | null>(null);

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
    // Linear vesting with optional cliff
    const cliff = cliffTime && cliffTime > startTime ? cliffTime : startTime;
    if (cliff > startTime) {
      points.push([startTime, 0]);
      points.push([cliff, 0]); // flat until cliff
    }
    const N = 30;
    const linearStart = cliff > startTime ? cliff : startTime;
    const linearRange = endTime - linearStart;
    for (let i = 0; i <= N; i++) {
      const t = linearStart + (linearRange * i) / N;
      const pct = linearRange > 0 ? i / N : 1;
      if (cliff > startTime && i === 0) continue; // already added cliff point at 0
      points.push([t, pct]);
    }
  } else {
    // Stepped vesting: use actual milestones if available
    if (milestones && milestones.length > 0) {
      points.push([startTime, 0]);
      let cumBps = 0;
      for (const m of milestones) {
        const ts = m.timestamp;
        // flat line up to the milestone timestamp at current level
        points.push([ts, cumBps / 10000]);
        // step up
        cumBps += m.basisPoints;
        points.push([ts, cumBps / 10000]);
      }
      // If milestones don't reach 100%, extend to end
      if (cumBps < 10000) {
        points.push([endTime, cumBps / 10000]);
        points.push([endTime, 1]);
      }
    } else {
      // Fallback: approximate with 5 equal steps
      const steps = 5;
      points.push([startTime, 0]);
      for (let i = 1; i <= steps; i++) {
        const t = startTime + (tRange * i) / steps;
        points.push([t, (i - 1) / steps]);
        points.push([t, i / steps]);
      }
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

  // Get vested % at a given timestamp by walking the points
  const getVestedAt = useCallback((t: number): number => {
    if (t <= points[0][0]) return points[0][1];
    if (t >= points[points.length - 1][0]) return points[points.length - 1][1];
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) {
        const [t0, p0] = points[i - 1];
        const [t1, p1] = points[i];
        if (t1 === t0) return p1;
        const frac = (t - t0) / (t1 - t0);
        return p0 + frac * (p1 - p0);
      }
    }
    return points[points.length - 1][1];
  }, [points]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // Convert SVG x back to timestamp
    const t = startTime + ((svgX - pad.l) / cW) * tRange;
    const clamped = Math.max(startTime, Math.min(endTime, t));
    const pct = getVestedAt(clamped);
    setHover({ x: svgX, t: clamped, pct });
  }, [startTime, endTime, tRange, cW, pad.l, W, getVestedAt]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }}
      >
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

        {/* Hover crosshair + tooltip */}
        {hover && hover.x >= pad.l && hover.x <= pad.l + cW && (
          <>
            {/* Vertical line */}
            <line x1={hover.x} y1={pad.t} x2={hover.x} y2={pad.t + cH}
              stroke="var(--foreground)" strokeWidth="0.5" opacity="0.4" />
            {/* Horizontal line */}
            <line x1={pad.l} y1={toY(hover.pct)} x2={pad.l + cW} y2={toY(hover.pct)}
              stroke="var(--foreground)" strokeWidth="0.5" opacity="0.2" />
            {/* Dot on curve */}
            <circle cx={hover.x} cy={toY(hover.pct)} r="3.5"
              fill="var(--primary)" stroke="var(--background)" strokeWidth="1.5" />
            {/* Tooltip background */}
            {(() => {
              const text1 = fmtTime(hover.t);
              const text2 = `${(hover.pct * 100).toFixed(1)}% unlocked`;
              const boxW = 120;
              const boxH = 30;
              // Keep tooltip inside the chart area
              let tx = hover.x + 8;
              if (tx + boxW > pad.l + cW) tx = hover.x - boxW - 8;
              let ty = toY(hover.pct) - boxH - 6;
              if (ty < pad.t) ty = toY(hover.pct) + 8;
              return (
                <g>
                  <rect x={tx} y={ty} width={boxW} height={boxH} rx="4"
                    fill="var(--card)" stroke="var(--card-border)" strokeWidth="0.5" opacity="0.95" />
                  <text x={tx + 6} y={ty + 12} fill="var(--foreground)" fontSize="8.5" fontWeight="600">{text1}</text>
                  <text x={tx + 6} y={ty + 23} fill="var(--primary)" fontSize="8.5" fontWeight="bold">{text2}</text>
                </g>
              );
            })()}
          </>
        )}

        {/* X axis labels */}
        <text x={pad.l} y={H - 4} fill="var(--muted)" fontSize="9">{formatDate(startTime)}</text>
        <text x={pad.l + cW} y={H - 4} textAnchor="end" fill="var(--muted)" fontSize="9">{formatDate(endTime)}</text>

        {/* Bottom border */}
        <line x1={pad.l} y1={pad.t + cH} x2={pad.l + cW} y2={pad.t + cH}
          stroke="var(--card-border)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

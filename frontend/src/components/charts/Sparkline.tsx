"use client";

import React from "react";
import { lastPoints, toPath } from "./sparkline-math";

export interface SparkPoint {
  in_mbps: number;
  out_mbps: number;
}

interface SparklineProps {
  points: SparkPoint[];
  width?: number;
  height?: number;
  /** Max points drawn. Constant cost regardless of history length. */
  limit?: number;
}

function SparklineImpl({ points, width = 128, height = 48, limit = 30 }: SparklineProps) {
  const recent = lastPoints(points, limit);
  if (recent.length < 2) return null;
  const max = Math.max(1, ...recent.map(p => Math.max(p.in_mbps, p.out_mbps)));
  const inPath = toPath(recent.map(p => p.in_mbps), width, height, max);
  const outPath = toPath(recent.map(p => p.out_mbps), width, height, max);
  return (
    <svg
      role="img"
      aria-label="Traffic trend, last 30 samples"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
    >
      <path d={inPath} fill="none" stroke="var(--ui-in)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d={outPath} fill="none" stroke="var(--ui-out)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Memoized: re-renders only when the points array reference or its length changes. */
export const Sparkline = React.memo(SparklineImpl, (prev, next) =>
  prev.points === next.points &&
  prev.width === next.width &&
  prev.height === next.height &&
  prev.limit === next.limit
);

/** Keep only the newest `n` points, preserving order. */
export function lastPoints<T>(points: readonly T[], n: number): T[] {
  return points.length <= n ? [...points] : points.slice(points.length - n);
}

/**
 * Build an SVG path for a series. Y is inverted (0 at bottom).
 * Values are clamped to [0, max]. Fewer than 2 values yields "".
 */
export function toPath(values: readonly number[], w: number, h: number, max: number): string {
  if (values.length < 2) return "";
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const clamped = Math.min(Math.max(v, 0), max);
      const y = h - (clamped / max) * h;
      return `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

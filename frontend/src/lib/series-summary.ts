export type Summary = { min: number; avg: number; max: number };

/** min/avg/max over finite values. Null when no finite value exists. */
export function summarize(values: readonly number[]): Summary | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  let min = v[0], max = v[0], sum = 0;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
  }
  return { min, avg: sum / v.length, max };
}

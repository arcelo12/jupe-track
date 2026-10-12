export type LayoutNode = { id: string; x: number; y: number };
export type LayoutEdge = { from: string; to: string };
export type Layout = { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number };

const COL_W = 160;
const ROW_H = 56;
const PAD = 24;

/** Split an AS path string into AS tokens. Drops I/E/? origin flags and bracket chars. */
export function parseAsPath(path: string): string[] {
  return path
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[[\](){}]/g, ""))
    .filter((t) => t.length > 0 && !["I", "E", "?"].includes(t));
}

/** Each path on its own row, hops laid out left-to-right. Node ids are shared across rows. */
export function layoutStraight(paths: string[]): Layout {
  const pos = new Map<string, LayoutNode>();
  const edges: LayoutEdge[] = [];
  const seenEdge = new Set<string>();
  let row = 0;
  for (const p of paths) {
    const hops = parseAsPath(p);
    if (hops.length === 0) continue;
    hops.forEach((id, col) => {
      if (!pos.has(id)) pos.set(id, { id, x: PAD + col * COL_W, y: PAD + row * ROW_H });
    });
    for (let i = 1; i < hops.length; i++) {
      const key = `${hops[i - 1]}>${hops[i]}`;
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push({ from: hops[i - 1], to: hops[i] });
      }
    }
    row++;
  }
  return finish([...pos.values()], edges, row);
}

/** Nodes grouped by hop depth. Same depth shares a column. Rows stack within a column. */
export function layoutFlexible(paths: string[]): Layout {
  const depth = new Map<string, number>();
  const edges: LayoutEdge[] = [];
  const seenEdge = new Set<string>();
  for (const p of paths) {
    const hops = parseAsPath(p);
    hops.forEach((id, d) => {
      depth.set(id, Math.max(depth.get(id) ?? 0, d));
    });
    for (let i = 1; i < hops.length; i++) {
      const key = `${hops[i - 1]}>${hops[i]}`;
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push({ from: hops[i - 1], to: hops[i] });
      }
    }
  }
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    byDepth.set(d, [...(byDepth.get(d) ?? []), id]);
  }
  const nodes: LayoutNode[] = [];
  let maxRows = 0;
  for (const [d, ids] of byDepth) {
    ids.sort();
    maxRows = Math.max(maxRows, ids.length);
    ids.forEach((id, r) => nodes.push({ id, x: PAD + d * COL_W, y: PAD + r * ROW_H }));
  }
  return finish(nodes, edges, maxRows);
}

function finish(nodes: LayoutNode[], edges: LayoutEdge[], rows: number): Layout {
  if (nodes.length === 0) return { nodes, edges, width: 0, height: 0 };
  const cols = Math.max(...nodes.map((n) => n.x)) - PAD;
  return {
    nodes,
    edges,
    width: cols + COL_W,
    height: PAD * 2 + Math.max(rows, 1) * ROW_H,
  };
}

/** Origin AS = last hop. Most frequent origin wins; ties go to the first seen. */
export function pickOrigin(paths: string[]): string | null {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const hops = parseAsPath(p);
    if (hops.length === 0) continue;
    const origin = hops[hops.length - 1];
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, c] of counts) {
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  return best;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * Translate that places a point (in layout coords) at the viewport center
 * after scaling by zoom. Canvas is transformed as: translate(tx,ty) scale(zoom).
 */
export function centerOffset(
  point: { x: number; y: number },
  zoom: number,
  viewport: { w: number; h: number }
): { tx: number; ty: number } {
  return {
    tx: viewport.w / 2 - point.x * zoom,
    ty: viewport.h / 2 - point.y * zoom,
  };
}

/**
 * Tier-1 ASN set. Source: Wikipedia "Tier 1 network" (universally recognized list)
 * plus Cogent (174), chosen by the user. Secondary source; revisit on real data.
 */
export const TIER1_ASNS: ReadonlySet<string> = new Set([
  "7018", "3320", "3257", "6830", "3356", "2914", "5511", "3491",
  "6453", "6762", "1299", "12956", "701", "6461", "174",
]);

export function isTier1(asn: string): boolean {
  return TIER1_ASNS.has(asn);
}

/**
 * Cut a hop list at the rightmost Tier-1 AS (nearest the origin), inclusive.
 * Returns the hops unchanged when no Tier-1 hop is present.
 */
export function truncateToTier1(hops: string[], tier1: ReadonlySet<string>): string[] {
  for (let i = hops.length - 1; i >= 0; i--) {
    if (tier1.has(hops[i])) return hops.slice(0, i + 1);
  }
  return hops;
}

/**
 * Truncate each path at its last Tier-1 AS, merge identical results, count them.
 * Sorted by count descending, then by path string ascending.
 */
export function groupPolicies(
  paths: string[],
  tier1: ReadonlySet<string>
): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const hops = truncateToTier1(parseAsPath(p), tier1);
    if (hops.length === 0) continue;
    const key = hops.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Display order: origin first (left), path flows outward to the right, like bgp.tools.
 * Operates on the raw path string and drops I/E/? flags via parseAsPath.
 */
export function reverseForDisplay(path: string): string {
  return parseAsPath(path).reverse().join(" ");
}

/** Keep the n most frequent policy routes. Groups must already be sorted by count desc. */
export function topPolicies<T>(groups: T[], n: number): { shown: T[]; hidden: number } {
  return { shown: groups.slice(0, n), hidden: Math.max(0, groups.length - n) };
}

/** Max policy routes drawn in the graph. Beyond this the canvas grows past the fixed viewport. */
export const POLICY_MAX_ROUTES = 5;

/** Node width by container width: smaller cards on narrow screens. */
export function nodeWidthFor(containerWidth: number): number {
  return containerWidth < 640 ? 88 : 120;
}

/** Pointer movement below this stays a click; at or above it becomes a drag. */
export const DRAG_THRESHOLD_PX = 6;

export function panAfterDrag(
  start: { x: number; y: number },
  delta: { x: number; y: number }
): { x: number; y: number } {
  return { x: start.x + delta.x, y: start.y + delta.y };
}

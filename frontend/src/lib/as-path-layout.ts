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

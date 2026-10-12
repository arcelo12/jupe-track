"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { layoutFlexible, layoutStraight, pickOrigin, centerOffset, clampZoom, tier1RoutesOnly, tier1Name, isTier1, reverseForDisplay, nodeWidthFor, DRAG_THRESHOLD_PX, type Layout } from "@/lib/as-path-layout";
import { CHART_EDGE, CHART_EDGE_FADED } from "@/lib/chart-colors";
import { authFetch } from "@/lib/auth";

type Mode = "straight" | "flexible" | "policy";
const STORAGE_KEY = "jupetrack-as-path-mode";
const NODE_H = 34;

interface AsMapping {
  asn: string;
  name: string;
  type: string;
}

/** AS-path topology for Global Lookup results. Two layouts: straight and flexible. */
function readStoredMode(): Mode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "straight" || saved === "flexible" || saved === "policy") return saved;
  } catch {}
  return "straight";
}

export function LookupAsPathGraph({ paths }: { paths: string[] }) {
  const [mode, setMode] = useState<Mode>(() => (typeof window === "undefined" ? "straight" : readStoredMode()));
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const nodeW = nodeWidthFor(viewport.w || 1280);
  // Pan offset in screen px, added to the centered translate. Drag updates it.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; moved: boolean; suppressClick: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [mappings, setMappings] = useState<Record<string, AsMapping>>({});

  useEffect(() => {
    authFetch("/api/proxy/as-mapping")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, AsMapping> = {};
        for (const m of data) map[String(m.asn)] = m;
        setMappings(map);
      })
      .catch(() => {});
  }, []);

  const choose = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
  };

  // Policy mode: every route that ends at a Tier-1 hop. Drag and the height clamp reach all rows.
  const policies = useMemo(() => tier1RoutesOnly(paths), [paths]);

  const layout: Layout = useMemo(() => {
    // Origin on the left, path flows outward to the right (bgp.tools style).
    if (mode === "policy") return layoutStraight(policies.map((p) => reverseForDisplay(p.path)));
    const display = paths.map((p) => reverseForDisplay(p));
    return mode === "straight" ? layoutStraight(display) : layoutFlexible(display);
  }, [mode, paths, policies]);

  // Center target: origin when visible, else the end of the most frequent policy route.
  const origin = useMemo(() => pickOrigin(paths), [paths]);
  const centerId = useMemo(() => {
    if (origin && layout.nodes.some((n) => n.id === origin)) return origin;
    const top = policies[0];
    if (!top) return null;
    // Display is reversed, so the route's origin-side hop is first.
    const hops = top.path.split(" ");
    return hops[0] ?? null;
  }, [origin, layout.nodes, policies]);
  const originNode = centerId ? layout.nodes.find((n) => n.id === centerId) : undefined;

  // In policy mode, how many raw paths end at each node (for the xN label).
  const endCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of policies) {
      const hops = p.path.split(" ");
      const end = hops[0];
      if (end) m.set(end, (m.get(end) ?? 0) + (p.count > 1 ? p.count : 0));
    }
    return m;
  }, [policies]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.nodes.length]);

  // Offset is derived from zoom + origin, so it is always centered. Zoom resets on mode/result change.
  const [prevKey, setPrevKey] = useState({ mode, paths });
  if (prevKey.mode !== mode || prevKey.paths !== paths) {
    setPrevKey({ mode, paths });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Center the node's midpoint, not its top-left corner.
  const off = originNode && viewport.w > 0
    ? centerOffset({ x: originNode.x + nodeW / 2, y: originNode.y + NODE_H / 2 }, zoom, viewport)
    : { tx: 0, ty: 0 };

  const zoomBy = (delta: number) => setZoom((z) => clampZoom(z + delta));
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Policy with no Tier-1 route still renders the header so the empty-state note shows.
  if (layout.nodes.length === 0 && mode !== "policy") return null;

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const selectedMapping = selected ? mappings[selected] : undefined;

  return (
    <div className="mb-4 rounded border border-outline-variant bg-surface-container p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <Network size={14} aria-hidden="true" className="text-primary" /> AS Path Topology
        </span>
        <div className="flex rounded border border-outline-variant bg-surface-container-high p-0.5" role="group" aria-label="AS path layout mode">
          {(["straight", "flexible", "policy"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => choose(m)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${mode === m ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          ref={viewportRef}
          style={{ height: Math.min(480, Math.max(320, layout.height + 24)), touchAction: "none" }}
          className="relative select-none overflow-hidden"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragRef.current = { x: e.clientX, y: e.clientY, moved: false, suppressClick: false };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
            if (!d.moved) {
              d.moved = true;
              d.suppressClick = true;
            }
            d.x = e.clientX;
            d.y = e.clientY;
            setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
          }}
          onPointerUp={() => {
            const d = dragRef.current;
            dragRef.current = null;
            if (d && d.moved) {
              // Swallow the click that follows a real drag; reset on the next tick.
              suppressClickRef.current = true;
              setTimeout(() => { suppressClickRef.current = false; }, 0);
            }
          }}
          onPointerCancel={() => { dragRef.current = null; }}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${off.tx + pan.x}px, ${off.ty + pan.y}px) scale(${zoom})`,
            }}
          >
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id="aspath-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={CHART_EDGE} />
              </marker>
            </defs>
            {layout.edges.map((e, i) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + nodeW;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const faded = hovered && e.from !== hovered && e.to !== hovered;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${x1 + (x2 - x1) / 2} ${y1}, ${x1 + (x2 - x1) / 2} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={faded ? CHART_EDGE_FADED : CHART_EDGE}
                  strokeWidth={faded ? "1" : "1.5"}
                  markerEnd="url(#aspath-arrowhead)"
                  className={`transition-opacity duration-300 ${faded ? "opacity-30" : "opacity-100"}`}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const m = mappings[n.id];
            return (
              <div key={n.id} className="absolute" style={{ left: n.x, top: n.y, width: nodeW, height: NODE_H }}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => { if (suppressClickRef.current) return; setSelected(n.id === selected ? null : n.id); }}
                  className={`h-full w-full truncate rounded border px-2 text-left font-mono text-xs transition-[transform,colors] duration-150 hover:scale-110 ${selected === n.id ? "border-primary bg-primary/15 text-primary" : "border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50"}`}
                >
                  <span className="font-bold">AS{n.id}</span>
                  {m && <span className="ml-1 text-[10px] text-on-surface-variant">{m.name}</span>}
                  {mode === "policy" && (endCounts.get(n.id) ?? 0) > 1 && (
                    <span className="ml-1 text-[10px] text-primary">×{endCounts.get(n.id)}</span>
                  )}
                </button>
                {hovered === n.id && (
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-outline-variant bg-surface-container-high px-2 py-1 font-mono text-[11px] text-on-surface ${n.y < layout.height / 2 ? "top-full mt-1" : "bottom-full mb-1"}`}
                  >
                    <span className="font-bold">AS{n.id}</span>
                    {n.id === origin && <span className="ml-1 text-primary">origin</span>}
                    {isTier1(n.id) && <span className="ml-1 text-primary">Tier-1</span>}
                    {(m?.name ?? tier1Name(n.id)) && <span className="ml-1 text-on-surface-variant">{m?.name ?? tier1Name(n.id)}{m ? ` · ${m.type}` : ""}</span>}
                  </span>
                )}
              </div>
            );
          })}
          </div>
        </div>
        {mode === "policy" && policies.length === 0 && (
          <p className="mt-2 text-[11px] text-on-surface-variant">No Tier-1 routes in this result</p>
        )}
        <div className="mt-2 flex justify-end gap-1">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.25)} className="rounded border border-outline-variant p-1 text-on-surface-variant hover:text-on-surface"><ZoomIn size={14} aria-hidden="true" /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-0.25)} className="rounded border border-outline-variant p-1 text-on-surface-variant hover:text-on-surface"><ZoomOut size={14} aria-hidden="true" /></button>
          <button type="button" aria-label="Reset zoom" onClick={reset} className="rounded border border-outline-variant p-1 text-on-surface-variant hover:text-on-surface"><RotateCcw size={14} aria-hidden="true" /></button>
        </div>
      </div>

      {selected && (
        <div className="mt-3 rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-mono text-xs">
          <span className="font-bold text-on-surface">AS{selected}</span>
          {selectedMapping ? (
            <span className="ml-2 text-on-surface-variant">{selectedMapping.name} · {selectedMapping.type}</span>
          ) : (
            <span className="ml-2 text-on-surface-variant">no mapping</span>
          )}
        </div>
      )}
    </div>
  );
}

export default LookupAsPathGraph;
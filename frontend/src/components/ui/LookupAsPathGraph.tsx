"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Network } from "lucide-react";
import { layoutFlexible, layoutStraight, type Layout } from "@/lib/as-path-layout";
import { CHART_EDGE, CHART_EDGE_FADED } from "@/lib/chart-colors";
import { authFetch } from "@/lib/auth";

type Mode = "straight" | "flexible";
const STORAGE_KEY = "jupetrack-as-path-mode";
const NODE_W = 120;
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
    if (saved === "straight" || saved === "flexible") return saved;
  } catch {}
  return "straight";
}

export function LookupAsPathGraph({ paths }: { paths: string[] }) {
  const [mode, setMode] = useState<Mode>(() => (typeof window === "undefined" ? "straight" : readStoredMode()));
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  const layout: Layout = useMemo(
    () => (mode === "straight" ? layoutStraight(paths) : layoutFlexible(paths)),
    [mode, paths]
  );

  if (layout.nodes.length === 0) return null;

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const selectedMapping = selected ? mappings[selected] : undefined;

  return (
    <div className="mb-4 rounded border border-outline-variant bg-surface-container p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          <Network size={14} aria-hidden="true" className="text-primary" /> AS Path Topology
        </span>
        <div className="flex rounded border border-outline-variant bg-surface-container-high p-0.5" role="group" aria-label="AS path layout mode">
          {(["straight", "flexible"] as const).map((m) => (
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
        <div className="relative" style={{ width: layout.width, height: layout.height, margin: "0 auto" }}>
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
              const x1 = a.x + NODE_W;
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
              <button
                key={n.id}
                type="button"
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(n.id === selected ? null : n.id)}
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                className={`absolute truncate rounded border px-2 text-left font-mono text-xs transition-colors ${selected === n.id ? "border-primary bg-primary/15 text-primary" : "border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50"}`}
                title={m ? `AS${n.id} · ${m.name} (${m.type})` : `AS${n.id}`}
              >
                <span className="font-bold">AS{n.id}</span>
                {m && <span className="ml-1 text-[10px] text-on-surface-variant">{m.name}</span>}
              </button>
            );
          })}
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
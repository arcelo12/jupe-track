# Global Lookup: AS Path Topology Graph

Date: 2026-10-11
Scope: `/lookup` page only. Route Lookup and `AggregateASGraph` are unchanged.

## Decision

Graph shows on the Global Lookup routing result. It has two layouts:

- Straight: one row per AS path, hops left to right. Node ids are shared across rows.
- Flexible: nodes grouped by hop depth into columns, rows stacked inside a column.

The chosen mode is saved in `localStorage` under `jupetrack-as-path-mode`.
Default is straight.

## Units

- `frontend/src/lib/as-path-layout.ts`: pure. `parseAsPath` drops origin
  tokens `I`, `E`, `?` and brackets. `layoutStraight` and `layoutFlexible`
  return positioned nodes, edges, and canvas size.
- `frontend/src/components/ui/LookupAsPathGraph.tsx`: renders the toggle,
  SVG edges, and node buttons. Loads `/api/proxy/as-mapping` once. Click on
  a node shows its name and type; no mapping shows "no mapping".
- `frontend/src/components/ui/LookupResultViewer.tsx`: opt-in `showAsPath`
  prop. Collects `as_path` from all peers across all RRCs.
- `frontend/src/app/lookup/page.tsx`: passes `showAsPath`. `LookupModal`
  does not, so it stays unchanged.

## Error handling

- Missing or failed `as-mapping` request: graph still renders with AS numbers.
- Empty paths: component returns null.

## Testing

- `frontend/scripts/test-as-path-layout.mjs`: pure layout assertions.
- Browser run with fixtures: toggle, persisted mode, node detail, no page
  errors, no document overflow at 390px and 1280px.

## Out of scope

- Live RIS data verification.
- Changes to route-lookup or aggregate AS graph.

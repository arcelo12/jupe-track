# Global Lookup: AS Path Graph Zoom, Origin Center, Hover Tooltip

Date: 2026-10-11
Scope: `LookupAsPathGraph` on `/lookup` only. Builds on `2026-10-11-lookup-as-path-graph-design.md`.

## Decisions

- Target AS = origin AS, the last hop of each path. If paths disagree,
  use the origin that appears most often. Ties go to the first seen.
- Pan (drag) is out of scope. Origin stays centered, so zoom alone keeps
  the target in view.
- Hover shows a tooltip card above the hovered node. The node does not move.

## Behavior

- Initial view: zoom 1x, origin node centered in the container.
- Zoom controls: `+`, `−`, reset, in the graph header. Mouse wheel also zooms.
- Zoom range: 0.5x to 2x. Reset returns to 1x and re-centers on origin.
- Center re-applies when mode changes (straight or flexible), when new
  results arrive, and on reset.
- Hover card: `AS<n>` + name + type when mapping exists, else `AS<n>` only.
  Origin node gets the label `origin`. Edges touching the hovered node stay
  highlighted as today.
- Container has fixed height and `overflow: hidden`. No document overflow at 390px.

## Units

- `frontend/src/lib/as-path-layout.ts` (pure, tested):
  - `pickOrigin(paths: string[]): string | null`
  - `centerOffset(node: {x, y}, origin: {x, y}, zoom, viewport: {w, h}): {tx, ty}`
  - `clampZoom(z: number): number` (0.5 to 2)
- `frontend/src/components/ui/LookupAsPathGraph.tsx`: zoom state, wheel
  handler, transform on the canvas, tooltip render. No layout math here.

## Error handling

- No origin found (empty paths): graph already returns null. No change.
- Missing mapping: tooltip shows AS number only.

## Testing

- `frontend/scripts/test-as-path-layout.mjs`: `pickOrigin` (single,
  majority, tie, empty), `centerOffset` (origin lands at viewport center
  at zoom 1 and 2), `clampZoom` (below 0.5, above 2).
- Playwright fixture run: zoom buttons change scale, reset re-centers,
  hover shows tooltip with mapping and "origin" label, no page errors,
  no overflow at 390px and 1280px, straight and flexible both work.

## Out of scope

- Pan / drag.
- Changes to route-lookup, LookupModal, or AggregateASGraph.
- Live RIS data check.

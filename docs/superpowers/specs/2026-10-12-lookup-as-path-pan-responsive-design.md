# Global Lookup: AS Path Graph Pan, Responsive Cards, Height Clamp

Date: 2026-10-12
Scope: `frontend/src/components/ui/LookupAsPathGraph.tsx` only. `as-path-layout.ts` is unchanged.
Builds on `2026-10-11-lookup-as-path-graph-design.md`, `...-zoom-center-design.md`,
and `...-policy-mode-design.md`.

## Decisions

- Drag pans the graph at all times, mouse and touch alike. Reset returns to origin-centered, zoom 1, pan zero.
- Responsive card width, no horizontal scroll inside the graph.
- Container height = `clamp(320, layout.height + 24, 480)`.

## Pan

- Pointer events with `setPointerCapture`. One code path for mouse and touch.
- Move past 6px from pointer-down is a drag. Below 6px stays a click on the node.
- After a drag ends, the next click on a node is ignored once, so releasing a drag never opens a node.
- Transform: `translate(center.x + pan.x, center.y + pan.y) scale(zoom)`. Zoom and tooltip logic unchanged.
- Graph area: `select-none` (stops text selection on drag) and `touch-action: none` (stops page scroll on touch drag).
- Pan state: `{ x, y }` in screen pixels. Reset clears it.

## Responsive cards

- Node width = `88px` when container width is below 640px, else `120px`.
- Label stays `truncate` (ellipsis). Node height unchanged.
- Edge endpoints and tooltip anchor use the same width value, so arrows do not drift.

## Height clamp

- Container height: `clamp(320, layout.height + 24, 480)`.
- Layouts taller than 480px scroll inside the graph via pan, not the page.
- Real-data repro (1.1.1.0/24, Straight) gave a 20544px canvas. With the clamp the page stays bounded.

## Testing

Playwright, fixtures plus real RIS data (`1.1.1.0/24`):

- Drag by (dx, dy) changes the canvas transform by that delta.
- Reset returns transform to the centered value with zero pan.
- Click on a node with no drag opens it.
- Drag that starts on a node does not open it.
- At 390px: node width is 88px, label has ellipsis.
- Real data: container height is 480px, document overflow is 0, no page errors.
- Regression: Straight, Flexible, Policy still render; tooltip still shows.

## Out of scope

- Changes to layout algorithms or `as-path-layout.ts`.
- Changes to v1, LookupModal, route-lookup.
- Pinch zoom on touch (wheel and buttons remain).

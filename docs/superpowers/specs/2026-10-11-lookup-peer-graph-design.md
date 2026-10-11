# Global Lookup: Per-Peer AS Path Graph and Node Hover Scale

Date: 2026-10-11
Scope: `/lookup` routing result only, `LookupResultViewer` (with `showAsPath`) and `LookupAsPathGraph`.
Route Lookup, `LookupModal`, and v1 are unchanged.

## Decisions

- Each peer card gets a "Show path graph" button with `aria-expanded`.
- Click opens `LookupAsPathGraph` below that card, fed with that peer's single `as_path`.
- Only one peer graph is open at a time. Clicking the open card's button closes it.
- Graph modes (Straight, Flexible, Policy) and zoom, center, and tooltip behave as before.
- Assumption to confirm: "ukuran bisa di-hover" means the hovered node grows slightly
  (`scale 1.1` on that node). Zoom controls are unchanged.

## Units

- `LookupResultViewer.tsx`: holds `openPeer: string | null` state keyed `${rrcIndex}-${peerIndex}`.
  Renders the graph under the open card, only when `showAsPath` is true.
- `LookupAsPathGraph.tsx`: adds node hover scale only. No new props.

## Behavior and error handling

- Peer with empty `as_path`: button hidden. Nothing to draw.
- Peer with `as_path` but no mappings: graph still renders with AS numbers.
- Hover scale uses `transform` on the node button, so layout is unchanged and no overflow is added.

## Testing

- Playwright at 1280px and 390px on fixtures: click peer button, graph appears below that card,
  second click closes it, opening a second peer closes the first, `aria-expanded` toggles,
  node `transform` changes on hover, no page errors, no document overflow.
- Regression: aggregate graph on the same page still renders.

## Out of scope

- Dialog view per peer.
- Changes to `LookupModal`, route-lookup, v1.

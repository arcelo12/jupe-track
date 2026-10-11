# Global Lookup: AS Path Policy Mode

Date: 2026-10-11
Scope: `LookupAsPathGraph` on `/lookup` only. Adds a third mode next to Straight and Flexible.
Builds on `2026-10-11-lookup-as-path-graph-design.md` and `2026-10-11-lookup-as-path-zoom-center-design.md`.

## Decisions

- Mode name: `Policy`. Third toggle button. Persisted in `localStorage` like the other modes.
- Truncation follows bgp.tools network policy: cut each path at the last Tier-1 AS it contains.
  Last = the Tier-1 nearest the origin (rightmost in the path string).
- Paths with no Tier-1 AS are kept whole.
- Paths that become identical after truncation merge into one route. The label shows the count, e.g. `x2`.
- Tier-1 set is a hardcoded constant. No backend change, no migration.
- Layout reuses `layoutStraight` on the merged paths. No new layout algorithm.

## Tier-1 set (15 ASN)

Source: Wikipedia "Tier 1 network", list of universally recognized Tier 1 networks, plus Cogent (174)
which the user chose to include. Source is secondary and may need later review.

7018 AT&T, 3320 DTAG, 3257 GTT, 6830 Liberty Global, 3356 Lumen, 2914 NTT, 5511 Orange,
3491 PCCW, 6453 Tata, 6762 Telecom Italia Sparkle, 1299 Arelion, 12956 Telxius, 701 Verizon,
6461 Zayo, 174 Cogent.

Open point: the bgp.tools example path `206924-136620-174-6461-...` is truncated at 174, not 6461.
That suggests bgp.tools does not count 6461 as Tier-1. This spec keeps 6461 per the chosen source.
Revisit if the policy result looks wrong on real data.

## Units

- `frontend/src/lib/as-path-layout.ts` (pure, tested):
  - `TIER1_ASNS: ReadonlySet<string>` constant with the 15 ASN above.
  - `truncateToTier1(hops: string[], tier1: ReadonlySet<string>): string[]`
    returns hops up to and including the rightmost Tier-1 hop. Returns hops unchanged when none is found.
  - `groupPolicies(paths: string[], tier1: ReadonlySet<string>): { path: string; count: number }[]`
    parses each path with `parseAsPath`, truncates, merges identical results, sorts by count descending
    then by path string.
- `frontend/src/components/ui/LookupAsPathGraph.tsx`: adds the `policy` mode. Builds the layout from
  `groupPolicies` output through `layoutStraight`. Shows `×N` on the node where a merged path ends.
  No business logic in the component beyond wiring.

## Centering in Policy mode

Center target stays `pickOrigin(paths)` when that node is in the layout. In Policy mode the origin is
usually cut off, so fall back to the last node of the most frequent route. Centering code is unchanged.

## Error handling

- Empty paths: graph returns null, as now.
- Path with only Tier-1 hops: kept as-is after truncation (no empty path).
- Path with unknown or malformed tokens: `parseAsPath` already drops flags. No extra handling.

## Testing

- `frontend/scripts/test-as-path-layout.mjs`:
  - truncation at last Tier-1 (example `7018 3356 13335` gives `7018 3356`)
  - path with no Tier-1 kept whole
  - path with Tier-1 as origin keeps origin hop
  - two paths with same truncated result merge with count 2
  - sort order by count desc
  - empty input returns empty array
- Playwright fixture run on `/lookup`: Policy button toggles, `x2` label visible on merged route,
  origin or fallback centered (offset 0px), no page errors, no document overflow at 390px and 1280px,
  Straight and Flexible still work.

## Out of scope

- Editing the Tier-1 set from the UI or backend.
- Changes to route-lookup, LookupModal, AggregateASGraph.
- Live RIS data check.

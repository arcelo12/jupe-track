# Global Lookup: AS Path Policy Mode Shows the Origin Side of Each Route

Date: 2026-10-12
Scope: `frontend/src/lib/as-path-layout.ts` and `frontend/src/components/ui/LookupAsPathGraph.tsx`.
Builds on `2026-10-12-lookup-as-path-policy-all-tier1-design.md`.
Straight and Flexible modes, Route Lookup, LookupModal, and v1 are unchanged.

## Problem

Policy mode rows were inconsistent. For path `20205 1299 13335` (origin 13335) the row showed
`AS1299 -> AS20205`: the internet side, not the origin side, so the origin was missing and the arrow
pointed away from it. Rows varied in length and direction, which read as messy.

## Decision

Truncate each path from its last Tier-1 AS to the origin, dropping the internet side. This is the
bgp.tools rule: "truncate each path at the last Tier 1 ISP we find."

- Keep hops from the rightmost Tier-1 hop to the end (origin). Drop everything before it.
- Display origin on the left, as now (`reverseForDisplay`), so arrows flow origin -> transit -> Tier-1.
- Paths with no Tier-1 hop are not shown in Policy mode (unchanged).
- Merge identical rows, count them, sort count desc then path asc (unchanged).

Sample result for `1.1.1.0/24`: 14 rows, all `13335 -> <Tier-1>`:
1299 x7, 6461 x5, 3257 x4, 3356 x4, 6762 x4, 174/2914/3491/6830 x3, 12956 x2, and the rest x1.
323 of 366 peers have no Tier-1 and are hidden, as before.

## Units

- `as-path-layout.ts` (pure, tested):
  - `truncateToTier1(hops, tier1)` returns `hops.slice(i)` where `i` is the rightmost Tier-1 index.
    Returns `hops` unchanged when no Tier-1 hop is present. (Was `slice(0, i + 1)`.)
  - `tier1RoutesOnly` and `tier1Name` unchanged in behavior and sort order.
  - `groupPolicies`, `topPolicies`, `POLICY_MAX_ROUTES`: removed if no caller remains (grep check).
- `LookupAsPathGraph.tsx`: no logic change. Policy still maps rows through `reverseForDisplay` and `layoutStraight`.

## Behavior and errors

- No Tier-1 route: Policy shows the existing "No Tier-1 routes in this result" line.
- Zoom, drag, origin centering, tooltip, and the 480px height clamp are unchanged.
- Non-Tier-1 node hover is unchanged.

## Testing

- `scripts/test-as-path-layout.mjs`:
  - `truncateToTier1(["917","931","1299","13335"])` -> `["1299","13335"]`
  - `truncateToTier1(["20205","1299","13335"])` -> `["1299","13335"]`
  - `truncateToTier1` keeps the whole hop list when no Tier-1 is present
  - `truncateToTier1(["3356"])` -> `["3356"]`
  - `tier1RoutesOnly` returns 14 rows on the real `1.1.1.0/24` paths, every row ending at a Tier-1
- Playwright at 1280px and 390px with the real response:
  - Policy row count is 14; every row contains `AS13335`
  - the rightmost node of each row is a Tier-1 ASN
  - tooltip on `AS1299` shows `Tier-1 Arelion`
  - no document overflow, no page errors
  - Straight and Flexible still render

## Out of scope

- Tier-1 list and names still come from a secondary source (Wikipedia).
- Changes to Straight and Flexible modes, Route Lookup, LookupModal, v1.

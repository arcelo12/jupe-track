# Global Lookup: AS Path Policy Mode Shows All Tier-1 Routes

Date: 2026-10-12
Scope: `frontend/src/components/ui/LookupAsPathGraph.tsx` and `frontend/src/lib/as-path-layout.ts`.
Builds on `2026-10-11-lookup-as-path-policy-mode-design.md` and `2026-10-12-lookup-as-path-pan-responsive-design.md`.
Straight and Flexible modes, Route Lookup, LookupModal, and v1 are unchanged.

## Problem

On real data (`1.1.1.0/24`, 366 peers) Policy mode showed only the top 5 routes. Of 14 distinct
Tier-1 ASNs seen, only one or two appeared. The cap was added to stop a 272-route canvas from overflowing.
The user wants every Tier-1 visible, and each Tier-1 node to say which AS it is on hover.

## Decisions

- Policy mode shows only routes whose truncated path ends at a Tier-1 AS. Routes with no Tier-1 are hidden
  in this mode. On the sample data that is 323 of 366 peers. Assumption: the user wants the Tier-1 view only.
- One row per distinct truncated route, with hops intact, `×N` when the route appears N times.
  Sorted by count desc, then path asc. On the sample: 31 rows.
- No cap. `POLICY_MAX_ROUTES`, `topPolicies`, and the "Showing top N" note are removed.
- Drag pan and the 480px height clamp (already shipped) let the user reach every row.
- Tier-1 hover tooltip shows `AS<n>`, a name, and the `Tier-1` label.
  Name = AS Mapping name when the mapping exists, else the built-in name for that Tier-1 ASN.

## Units

- `as-path-layout.ts` (pure, tested):
  - `tier1RoutesOnly(paths: string[]): { path: string; count: number }[]`
    Keeps paths whose truncated route ends at a Tier-1 hop. Groups identical routes, counts them,
    sorts count desc then path asc. Replaces `groupPolicies` use in Policy mode.
  - `TIER1_NAMES: ReadonlyMap<string, string>` with the 15 names from the Tier-1 list:
    7018 AT&T, 3320 Deutsche Telekom Global Carrier, 3257 GTT, 6830 Liberty Global,
    3356 Lumen, 2914 NTT, 5511 Orange, 3491 PCCW Global, 6453 Tata Communications,
    6762 Telecom Italia Sparkle, 1299 Arelion, 12956 Telxius, 701 Verizon, 6461 Zayo, 174 Cogent.
  - `tier1Name(asn: string): string | null`.
- `groupPolicies`, `topPolicies`, `POLICY_MAX_ROUTES`: removed if no other caller remains (checked by grep).
- `LookupAsPathGraph.tsx`: Policy mode uses `tier1RoutesOnly` output with `layoutStraight`.
  Tooltip name uses `mappings[n.id]?.name ?? tier1Name(n.id)`. No business logic beyond wiring.

## Behavior and errors

- No Tier-1 route in the result: Policy mode shows an empty-state line "No Tier-1 routes in this result".
  Other modes unchanged.
- Mapping request fails: tooltip still shows built-in name for Tier-1 hops.
- Non-Tier-1 node hover: unchanged (AS number, mapping name if present).

## Testing

- `scripts/test-as-path-layout.mjs`:
  - route ending at Tier-1 is kept, route without Tier-1 is dropped
  - duplicates merge with count, sort order is count desc then path asc
  - empty input returns empty array
  - `tier1Name("3356") === "Lumen"`, `tier1Name("13335") === null`
  - all 15 Tier-1 ASNs have a name
- Playwright at 1280px and 390px with the real `1.1.1.0/24` response:
  - Policy shows 31 rows, no "Showing top" text
  - all 14 distinct Tier-1 nodes render
  - hover on `AS3356` shows `Lumen` and `Tier-1`
  - no document overflow, no page errors
  - Straight and Flexible still render

## Open points (not decided here)

- The Tier-1 list and names come from a secondary source (Wikipedia). Not yet checked against a primary source.
- bgp.tools example truncates at 174, not 6461. Current list keeps 6461 as Tier-1.

## Out of scope

- Editing the Tier-1 list from the UI or backend.
- Changes to Straight and Flexible modes, Route Lookup, LookupModal, v1.

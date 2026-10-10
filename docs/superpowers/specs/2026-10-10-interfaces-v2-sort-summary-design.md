# Interfaces v2: Logical Unit Sorting and Chart Summary

Date: 2026-10-10
Scope: v2 only. `frontend/src/app/interfaces/page.tsx` (ClassicView, chart dialog) plus one small pure helper module.

## Goal

Make the logical-unit table sortable and show min/avg/max in the per-unit chart dialog. Both use data already in memory. No new fetches.

## Behavior

### 1. Sorting (ClassicView, logical-unit table)

- Sortable headers: `In (Rx)`, `Out (Tx)`, `Status`. `Unit` stays unsorted.
- Click header: sort ascending by that column. Click again: descending. Third click: back to default order.
- Default order: the order returned by the API (unchanged).
- Sort state is per physical group, held in the component, not persisted.
- Numeric columns sort by `bps_in` / `bps_out`. `Status` sorts by `oper_status` string, `up` before `down`, otherwise alphabetical.
- Header uses `aria-sort` (`ascending`, `descending`, `none`) and is a `button` inside `th`, so it is keyboard reachable.
- Row hover, sparkline, and click-to-open-dialog behavior are unchanged.

### 2. Chart dialog summary

- Above the chart, one line each for Ingress and Egress: `min / avg / max` in Mbps, one decimal.
- Computed from `trafficHistory[modalIface]` (`in_mbps`, `out_mbps`).
- Empty history: summary not rendered (the existing "Waiting for live telemetry" state already covers this).

## Components

- `frontend/src/lib/table-sort.ts` (new): pure functions `nextSortState(current, column)` and `sortUnits(units, sort)`. No React.
- `frontend/src/lib/series-summary.ts` (new): pure `summarize(values: number[])` returning `{min, avg, max}` or `null` when empty.
- `interfaces/page.tsx`: wires the helpers. ClassicView and dialog only. Compact view and `HistoryPanel` untouched.

## Out of scope

- Compact view sorting. v1 changes. Desktop layout changes. Replacing Recharts. Persisting sort across reloads. Server-side sorting.

## Testing

- Unit: `table-sort` (default order, asc, desc, cycle back to default, status ordering) and `series-summary` (empty, single value, mixed), using the existing assert-style test pattern in `sparkline-math` if present, else a small `*.test.ts` run with `node --test` or `tsx`. Run it.
- Static: `npx tsc --noEmit`, `npx eslint` on touched files.
- Browser (Playwright, `/root/node_modules/playwright`, v2 via `data-ui-version`): fixture with 4 logical units. Click `In (Rx)` twice, verify row order and `aria-sort`. Open a unit dialog, verify min/avg/max text matches values computed in the test.
- Viewports 390px and 1280px: no horizontal overflow, no page errors.
- v1 regression: same route with v1 shows no sort buttons and no summary line.

## Risks

- `trafficHistory` may contain null values: `summarize` filters non-finite numbers.
- Sort on every render: memoize per group with `useMemo`.

## Open question

None. Awaiting user review of this spec before the implementation plan.

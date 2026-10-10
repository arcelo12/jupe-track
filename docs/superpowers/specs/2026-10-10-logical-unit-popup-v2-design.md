# Logical Unit Popup Rework (v2, Live Only)

Date: 2026-10-10
Scope: v2 only. `frontend/src/app/interfaces/page.tsx` (chart dialog block). v1 unchanged.

## Goal

Rework the per-logical-unit chart dialog into a clearer detail view. Live data only. No time-range selector, no sibling-unit table.

## Behavior

Dialog opens from a logical-unit row in Classic and Compact views (same dialog, both views).

Layout, top to bottom:

1. **Header:** unit name (title, existing), plus a line "Live logical unit traffic overview" (existing description).
2. **Status row:** oper status badge (`up` / `down`, same colors as the physical card badge) and admin status badge. Description text from the interface, truncated to one line.
3. **Metric boxes:** two boxes side by side. Ingress (blue, `v2-io-in`) and Egress (orange, `v2-io-out`). Each shows the current value as `lastPoint.in_mbps.toFixed(1) + ' Mbps'` (the history is already in Mbps, so `formatBps`, which takes bps, must not be used here), e.g. `343.8 Mbps`.
4. **Chart:** existing area chart (Ingress and Egress series), unchanged data source `trafficHistory[unit]`.
5. **Summary:** existing min/avg/max line per direction, unchanged.
6. **Footer line:** "Updated HH:MM:SS · N pts", existing readout, moved below the summary.

Empty state (no history yet): unchanged "Waiting for live telemetry" message.

Not included: time-range selector (Live/1h/6h/24h), sibling-unit table, new endpoints, any change to v1.

## Data

- Same WebSocket `interfaces` stream and `trafficHistory` state. No new fetches.
- Current value = last point of `trafficHistory[unit]`, already computed for the readout.
- Oper and admin status come from the `InterfaceInfo` object for the unit. Look it up from `rawInterfaces` by name, or pass the unit object into the dialog state. Pick the simpler: store the selected unit object instead of only its name.

## Components

- Only the dialog block in `interfaces/page.tsx` changes.
- Small presentational helper `UnitStatusBadge` may be added in the same file if it avoids duplication with the physical card. Otherwise inline.
- No new files unless the helper grows beyond one function.

## Error handling

- Missing unit in `rawInterfaces` (disappeared between refresh cycles): show the header with name only, no status badges, and keep the chart. Do not crash.
- Empty history: existing empty-state branch, metric boxes show `—`.

## Testing

- Browser (Playwright, mock WebSocket with deterministic values): open a logical unit in Classic and Compact, verify header badges text, metric values match the fixture, summary matches, footer count increases after one WebSocket push.
- Missing-unit path: send a message without the unit, verify no page error and dialog stays open.
- Viewports 390px and 1280px: no horizontal overflow.
- v1: same route with v1 shows the old dialog text (no status badges, no metric boxes).
- `npx tsc --noEmit`, `npx eslint` on the file.

## Out of scope

- Global Lookup as-path layout (separate design, not started).
- Physical-interface popup.
- Backend changes.

## Open question

None.

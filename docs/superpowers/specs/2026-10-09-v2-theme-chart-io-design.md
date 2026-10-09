# UI v2: Theme Source, IN/OUT Colors, Sparkline Performance

Date: 2026-10-09
Scope: `[data-ui-version="v2"]` only. v1 is unchanged.

## Decisions (approved)

- **A1 Theme source of truth: server.** The per-user preference stored via
  `PATCH /api/proxy/auth/me` is authoritative. Local storage is a cache only.
- **B1 IN/OUT colors: In = green, Out = orange.** Semantic, independent of the
  primary accent.

## Problem

1. Theme differs per page. Reproduced: server `color_mode=light`, local cache
   `dark`. After reload, every page shows `light`. The header toggle and the
   Settings page both write the same server field, but a stale local cache can
   override the server on load, so the displayed theme and the saved theme
   disagree.
2. IN/OUT labels have no semantic color. In (Rx) uses `text-primary`, which is
   near-white in v2, and Out (Tx) uses `text-on-surface`. Users cannot tell
   direction at a glance.
3. Sublogical mini charts lag. `ClassicView` renders one Recharts
   `ResponsiveContainer` plus `AreaChart` per row inside the table. Each
   WebSocket tick rebuilds `trafficHistory`, so every chart re-renders.

## Design

### 1. Theme: one source, server wins on load

- `ThemeProvider` is the only writer of theme state. Header `ThemeToggle` and
  Settings both call `setThemePreference`. No second control path.
- On auth restore, the server value overwrites local cache, always, before first
  paint. The inline `themeInitScript` in `layout.tsx` keeps applying the cache
  first to avoid a flash, then the provider corrects it once `user` loads.
- Failure: if `PATCH` fails, revert to the previous preset and mode, show
  `saveError`, and keep the cache equal to the reverted value.
- Lock: `isSaving` disables the toggle only while a PATCH is in flight. It must
  reset in `finally`, so a failed request cannot leave the toggle stuck.

### 2. IN/OUT semantic colors (v2 scope)

- New v2 tokens on `[data-ui-version="v2"]`:
  - `--ui-in: #22c55e` (dark) / `#15803d` (light). Green.
  - `--ui-out: #f97316` (dark) / `#c2410c` (light). Orange, matches `CHART_OUT`.
- Apply to In/Out labels and values in the Classic view header and table cells
  and to the legend dots. Chart series keep `CHART_IN` / `CHART_OUT` as before.
- Labels stay readable: values use `font-bold`, labels keep `uppercase tracking-widest`.

### 3. Sparkline: replace Recharts for per-unit mini charts

- New component `components/charts/Sparkline.tsx`: a pure SVG polyline pair
  (in, out) with fixed `viewBox`, no Recharts, no `ResponsiveContainer`.
- Input: `points: { in_mbps: number; out_mbps: number }[]`, capped to the last
  30 points (the hover preview) so cost stays constant.
- `React.memo` with a shallow comparison on the points array reference and
  length. The parent only passes a new array when that unit's history changes.
- Full history charts (physical card and the detail dialog) keep Recharts. Only
  the per-row hover preview and per-unit mini charts change.
- The hover preview renders only while hovered (existing behavior), so idle
  rows cost nothing.

## Error handling

- Theme PATCH failure: revert and show `saveError`. No silent divergence.
- Sparkline with fewer than 2 points: render nothing, no error.

## Testing

- Theme: reproduce the server=light / cache=dark case. After load, the header,
  Settings, and body must all show `light`. Also: a failed PATCH reverts and
  leaves the toggle clickable.
- IN/OUT: computed color on In is green and on Out is orange in both modes.
- Performance: count `.recharts-wrapper` nodes on `/interfaces` classic view
  with 6 physical × 4 logical units. Before: one per unit row. After: zero
  on the table, Recharts only for the physical card and dialog.
- Regression: v1 unchanged, 44-combo route check still passes.

## Out of scope

- Changing the WebSocket tick rate or server payload.
- Redesigning the physical card or the detail dialog.
- Any change to v1 styling.

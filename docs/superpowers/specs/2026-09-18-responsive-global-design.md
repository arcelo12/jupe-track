# Responsive Global JupeTrack

## Goal
Make JupeTrack usable in portrait/mobile without changing the desktop layout.

## Scope
- Global shell: prevent page-level horizontal overflow; preserve local vertical scrolling.
- All pages: mobile-first single-column layout; existing `sm`, `lg`, and `xl` desktop breakpoints remain.
- Tables: horizontal scrolling stays local to the table container.
- ChartDialog: viewport-safe width, compact mobile spacing, determinate chart height, no horizontal overflow, legend below/wrapped where controlled by the chart.
- Header/sidebar: retain usable touch targets and mobile navigation.

## Approach
Use existing Tailwind utilities and the smallest component-level changes. Avoid new dependencies, abstractions, or router/device-specific behavior. Desktop classes remain unchanged unless needed to make the mobile default safe.

## Acceptance checks
- At portrait widths around 360px and 414px, no document-level horizontal overflow.
- ChartDialog fits the viewport, chart remains visible, close control remains reachable.
- Tables scroll within their own container when content exceeds the viewport.
- `npm run build` passes. Existing lint baseline is reported separately if unchanged.

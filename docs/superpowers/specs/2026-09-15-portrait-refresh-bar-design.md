# Portrait Auto-Refresh Bar Design

## Goal

Make auto-refresh settings immediately visible on portrait/mobile screens. Replace the current refresh popover with a persistent second header row while preserving the existing desktop header.

## Responsive Layout

- Below `xl` (`1280px`), the authenticated header uses two rows.
- Row one keeps navigation, theme, password, and sign-out controls.
- Row two contains, left to right: Logical System, Auto Refresh, and Refresh Now.
- At `xl` and above, the existing single-row desktop controls remain unchanged.
- The mobile row must fit a 320px viewport without horizontal page overflow. Logical System may flex and truncate. Auto Refresh uses a compact fixed-width select. Refresh Now may use an icon-only presentation at the narrowest width, with an accessible label and tooltip.

## Components and State

- Modify only `frontend/src/components/ui/HeaderRefreshButton.tsx` and `frontend/src/components/ui/LayoutShell.tsx` unless verification exposes a necessary dependency.
- Keep `RefreshProvider` as the single state owner for `logicalSystem`, `refreshInterval`, and manual refresh.
- Render one responsive control group per breakpoint. Do not duplicate state or add a second provider.
- Remove the portrait `<details>` popover. No card, dropdown panel, or new dependency.
- Preserve the Amber command-center theme, flat fills, 4px radii, and 1px borders.

## Accessibility

- Each select keeps a visible label.
- Controls retain at least 44px touch height.
- Manual refresh retains an explicit accessible name and disabled/spinning feedback.
- Native selects remain keyboard-operable and use visible focus borders.

## Verification

- Run scoped ESLint for both changed components.
- Run the design-token guard, TypeScript check, and production build.
- Render authenticated-shell fixtures at 320x800, 390x844, 768x1024, and desktop width using an isolated browser context with mocked auth/data requests. Do not access a live router.
- Confirm the portrait controls are always visible, the old popover is absent, all controls are usable, and no horizontal overflow occurs.
- Confirm desktop layout remains visually unchanged.

## Non-Goals

- No refresh behavior or backend API changes.
- No changes to the desktop control content.
- No global theme, chart, Grafana, authentication, or router changes.

# Account Theme Presets Design

## Goal

Provide four account-scoped visual presets while preserving the existing independent dark/light mode. Make Graphite Mono the default for new and existing accounts. Let every authenticated user manage appearance from Settings while keeping device configuration and all other administration features admin-only.

## Approved Presets

| Stored value | Label | Character | Dark foundation | Dark accent | Dark success | Dark warning |
| --- | --- | --- | --- | --- | --- | --- |
| `signal-blue` | Signal Blue | Neutral, sharp, familiar NOC palette | `#0b0f14` | `#58a6ff` | `#3fb950` | `#d29922` |
| `network-teal` | Network Teal | Calm, technical network identity | `#091313` | `#2dd4bf` | `#5ee39b` | `#eab84e` |
| `midnight-indigo` | Midnight Indigo | Modern, low-glare expression | `#0c0d16` | `#8da2fb` | `#4ade80` | `#fbbf24` |
| `graphite-mono` | Graphite Mono | Neutral chrome; color reserved for status and data | `#0e1012` | `#d6dbe0` | `#65c88a` | `#d8aa55` |

Each preset defines the complete existing surface, text, outline, primary, error, success, and warning token set for both light and dark modes. Light variants use near-white neutral or lightly tinted surfaces from the same hue family, dark readable text, and a darker accent suitable for text and controls. Implementations must meet WCAG AA contrast for normal text and controls. No gradients or shadows are introduced. Existing flat fills, 4px component radii, and 1px borders remain.

`graphite-mono` and `dark` are the canonical fallback values. Existing users receive those values during migration. Missing, malformed, or stale browser cache values also resolve to those defaults.

## Data Model

Add two non-null fields to `models.User`:

- `ThemePreset string` serialized as `theme_preset`, default `graphite-mono`.
- `ColorMode string` serialized as `color_mode`, default `dark`.

Allowed presets are `signal-blue`, `network-teal`, `midnight-indigo`, and `graphite-mono`. Allowed modes are `dark` and `light`. Backend constants and validation functions are the authority for accepted persisted values.

GORM `AutoMigrate` adds both columns. After migration, explicitly backfill empty values to the canonical defaults so legacy rows behave consistently regardless of SQLite/GORM default behavior. New account creation paths, including the default admin seed and `POST /users`, explicitly assign the same defaults rather than relying only on database tags. No separate preference table or JSON column is needed because the preference is one-to-one with the user and has a fixed schema.

## API Contract

Extend authenticated `GET /api/v1/auth/me` with:

```json
{
  "theme_preset": "graphite-mono",
  "color_mode": "dark"
}
```

Add authenticated `PATCH /api/v1/auth/me`. The request contains both fields:

```json
{
  "theme_preset": "network-teal",
  "color_mode": "light"
}
```

Both fields are required. The handler:

1. Binds JSON and rejects malformed or missing values with `400`.
2. Validates both values against fixed allowlists and rejects unsupported values with `400`.
3. Finds the authenticated user from the middleware username.
4. Updates only `theme_preset` and `color_mode` in one DB operation.
5. Returns the same public user shape as `GET /auth/me`.
6. Returns `404` if the authenticated user no longer exists and `500` if persistence fails.

The endpoint is self-service and requires `AuthMiddleware`, not admin access. It cannot update another account or any non-theme user field. JWT claims remain unchanged.

Document the extended response and new operation in `docs/API.md` and `docs/openapi.yaml`.

## Frontend Theme State

Keep `ThemeProvider` as the sole owner of active visual theme state. Reorder the root providers to `AuthProvider` → `ThemeProvider` → the remaining providers so ThemeProvider can consume the authenticated profile without an event bridge or circular context dependency. The pre-render script still applies cached CSS before either provider hydrates. Expand the ThemeProvider contract to expose:

- current `themePreset` and `colorMode`;
- supported preset metadata for the Settings cards;
- one async preference setter used by Settings;
- the existing mode toggle, now persisted through the same setter when authenticated.

Use two localStorage keys, `jupetrack-theme-preset` and `jupetrack-color-mode`. These values are a cache for pre-render startup, not the source of truth. The provider applies state by setting `document.documentElement.dataset.themePreset` and toggling `.dark`, plus `colorScheme`.

The `beforeInteractive` script in `app/layout.tsx` reads and allowlist-validates both cache keys before first paint. Invalid or absent values become Graphite Mono and dark. This preserves the current anti-flash behavior for both dimensions.

`AuthProvider` exposes a small `updateUser` operation that updates React state and the existing cached `jupe_user` value. On login or session restoration, the server profile is applied to ThemeProvider and local cache. This means the account value wins once `/auth/me` returns. On logout, keep the last visual cache to avoid an unnecessary flash on the login page; a subsequent account login replaces it with that account's preference.

## Save and Failure Flow

Appearance controls use optimistic application:

1. User chooses a preset or mode.
2. ThemeProvider immediately applies it and updates the anti-flash cache.
3. Frontend sends both current fields to `PATCH /api/proxy/auth/me` through `authFetch`.
4. Success replaces the AuthProvider user object and cached profile with the returned public user.
5. Failure restores the previous preset and mode in the DOM and local cache, then shows an accessible error message.

Disable the Appearance controls while a save is in flight. This intentionally serializes preference changes and avoids stale responses overwriting newer choices. The header mode toggle uses the same save path. Before authentication restoration completes, it may apply the local cache but does not send a request. After authentication, changing mode always persists to the account.

## CSS and Semantic Color Separation

Keep the existing Tailwind token names so most components need no changes. Every preset supplies both light and dark variable blocks; no mode may inherit another preset's values accidentally. Export new `--color-success` and `--color-warning` mappings from the Tailwind v4 `@theme inline` block, alongside the current mappings, so utilities such as `text-success`, `bg-success`, `border-warning`, and chart token references resolve at build time. Define preset-specific variables under selectors equivalent to:

```css
:root[data-theme-preset="graphite-mono"] { /* light */ }
.dark[data-theme-preset="graphite-mono"] { /* dark */ }
```

Repeat for all four presets. The root fallback contains the Graphite Mono light values, and the dark fallback contains the Graphite Mono dark values, so an absent data attribute is still safe.

Add semantic `success` and `warning` tokens alongside the existing `error` token. Presets may tune those tokens, but status meaning stays stable: healthy, online, connected, established, active, completed, and successful use `success`; degraded/caution uses `warning`; failed, offline, disconnected, down, and destructive use `error`. Primary remains interaction, selection, focus, branding, and non-semantic emphasis.

Before editing status styles, search all frontend uses of `primary` combined with operational state or success messaging. Record every semantic consumer in the implementation plan, then verify each recorded location uses `success`, `warning`, or `error` as appropriate. This search is required because status rendering is distributed across pages and shared components.

Existing ingress/egress chart series retain distinct data colors. Static chart surface/grid/axis constants must be converted to CSS-variable references or resolved computed tokens where necessary so tooltips and grids remain legible in every preset and mode. Charts do not use success/error colors unless the plotted value itself represents status.

## Settings and Authorization

`/settings` becomes an authenticated account settings page:

- Place an Appearance card first. It shows four labeled radio-card choices with compact palette previews and a separate Dark/Light segmented control.
- Use native radio semantics or equivalent `role="radiogroup"` behavior, visible focus, selected text in addition to color, and at least 44px interactive targets.
- Show saving state and an `aria-live` success/error notice.
- Render the existing device settings header, form, and supporting cards only for admins.
- Do not fetch `/settings/device` for non-admin users.

Change RBAC so only the child administration routes remain guarded: `/settings/users`, `/settings/retention`, and `/settings/as-mapping`. The exact `/settings` route is available to every authenticated user, while its device controls remain conditionally rendered. Remove the current page-level `if (me && !isAdmin(me)) return null` guard; replace it with conditional rendering around only the device settings header, form, and supporting admin cards. Rename the sidebar entry from `Device Settings` to `Settings`; other configuration navigation remains hidden from non-admins.

Backend authorization for device settings remains unchanged. Frontend hiding is presentation and does not replace the existing backend admin boundary.

## Error Handling

- Invalid API values: `400`, no database mutation.
- Missing user: `404`.
- Database update failure: `500`, no success response.
- Network, refresh, or server failure in the browser: rollback both theme dimensions and cache; retain the authenticated session unless `authFetch` determines it expired.
- Invalid localStorage or cached user values: ignore and apply Graphite Mono dark until the server profile arrives.
- Failed account-profile fetch during session restore: use the existing cached user and validated theme cache; retry occurs through the existing authentication lifecycle rather than a new polling mechanism.

## Verification

### Backend

Add focused tests for:

- allowlisted preset and mode validation;
- default/backfill behavior for legacy users;
- `GET /auth/me` returning both preference fields;
- valid `PATCH /auth/me` persistence and returned profile;
- missing and invalid fields returning `400` without mutation;
- one account update not changing another account.

Run:

```bash
cd backend-go
gofmt -w internal/models/user.go internal/database/database.go internal/api/auth.go internal/api/users.go internal/api/auth_test.go
go test ./...
go vet ./...
go build ./...
```

### Frontend

Run:

```bash
cd frontend
npm run check:design
npm run lint
npm run build
```

The repository has known lint baseline failures, so record scoped results separately and do not claim the full lint command is clean unless it exits successfully.

Use a browser with mocked auth and API responses. Do not access authenticated NETCONF, scraper, looking-glass, or a real router. Verify:

- first paint uses the cached preset and mode without a visible theme flash;
- server profile supersedes stale cache after login and refresh;
- all eight preset/mode combinations render readable Settings, dashboard, BGP, interfaces, dialogs, and charts;
- keyboard selection, focus indication, radio names, and 44px targets work;
- valid saves survive reload and a second login for the same account;
- different accounts restore different preferences;
- simulated save failure visibly rolls back and announces the error;
- non-admin users can open Appearance but cannot see, fetch, or reach device/admin controls;
- admin users retain all existing Settings functionality;
- operational statuses remain green/red/warning as appropriate under Graphite Mono.

## Canonical Theme Tokens

These values are implementation requirements, not examples. The approved dark key colors are preserved. All listed text/background and control pairs were checked using WCAG relative luminance calculations: 312 checks, zero failures at 4.5:1 for normal text or 3:1 for UI boundaries as applicable.

```text
# JupeTrack Theme Presets — 24 Tokens x 8 Combinations (Light + Dark)

=== 1. GRAPHITE-MONO (dark) ===
--background: #0e1012
--foreground: #e2e4e8
--on-background: #e2e4e8
--surface: #0e1012
--surface-dim: #090a0c
--surface-bright: #34383d
--surface-container-lowest: #090a0c
--surface-container-low: #15181b
--surface-container: #1b1e22
--surface-container-high: #24282d
--surface-container-highest: #2e3339
--on-surface: #e2e4e8
--on-surface-variant: #9da3ab
--outline: #858b94
--outline-variant: #363b42
--primary: #d6dbe0
--on-primary: #0e1012
--primary-hover: #e6eaef
--success: #65c88a
--on-success: #032612
--warning: #d8aa55
--on-warning: #2c1a00
--error: #ffb4ab
--on-error: #690005

=== 1. GRAPHITE-MONO (light) ===
--background: #f6f8fa
--foreground: #191c20
--on-background: #191c20
--surface: #ffffff
--surface-dim: #edeef1
--surface-bright: #ffffff
--surface-container-lowest: #ffffff
--surface-container-low: #f4f5f7
--surface-container: #edeef1
--surface-container-high: #e4e6ea
--surface-container-highest: #dcdee3
--on-surface: #191c20
--on-surface-variant: #545963
--outline: #727883
--outline-variant: #cacdd4
--primary: #24292f
--on-primary: #ffffff
--primary-hover: #0f1115
--success: #137333
--on-success: #ffffff
--warning: #855700
--on-warning: #ffffff
--error: #ba1a1a
--on-error: #ffffff

=== 2. SIGNAL-BLUE (dark) ===
--background: #0b0f14
--foreground: #e2e7ee
--on-background: #e2e7ee
--surface: #0b0f14
--surface-dim: #070a0e
--surface-bright: #313742
--surface-container-lowest: #070a0e
--surface-container-low: #11161d
--surface-container: #161c24
--surface-container-high: #1e2530
--surface-container-highest: #262f3d
--on-surface: #e2e7ee
--on-surface-variant: #97a3b3
--outline: #738294
--outline-variant: #2b3644
--primary: #58a6ff
--on-primary: #00284d
--primary-hover: #79b8ff
--success: #3fb950
--on-success: #00270a
--warning: #d29922
--on-warning: #2e1c00
--error: #ffb4ab
--on-error: #690005

=== 2. SIGNAL-BLUE (light) ===
--background: #f4f7fb
--foreground: #0f172a
--on-background: #0f172a
--surface: #ffffff
--surface-dim: #ebf0f7
--surface-bright: #ffffff
--surface-container-lowest: #ffffff
--surface-container-low: #f0f4f9
--surface-container: #e8eef6
--surface-container-high: #dfe6f0
--surface-container-highest: #d4dee9
--on-surface: #0f172a
--on-surface-variant: #475569
--outline: #64748b
--outline-variant: #cbd5e1
--primary: #0760cb
--on-primary: #ffffff
--primary-hover: #054da4
--success: #137333
--on-success: #ffffff
--warning: #855700
--on-warning: #ffffff
--error: #ba1a1a
--on-error: #ffffff

=== 3. NETWORK-TEAL (dark) ===
--background: #091313
--foreground: #e0ecea
--on-background: #e0ecea
--surface: #091313
--surface-dim: #050e0e
--surface-bright: #2e3938
--surface-container-lowest: #050e0e
--surface-container-low: #0f1a1a
--surface-container: #142120
--surface-container-high: #1b2928
--surface-container-highest: #233332
--on-surface: #e0ecea
--on-surface-variant: #92a6a4
--outline: #6d8582
--outline-variant: #253836
--primary: #2dd4bf
--on-primary: #002722
--primary-hover: #5eead4
--success: #5ee39b
--on-success: #002914
--warning: #eab84e
--on-warning: #342400
--error: #ffb4ab
--on-error: #690005

=== 3. NETWORK-TEAL (light) ===
--background: #f3f8f7
--foreground: #0d1f1d
--on-background: #0d1f1d
--surface: #ffffff
--surface-dim: #e6f0ee
--surface-bright: #ffffff
--surface-container-lowest: #ffffff
--surface-container-low: #ecf5f3
--surface-container: #e2eeec
--surface-container-high: #d7e5e3
--surface-container-highest: #ccdedb
--on-surface: #0d1f1d
--on-surface-variant: #3b524f
--outline: #597471
--outline-variant: #b9cfcc
--primary: #006663
--on-primary: #ffffff
--primary-hover: #004f4c
--success: #137333
--on-success: #ffffff
--warning: #855700
--on-warning: #ffffff
--error: #ba1a1a
--on-error: #ffffff

=== 4. MIDNIGHT-INDIGO (dark) ===
--background: #0c0d16
--foreground: #e3e4f0
--on-background: #e3e4f0
--surface: #0c0d16
--surface-dim: #080810
--surface-bright: #323344
--surface-container-lowest: #080810
--surface-container-low: #121320
--surface-container: #171828
--surface-container-high: #1f2134
--surface-container-highest: #282a40
--on-surface: #e3e4f0
--on-surface-variant: #9aa0c0
--outline: #757a9e
--outline-variant: #2b2d45
--primary: #8da2fb
--on-primary: #101442
--primary-hover: #aab9fc
--success: #4ade80
--on-success: #00290f
--warning: #fbbf24
--on-warning: #372000
--error: #ffb4ab
--on-error: #690005

=== 4. MIDNIGHT-INDIGO (light) ===
--background: #f5f5fb
--foreground: #131424
--on-background: #131424
--surface: #ffffff
--surface-dim: #ebebf5
--surface-bright: #ffffff
--surface-container-lowest: #ffffff
--surface-container-low: #f0f0f9
--surface-container: #e8e8f4
--surface-container-high: #dedeed
--surface-container-highest: #d2d2e5
--on-surface: #131424
--on-surface-variant: #474966
--outline: #65688a
--outline-variant: #c3c5dc
--primary: #4338ca
--on-primary: #ffffff
--primary-hover: #3730a3
--success: #137333
--on-success: #ffffff
--warning: #855700
--on-warning: #ffffff
--error: #ba1a1a
--on-error: #ffffff

=== RINGKASAN KONTRAS WCAG AA ===
Total checks: 312, 0 failure.
- foreground / on-background vs background: 14.98:1 - 18.21:1 (min 4.5:1)
- on-surface vs semua kontainer: 10.01:1 - 18.21:1 (min 4.5:1)
- on-surface-variant vs kontainer tertinggi: 5.01:1 - 6.00:1 (min 4.5:1)
- on-primary vs primary: 5.89:1 - 14.65:1 (min 4.5:1)
- on-success vs success: 5.95:1 - 9.75:1 (min 4.5:1)
- on-warning vs warning: 6.25:1 - 9.19:1 (min 4.5:1)
- on-error vs error: 6.46:1 - 7.72:1 (min 4.5:1)
- outline vs surface: 4.44:1 - 5.55:1 (min 3.0:1)
```

## Files Expected to Change

Backend:

- `backend-go/internal/models/user.go`
- `backend-go/internal/database/database.go`
- `backend-go/internal/api/auth.go`
- `backend-go/internal/api/users.go`
- `backend-go/internal/api/auth_test.go`
- `docs/API.md`
- `docs/openapi.yaml`

Frontend:

- `frontend/src/app/globals.css`
- `frontend/src/app/layout.tsx` (including provider order)
- `frontend/src/app/settings/page.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/bgp/page.tsx`
- `frontend/src/app/interfaces/page.tsx`
- `frontend/src/components/ThemeProvider.tsx`
- `frontend/src/components/ThemeToggle.tsx`
- `frontend/src/components/AuthProvider.tsx`
- `frontend/src/components/ui/LayoutShell.tsx`
- `frontend/src/components/ui/Sidebar.tsx`
- `frontend/src/lib/auth.ts`
- `frontend/src/lib/rbac.ts`
- `frontend/src/lib/chart-colors.ts`
- additional status consumers found by the required semantic-token search before implementation

No new package is required. Do not modify `archive/backend/` or `grafana/`.

## Non-Goals

- User-created palettes or arbitrary color pickers.
- System/automatic color mode.
- Theme administration for other users.
- Theme history, audit records, or cross-device real-time push.
- Router, scraper, VictoriaMetrics, WebSocket protocol, or Grafana changes.
- Redesigning layouts, typography, navigation structure, or charts beyond token compatibility.

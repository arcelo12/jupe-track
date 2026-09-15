# Account Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide four account-scoped visual presets with independent dark/light modes, defaulting to Graphite Mono dark, managed from Settings by any authenticated user while keeping device configuration and administration features admin-only.

**Architecture:** Extend the GORM `User` model with `theme_preset` and `color_mode` columns and backfill existing rows. Implement authenticated `GET /api/v1/auth/me` and `PATCH /api/v1/auth/me` with strict allowlist validation. Reorder root providers to `AuthProvider` → `ThemeProvider` so `ThemeProvider` can consume the profile, synchronize with an anti-flash `localStorage` cache, and optimistically save appearance. Decouple `/settings` RBAC so non-admins can access appearance settings while hiding device configuration. Map Tailwind CSS v4 variables for all 4 presets across both modes, and migrate operational status elements from `primary` to semantic `success`/`warning`/`error` tokens.

**Tech Stack:** Go 1.22, Gin, GORM (`glebarez/sqlite`), Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript strict mode.

---

### Critical Guardrails & Staging Constraints
- Before editing, save read-only baseline copies of every already-dirty target under `$JCODE_SCRATCH_DIR/theme-baseline/`. After editing, do not stage the whole dirty file. Generate the agent delta from baseline to final, apply that delta to a temporary copy of the `HEAD` version, validate the resulting theme-only file, write its blob with `git hash-object -w`, and stage that blob with `git update-index --cacheinfo 100644,<blob>,<path>`. Inspect `git diff --cached` and `git diff` before committing. This preserves the user's pre-existing changes in the worktree while committing only theme changes.
- **No Live Router Access:** Do not access or invoke live NETCONF, router scraper, or looking-glass flows. All tests use in-memory SQLite and Gin test contexts.
- **No Archive/Grafana Changes:** Do not modify `archive/backend/` or `grafana/`.
- **Known Baseline Handling:** `npm run build` compiles cleanly. ESLint has pre-existing errors unrelated to theme changes; verify frontend changes with `npm run build` and target-specific checks.

---

## File Map

| Action | Path | Responsibility |
| --- | --- | --- |
| Modify | `frontend/src/app/globals.css` | Define 8 CSS token blocks (4 presets x 2 modes) + Tailwind `@theme inline` semantic tokens |
| Modify | `frontend/src/lib/chart-colors.ts` | Convert static chart colors to theme-adaptive CSS variable references |
| Modify | `backend-go/internal/models/user.go` | Add `ThemePreset` and `ColorMode` fields and validation constants |
| Modify | `backend-go/internal/database/database.go` | AutoMigrate columns, backfill legacy empty rows to defaults, update admin seed |
| Modify | `backend-go/internal/api/auth.go` | Update `GET /auth/me`, add validated `PATCH /auth/me` endpoint |
| Modify | `backend-go/internal/api/users.go` | Update `POST /users` seed defaults and public serialization |
| Modify | `backend-go/internal/api/auth_test.go` | Unit tests for auth/me GET/PATCH, validation, isolation, backfill |
| Modify | `docs/API.md` | API documentation for `GET /auth/me` and `PATCH /auth/me` |
| Modify | `docs/openapi.yaml` | OpenAPI 3.0 spec for theme preset API contract |
| Modify | `frontend/src/lib/types.ts` | Add theme fields to user types (preserve existing dirty edits) |
| Modify | `frontend/src/lib/auth.ts` | Extend `User` interface, add `updateUser` profile cache helper |
| Modify | `frontend/src/components/AuthProvider.tsx` | Expose `updateUser` in context (preserve existing dirty edits) |
| Modify | `frontend/src/components/ThemeProvider.tsx` | Owner of preset + mode, anti-flash cache, optimistic API persistence |
| Modify | `frontend/src/components/ThemeToggle.tsx` | Update mode toggle to route through `ThemeProvider` persistence |
| Modify | `frontend/src/app/layout.tsx` | Reorder providers (`AuthProvider` -> `ThemeProvider`), anti-flash script |
| Modify | `frontend/src/app/page.tsx` | Migrate status badges/dots from `primary` to `success` |
| Modify | `frontend/src/app/bgp/page.tsx` | Migrate peer status badges/dots from `primary` to `success` |
| Modify | `frontend/src/app/interfaces/page.tsx` | Migrate interface oper status from `primary` to `success` |
| Modify | `frontend/src/app/lg/page.tsx` | Migrate execution success badge from `primary` to `success` |
| Modify | `frontend/src/app/settings/users/page.tsx` | Migrate active user filter & table indicators to `success` |
| Modify | `frontend/src/app/settings/retention/page.tsx` | Migrate scraper worker enabled dot and success notice to `success` |
| Modify | `frontend/src/app/settings/as-mapping/page.tsx` | Migrate mapping success banner to `success` |
| Modify | `frontend/src/lib/rbac.ts` | Restrict `ADMIN_PATHS` to child settings routes (`/settings/users`, etc.) |
| Modify | `frontend/src/components/ui/Sidebar.tsx` | Rename `Device Settings` to `Settings`, keep config visible for all |
| Modify | `frontend/src/app/settings/page.tsx` | Add Appearance card, conditionally render device controls for admins (preserve existing dirty edits) |

---

### Task 1: Pre-Edit Semantic Token Audit and CSS Theme Setup

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/chart-colors.ts`

**Pre-Edit Semantic Inventory:**
Audited frontend locations where `primary` was improperly bound to operational status or success messaging:
1. `frontend/src/app/page.tsx:102-103`: WebSocket connection badge & dot (`isConnected ? 'bg-primary' : 'bg-error'`) -> change to `success`.
2. `frontend/src/app/page.tsx:143`: Interface oper status dot (`iface.oper_status === 'up' ? 'bg-primary' : 'bg-error'`) -> change to `success`.
3. `frontend/src/app/page.tsx:175`: BGP health badge (`downPeers ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'`) -> change to `success`.
4. `frontend/src/app/page.tsx:189,196`: BGP peer established dot & badge (`established ? 'bg-primary' : 'bg-error'`) -> change to `success`.
5. `frontend/src/app/bgp/page.tsx:197-198`: Peer status badge & pulsing dot (`isUp ? 'bg-primary/10 text-primary' : ...`) -> change to `success`.
6. `frontend/src/app/bgp/page.tsx:244-245`: Selected peer drawer badge & dot (`selectedPeer.state === 'Established' ? 'bg-primary' : ...`) -> change to `success`.
7. `frontend/src/app/interfaces/page.tsx:252,274,375`: Interface oper status dot & badge (`isUp ? 'bg-primary' : 'bg-error'`) -> change to `success`.
8. `frontend/src/app/settings/users/page.tsx:447,925,934`: Active users count check icon & active status badge/dot -> change to `success`.
9. `frontend/src/app/settings/retention/page.tsx:479,558`: Success notice banner & scraper running dot -> change to `success`.
10. `frontend/src/app/settings/as-mapping/page.tsx:410,413`: Save success banner & check icon -> change to `success`.
11. `frontend/src/app/settings/page.tsx:241,249`: Device settings save success banner & check icon -> change to `success`.
12. `frontend/src/app/lg/page.tsx:615`: Looking glass execution success badge (`isSuccess && "bg-primary/10 text-primary"`) -> change to `success`.

- [ ] **Step 1: Update `frontend/src/app/globals.css` with 8 token blocks and semantic tokens**

Replace root variables with Graphite Mono default and define all 8 combinations (`:root[data-theme-preset="..."]` and `.dark[data-theme-preset="..."]`), plus `--color-success` and `--color-warning` under `@theme inline`:

```css
@import "tailwindcss";

/* Fallback & Graphite Mono Light */
:root,
:root[data-theme-preset="graphite-mono"] {
  color-scheme: light;
  --background: #f6f8fa;
  --foreground: #191c20;
  --on-background: #191c20;
  --surface: #ffffff;
  --surface-dim: #edeef1;
  --surface-bright: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f4f5f7;
  --surface-container: #edeef1;
  --surface-container-high: #e4e6ea;
  --surface-container-highest: #dcdee3;
  --on-surface: #191c20;
  --on-surface-variant: #545963;
  --outline: #727883;
  --outline-variant: #cacdd4;
  --primary: #24292f;
  --on-primary: #ffffff;
  --primary-hover: #0f1115;
  --success: #137333;
  --on-success: #ffffff;
  --warning: #855700;
  --on-warning: #ffffff;
  --error: #ba1a1a;
  --on-error: #ffffff;
}

/* Fallback & Graphite Mono Dark */
.dark,
.dark[data-theme-preset="graphite-mono"] {
  color-scheme: dark;
  --background: #0e1012;
  --foreground: #e2e4e8;
  --on-background: #e2e4e8;
  --surface: #0e1012;
  --surface-dim: #090a0c;
  --surface-bright: #34383d;
  --surface-container-lowest: #090a0c;
  --surface-container-low: #15181b;
  --surface-container: #1b1e22;
  --surface-container-high: #24282d;
  --surface-container-highest: #2e3339;
  --on-surface: #e2e4e8;
  --on-surface-variant: #9da3ab;
  --outline: #858b94;
  --outline-variant: #363b42;
  --primary: #d6dbe0;
  --on-primary: #0e1012;
  --primary-hover: #e6eaef;
  --success: #65c88a;
  --on-success: #032612;
  --warning: #d8aa55;
  --on-warning: #2c1a00;
  --error: #ffb4ab;
  --on-error: #690005;
}

/* Signal Blue Light */
:root[data-theme-preset="signal-blue"] {
  color-scheme: light;
  --background: #f4f7fb;
  --foreground: #0f172a;
  --on-background: #0f172a;
  --surface: #ffffff;
  --surface-dim: #ebf0f7;
  --surface-bright: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f0f4f9;
  --surface-container: #e8eef6;
  --surface-container-high: #dfe6f0;
  --surface-container-highest: #d4dee9;
  --on-surface: #0f172a;
  --on-surface-variant: #475569;
  --outline: #64748b;
  --outline-variant: #cbd5e1;
  --primary: #0760cb;
  --on-primary: #ffffff;
  --primary-hover: #054da4;
  --success: #137333;
  --on-success: #ffffff;
  --warning: #855700;
  --on-warning: #ffffff;
  --error: #ba1a1a;
  --on-error: #ffffff;
}

/* Signal Blue Dark */
.dark[data-theme-preset="signal-blue"] {
  color-scheme: dark;
  --background: #0b0f14;
  --foreground: #e2e7ee;
  --on-background: #e2e7ee;
  --surface: #0b0f14;
  --surface-dim: #070a0e;
  --surface-bright: #313742;
  --surface-container-lowest: #070a0e;
  --surface-container-low: #11161d;
  --surface-container: #161c24;
  --surface-container-high: #1e2530;
  --surface-container-highest: #262f3d;
  --on-surface: #e2e7ee;
  --on-surface-variant: #97a3b3;
  --outline: #738294;
  --outline-variant: #2b3644;
  --primary: #58a6ff;
  --on-primary: #00284d;
  --primary-hover: #79b8ff;
  --success: #3fb950;
  --on-success: #00270a;
  --warning: #d29922;
  --on-warning: #2e1c00;
  --error: #ffb4ab;
  --on-error: #690005;
}

/* Network Teal Light */
:root[data-theme-preset="network-teal"] {
  color-scheme: light;
  --background: #f3f8f7;
  --foreground: #0d1f1d;
  --on-background: #0d1f1d;
  --surface: #ffffff;
  --surface-dim: #e6f0ee;
  --surface-bright: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #ecf5f3;
  --surface-container: #e2eeec;
  --surface-container-high: #d7e5e3;
  --surface-container-highest: #ccdedb;
  --on-surface: #0d1f1d;
  --on-surface-variant: #3b524f;
  --outline: #597471;
  --outline-variant: #b9cfcc;
  --primary: #006663;
  --on-primary: #ffffff;
  --primary-hover: #004f4c;
  --success: #137333;
  --on-success: #ffffff;
  --warning: #855700;
  --on-warning: #ffffff;
  --error: #ba1a1a;
  --on-error: #ffffff;
}

/* Network Teal Dark */
.dark[data-theme-preset="network-teal"] {
  color-scheme: dark;
  --background: #091313;
  --foreground: #e0ecea;
  --on-background: #e0ecea;
  --surface: #091313;
  --surface-dim: #050e0e;
  --surface-bright: #2e3938;
  --surface-container-lowest: #050e0e;
  --surface-container-low: #0f1a1a;
  --surface-container: #142120;
  --surface-container-high: #1b2928;
  --surface-container-highest: #233332;
  --on-surface: #e0ecea;
  --on-surface-variant: #92a6a4;
  --outline: #6d8582;
  --outline-variant: #253836;
  --primary: #2dd4bf;
  --on-primary: #002722;
  --primary-hover: #5eead4;
  --success: #5ee39b;
  --on-success: #002914;
  --warning: #eab84e;
  --on-warning: #342400;
  --error: #ffb4ab;
  --on-error: #690005;
}

/* Midnight Indigo Light */
:root[data-theme-preset="midnight-indigo"] {
  color-scheme: light;
  --background: #f5f5fb;
  --foreground: #131424;
  --on-background: #131424;
  --surface: #ffffff;
  --surface-dim: #ebebf5;
  --surface-bright: #ffffff;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f0f0f9;
  --surface-container: #e8e8f4;
  --surface-container-high: #dedeed;
  --surface-container-highest: #d2d2e5;
  --on-surface: #131424;
  --on-surface-variant: #474966;
  --outline: #65688a;
  --outline-variant: #c3c5dc;
  --primary: #4338ca;
  --on-primary: #ffffff;
  --primary-hover: #3730a3;
  --success: #137333;
  --on-success: #ffffff;
  --warning: #855700;
  --on-warning: #ffffff;
  --error: #ba1a1a;
  --on-error: #ffffff;
}

/* Midnight Indigo Dark */
.dark[data-theme-preset="midnight-indigo"] {
  color-scheme: dark;
  --background: #0c0d16;
  --foreground: #e3e4f0;
  --on-background: #e3e4f0;
  --surface: #0c0d16;
  --surface-dim: #080810;
  --surface-bright: #323344;
  --surface-container-lowest: #080810;
  --surface-container-low: #121320;
  --surface-container: #171828;
  --surface-container-high: #1f2134;
  --surface-container-highest: #282a40;
  --on-surface: #e3e4f0;
  --on-surface-variant: #9aa0c0;
  --outline: #757a9e;
  --outline-variant: #2b2d45;
  --primary: #8da2fb;
  --on-primary: #101442;
  --primary-hover: #aab9fc;
  --success: #4ade80;
  --on-success: #00290f;
  --warning: #fbbf24;
  --on-warning: #372000;
  --error: #ffb4ab;
  --on-error: #690005;
}

@theme inline {
  --font-sans: var(--font-body-face);
  --font-mono: var(--font-data-face);
  --font-display: var(--font-heading-face);

  --color-background: var(--background);
  --color-on-background: var(--on-background);
  --color-surface: var(--surface);
  --color-surface-dim: var(--surface-dim);
  --color-surface-bright: var(--surface-bright);
  --color-surface-container-lowest: var(--surface-container-lowest);
  --color-surface-container-low: var(--surface-container-low);
  --color-surface-container: var(--surface-container);
  --color-surface-container-high: var(--surface-container-high);
  --color-surface-container-highest: var(--surface-container-highest);
  --color-on-surface: var(--on-surface);
  --color-on-surface-variant: var(--on-surface-variant);
  --color-outline: var(--outline);
  --color-outline-variant: var(--outline-variant);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-primary-hover: var(--primary-hover);
  --color-success: var(--success);
  --color-on-success: var(--on-success);
  --color-warning: var(--warning);
  --color-on-warning: var(--on-warning);
  --color-error: var(--error);
  --color-on-error: var(--on-error);

  --color-foreground: var(--foreground);
  --color-card: var(--surface-container);
  --color-card-foreground: var(--on-surface);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--on-surface);
  --color-border: var(--outline-variant);
  --color-input: var(--outline-variant);
  --color-ring: var(--primary);
  --color-muted: var(--surface-dim);
  --color-muted-foreground: var(--on-surface-variant);
  --color-secondary: var(--surface-container-high);
  --color-secondary-foreground: var(--on-surface);
  --color-destructive: var(--error);
  --color-destructive-foreground: var(--on-error);

  --radius-sm: 0.125rem;
  --radius-DEFAULT: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;
}

@layer base {
  :focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  body {
    background-color: var(--background);
    color: var(--on-background);
    font-family: var(--font-body-face);
    @apply antialiased min-h-screen selection:bg-primary/30;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading-face);
    letter-spacing: -0.01em;
  }
}
```

- [ ] **Step 2: Update `frontend/src/lib/chart-colors.ts` with CSS variable mappings**

Change fixed hex constants for axis, grid, tooltip, and active series to CSS variables so charts adapt dynamically to theme presets and modes:

```ts
// High-contrast traffic pair: original blue ingress / orange egress.
export const CHART_IN = "#3b82f6";      // ingress / received — original blue
export const CHART_OUT = "#f97316";     // egress — warm orange
export const CHART_ACTIVE = "var(--primary)";
export const CHART_GRID = "var(--outline-variant)";
export const CHART_AXIS = "var(--on-surface-variant)";
export const CHART_TOOLTIP_BG = "var(--surface-container-low)";
export const CHART_TOOLTIP_BORDER = "var(--outline-variant)";
export const CHART_EDGE = "var(--outline)";
export const CHART_EDGE_FADED = "var(--outline-variant)";
```

- [ ] **Step 3: Verify CSS tokens build cleanly**

Run: `cd frontend && npm run build`
Expected: Production build succeeds with 0 compile errors.

- [ ] **Step 4: Commit CSS and chart color changes**

```bash
git add frontend/src/app/globals.css frontend/src/lib/chart-colors.ts
git commit -m "style: define theme preset tokens and dynamic chart color variables"
```

---

### Task 2: Backend Data Model, Migration, and Backfill

**Files:**
- Modify: `backend-go/internal/models/user.go`
- Modify: `backend-go/internal/database/database.go`
- Modify: `backend-go/internal/api/users.go`

- [ ] **Step 1: Update `models.User` in `backend-go/internal/models/user.go`**

Add preset/mode constants, validation helpers, and the two fields to the struct:

```go
package models

import (
	"time"
)

const (
	ThemePresetGraphiteMono   = "graphite-mono"
	ThemePresetSignalBlue     = "signal-blue"
	ThemePresetNetworkTeal    = "network-teal"
	ThemePresetMidnightIndigo = "midnight-indigo"

	ColorModeDark  = "dark"
	ColorModeLight = "light"
)

func IsValidThemePreset(p string) bool {
	switch p {
	case ThemePresetGraphiteMono, ThemePresetSignalBlue, ThemePresetNetworkTeal, ThemePresetMidnightIndigo:
		return true
	default:
		return false
	}
}

func IsValidColorMode(m string) bool {
	switch m {
	case ColorModeDark, ColorModeLight:
		return true
	default:
		return false
	}
}

type User struct {
	ID             uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Username       string     `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Email          string     `gorm:"size:255;uniqueIndex" json:"email"`
	HashedPassword string     `gorm:"size:255;not null" json:"-"`
	IsActive       bool       `gorm:"default:true;not null" json:"is_active"`
	IsAdmin        bool       `gorm:"default:false;not null" json:"is_admin"`
	ThemePreset    string     `gorm:"size:32;default:'graphite-mono';not null" json:"theme_preset"`
	ColorMode      string     `gorm:"size:16;default:'dark';not null" json:"color_mode"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;not null" json:"created_at"`
	LastLogin      *time.Time `json:"last_login"`
}

// TableName overrides the table name used by User to `users`
func (User) TableName() string {
	return "users"
}
```

- [ ] **Step 2: Update `backend-go/internal/database/database.go` with migration backfill and admin seed defaults**

In `database.Connect()`:
1. After `database.AutoMigrate(&models.ScraperSettings{}, &models.User{}, &models.ASMapping{})`, run backfill statements:
```go
// Backfill legacy users with default theme preferences
database.Model(&models.User{}).
	Where("theme_preset IS NULL OR theme_preset = ''").
	Update("theme_preset", models.ThemePresetGraphiteMono)
database.Model(&models.User{}).
	Where("color_mode IS NULL OR color_mode = ''").
	Update("color_mode", models.ColorModeDark)
```
2. When creating the default admin account:
```go
database.Create(&models.User{
	Username:       "admin",
	HashedPassword: string(hashed),
	IsAdmin:        true,
	IsActive:       true,
	ThemePreset:    models.ThemePresetGraphiteMono,
	ColorMode:      models.ColorModeDark,
})
```

- [ ] **Step 3: Update `backend-go/internal/api/users.go` for new user creation and public response**

In `backend-go/internal/api/users.go`:
1. In `userPublic(u *models.User) gin.H`:
```go
func userPublic(u *models.User) gin.H {
	preset := u.ThemePreset
	if preset == "" {
		preset = models.ThemePresetGraphiteMono
	}
	mode := u.ColorMode
	if mode == "" {
		mode = models.ColorModeDark
	}
	return gin.H{
		"id":           u.ID,
		"username":     u.Username,
		"email":        u.Email,
		"is_admin":     u.IsAdmin,
		"is_active":    u.IsActive,
		"theme_preset": preset,
		"color_mode":   mode,
		"created_at":   u.CreatedAt,
		"last_login":   u.LastLogin,
	}
}
```
2. In `users.POST`: explicitly set defaults when creating new accounts:
```go
user := models.User{
	Username:       req.Username,
	Email:          req.Email,
	HashedPassword: string(hashed),
	IsAdmin:        req.IsAdmin,
	IsActive:       true,
	ThemePreset:    models.ThemePresetGraphiteMono,
	ColorMode:      models.ColorModeDark,
}
```

- [ ] **Step 4: Verify backend compilation**

Run: `cd backend-go && go build ./...`
Expected: Compilation exits 0.

- [ ] **Step 5: Commit model and database updates**

```bash
git add backend-go/internal/models/user.go backend-go/internal/database/database.go backend-go/internal/api/users.go
git commit -m "feat(backend): add theme_preset and color_mode to user model with backfill"
```

---

### Task 3: Backend API Endpoints (GET & PATCH /api/v1/auth/me) with Tests

**Files:**
- Modify: `backend-go/internal/api/auth.go`
- Modify: `backend-go/internal/api/auth_test.go`
- Modify: `docs/API.md`
- Modify: `docs/openapi.yaml`

- [ ] **Step 1: Write unit tests in `backend-go/internal/api/auth_test.go`**

Add comprehensive tests using in-memory SQLite and Gin test router covering:
- `GET /api/v1/auth/me` returning `theme_preset` and `color_mode`.
- Valid `PATCH /api/v1/auth/me` persisting changes and returning the updated user object.
- Invalid preset (e.g., `invalid-theme`) returning `400 Bad Request`.
- Invalid mode (e.g., `sepia`) returning `400 Bad Request`.
- Missing fields returning `400 Bad Request`.
- Account isolation: user A's theme patch does not alter user B's preferences.

Add to `backend-go/internal/api/auth_test.go`:
```go
package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("Failed to migrate test db: %v", err)
	}
	database.DB = db
	JWTSecret = []byte("test-secret-key-32-chars-long!!")
	accessTokenTTL = 60 * time.Minute
	return db
}

func createTestUser(t *testing.T, db *gorm.DB, username string) models.User {
	u := models.User{
		Username:    username,
		Email:       username + "@test.local",
		IsActive:    true,
		IsAdmin:     false,
		ThemePreset: models.ThemePresetGraphiteMono,
		ColorMode:   models.ColorModeDark,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}
	return u
}

func makeAuthToken(username string, isAdmin bool) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":      username,
		"exp":      time.Now().Add(accessTokenTTL).Unix(),
		"is_admin": isAdmin,
		"type":     "access",
	})
	tokenStr, _ := token.SignedString(JWTSecret)
	return tokenStr
}

func TestAuthMeThemeFlow(t *testing.T) {
	db := setupTestDB(t)
	userA := createTestUser(t, db, "usera")
	userB := createTestUser(t, db, "userb")

	router := gin.New()
	apiGroup := router.Group("/api/v1")
	RegisterAuthRoutes(apiGroup)

	tokenA := makeAuthToken(userA.Username, false)
	tokenB := makeAuthToken(userB.Username, false)

	// 1. GET /api/v1/auth/me returns default theme
	req, _ := http.NewRequest("GET", "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenA)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me status = %d; want 200", w.Code)
	}
	var resBody map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resBody)
	if resBody["theme_preset"] != "graphite-mono" || resBody["color_mode"] != "dark" {
		t.Fatalf("GET /auth/me unexpected theme: %v", resBody)
	}

	// 2. PATCH /api/v1/auth/me with invalid preset returns 400
	invalidPayload := []byte(`{"theme_preset":"non-existent","color_mode":"dark"}`)
	req, _ = http.NewRequest("PATCH", "/api/v1/auth/me", bytes.NewBuffer(invalidPayload))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("PATCH with invalid preset code = %d; want 400", w.Code)
	}

	// 3. PATCH /api/v1/auth/me with invalid mode returns 400
	invalidModePayload := []byte(`{"theme_preset":"signal-blue","color_mode":"sepia"}`)
	req, _ = http.NewRequest("PATCH", "/api/v1/auth/me", bytes.NewBuffer(invalidModePayload))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("PATCH with invalid mode code = %d; want 400", w.Code)
	}

	// 4. Valid PATCH /api/v1/auth/me updates User A
	validPayload := []byte(`{"theme_preset":"network-teal","color_mode":"light"}`)
	req, _ = http.NewRequest("PATCH", "/api/v1/auth/me", bytes.NewBuffer(validPayload))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("PATCH status = %d; want 200, body: %s", w.Code, w.Body.String())
	}
	var patchRes map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &patchRes)
	if patchRes["theme_preset"] != "network-teal" || patchRes["color_mode"] != "light" {
		t.Fatalf("PATCH returned wrong preferences: %v", patchRes)
	}

	// 5. Account isolation check: User B's preferences must remain unchanged
	req, _ = http.NewRequest("GET", "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenB)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me User B status = %d; want 200", w.Code)
	}
	var resB map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resB)
	if resB["theme_preset"] != "graphite-mono" || resB["color_mode"] != "dark" {
		t.Fatalf("User B's theme was mutated: %v", resB)
	}
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend-go && go test -v -run TestAuthMeThemeFlow ./internal/api`
Expected: Compilation error or test failure because `PATCH /auth/me` is not registered yet.

- [ ] **Step 3: Implement `GET /me` extension and `PATCH /me` in `backend-go/internal/api/auth.go`**

In `backend-go/internal/api/auth.go`:
1. Update `protected.GET("/me")` to return `theme_preset` and `color_mode`:
```go
	protected.GET("/me", func(c *gin.Context) {
		username, _ := c.Get("username")
		var user models.User
		if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		preset := user.ThemePreset
		if preset == "" {
			preset = models.ThemePresetGraphiteMono
		}
		mode := user.ColorMode
		if mode == "" {
			mode = models.ColorModeDark
		}

		c.JSON(http.StatusOK, gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"is_active":    user.IsActive,
			"is_admin":     user.IsAdmin,
			"theme_preset": preset,
			"color_mode":   mode,
			"created_at":   user.CreatedAt,
			"last_login":   user.LastLogin,
		})
	})
```
2. Add `protected.PATCH("/me")`:
```go
	type UpdateThemeRequest struct {
		ThemePreset string `json:"theme_preset" binding:"required"`
		ColorMode   string `json:"color_mode" binding:"required"`
	}

	protected.PATCH("/me", func(c *gin.Context) {
		var req UpdateThemeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: theme_preset and color_mode are required"})
			return
		}

		if !models.IsValidThemePreset(req.ThemePreset) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theme_preset. Allowed: graphite-mono, signal-blue, network-teal, midnight-indigo"})
			return
		}

		if !models.IsValidColorMode(req.ColorMode) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid color_mode. Allowed: dark, light"})
			return
		}

		username, _ := c.Get("username")
		var user models.User
		if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if err := database.DB.Model(&user).Updates(map[string]interface{}{
			"theme_preset": req.ThemePreset,
			"color_mode":   req.ColorMode,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theme preferences"})
			return
		}

		user.ThemePreset = req.ThemePreset
		user.ColorMode = req.ColorMode

		c.JSON(http.StatusOK, gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"is_active":    user.IsActive,
			"is_admin":     user.IsAdmin,
			"theme_preset": user.ThemePreset,
			"color_mode":   user.ColorMode,
			"created_at":   user.CreatedAt,
			"last_login":   user.LastLogin,
		})
	})
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `cd backend-go && go test -v -run TestAuthMeThemeFlow ./internal/api`
Expected: PASS

Run all backend tests: `cd backend-go && go test ./...`
Expected: All packages pass.

- [ ] **Step 5: Document endpoints in `docs/API.md` and `docs/openapi.yaml`**

1. In `docs/API.md`: Document `GET /api/v1/auth/me` updated response with `theme_preset` and `color_mode`, and add `PATCH /api/v1/auth/me` description with request/response schema.
2. In `docs/openapi.yaml`: Add `/auth/me` PATCH operation with request body containing `theme_preset` (enum) and `color_mode` (enum), and update the 200 response User schema.

- [ ] **Step 6: Commit backend API changes and documentation**

```bash
git add backend-go/internal/api/auth.go backend-go/internal/api/auth_test.go docs/API.md docs/openapi.yaml
git commit -m "feat(api): implement and document theme preset in auth/me endpoints"
```

---

### Task 4: Frontend State Architecture (Types, Anti-Flash Script, AuthProvider & ThemeProvider)

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/auth.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/AuthProvider.tsx`
- Modify: `frontend/src/components/ThemeProvider.tsx`
- Modify: `frontend/src/components/ThemeToggle.tsx`

*Caution:* Keep existing uncommitted edits in `frontend/src/lib/types.ts` (such as `BGPPoint`) and `frontend/src/components/AuthProvider.tsx` (such as JSON error parsing). Do not wipe or overwrite them.

- [ ] **Step 1: Update `frontend/src/lib/types.ts` and `frontend/src/lib/auth.ts`**

1. In `frontend/src/lib/types.ts`, add theme preset types:
```ts
export type ThemePreset = "graphite-mono" | "signal-blue" | "network-teal" | "midnight-indigo";
export type ColorMode = "dark" | "light";

export interface UserThemePreference {
  theme_preset: ThemePreset;
  color_mode: ColorMode;
}
```
2. In `frontend/src/lib/auth.ts`, update `interface User`:
```ts
export interface User {
  id: number;
  username: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  theme_preset?: string;
  color_mode?: string;
  created_at: string;
  last_login: string | null;
}
```

- [ ] **Step 2: Update `frontend/src/components/AuthProvider.tsx`**

Expose `updateUser: (user: User) => void` on the existing `AuthContextValue`. Preserve every current member and the existing `login(username, password)` signature:
```tsx
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}
```
In `AuthProvider`:
```tsx
  const updateUser = useCallback((updated: User) => {
    setUserState(updated);
    setUser(updated);
  }, []);
```
Include `updateUser` without dropping the existing authentication flag: `<AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, updateUser }}>`.

- [ ] **Step 3: Update `frontend/src/app/layout.tsx`**

1. Reorder providers to `AuthProvider` → `ThemeProvider` → `RefreshProvider` → `WebSocketProvider` → `LayoutShell`.
2. Update `themeInitScript` to read and allowlist both `jupetrack-theme-preset` and `jupetrack-color-mode`:
```tsx
const themeInitScript = `
try {
  var validPresets = ['graphite-mono', 'signal-blue', 'network-teal', 'midnight-indigo'];
  var preset = localStorage.getItem('jupetrack-theme-preset');
  if (!preset || validPresets.indexOf(preset) === -1) {
    preset = 'graphite-mono';
  }
  var mode = localStorage.getItem('jupetrack-color-mode');
  if (mode !== 'light' && mode !== 'dark') {
    mode = 'dark';
  }
  document.documentElement.dataset.themePreset = preset;
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
} catch (e) {
  document.documentElement.dataset.themePreset = 'graphite-mono';
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
}
`;
```
3. Provider nesting in `RootLayout`:
```tsx
        <AuthProvider>
          <ThemeProvider>
            <RefreshProvider>
              <WebSocketProvider>
                <LayoutShell>{children}</LayoutShell>
              </WebSocketProvider>
            </RefreshProvider>
          </ThemeProvider>
        </AuthProvider>
```

- [ ] **Step 4: Refactor `frontend/src/components/ThemeProvider.tsx`**

Implement full state management with optimistic saves, server sync, rollback on error, and anti-flash localStorage cache:

```tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { authFetch } from "@/lib/auth";
import type { ThemePreset, ColorMode } from "@/lib/types";

export const PRESET_OPTIONS: { id: ThemePreset; name: string; description: string; accent: string; darkBg: string }[] = [
  { id: "graphite-mono", name: "Graphite Mono", description: "Neutral chrome; color reserved for status", accent: "#d6dbe0", darkBg: "#0e1012" },
  { id: "signal-blue", name: "Signal Blue", description: "Sharp, familiar NOC palette", accent: "#58a6ff", darkBg: "#0b0f14" },
  { id: "network-teal", name: "Network Teal", description: "Calm, technical network identity", accent: "#2dd4bf", darkBg: "#091313" },
  { id: "midnight-indigo", name: "Midnight Indigo", description: "Modern, low-glare expression", accent: "#8da2fb", darkBg: "#0c0d16" },
];

const PRESET_KEY = "jupetrack-theme-preset";
const MODE_KEY = "jupetrack-color-mode";

interface ThemeContextType {
  themePreset: ThemePreset;
  colorMode: ColorMode;
  theme: ColorMode; // back-compat with existing useTheme().theme
  isSaving: boolean;
  saveError: string | null;
  setThemePreference: (preset: ThemePreset, mode: ColorMode) => Promise<boolean>;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isValidPreset(p: string | null): p is ThemePreset {
  return p === "graphite-mono" || p === "signal-blue" || p === "network-teal" || p === "midnight-indigo";
}

function isValidMode(m: string | null): m is ColorMode {
  return m === "dark" || m === "light";
}

function applyThemeToDOM(preset: ThemePreset, mode: ColorMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.themePreset = preset;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();

  const [themePreset, setThemePreset] = useState<ThemePreset>(() => {
    if (typeof window === "undefined") return "graphite-mono";
    const cached = localStorage.getItem(PRESET_KEY);
    return isValidPreset(cached) ? cached : "graphite-mono";
  });

  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    if (typeof window === "undefined") return "dark";
    const cached = localStorage.getItem(MODE_KEY);
    return isValidMode(cached) ? cached : "dark";
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Synchronize DOM on state change
  useEffect(() => {
    applyThemeToDOM(themePreset, colorMode);
    localStorage.setItem(PRESET_KEY, themePreset);
    localStorage.setItem(MODE_KEY, colorMode);
  }, [themePreset, colorMode]);

  // Synchronize from authenticated server profile
  const lastSyncedUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      lastSyncedUser.current = null;
      return;
    }
    const userKey = `${user.id}:${user.theme_preset}:${user.color_mode}`;
    if (lastSyncedUser.current === userKey) return;
    lastSyncedUser.current = userKey;

    const serverPreset = isValidPreset(user.theme_preset ?? null) ? (user.theme_preset as ThemePreset) : "graphite-mono";
    const serverMode = isValidMode(user.color_mode ?? null) ? (user.color_mode as ColorMode) : "dark";

    setThemePreset(serverPreset);
    setColorMode(serverMode);
  }, [user]);

  const setThemePreference = useCallback(async (newPreset: ThemePreset, newMode: ColorMode): Promise<boolean> => {
    const prevPreset = themePreset;
    const prevMode = colorMode;

    // 1. Optimistic apply
    setThemePreset(newPreset);
    setColorMode(newMode);
    setSaveError(null);

    // If unauthenticated, only persist to localStorage
    if (!user) return true;

    // 2. Persist to backend
    setIsSaving(true);
    try {
      const res = await authFetch("/api/proxy/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          theme_preset: newPreset,
          color_mode: newMode,
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to save theme preferences";
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const updatedUser = await res.json();
      updateUser(updatedUser);
      setIsSaving(false);
      return true;
    } catch (err: unknown) {
      // Rollback on failure
      setThemePreset(prevPreset);
      setColorMode(prevMode);
      applyThemeToDOM(prevPreset, prevMode);
      const msg = err instanceof Error ? err.message : "Failed to save theme";
      setSaveError(msg);
      setIsSaving(false);
      return false;
    }
  }, [themePreset, colorMode, user, updateUser]);

  const toggleTheme = useCallback(() => {
    const nextMode: ColorMode = colorMode === "dark" ? "light" : "dark";
    setThemePreference(themePreset, nextMode);
  }, [colorMode, themePreset, setThemePreference]);

  return (
    <ThemeContext.Provider
      value={{
        themePreset,
        colorMode,
        theme: colorMode,
        isSaving,
        saveError,
        setThemePreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
```

- [ ] **Step 5: Verify `ThemeToggle.tsx` compatibility**

Confirm `ThemeToggle.tsx` calls `toggleTheme()` from `useTheme()` and displays accessible tooltips.

- [ ] **Step 6: Verify frontend builds cleanly**

Run: `cd frontend && npm run build`
Expected: Production build compiles successfully.

- [ ] **Step 7: Commit frontend state architecture changes**

For `types.ts` and `AuthProvider.tsx`, use the theme-only staged-blob procedure from the guardrails. Stage only previously clean files by exact path, inspect the complete staged patch, then commit:

```bash
git add frontend/src/lib/auth.ts frontend/src/app/layout.tsx frontend/src/components/ThemeProvider.tsx frontend/src/components/ThemeToggle.tsx
git diff --cached --check
git commit -m "feat(theme): implement ThemeProvider state, provider order, and anti-flash script"
```

---

### Task 5: Frontend Semantic Color Migration (Remediation of Audited Locations)

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/bgp/page.tsx`
- Modify: `frontend/src/app/interfaces/page.tsx`
- Modify: `frontend/src/app/settings/users/page.tsx`
- Modify: `frontend/src/app/settings/retention/page.tsx`
- Modify: `frontend/src/app/settings/as-mapping/page.tsx`
- Modify: `frontend/src/app/lg/page.tsx`

- [ ] **Step 1: Migrate status indicators in `frontend/src/app/page.tsx`**

Replace `primary` operational status classes with `success`:
- Line 102: `isConnected ? 'border-success/30 bg-success/10 text-success' : 'border-error/30 bg-error/10 text-error'`
- Line 103: `isConnected ? 'bg-success animate-pulse' : 'bg-error'`
- Line 143: `iface.oper_status.toLowerCase() === 'up' ? 'bg-success' : 'bg-error'`
- Line 175: `downPeers ? 'bg-error/10 text-error' : 'bg-success/10 text-success'`
- Line 189: `established ? 'bg-success' : 'bg-error'`
- Line 196: `established ? 'bg-success/10 text-success' : 'bg-error/10 text-error'`

- [ ] **Step 2: Migrate status indicators in `frontend/src/app/bgp/page.tsx`**

- Lines 197-198: Peer status badge and dot:
```tsx
<Badge variant={isUp ? 'default' : 'destructive'} className={`gap-1.5 rounded ${isUp ? 'bg-success/10 text-success border-none' : 'bg-error/10 text-error border-none'}`}>
  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-success animate-pulse' : 'bg-error'}`}></span>
```
- Lines 244-245: Selected peer drawer status badge and dot:
```tsx
<Badge className={`text-xs font-normal gap-1 rounded ${selectedPeer.state === "Established" ? 'bg-success/10 text-success border-none' : 'bg-error/10 text-error border-none'}`}>
  <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${selectedPeer.state === "Established" ? 'bg-success animate-pulse' : 'bg-error'}`}></span>
```

- [ ] **Step 3: Migrate status indicators in `frontend/src/app/interfaces/page.tsx`**

- Line 252: `isUp(group.physical) ? 'bg-success' : 'bg-error'`
- Line 274: `isUp(selectedGroup.physical) ? 'bg-success/10 text-success' : 'bg-error/10 text-error'`
- Line 375: `up ? 'bg-success' : 'bg-error'`

- [ ] **Step 4: Migrate status indicators in `frontend/src/app/settings/users/page.tsx`**

- Line 447: `<CheckCircle2 size={14} className="text-success" aria-hidden="true" />`
- Line 925: `u.is_active ? "bg-success/10 text-success border-success/20" : "bg-error/10 text-error border-error/20"`
- Line 934: `u.is_active ? "bg-success" : "bg-error"`

- [ ] **Step 5: Migrate status indicators in `frontend/src/app/settings/retention/page.tsx`, `as-mapping/page.tsx`, and `lg/page.tsx`**

- `retention/page.tsx:479`: `type === "success" ? "border-success/30 bg-success/10 text-success" : "border-error/30 bg-error/10 text-error"`
- `retention/page.tsx:558`: `status?.enabled ? "bg-success animate-pulse" : "bg-error"`
- `as-mapping/page.tsx:410, 413, 419`: Success alert banner `border-success/30 bg-success/10 text-success` and `CheckCircle2` `text-success`.
- `lg/page.tsx:615`: `isSuccess && "bg-success/10 text-success"`.

- [ ] **Step 6: Verify frontend compiles with new semantic tokens**

Run: `cd frontend && npm run build`
Expected: Build passes with all static and dynamic routes compiled.

- [ ] **Step 7: Commit semantic color migrations**

For files that were already dirty before this task, use the theme-only staged-blob procedure from the guardrails instead of `git add`. For previously clean files, stage exact paths only. Verify `git diff --cached --name-only` and `git diff --cached` before committing.

```bash
git add frontend/src/app/page.tsx frontend/src/app/settings/users/page.tsx frontend/src/app/settings/retention/page.tsx frontend/src/app/settings/as-mapping/page.tsx frontend/src/app/lg/page.tsx
# Stage theme-only blobs for pre-dirty bgp/page.tsx and interfaces/page.tsx.
git diff --cached --check
git commit -m "fix(ui): migrate operational status and success indicators from primary to semantic tokens"
```

---

### Task 6: Settings Appearance UI and RBAC Decoupling

**Files:**
- Modify: `frontend/src/lib/rbac.ts`
- Modify: `frontend/src/components/ui/Sidebar.tsx`
- Modify: `frontend/src/app/settings/page.tsx`

*Caution:* Preserve existing dirty user edits in `frontend/src/app/settings/page.tsx` (such as the error message parsing logic). Do not overwrite or discard them.

- [ ] **Step 1: Update `frontend/src/lib/rbac.ts`**

Change `ADMIN_PATHS` from `["/settings"]` to target only the admin child routes:
```ts
/** Route prefixes that require an admin (is_admin) user. */
export const ADMIN_PATHS = [
  "/settings/users",
  "/settings/retention",
  "/settings/as-mapping",
] as const;
```

- [ ] **Step 2: Update `frontend/src/components/ui/Sidebar.tsx`**

Rename the sidebar navigation entry from "Device Settings" to "Settings":
```tsx
    {
      title: "Configuration",
      items: [
        { name: 'Settings', path: '/settings', icon: Settings },
        { name: 'User Management', path: '/settings/users', icon: Users },
        { name: 'Data Retention', path: '/settings/retention', icon: Archive },
        { name: 'AS Mappings', path: '/settings/as-mapping', icon: Bookmark },
      ]
    }
```

- [ ] **Step 3: Update `frontend/src/app/settings/page.tsx`**

1. Merge `Palette`, `Sun`, and `Moon` into the existing `lucide-react` import. Add the ThemeProvider import; no separate theme type import is needed in this page:
```tsx
import { useTheme, PRESET_OPTIONS } from "@/components/ThemeProvider";
```
Immediately after `const { user: me } = useAuth();`, declare the values used by the Appearance card:
```tsx
  const {
    themePreset,
    colorMode,
    isSaving: isThemeSaving,
    saveError: themeSaveError,
    setThemePreference,
  } = useTheme();
```
2. Remove top-level blocking guard:
```tsx
// REMOVE:
// if (me && !isAdmin(me)) {
//   return null;
// }
```
3. Guard `fetchSettings` so `/settings/device` is only fetched when `isAdmin(me)`:
```tsx
  useEffect(() => {
    if (me && isAdmin(me)) {
      fetchSettings();
    } else {
      setIsLoading(false);
    }
  }, [me, fetchSettings]);
```
4. Insert the Appearance card at the very top of the page content:
```tsx
      {/* Appearance Settings Card (Self-Service) */}
      <Card className="border-outline-variant bg-surface-container-low">
        <CardHeader>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <span className="h-px w-5 bg-primary" aria-hidden="true" />
            Personal Preferences
          </div>
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <Palette className="size-5 text-primary" aria-hidden="true" />
            Appearance
          </CardTitle>
          <CardDescription className="text-on-surface-variant">
            Choose your preferred color theme preset and mode. Saved to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preset Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Theme Preset
            </label>
            <div
              role="radiogroup"
              aria-label="Theme Preset Selection"
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = themePreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isThemeSaving}
                    onClick={() => setThemePreference(opt.id, colorMode)}
                    className={cn(
                      "flex min-h-[44px] flex-col justify-between rounded border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                      isSelected
                        ? "border-primary bg-surface-container-high ring-1 ring-primary"
                        : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-on-surface">{opt.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-3.5 rounded-full border border-outline-variant"
                          style={{ backgroundColor: opt.accent }}
                          title="Accent preview"
                        />
                        <span
                          className="size-3.5 rounded-full border border-outline-variant"
                          style={{ backgroundColor: opt.darkBg }}
                          title="Dark background preview"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-on-surface-variant">{opt.description}</p>
                    <span className="mt-3 text-[11px] font-mono font-medium text-primary">
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Color Mode
            </label>
            <div
              role="radiogroup"
              aria-label="Color Mode Selection"
              className="mt-3 flex max-w-xs rounded border border-outline-variant bg-surface-container p-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={colorMode === "dark"}
                disabled={isThemeSaving}
                onClick={() => setThemePreference(themePreset, "dark")}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  colorMode === "dark"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Moon className="size-4" aria-hidden="true" />
                Dark
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={colorMode === "light"}
                disabled={isThemeSaving}
                onClick={() => setThemePreference(themePreset, "light")}
                className={cn(
                  "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  colorMode === "light"
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Sun className="size-4" aria-hidden="true" />
                Light
              </button>
            </div>
          </div>

          {/* Feedback & Live Status */}
          <div aria-live="polite" className="text-xs">
            {isThemeSaving && (
              <span className="text-on-surface-variant animate-pulse">Saving appearance preferences…</span>
            )}
            {themeSaveError && (
              <span className="text-error font-medium">{themeSaveError}</span>
            )}
          </div>
        </CardContent>
      </Card>
```
5. Wrap the entire Device Settings header, form, and supporting administration cards with `me && isAdmin(me) ? (...) : null`.
6. Update the success message styling in `settings/page.tsx:241` from `primary` to `success`.

- [ ] **Step 4: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit settings and RBAC changes**

For `settings/page.tsx`, use the theme-only staged-blob procedure from the guardrails because the file was dirty before this task. Stage the clean RBAC files normally, inspect the staged patch, then commit:

```bash
git add frontend/src/lib/rbac.ts frontend/src/components/ui/Sidebar.tsx
git diff --cached --check
git commit -m "feat(settings): add self-service Appearance cards and decouple RBAC for /settings"
```

---

### Task 7: Comprehensive Verification & Documentation

**Files:**
- Verification only

- [ ] **Step 1: Execute backend checks**

Run:
```bash
cd backend-go
gofmt -w internal/models/user.go internal/database/database.go internal/api/auth.go internal/api/users.go internal/api/auth_test.go
go test -v ./...
go vet ./...
go build ./...
```
Expected results:
- All unit tests pass (`PASS`).
- `go vet` produces no warnings.
- `go build` compiles cleanly.

- [ ] **Step 2: Execute frontend production build check**

Run:
```bash
cd frontend
npm run build
```
Expected results:
- Production Next.js build passes cleanly.

- [ ] **Step 3: End-to-End Browser & Theme Verification Checklist**

Perform browser checks using mock authentication or browser developer tools:
1. **First-paint Anti-Flash:** Verify `document.documentElement.dataset.themePreset` and `.dark` class match `localStorage` before paint.
2. **Profile Precedence:** Verify `/auth/me` response immediately applies the account preset if cache is stale.
3. **8 Theme Combinations:** Switch between all 4 presets in both Dark and Light mode. Verify text contrast, cards, borders, and sidebar readability.
4. **Chart Legibility:** Navigate to `/interfaces` and `/bgp`. Verify chart axes, grids, and tooltips are legible across all presets without broken contrast.
5. **Non-Admin RBAC:** Log in with a non-admin account:
   - Navigate to `/settings`: verify Appearance card is usable.
   - Verify device settings header, form, and credentials are completely omitted.
   - Verify network tab contains no request to `/api/proxy/settings/device`.
   - Direct navigation to `/settings/users` or `/settings/retention` is blocked by `AdminGuard`.
6. **Admin Retained Controls:** Log in as admin: verify both Appearance card and Device Settings form render and function properly.
7. **Rollback on Error:** Simulate a network failure on `PATCH /api/proxy/auth/me`. Verify UI visibly reverts to previous selection and displays error message.

- [ ] **Step 4: Final git status sanity check**

Run: `git status`
Expected results:
- No unexpected files modified.
- Dirty user edits in `types.ts`, `AuthProvider.tsx`, and `settings/page.tsx` preserved cleanly.
- No artifacts under `archive/` or `grafana/` touched.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-15-account-theme-presets.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Fresh subagent per task, review checkpoints, rapid parallel/iterative execution.
2. **Inline Execution** - Execute tasks sequentially in this session with verification checkpoints.

Which approach would you like to take?

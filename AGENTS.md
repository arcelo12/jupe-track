# AGENTS.md

Guidance for agentic coding tools working in this repository.

## Project Overview

JupeTrack is a monitoring dashboard for Juniper MX204 edge routers. It talks to
the device over NETCONF (SSH) to collect BGP, interface, and routing-policy data,
stores time-series metrics in VictoriaMetrics, and serves a Next.js UI.

The system has three runtime services (see `docker-compose.yml`):

- `jupetrack` — Next.js frontend, exposed on host port `3040` (container `3040`).
- `backend-go` — Go API + background scraper, exposed on host port `8085` (container `8080`).
- `victoriametrics` — time-series DB, exposed on host port `8428`.

Note: an older Python/FastAPI backend exists under `archive/backend/`. It is
**legacy and not used**. All backend work happens in `backend-go/`.

## Repository Layout

```
backend-go/            Go backend (API + scraper)
  cmd/server/main.go   Entrypoint: DB connect, Gin routes, start scraper worker
  cmd/apikey/main.go   CLI: create/list/revoke API keys directly via DB (no JWT)
  internal/api/        Gin HTTP handlers, one file per feature area
  internal/scraper/    NETCONF fetchers, background worker, VictoriaMetrics push
  internal/junos/      NETCONF/SSH session management + RPC/CLI helpers
  internal/cache/      In-memory state cache (BGP, interfaces, device status)
  internal/database/   GORM SQLite connect + automigrate + admin seed
  internal/models/     GORM models (User, ScraperSettings, ASMapping, APIKey)
  internal/utils/      Input sanitization / XML escaping
  data/                Runtime SQLite DB + device_config.json (gitignored)
frontend/              Next.js 16 / React 19 app
  src/app/             App-router pages + API proxy routes
  src/components/      Providers (Auth, WebSocket, Refresh, Theme) + UI
  src/lib/             auth token helpers, shared types, cn() util
archive/backend/       Legacy Python FastAPI backend (DO NOT USE)
docs/                  Screenshots referenced by README
DESIGN.md              Design-system reference (colors, typography, components)
docs/API.md            External API reference (Bahasa Indonesia)
docs/openapi.yaml      OpenAPI 3.0 spec for non-admin endpoints
docs/examples/         Standalone API client examples (Python + Go)
```

## Build, Run, Test

### Full stack (Docker)

```bash
docker compose up -d --build
```

Frontend at `http://localhost:3040`. Backend API at `http://localhost:8085`.

### Backend (Go)

```bash
cd backend-go
go mod download
go mod tidy          # regenerate dependency metadata only when dependencies change
go build ./...       # compile check
go vet ./...         # static analysis
go test ./...        # unit tests
go run cmd/server/main.go   # runs API + scraper on :8080
```

The existing API package has tests. Add focused `_test.go` coverage for new Go
logic and run `go test ./...`.

### Frontend (Next.js)

```bash
cd frontend
npm install --legacy-peer-deps   # peer deps require the legacy flag
npm run dev      # dev server on :3000
npm run build    # production build (run this to verify changes compile)
npm run lint     # eslint (eslint-config-next)
npm start        # serve production build
```

There are no frontend unit tests. Verify changes with `npm run build` and
`npm run lint`. The current lint baseline has pre-existing errors, so do not
claim lint is clean unless the command itself exits successfully.

### Verified runtime checks

The local Docker stack exposes these safe unauthenticated checks:

```bash
curl -fsS http://localhost:8085/health
curl -fsS http://localhost:8085/api/v1/health
curl -fsS http://localhost:3040/login >/dev/null
curl -fsS http://127.0.0.1:8428/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8085/api/v1/live/bgp # 401 without auth
```

Do not exercise authenticated NETCONF, scraper, or looking-glass flows against
a live router without explicit authorization.

## Architecture Notes

### Data flow

1. `scraper` worker (`internal/scraper/worker.go`) runs on a ticker (`ScrapeInterval`,
   default 30s). It only scrapes when `BackgroundScrape` is on OR at least one web
   user is active (tracked via WebSocket connect/heartbeat).
2. Each cycle fetches BGP + interfaces + device status via NETCONF, writes them to
   the in-memory `cache.GlobalCache`, pushes metrics to VictoriaMetrics in
   Prometheus text format, and broadcasts updates over WebSocket.
3. Live endpoints and the dashboard read from the in-memory cache for instant
   responses; historical charts query VictoriaMetrics through the metrics proxy.

### NETCONF sessions

- `internal/junos/ssh.go` keeps a single persistent NETCONF session guarded by
  mutexes. `RunNetconfRPC` retries once on failure by tearing down and
  reconnecting. Prefer `RunNetconfRPC` (native XML RPC) over `RunCLICommand`
  (text-command wrapper) where an RPC exists.
- Device credentials come from env vars (`JUNOS_HOST/USER/PASS/PORT`) and are
  overridden by `data/device_config.json` when present (written by the settings UI).

### Backend circular-dependency pattern

`scraper` cannot import `api` (would cycle), so `api` wires itself into `scraper`
via callback vars set in `websocket.go` `init()`:
`scraper.OnBGPUpdate`, `scraper.OnInterfaceUpdate`, `scraper.GetActiveLogicalSystems`.
Preserve this pattern when adding cross-package hooks.

### Frontend request flow

- The browser never calls the Go backend directly for REST. It calls Next.js
  route handlers under `src/app/api/proxy/[...path]/route.ts`, which forward to
  the Go backend (`INTERNAL_GO_API_URL`, default `http://jupetrack_go:8080`) at
  `/api/v1/...`. TSDB queries proxy through `src/app/api/tsdb/[...path]/route.ts`.
- WebSocket is the exception: `WebSocketProvider` connects directly to
  `ws://<host>:8085/api/v1/ws` with the token in the query string.
- Access token lives in memory only; the refresh token is in `localStorage`.
  Use `authFetch` from `src/lib/auth.ts` for authenticated calls — it auto-refreshes
  on 401.

## Conventions

### Go

- Module path: `github.com/arcelo12/jupe-track/backend-go`.
- Framework: Gin. Register routes with a `RegisterXxxRoutes(r *gin.RouterGroup)`
  function per file in `internal/api`, called from `handlers.go` `SetupRoutes`.
- Protect authenticated routes with `AuthMiddleware()` (JWT bearer). For routes
  that also accept API keys (`X-API-Key` header), use `AuthAnyMiddleware()` plus
  `RequireScope(...)` per endpoint — see `internal/api/apikey.go` header comment.
  API-key management (admin): `POST/GET/PATCH/DELETE /api/v1/api-keys`.
- CORS (`CORSMiddleware`, env `ALLOWED_ORIGINS`) and a global per-client rate
  limit (`GlobalRateLimitMiddleware`, 300 req/min) are registered in
  `cmd/server/main.go` before routes.
- Tabs for indentation (standard Go). Run `gofmt`/`go vet` before finishing.
- JSON API fields are `snake_case` via struct tags.

### Frontend

- Next.js App Router, TypeScript strict mode, path alias `@/*` -> `src/*`.
- Tailwind CSS v4 (config via `@theme` in `globals.css`); components use shadcn-style
  primitives in `src/components/ui`. Use the `cn()` helper for class merging.
- Client components need the `"use client"` directive (all providers/pages here are).
- Follow `DESIGN.md` for colors/typography — dark "Command Center" theme, warm amber
  primary, no cool-tone accents, sharp 4px radius, 1px borders instead of shadows.

## Security

- Sanitize any value interpolated into Junos CLI/RPC with
  `utils.SanitizeJunosInput` (allowlist) or `utils.EscapeXML`. The looking-glass
  and policy handlers depend on this — never build Junos commands from raw input.
- `data/device_config.json` and `.env` hold live device credentials and are
  gitignored. Never commit them or echo secret values.
- `SECRET_KEY`/`JWT_SECRET` must be a strong random value in production; the app
  generates an ephemeral key if unset (invalidates tokens on restart).
- The default admin password is randomly generated on first DB init and printed to
  the backend log once — surface this rather than hardcoding credentials.

## Gotchas

- `backend-go/go.sum` is committed. Do not delete or regenerate it unless Go
  dependencies actually change.
- `ScrapeInterval` is stored as `time.Duration` nanoseconds in the DB (default
  `30000000000`). The frontend converts seconds to ns when syncing settings.
- Interface scraping filters to physical `ge`/`et`/`xe` ports plus their logical
  units; other interfaces are dropped in `scraper.FetchInterfaces`.
- `internal/api/live.go` `RegisterLiveRoutes` is defined but not wired in
  `SetupRoutes`; the live endpoints in use are the inline ones in `handlers.go`.
- The frontend REST and TSDB proxy routes forward `Authorization`, but not
  `X-API-Key`. API-key browser access needs proxy support before it can work.
- `PushToVictoriaMetrics` currently posts to the Docker service hostname
  `http://victoriametrics:8428`; local non-Docker scraper runs need that hostname
  to resolve or need an explicit code/config change.
- Do not modify `archive/backend/` — it is retained for reference only.

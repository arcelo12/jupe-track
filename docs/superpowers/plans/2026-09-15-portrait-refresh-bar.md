# Portrait Auto-Refresh Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portrait refresh popover with an always-visible second header row while preserving desktop controls and refresh behavior.

**Architecture:** `RefreshProvider` remains the only state owner. `HeaderRefreshButton` renders separate responsive presentations over the same state. `LayoutShell` changes from a fixed-height row to a two-row mobile header and a single-row desktop header.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node.js assertions, Playwright acceptance checks.

---

### Task 1: Add a responsive-layout guard

**Files:**
- Create: `frontend/scripts/check-portrait-refresh.mjs`

- [ ] **Step 1: Write the failing check**

Create a Node.js assertion script that reads `HeaderRefreshButton.tsx` and `LayoutShell.tsx`, then requires:

```js
assert(controls.includes('data-portrait-refresh-bar'), 'portrait refresh bar must be identifiable');
assert(!controls.includes('<details'), 'portrait controls must not use a details popover');
assert(controls.includes('xl:hidden'), 'portrait controls must be visible below xl');
assert(controls.includes('hidden items-center gap-4 xl:flex'), 'desktop controls must remain xl-only');
assert(layout.includes('flex-wrap'), 'header must allow a second portrait row');
assert(layout.includes('xl:flex-nowrap'), 'desktop header must remain one row');
```

- [ ] **Step 2: Verify RED**

Run: `cd frontend && node scripts/check-portrait-refresh.mjs`

Expected: FAIL because the current portrait controls use `<details>` and the header does not stack.

### Task 2: Implement the approved portrait bar

**Files:**
- Modify: `frontend/src/components/ui/HeaderRefreshButton.tsx:18-94`
- Modify: `frontend/src/components/ui/LayoutShell.tsx:133-188`

- [ ] **Step 1: Replace the portrait popover**

Render an `xl:hidden` flex row marked `data-portrait-refresh-bar`. It contains two labelled groups and the manual action:

```tsx
<div data-portrait-refresh-bar className="order-3 flex w-full items-end gap-2 border-t border-outline-variant pt-2 xl:hidden">
  <div className="min-w-0 flex-1">Logical System select</div>
  <div className="w-16 shrink-0">Auto Refresh select</div>
  <button className="size-11 shrink-0">Refresh icon plus an `sm:inline` label</button>
</div>
```

Keep both selects at `h-11`. Keep visible labels, existing values, callbacks, accessible button name, spin state, and native select behavior. Delete the `<details>`, `<summary>`, and absolute panel.

- [ ] **Step 2: Stack the header below `xl`**

Use a wrapping header so the responsive elements returned by `HeaderRefreshButton` participate directly in header layout:

```tsx
<header className="flex min-h-16 flex-wrap items-center justify-between gap-y-2 border-b border-outline-variant bg-background px-4 py-2 md:px-8 xl:h-16 xl:flex-nowrap xl:py-0">
```

Give the identity/menu group `order-1`, render `HeaderRefreshButton` directly under the header so its responsive groups can participate in wrapping, and give the theme/password/logout group `order-2 ml-auto xl:order-3 xl:ml-0`. Inside `HeaderRefreshButton`, give the desktop group `order-2 ml-auto` and the portrait row `order-3 basis-full`. Preserve all handlers and desktop control markup.

- [ ] **Step 3: Verify GREEN**

Run: `cd frontend && node scripts/check-portrait-refresh.mjs`

Expected: `check:portrait-refresh OK`.

### Task 3: Verify behavior and presentation

**Files:**
- Verify: `frontend/src/components/ui/HeaderRefreshButton.tsx`
- Verify: `frontend/src/components/ui/LayoutShell.tsx`

- [ ] **Step 1: Run static checks**

```bash
cd frontend
npx eslint src/components/ui/HeaderRefreshButton.tsx src/components/ui/LayoutShell.tsx
npx tsc --noEmit
npm run check:design
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run isolated browser acceptance**

Use the existing isolated Playwright installation (`/root/.jcode/scratch/pwenv/bin/python3` and `/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`) with intercepted auth, settings, logical-system, page-data, manual-refresh, and WebSocket traffic. Do not use live credentials or allow requests to port `8085`. Render at `320x800`, `390x844`, `768x1024`, and `1440x1000`.

Expected below `xl`: visible Logical System, Auto Refresh, and Refresh Now controls; no details/summary popover; no horizontal overflow; each interactive control height at least 44px; interval selection updates visibly; manual refresh remains callable without reaching the backend. Expected at desktop: one-row layout matching the prior structure.

- [ ] **Step 3: Commit only owned files**

```bash
git add frontend/scripts/check-portrait-refresh.mjs \
  frontend/src/components/ui/HeaderRefreshButton.tsx \
  frontend/src/components/ui/LayoutShell.tsx
git commit -m "fix(ui): surface refresh controls on portrait"
```

### Task 4: Deploy and smoke-test

- [ ] **Step 1: Build a tagged frontend image and preserve the current image as rollback**
- [ ] **Step 2: Recreate only the frontend service on port 3040**
- [ ] **Step 3: Verify `/login`, proxy health, auth boundary, active image identity, empty index, untouched user edits, and unchanged Grafana checksum**

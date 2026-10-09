# UI v2: Theme Source, IN/OUT Colors, Sparkline Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make v2 theme consistent across pages (server is the source of truth), color IN/OUT semantically, and replace per-row Recharts mini charts with a memoized SVG sparkline.

**Architecture:** Theme state stays in `ThemeProvider`; load order is fixed so the server value overwrites the local cache. IN/OUT colors are v2-scoped CSS tokens. The per-unit preview becomes a pure SVG `Sparkline` (`React.memo`, last 30 points). Full charts keep Recharts. Everything is scoped to `[data-ui-version="v2"]`; v1 is untouched.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Recharts, Node Playwright (`/root/node_modules/playwright`) for browser checks, `tsc --noEmit` and `npm run build` for compilation.

**Test approach:** No frontend unit test runner exists (AGENTS.md). Verification is `tsc`, `npm run build`, targeted ESLint, and Playwright browser checks with fixtures. Pure logic (point slicing, path math) is tested with a small `assert`-based script run by `node`.

---

## File Structure

- Create: `frontend/src/components/charts/sparkline-math.ts`. Pure functions: `lastPoints(points, n)` and `toPath(values, w, h, max)`. One responsibility, testable in Node.
- Create: `frontend/src/components/charts/Sparkline.tsx`. SVG component using the math module, `React.memo`.
- Create: `frontend/scripts/test-sparkline-math.mjs`. Assert-based check for the math module.
- Modify: `frontend/src/components/ThemeProvider.tsx`. Server overwrites cache on load; `finally` resets `isSaving`; failed PATCH reverts.
- Modify: `frontend/src/app/interfaces/page.tsx` (ClassicView, around lines 361-405). Use `Sparkline` for per-unit preview, add In/Out semantic classes.
- Modify: `frontend/src/app/globals.css`. Add `--ui-in` / `--ui-out` tokens under v2 and `.v2-io-in` / `.v2-io-out` helpers.

---

### Task 1: Pure sparkline math with a runnable check

**Files:**
- Create: `frontend/src/components/charts/sparkline-math.ts`
- Test: `frontend/scripts/test-sparkline-math.mjs`

- [ ] **Step 1: Write the failing check**

Create `frontend/scripts/test-sparkline-math.mjs`:

```js
import assert from "node:assert/strict";
import { lastPoints, toPath } from "../.test-build/sparkline-math.js";

// lastPoints keeps only the newest n items, preserving order.
assert.deepEqual(lastPoints([1, 2, 3, 4, 5], 3), [3, 4, 5]);
assert.deepEqual(lastPoints([1, 2], 30), [1, 2]);
assert.deepEqual(lastPoints([], 30), []);

// toPath: one point -> empty path; two points -> M...L...
assert.equal(toPath([], 100, 40, 10), "");
assert.equal(toPath([5], 100, 40, 10), "");
assert.equal(toPath([0, 10], 100, 40, 10), "M0.00,40.00 L100.00,0.00");

// Values above max are clamped to the top edge.
assert.equal(toPath([0, 99], 100, 40, 10), "M0.00,40.00 L100.00,0.00");

console.log("sparkline-math: ok");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && node scripts/test-sparkline-math.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (module not built yet).

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/components/charts/sparkline-math.ts`:

```ts
/** Keep only the newest `n` points, preserving order. */
export function lastPoints<T>(points: readonly T[], n: number): T[] {
  return points.length <= n ? [...points] : points.slice(points.length - n);
}

/**
 * Build an SVG path for a series. Y is inverted (0 at bottom).
 * Values are clamped to [0, max]. Fewer than 2 values yields "".
 */
export function toPath(values: readonly number[], w: number, h: number, max: number): string {
  if (values.length < 2) return "";
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const clamped = Math.min(Math.max(v, 0), max);
      const y = h - (clamped / max) * h;
      return `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
```

- [ ] **Step 4: Build the module and run the check**

The check imports compiled output. Compile with `tsc` to a scratch folder:

Run: `cd frontend && npx tsc src/components/charts/sparkline-math.ts --outDir .test-build --module esnext --target es2020 --moduleResolution node --skipLibCheck && node scripts/test-sparkline-math.mjs`
Expected: PASS, prints `sparkline-math: ok`.

Note: `toPath([0,10],100,40,10)` gives `M0.00,40.00 L100.00,0.00`. `toPath([0,99],…)` clamps 99 to 10 so y = 0.00, matching the assertion.

- [ ] **Step 5: Commit**

```bash
cd /root/jupe-track
echo ".test-build/" >> frontend/.gitignore
git add frontend/src/components/charts/sparkline-math.ts frontend/scripts/test-sparkline-math.mjs frontend/.gitignore
git commit -m "feat(v2): pure sparkline math with runnable check"
```

---

### Task 2: Sparkline component

**Files:**
- Create: `frontend/src/components/charts/Sparkline.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/charts/Sparkline.tsx`:

```tsx
"use client";

import React from "react";
import { lastPoints, toPath } from "./sparkline-math";

export interface SparkPoint {
  in_mbps: number;
  out_mbps: number;
}

interface SparklineProps {
  points: SparkPoint[];
  width?: number;
  height?: number;
  /** Max points drawn. Constant cost regardless of history length. */
  limit?: number;
}

function SparklineImpl({ points, width = 128, height = 48, limit = 30 }: SparklineProps) {
  const recent = lastPoints(points, limit);
  if (recent.length < 2) return null;
  const max = Math.max(1, ...recent.map(p => Math.max(p.in_mbps, p.out_mbps)));
  const inPath = toPath(recent.map(p => p.in_mbps), width, height, max);
  const outPath = toPath(recent.map(p => p.out_mbps), width, height, max);
  return (
    <svg
      role="img"
      aria-label="Traffic trend, last 30 samples"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
    >
      <path d={inPath} fill="none" stroke="var(--ui-in)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d={outPath} fill="none" stroke="var(--ui-out)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Memoized: re-renders only when the points array reference or its length changes. */
export const Sparkline = React.memo(SparklineImpl, (prev, next) =>
  prev.points === next.points &&
  prev.width === next.width &&
  prev.height === next.height &&
  prev.limit === next.limit
);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit && echo TSC_OK`
Expected: `TSC_OK`.

- [ ] **Step 3: Commit**

```bash
cd /root/jupe-track
git add frontend/src/components/charts/Sparkline.tsx
git commit -m "feat(v2): memoized SVG sparkline for per-unit traffic"
```

---

### Task 3: IN/OUT tokens and classes (v2 only)

**Files:**
- Modify: `frontend/src/app/globals.css` (inside the v2 block, after the existing `:root[data-ui-version="v2"]` and `.dark[data-ui-version="v2"]` blocks)

- [ ] **Step 1: Add the tokens and helpers**

Append to `frontend/src/app/globals.css`:

```css
/* v2 semantic traffic colors. In = green, Out = orange (decision B1). */
:root[data-ui-version="v2"] {
  --ui-in: #15803d;
  --ui-out: #c2410c;
}
.dark[data-ui-version="v2"] {
  --ui-in: #22c55e;
  --ui-out: #f97316;
}
[data-ui-version="v2"] .v2-io-in { color: var(--ui-in); }
[data-ui-version="v2"] .v2-io-out { color: var(--ui-out); }
```

- [ ] **Step 2: Verify compile**

Run: `cd frontend && npm run build > $JCODE_SCRATCH_DIR/b1.log 2>&1; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 3: Commit**

```bash
cd /root/jupe-track
git add frontend/src/app/globals.css
git commit -m "style(v2): semantic IN/OUT traffic tokens"
```

---

### Task 4: Use sparkline and IN/OUT colors in the Classic view

**Files:**
- Modify: `frontend/src/app/interfaces/page.tsx` (imports near line 1-20; ClassicView around lines 376-383 and the unit hover preview at line 386)

- [ ] **Step 1: Add the import**

In `frontend/src/app/interfaces/page.tsx`, add after the `InterfaceTrafficChart` import:

```tsx
import { Sparkline } from '@/components/charts/Sparkline';
```

- [ ] **Step 2: Replace the per-unit hover Recharts with Sparkline**

In the `TableCell` that holds the unit `bps_in` hover preview, replace this block:

```tsx
{hoveredIface === unit.name && unitHistory.length > 1 && <div className="absolute right-full top-1/2 z-20 mr-2 hidden h-12 w-32 -translate-y-1/2 rounded border border-outline-variant bg-surface-container-low md:block"><ResponsiveContainer width="100%" height="100%"><AreaChart data={unitHistory}><Area type="monotone" dataKey="in_mbps" stroke={CHART_IN} fill={CHART_IN} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false}/><Area type="monotone" dataKey="out_mbps" stroke={CHART_OUT} fill={CHART_OUT} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>}
```

with:

```tsx
{hoveredIface === unit.name && unitHistory.length > 1 && <div className="absolute right-full top-1/2 z-20 mr-2 hidden h-12 w-32 -translate-y-1/2 rounded border border-outline-variant bg-surface-container-low p-1 md:block"><Sparkline points={unitHistory} width={120} height={36} /></div>}
```

- [ ] **Step 3: Color the Classic In/Out header and table values**

In the physical card header, change the In/Out labels and values so direction is semantic:

- `In (Rx)` label: add `v2-io-in` to its text class (label keeps `text-on-surface-variant`, so use `className="mb-0.5 text-[10px] uppercase tracking-widest v2-io-in"`).
- `physical.bps_in` value: `className="font-bold v2-io-in"` (was `font-bold text-primary`).
- `Out (Tx)` label: `className="mb-0.5 text-[10px] uppercase tracking-widest v2-io-out"`.
- `physical.bps_out` value: `className="font-bold v2-io-out"` (was `font-bold text-on-surface`).

In the unit table row, the `unit.bps_in` span (currently `font-mono text-xs text-primary`) becomes `font-mono text-xs v2-io-in`. The `unit.bps_out` cell (currently `font-mono text-xs text-on-surface`) becomes `font-mono text-xs v2-io-out`.

These classes only take effect under `[data-ui-version="v2"]`, so v1 keeps its current colors.

- [ ] **Step 4: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build > $JCODE_SCRATCH_DIR/b4.log 2>&1; echo "exit=$?"`
Expected: `exit=0`. If `CHART_IN`, `CHART_OUT`, `Area`, or `AreaChart` are now unused in this block, leave them: they are still used by the card chart at line ~380.

- [ ] **Step 5: Commit**

```bash
cd /root/jupe-track
git add frontend/src/app/interfaces/page.tsx
git commit -m "feat(v2): sparkline per-unit preview and semantic IN/OUT colors"
```

---

### Task 5: Server is the theme source of truth

**Files:**
- Modify: `frontend/src/components/ThemeProvider.tsx` (the `setThemePreference` function, and the server-sync effect near line 96-106)

- [ ] **Step 1: Confirm the failing behavior first**

Run the reproduction from earlier: server `color_mode=light`, local cache `dark`, load `/interfaces`, read `document.documentElement.classList.contains('dark')`.
Expected now: `false` on `/interfaces`, but local storage still says `dark` before the sync runs. Record the observed value.

- [ ] **Step 2: Make the server overwrite local cache on load**

In `ThemeProvider.tsx`, the server-sync effect already calls `setLocalCache(serverPreset, serverMode)` (line 104). Keep it. Also make the initial client state not trust a stale cache over the server once `user` is known: in the effect, reset `lastSyncedUser` when `user` becomes null so the next authenticated user always syncs.

Replace the top of that effect's guard:

```tsx
if (lastSyncedUser.current === userKey) return;
lastSyncedUser.current = userKey;
```

with:

```tsx
if (!user) {
  lastSyncedUser.current = null;
  return;
}
const userKey = `${user.id}:${user.theme_preset ?? ""}:${user.color_mode ?? ""}`;
if (lastSyncedUser.current === userKey) return;
lastSyncedUser.current = userKey;
```

Note: `userKey` must be defined before this guard. Check the existing declaration above the guard and move it if needed so it is not declared twice.

- [ ] **Step 3: Reset `isSaving` in `finally` and revert on failure**

In `setThemePreference`, wrap the PATCH so `isSavingRef` and `isSaving` always reset, and a non-OK response restores the previous values. Replace the `try`/`catch` block after `setIsSaving(true)` with:

```tsx
try {
  const res = await authFetch("/api/proxy/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ theme_preset: newPreset, color_mode: newMode }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return true;
} catch (err) {
  setThemePreset(prevPreset);
  setColorMode(prevMode);
  applyThemeToDOM(prevPreset, prevMode);
  setLocalCache(prevPreset, prevMode);
  setSaveError(err instanceof Error ? err.message : "Save failed");
  return false;
} finally {
  isSavingRef.current = false;
  setIsSaving(false);
}
```

Remove the old `if (!res.ok) { ... }` branch and its duplicate reset lines that this replaces. Keep the early `isLoading || !user` return above it unchanged.

- [ ] **Step 4: Typecheck and build**

Run: `cd frontend && npx tsc --noEmit && npm run build > $JCODE_SCRATCH_DIR/b5.log 2>&1; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd /root/jupe-track
git add frontend/src/components/ThemeProvider.tsx
git commit -m "fix(theme): server is source of truth, revert and unlock on failed save"
```

---

### Task 6: Deploy and verify all three behaviors

**Files:** none modified. Verification only.

- [ ] **Step 1: Run the sparkline math check**

Run: `cd frontend && node scripts/test-sparkline-math.mjs`
Expected: `sparkline-math: ok`.

- [ ] **Step 2: Deploy to Docker**

Run: `cd /root/jupe-track && docker compose up -d --build jupetrack`
Expected: container recreated, exit 0.

- [ ] **Step 3: Verify theme consistency across pages**

Playwright fixture: server `color_mode=light`, local cache `dark`. Visit `/interfaces`, `/settings`, `/bgp`. Each must report `dark` class `false`. Then click the header Theme button on `/interfaces` and reload `/bgp`: it must stay consistent with the saved value.
Expected: all three pages match; no page shows a different mode.

- [ ] **Step 4: Verify failed save reverts and unlocks**

Fixture `PATCH /api/proxy/auth/me` returns 500. Click Theme. Expected: the mode returns to its previous value, the toggle is clickable again (`aria-disabled` not `true` after the request), and the error is set.

- [ ] **Step 5: Verify IN/OUT colors**

Computed `color` on a `v2-io-in` element is green (`rgb(34, 197, 94)` dark), on `v2-io-out` orange (`rgb(249, 115, 22)` dark). Light values: `#15803d` and `#c2410c`.

- [ ] **Step 6: Verify sparkline removes Recharts from unit rows**

With 6 physical and 4 logical units and hover on one unit, count `.recharts-wrapper` on the classic view. Expected: only the physical card charts and the dialog, no per-unit Recharts. Also confirm `Sparkline` renders an `svg[role=img]` for the hovered unit.

- [ ] **Step 7: Regression**

Run the 44-combination route check (11 routes × v1/v2 × 1280/390). Expected: shell correct, overflow 0, page errors 0. v1 IN/OUT colors unchanged.

---

## Self-Review

**Spec coverage:** Theme server-as-truth → Task 5. Failed save revert and unlock → Task 5 Step 3. IN/OUT green/orange semantic → Task 3 and Task 4. Sparkline replacing per-unit Recharts, `React.memo`, 30-point cap → Task 1, Task 2, Task 4. Testing items in spec → Task 6.

**Placeholder scan:** No TBD/TODO. Every code step has the code. Task 5 Step 2 mentions moving a declaration; the exact placement is stated (must be defined before the guard).

**Type consistency:** `Sparkline` takes `SparkPoint[]` with `in_mbps`/`out_mbps`, matching `TrafficData` in `page.tsx`. `lastPoints`/`toPath` signatures match between Task 1 and Task 2. Token names `--ui-in`/`--ui-out` match between Task 2 (used in SVG `stroke`) and Task 3 (defined).

**Known risk:** Task 5 depends on the exact existing structure of `ThemeProvider.tsx` (the `userKey` declaration location). The step tells the implementer to check and move it, rather than assuming.

# Interfaces v2 Sort and Chart Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortable logical-unit table headers and min/avg/max summary in the per-unit chart dialog, both v2 only.

**Architecture:** Two pure helper modules hold all logic and have assert tests run with `node`, matching `frontend/scripts/test-sparkline-math.mjs`. `interfaces/page.tsx` only wires them into ClassicView and the chart dialog. No new fetches.

**Tech Stack:** TypeScript (Next.js 16, React 19), Node assert scripts, Playwright (`/root/node_modules/playwright`) for browser checks.

---

## File Structure

- Create: `frontend/src/lib/table-sort.ts` — `nextSortState`, `sortUnits`. Pure.
- Create: `frontend/src/lib/series-summary.ts` — `summarize`. Pure.
- Create: `frontend/scripts/test-table-sort.mjs` — assert tests for both helpers. Imports via a pre-transpiled copy? No: see Task 1 for the import approach.
- Modify: `frontend/src/app/interfaces/page.tsx` — ClassicView (sort state, headers, sorted rows) and chart dialog (summary line).

Note on helper imports: `sparkline-math.ts` is `.ts` and the existing `.mjs` test is in `scripts/`. Check how `test-sparkline-math.mjs` loads its source before Task 1 step 1.

---

### Task 1: Pure sort helper

**Files:**
- Create: `frontend/src/lib/table-sort.ts`
- Test: `frontend/scripts/test-table-sort.mjs`

- [ ] **Step 1: Check how the existing test loads TypeScript source**

Run: `sed -n 1,12p frontend/scripts/test-sparkline-math.mjs`
Expected: shows the import line. Use the same loading approach in the new test (copy its pattern, do not invent one).

- [ ] **Step 2: Write the failing test**

Create `frontend/scripts/test-table-sort.mjs` using the same import pattern found in step 1, with these cases:

```js
import assert from "node:assert/strict";
// <import nextSortState, sortUnits from ../src/lib/table-sort.ts using the pattern from step 1>

const units = [
  { name: "ge-0/0/0.0", bps_in: 300, bps_out: 10, oper_status: "up" },
  { name: "ge-0/0/1.0", bps_in: 100, bps_out: 500, oper_status: "down" },
  { name: "ge-0/0/2.0", bps_in: 200, bps_out: 20, oper_status: "up" },
];
const names = (xs) => xs.map((u) => u.name);

// cycle: null -> asc -> desc -> null
let s = nextSortState(null, "in");
assert.deepEqual(s, { column: "in", dir: "asc" });
s = nextSortState(s, "in");
assert.deepEqual(s, { column: "in", dir: "desc" });
assert.equal(nextSortState(s, "in"), null);
// switching column starts asc
assert.deepEqual(nextSortState({ column: "in", dir: "desc" }, "out"), { column: "out", dir: "asc" });

// default keeps API order
assert.deepEqual(names(sortUnits(units, null)), names(units));
// in asc / desc
assert.deepEqual(names(sortUnits(units, { column: "in", dir: "asc" })), ["ge-0/0/1.0", "ge-0/0/2.0", "ge-0/0/0.0"]);
assert.deepEqual(names(sortUnits(units, { column: "in", dir: "desc" })), ["ge-0/0/0.0", "ge-0/0/2.0", "ge-0/0/1.0"]);
// out uses bps_out
assert.deepEqual(names(sortUnits(units, { column: "out", dir: "desc" })), ["ge-0/0/1.0", "ge-0/0/2.0", "ge-0/0/0.0"]);
// status: up before down in asc
assert.deepEqual(names(sortUnits(units, { column: "status", dir: "asc" })).slice(2), ["ge-0/0/1.0"]);
// input not mutated
assert.equal(units[0].name, "ge-0/0/0.0");
console.log("table-sort: all assertions passed");
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && node scripts/test-table-sort.mjs`
Expected: FAIL, module `table-sort.ts` not found or functions undefined.

- [ ] **Step 4: Write minimal implementation**

Create `frontend/src/lib/table-sort.ts`:

```ts
export type SortColumn = "in" | "out" | "status";
export type SortDir = "asc" | "desc";
export type SortState = { column: SortColumn; dir: SortDir } | null;

type Unit = { bps_in: number; bps_out: number; oper_status: string };

/** Click cycle per column: none -> asc -> desc -> none. Switching column starts at asc. */
export function nextSortState(current: SortState, column: SortColumn): SortState {
  if (!current || current.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}

/** Returns a new array. Null state keeps the input order. Status: "up" before others, then alphabetical. */
export function sortUnits<T extends Unit>(units: readonly T[], sort: SortState): T[] {
  const copy = [...units];
  if (!sort) return copy;
  const sign = sort.dir === "asc" ? 1 : -1;
  const key = (u: T): number | string =>
    sort.column === "in" ? u.bps_in : sort.column === "out" ? u.bps_out : u.oper_status;
  copy.sort((a, b) => {
    if (sort.column === "status") {
      const rank = (s: string) => (s === "up" ? 0 : 1);
      const d = rank(a.oper_status) - rank(b.oper_status) || a.oper_status.localeCompare(b.oper_status);
      return d * sign;
    }
    return ((key(a) as number) - (key(b) as number)) * sign;
  });
  return copy;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && node scripts/test-table-sort.mjs`
Expected: `table-sort: all assertions passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/table-sort.ts frontend/scripts/test-table-sort.mjs
git commit -m "feat(interfaces-v2): pure sort helper with assert test"
```

---

### Task 2: Summary helper

**Files:**
- Create: `frontend/src/lib/series-summary.ts`
- Modify: `frontend/scripts/test-table-sort.mjs` (append cases; keep one test file for both helpers)

- [ ] **Step 1: Write the failing test**

Append to `frontend/scripts/test-table-sort.mjs`, importing `summarize` the same way:

```js
import { summarize } from "../src/lib/series-summary.ts"; // same loading pattern as step 1 of Task 1
assert.equal(summarize([]), null);
assert.deepEqual(summarize([5]), { min: 5, avg: 5, max: 5 });
assert.deepEqual(summarize([1, 2, 3, 6]), { min: 1, avg: 3, max: 6 });
// non-finite values are ignored
assert.deepEqual(summarize([NaN, 2, Infinity, 4]), { min: 2, avg: 3, max: 4 });
assert.equal(summarize([NaN]), null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node scripts/test-table-sort.mjs`
Expected: FAIL, `series-summary.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/series-summary.ts`:

```ts
export type Summary = { min: number; avg: number; max: number };

/** min/avg/max over finite values. Null when no finite value exists. */
export function summarize(values: readonly number[]): Summary | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  let min = v[0], max = v[0], sum = 0;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
  }
  return { min, avg: sum / v.length, max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node scripts/test-table-sort.mjs`
Expected: `table-sort: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/series-summary.ts frontend/scripts/test-table-sort.mjs
git commit -m "feat(interfaces-v2): min/avg/max summary helper"
```

---

### Task 3: Wire sorting into ClassicView (v2 only)

**Files:**
- Modify: `frontend/src/app/interfaces/page.tsx` (ClassicView, the logical-unit table)

Current behavior: `ClassicView` renders `logicals.map(...)` inside `<TableBody>`. The `<TableHead>` cells are plain text, rendered for both v1 and v2.

Constraint: v1 must not change. Sort headers render only when `uiVersion === "v2"`. Check how `page.tsx` or `LayoutShell` exposes the version (`useUiVersion` from `components/UiVersionProvider.tsx`) before step 2.

- [ ] **Step 1: Read the current UI version hook**

Run: `sed -n 1,40p frontend/src/components/UiVersionProvider.tsx`
Expected: export name of the hook (for example `useUiVersion`). Use that exact name in step 2.

- [ ] **Step 2: Add per-group sort state and version check**

In `ClassicView`, add near the top of each group's render. Store sort state in a `Record<string, SortState>` keyed by `physical.name` using `useState` in a small wrapper, because hooks cannot run inside `.map`. Extract the group body into `ClassicGroupCard` (new function in the same file) that owns its own `const [sort, setSort] = useState<SortState>(null)`.

Add the import at top of `page.tsx`:

```tsx
import { nextSortState, sortUnits, type SortColumn, type SortState } from "@/lib/table-sort";
```

Replace the `groups.map(group => { ... })` body with `<ClassicGroupCard key={group.physical.name} group={group} ... />`. Move the existing card JSX unchanged into it, then apply step 3 inside.

- [ ] **Step 3: Render sortable headers and sorted rows (v2)**

Inside `ClassicGroupCard`, compute:

```tsx
const isV2 = useUiVersion() === "v2";
const rows = useMemo(() => sortUnits(logicals, sort), [logicals, sort]);
```

Replace the `In (Rx)`, `Out (Tx)`, `Status` `<TableHead>` content with a helper:

```tsx
function SortHead({ col, label, sort, onSort, className }: { col: SortColumn; label: string; sort: SortState; onSort: (c: SortColumn) => void; className: string }) {
  const active = sort?.column === col ? sort.dir : null;
  return (
    <TableHead className={className} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
      <button type="button" onClick={() => onSort(col)} className="inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-primary">
        {label}{active === "asc" ? " ▲" : active === "desc" ? " ▼" : ""}
      </button>
    </TableHead>
  );
}
```

Use it only when `isV2`; otherwise keep the existing plain `<TableHead>` text. Map `logicals.map` to `rows.map`.

Note: the `▲/▼` glyphs are visible text, not decorative. Keep them. Do not use emoji.

- [ ] **Step 4: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/interfaces/page.tsx src/lib/table-sort.ts src/lib/series-summary.ts`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/interfaces/page.tsx
git commit -m "feat(interfaces-v2): sortable logical-unit table headers"
```

---

### Task 4: Summary line in chart dialog (v2 only)

**Files:**
- Modify: `frontend/src/app/interfaces/page.tsx` (chart dialog, `modalIface` block near line 340)

- [ ] **Step 1: Add import and compute summaries**

Add to imports:

```tsx
import { summarize } from "@/lib/series-summary";
```

In the dialog component (where `trafficHistory[modalIface]` is read), compute:

```tsx
const modalHistory = modalIface ? trafficHistory[modalIface] || [] : [];
const inSum = summarize(modalHistory.map(p => p.in_mbps));
const outSum = summarize(modalHistory.map(p => p.out_mbps));
```

- [ ] **Step 2: Render summary above chart, v2 only**

Above the `<ResponsiveContainer>` block in the dialog, when `isV2 && inSum && outSum`:

```tsx
<div className="mb-3 grid grid-cols-2 gap-3 font-mono text-xs">
  <div><span className="uppercase tracking-widest v2-io-in">Ingress</span> min {inSum.min.toFixed(1)} / avg {inSum.avg.toFixed(1)} / max {inSum.max.toFixed(1)} Mbps</div>
  <div><span className="uppercase tracking-widest v2-io-out">Egress</span> min {outSum.min.toFixed(1)} / avg {outSum.avg.toFixed(1)} / max {outSum.max.toFixed(1)} Mbps</div>
</div>
```

On mobile (390px) this grid wraps to one column if needed: use `grid-cols-1 min-[480px]:grid-cols-2`.

- [ ] **Step 3: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/interfaces/page.tsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/interfaces/page.tsx
git commit -m "feat(interfaces-v2): min/avg/max summary in chart dialog"
```

---

### Task 5: Browser verification and rollout

**Files:** none modified. Verification only.

- [ ] **Step 1: Rebuild and run the container**

Run: `cd /root/jupe-track && docker compose build jupetrack && docker compose up -d jupetrack && sleep 8 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3040/login`
Expected: `200`.

- [ ] **Step 2: Playwright test at 390px and 1280px, v2 and v1**

Use the fixture pattern from the retention test (`$JCODE_SCRATCH_DIR/rt/test.js`): stub `auth/refresh`, `auth/me`, `logical-systems`, `ws/settings`, `ws*` abort, `metrics/interfaces/names`, `metrics/bgp/peers`. For interfaces data, stub the endpoint that `page.tsx` uses for the live list (grep `fetch`/`authFetch` in `interfaces/page.tsx` to get the exact path) with one physical group and 4 logical units with known `bps_in`/`bps_out`/`oper_status`.

Checks:
- v2: click `In (Rx)` twice, read row order, expect descending by `bps_in`. `aria-sort` on that `th` is `descending`.
- v2: open a unit dialog, read summary text, compare with values computed in the test (`min/avg/max` to one decimal).
- v1: no `button` inside the `In (Rx)` header, no summary text.
- `document.documentElement.scrollWidth <= innerWidth` at both viewports.
- `pageerror` count 0.

Expected: all true. Record the output.

- [ ] **Step 3: Confirm no regression in other pages**

Run: `cd /root/jupe-track && git diff 308592b --stat -- frontend/src/app/layout.tsx frontend/src/components/ui/LayoutShell.tsx`
Expected: empty (no change to shell files).

- [ ] **Step 4: Report**

Report to the user: the commit hashes, the test output lines, and that nothing is pushed. Ask before pushing.

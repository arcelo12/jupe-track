# Logical Unit Popup v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the per-logical-unit chart dialog in v2 into header, status badges, live Ingress/Egress metric boxes, chart, min/avg/max summary, and update footer. Live only.

**Architecture:** Only `frontend/src/app/interfaces/page.tsx` changes. The unit object is looked up from `rawInterfaces` by name, which already comes from `useWebSocket()` in `InterfacesDashboard`. Chart data stays in `trafficHistory`. No new fetches, no new files. v1 keeps the old dialog text.

**Tech Stack:** TypeScript (Next.js 16, React 19), Tailwind, Recharts (existing), Playwright at `/root/node_modules/playwright` for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-10-logical-unit-popup-v2-design.md`

---

## File Structure

- Modify: `frontend/src/app/interfaces/page.tsx`
  - `InterfacesDashboard` body: add `modalUnit` lookup and current values next to `modalHistory` (around line 69).
  - Dialog block (`<ChartDialog ...>` children, around lines 348-377): new v2 header, status row, metric boxes, chart (unchanged), summary, footer.

No other files. Compact and Classic both open this same dialog through `setModalIface`, so one edit covers both views.

---

### Task 1: Lookup unit and current values

**Files:**
- Modify: `frontend/src/app/interfaces/page.tsx` (after the `modalHistory` line)

- [ ] **Step 1: Confirm the anchor exists exactly once**

Run: `grep -n "const modalHistory = " frontend/src/app/interfaces/page.tsx`
Expected: one line, `const modalHistory = modalIface ? trafficHistory[modalIface] || [] : [];`

- [ ] **Step 2: Add the lookup and current values**

Insert after the `modalHistory` line:

```tsx
  const modalUnit = modalIface ? rawInterfaces.find(i => i.name === modalIface) : undefined;
  const lastPoint = modalHistory[modalHistory.length - 1];
```

`rawInterfaces` is already destructured at the top of `InterfacesDashboard` from `useWebSocket()`. Its declaration must come before this line. Confirm with `grep -n "interfaces: rawInterfaces" frontend/src/app/interfaces/page.tsx`. If the line number is greater than the insertion point, move the insertion below it.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/interfaces/page.tsx
git commit -m "refactor(interfaces-v2): look up selected logical unit for popup"
```

---

### Task 2: Rebuild the v2 dialog content

**Files:**
- Modify: `frontend/src/app/interfaces/page.tsx` (the `ChartDialog` children block)

- [ ] **Step 1: Replace the v2 summary block with the full v2 header**

Find the block that starts with `{modalIface && isV2 && inSum && outSum && (` and ends at its matching `)}`. Replace the whole block with:

```tsx
        {modalIface && isV2 && (
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              {modalUnit ? (
                <>
                  <Badge className={isUp(modalUnit) ? 'border-none bg-success/10 text-success' : 'border-none bg-error/10 text-error'}>{modalUnit.oper_status}</Badge>
                  <Badge variant="outline" className="rounded border-outline-variant text-[10px] uppercase text-on-surface-variant">admin {modalUnit.admin_status}</Badge>
                  {modalUnit.description && <span className="min-w-0 truncate text-on-surface-variant">{modalUnit.description}</span>}
                </>
              ) : (
                <span className="text-on-surface-variant">Unit not in current telemetry</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-outline-variant bg-surface-container p-3">
                <div className="text-[10px] uppercase tracking-widest v2-io-in">Ingress</div>
                <div className="font-mono text-lg font-bold v2-io-in">{lastPoint ? `${lastPoint.in_mbps.toFixed(1)} Mbps` : '—'}</div>
              </div>
              <div className="rounded border border-outline-variant bg-surface-container p-3">
                <div className="text-[10px] uppercase tracking-widest v2-io-out">Egress</div>
                <div className="font-mono text-lg font-bold v2-io-out">{lastPoint ? `${lastPoint.out_mbps.toFixed(1)} Mbps` : '—'}</div>
              </div>
            </div>
          </div>
        )}
```

Note: `Badge` and `isUp` already exist in this file. `modalUnit.admin_status` is a string in `InterfaceInfo`.

- [ ] **Step 2: Move the summary and footer below the chart**

Replace the current summary-and-readout fragment (the `inSum && outSum` block that renders the min/avg/max grid and the "Now: ... Updated ..." row) with a single block rendered after the chart. Move it to just after the `ResponsiveContainer` closing tag inside the dialog children:

```tsx
        {modalIface && isV2 && inSum && outSum && lastPoint && (
          <div className="mt-3 space-y-2 font-mono text-xs">
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <div><span className="uppercase tracking-widest v2-io-in">Ingress</span> min {inSum.min.toFixed(1)} / avg {inSum.avg.toFixed(1)} / max {inSum.max.toFixed(1)} Mbps</div>
              <div><span className="uppercase tracking-widest v2-io-out">Egress</span> min {outSum.min.toFixed(1)} / avg {outSum.avg.toFixed(1)} / max {outSum.max.toFixed(1)} Mbps</div>
            </div>
            <div className="text-on-surface-variant">Updated {lastPoint.time} · {modalHistory.length} pts</div>
          </div>
        )}
```

Keep the existing `Waiting for live telemetry` branch and the `AreaChart` block exactly as they are. Only their position relative to the summary changes: the chart stays between the header and this summary. Place the new summary block after the `: null}` that closes the chart conditional.

- [ ] **Step 3: Typecheck and lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src/app/interfaces/page.tsx`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/interfaces/page.tsx
git commit -m "feat(interfaces-v2): status badges, metric boxes, footer in unit popup"
```

---

### Task 3: Browser verification

**Files:** none modified.

- [ ] **Step 1: Build and run the container**

Run: `cd /root/jupe-track && docker compose build jupetrack && docker compose up -d jupetrack && sleep 10 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3040/login`
Expected: `200`.

- [ ] **Step 2: Playwright check with deterministic mock WebSocket**

Use the pattern from `$JCODE_SCRATCH_DIR/sortsum.cjs` and `readout2.cjs`: stub `auth/refresh`, `auth/me`, `logical-systems`, `ws/settings`, `metrics/interfaces/history`. Fake WebSocket sends `interfaces` with one physical and two logical units with fixed `bps_in`/`bps_out`. Oper status of one unit is `down`.

Run for `classic` and `compact` views, `v2` at 1280px and 390px. Checks:
- Open unit `ge-0/0/0.0`. Header shows badge `up`, `admin up`, and description text.
- Ingress and Egress boxes show `X.X Mbps` equal to the fixture values.
- Summary min/avg/max line matches values computed from the mock series.
- Footer shows `Updated ... · N pts`. After one more WebSocket push, N increases by 1.
- Open the `down` unit: badge text `down`, red class present.
- Missing-unit path: send a message without the open unit. Dialog stays open, text `Unit not in current telemetry` shows, no page error.
- No horizontal overflow at either viewport.
- Zero `pageerror`.

Expected: all true. Save the output.

- [ ] **Step 3: v1 regression**

Same route with `jupetrack-ui-version` set to `v1`. Expected: no `Ingress` metric box text with `Mbps` in the header area, no `admin up` badge, no `Updated` footer line.

- [ ] **Step 4: Report**

Report the commit hashes, the Playwright output summary, and whether `master` should get a merge. Do not push without an explicit instruction.

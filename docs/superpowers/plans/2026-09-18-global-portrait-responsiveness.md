# Global Portrait Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JupeTrack fit 360–414px portrait viewports while preserving desktop behavior.

**Architecture:** Keep existing mobile-first page grids. Fix shared boundaries only: shell sizing, dialog viewport constraints, and chart legend wrapping. Existing table primitive already provides local horizontal scrolling.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Recharts.

---

### Task 1: Shared shell portrait containment

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/ui/LayoutShell.tsx`

- [ ] Replace viewport-derived minimum body width with `w-full min-w-0`.
- [ ] Reduce shell and content padding only below existing responsive breakpoints.
- [ ] Keep desktop sidebar and content dimensions unchanged.

### Task 2: Chart dialog portrait sizing

**Files:**
- Modify: `frontend/src/components/ui/chart-dialog.tsx`
- Modify: `frontend/src/components/charts/InterfaceTrafficChart.tsx`

- [ ] Constrain dialog using `100dvw`/`100dvh` minus mobile gutters.
- [ ] Make header text shrink/wrap without pushing the close button off-screen.
- [ ] Keep a determinate chart height and compact only mobile padding.
- [ ] Wrap and center Recharts legend content below the plot.

### Task 3: Verification

**Files:**
- Verify: all changed frontend files

- [ ] Run `npm run build` from `frontend/`; expect success.
- [ ] Run `npm run lint`; report any pre-existing baseline separately.
- [ ] Verify `/login` at 360×800 and 414×896 has no document-level horizontal overflow.
- [ ] Review the final diff for desktop breakpoint regressions.
- [ ] Commit only responsive code and its design/plan documents.

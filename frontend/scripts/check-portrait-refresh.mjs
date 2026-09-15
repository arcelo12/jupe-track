import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const headerButtonPath = fileURLToPath(new URL("../src/components/ui/HeaderRefreshButton.tsx", import.meta.url));
const layoutShellPath = fileURLToPath(new URL("../src/components/ui/LayoutShell.tsx", import.meta.url));

const headerButtonContent = readFileSync(headerButtonPath, "utf8");
const layoutShellContent = readFileSync(layoutShellPath, "utf8");

// HeaderRefreshButton checks
assert.ok(
  headerButtonContent.includes("data-portrait-refresh-bar"),
  "HeaderRefreshButton must include data-portrait-refresh-bar"
);

assert.ok(
  !headerButtonContent.includes("<details"),
  "HeaderRefreshButton must not use <details"
);

assert.ok(
  headerButtonContent.includes("xl:hidden"),
  "HeaderRefreshButton must use xl:hidden for portrait row"
);

assert.ok(
  headerButtonContent.includes("hidden items-center gap-4 xl:flex"),
  'HeaderRefreshButton must retain desktop "hidden items-center gap-4 xl:flex"'
);

// LayoutShell checks
assert.ok(
  layoutShellContent.includes("flex-wrap"),
  "LayoutShell header must include flex-wrap"
);

assert.ok(
  layoutShellContent.includes("xl:flex-nowrap"),
  "LayoutShell header must include xl:flex-nowrap"
);

console.log("check-portrait-refresh OK");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const headerButtonPath = fileURLToPath(new URL("../src/components/ui/HeaderRefreshButton.tsx", import.meta.url));
const layoutShellPath = fileURLToPath(new URL("../src/components/ui/LayoutShell.tsx", import.meta.url));

const headerButtonContent = readFileSync(headerButtonPath, "utf8");
const layoutShellContent = readFileSync(layoutShellPath, "utf8");

// Helper to check that an element containing a marker has all required class tokens
function assertHasClassTokens(content, marker, tokens, label) {
  assert.ok(content.includes(marker), `${label} must contain marker: ${marker}`);
  const markerIndex = content.indexOf(marker);
  const snippet = content.slice(Math.max(0, markerIndex - 200), markerIndex + 200);
  const classMatch = snippet.match(/className=["']([^"']+)["']/);
  assert.ok(classMatch, `${label} must have className attribute`);
  const classList = classMatch[1].split(/\s+/);
  for (const token of tokens) {
    assert.ok(
      classList.includes(token),
      `${label} className must contain token "${token}", found: ${classMatch[1]}`
    );
  }
}

// HeaderRefreshButton checks: data marker and no <details
assert.ok(
  headerButtonContent.includes("data-portrait-refresh-bar"),
  "HeaderRefreshButton must include data-portrait-refresh-bar"
);

assert.ok(
  !headerButtonContent.includes("<details"),
  "HeaderRefreshButton must not use <details"
);

// Portrait refresh bar required class tokens (token-order-agnostic)
assertHasClassTokens(
  headerButtonContent,
  "data-portrait-refresh-bar",
  ["order-3", "basis-full", "flex", "w-full", "items-end", "gap-2", "border-t", "xl:hidden"],
  "Portrait refresh bar"
);

// Desktop controls required class tokens (token-order-agnostic)
const desktopMatch = headerButtonContent.match(/<div[^>]*className=["']([^"']*\bxl:flex\b[^"']*)["'][^>]*>/);
assert.ok(desktopMatch, "Desktop controls container must exist");
const desktopClasses = desktopMatch[1].split(/\s+/);
for (const token of ["hidden", "items-center", "gap-4", "xl:flex"]) {
  assert.ok(
    desktopClasses.includes(token),
    `Desktop controls must contain token "${token}", found: ${desktopMatch[1]}`
  );
}

// LayoutShell checks
assert.ok(
  layoutShellContent.includes("flex-wrap"),
  "LayoutShell header must include flex-wrap"
);

assert.ok(
  layoutShellContent.includes("xl:flex-nowrap"),
  "LayoutShell header must include xl:flex-nowrap"
);

assert.ok(
  layoutShellContent.includes("xl:ml-3"),
  "LayoutShell action group must include xl:ml-3 for desktop spacing"
);

console.log("check-portrait-refresh OK");

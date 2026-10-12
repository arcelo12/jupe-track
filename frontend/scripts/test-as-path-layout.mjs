import assert from "node:assert/strict";
import { parseAsPath, layoutStraight, layoutFlexible, pickOrigin, centerOffset, clampZoom, TIER1_ASNS, truncateToTier1, isTier1, reverseForDisplay, nodeWidthFor, panAfterDrag, DRAG_THRESHOLD_PX, tier1RoutesOnly, tier1Name } from "../.test-build/as-path-layout.js";

// parse: drop I/E/? flags and bracket chars, keep order
assert.deepEqual(parseAsPath("7018 3356 15169"), ["7018", "3356", "15169"]);
assert.deepEqual(parseAsPath("  7018 [3356] (15169) I "), ["7018", "3356", "15169"]);
assert.deepEqual(parseAsPath(""), []);
assert.deepEqual(parseAsPath("?"), []);

// straight: one row per path, nodes left-to-right, no duplicate node ids
const s = layoutStraight(["7018 3356 15169", "7018 1299 15169"]);
const ids = s.nodes.map((n) => n.id);
assert.equal(new Set(ids).size, ids.length, "node ids unique");
assert.ok(ids.includes("7018") && ids.includes("15169") && ids.includes("1299"));
const n7018 = s.nodes.find((n) => n.id === "7018");
const n15169 = s.nodes.find((n) => n.id === "15169");
assert.ok(n7018.x < n15169.x, "origin-side hop is left of destination");
assert.ok(s.edges.some((e) => e.from === "7018" && e.to === "3356"));
assert.ok(s.width > 0 && s.height > 0);

// flexible: nodes grouped by hop depth (layer), same depth -> same x
const f = layoutFlexible(["7018 3356 15169", "7018 1299 15169"]);
const xOf = (id) => f.nodes.find((n) => n.id === id).x;
assert.equal(xOf("3356"), xOf("1299"), "same depth shares a column");
assert.ok(xOf("7018") < xOf("3356") && xOf("3356") < xOf("15169"));
assert.ok(f.edges.some((e) => e.from === "3356" && e.to === "15169"));

// empty input yields empty layout, no throw
assert.deepEqual(layoutStraight([]).nodes, []);
assert.deepEqual(layoutFlexible([]).nodes, []);

// pickOrigin: last hop of each path, most frequent wins, tie -> first seen
assert.equal(pickOrigin([]), null);
assert.equal(pickOrigin(["7018 3356 15169"]), "15169");
assert.equal(pickOrigin(["7018 3356 15169", "1299 15169", "2914 6453"]), "15169");
assert.equal(pickOrigin(["7018 3356 15169", "1299 6453"]), "15169", "tie -> first seen");
assert.equal(pickOrigin(["7018 I", "  "]), "7018", "flags and blanks ignored");

// clampZoom: 0.5..2
assert.equal(clampZoom(0.1), 0.5);
assert.equal(clampZoom(3), 2);
assert.equal(clampZoom(1.25), 1.25);

// centerOffset: at zoom z, origin point lands at viewport center
const vp = { w: 400, h: 200 };
for (const z of [1, 2]) {
  const o = { x: 300, y: 100 };
  const { tx, ty } = centerOffset(o, z, vp);
  assert.equal(o.x * z + tx, vp.w / 2, `x centered at zoom ${z}`);
  assert.equal(o.y * z + ty, vp.h / 2, `y centered at zoom ${z}`);
}

// tier1 set: 15 ASN from spec
assert.equal(TIER1_ASNS.size, 15);
assert.ok(TIER1_ASNS.has("3356") && TIER1_ASNS.has("174") && !TIER1_ASNS.has("13335"));

// truncateToTier1: keep from rightmost tier-1 hop to origin; keep whole when none
assert.deepEqual(truncateToTier1(["917", "931", "1299", "13335"], TIER1_ASNS), ["1299", "13335"]);
assert.deepEqual(truncateToTier1(["20205", "1299", "13335"], TIER1_ASNS), ["1299", "13335"]);
assert.deepEqual(truncateToTier1(["3356", "13335"], TIER1_ASNS), ["3356", "13335"], "rightmost tier-1 to origin");
assert.deepEqual(truncateToTier1(["3356"], TIER1_ASNS), ["3356"], "tier-1 only");
assert.deepEqual(truncateToTier1(["13335", "15169"], TIER1_ASNS), ["13335", "15169"], "no tier-1 kept whole");


// isTier1 for tooltip label
assert.equal(isTier1("3356"), true);
assert.equal(isTier1("13335"), false);

// reverseForDisplay: origin on the left, path flows out to the right (bgp.tools style)
assert.equal(reverseForDisplay("7018 3356 13335"), "13335 3356 7018");
assert.equal(reverseForDisplay("  1299 13335 I"), "13335 1299");
assert.equal(reverseForDisplay(""), "");


// nodeWidthFor: 88 below 640px container, 120 otherwise
assert.equal(nodeWidthFor(390), 88);
assert.equal(nodeWidthFor(639), 88);
assert.equal(nodeWidthFor(640), 120);
assert.equal(nodeWidthFor(1280), 120);

// drag threshold and pan accumulation
assert.equal(DRAG_THRESHOLD_PX, 6);
assert.deepEqual(panAfterDrag({ x: 0, y: 0 }, { x: 30, y: -12 }), { x: 30, y: -12 });
assert.deepEqual(panAfterDrag({ x: 10, y: 5 }, { x: -4, y: 2 }), { x: 6, y: 7 });

// tier1RoutesOnly: keep routes whose truncated path ends at a Tier-1, merged and sorted
const t1 = tier1RoutesOnly([
  "7018 3356 13335", "7018 3356 13335", "7018 3356 15169",
  "1299 13335", "13335 15169", "6461 50673", "20205 1299 13335",
]);
assert.deepEqual(t1, [
  { path: "1299 13335", count: 2 },
  { path: "3356 13335", count: 2 },
  { path: "3356 15169", count: 1 },
  { path: "6461 50673", count: 1 },
].sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
assert.deepEqual(tier1RoutesOnly([]), []);
assert.deepEqual(tier1RoutesOnly(["13335 15169"]), [], "no tier-1 -> dropped");

// tier1Name: built-in names for the 15 Tier-1 ASNs
assert.equal(tier1Name("3356"), "Lumen");
assert.equal(tier1Name("1299"), "Arelion");
assert.equal(tier1Name("13335"), null);
for (const asn of ["7018","3320","3257","6830","3356","2914","5511","3491","6453","6762","1299","12956","701","6461","174"]) {
  assert.ok(tier1Name(asn), `name for ${asn}`);
}

console.log("as-path-layout: all assertions passed");

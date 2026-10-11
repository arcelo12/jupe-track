import assert from "node:assert/strict";
import { parseAsPath, layoutStraight, layoutFlexible, pickOrigin, centerOffset, clampZoom, TIER1_ASNS, truncateToTier1, groupPolicies, isTier1, reverseForDisplay, topPolicies } from "../.test-build/as-path-layout.js";

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

// truncateToTier1: cut after rightmost tier-1 hop; keep whole when none
assert.deepEqual(truncateToTier1(["7018", "3356", "13335"], TIER1_ASNS), ["7018", "3356"]);
assert.deepEqual(truncateToTier1(["7018", "3356", "6461", "50673"], TIER1_ASNS), ["7018", "3356", "6461"]);
assert.deepEqual(truncateToTier1(["3356", "13335"], TIER1_ASNS), ["3356"], "tier-1 origin side kept");
assert.deepEqual(truncateToTier1(["13335", "15169"], TIER1_ASNS), ["13335", "15169"], "no tier-1 kept whole");

// groupPolicies: identical truncated paths merge, count desc then path asc
const g = groupPolicies(["7018 3356 13335", "7018 3356 15169", "1299 6453 2497", "7018 3356 13335 I"], TIER1_ASNS);
assert.deepEqual(g[0], { path: "7018 3356", count: 3 });
assert.deepEqual(g[1], { path: "1299 6453", count: 1 });
assert.equal(g.length, 2);
assert.deepEqual(groupPolicies([], TIER1_ASNS), []);

// isTier1 for tooltip label
assert.equal(isTier1("3356"), true);
assert.equal(isTier1("13335"), false);

// reverseForDisplay: origin on the left, path flows out to the right (bgp.tools style)
assert.equal(reverseForDisplay("7018 3356 13335"), "13335 3356 7018");
assert.equal(reverseForDisplay("  1299 13335 I"), "13335 1299");
assert.equal(reverseForDisplay(""), "");

// topPolicies: keep the n most frequent routes, report how many were left out
const groupsSample = [{path:"a",count:5},{path:"b",count:3},{path:"c",count:1}];
assert.deepEqual(topPolicies(groupsSample, 2), { shown: [{path:"a",count:5},{path:"b",count:3}], hidden: 1 });
assert.deepEqual(topPolicies(groupsSample, 10), { shown: groupsSample, hidden: 0 });
assert.deepEqual(topPolicies([], 3), { shown: [], hidden: 0 });

console.log("as-path-layout: all assertions passed");

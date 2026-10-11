import assert from "node:assert/strict";
import { parseAsPath, layoutStraight, layoutFlexible } from "../.test-build/as-path-layout.js";

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

console.log("as-path-layout: all assertions passed");

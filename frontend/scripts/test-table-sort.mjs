import assert from "node:assert/strict";
import { nextSortState, sortUnits } from "../.test-build/table-sort.js";
import { summarize } from "../.test-build/series-summary.js";

const units = [
  { name: "ge-0/0/0.0", bps_in: 300, bps_out: 10, oper_status: "up" },
  { name: "ge-0/0/1.0", bps_in: 100, bps_out: 500, oper_status: "down" },
  { name: "ge-0/0/2.0", bps_in: 200, bps_out: 20, oper_status: "up" },
];
const names = (xs) => xs.map((u) => u.name);

// click cycle: none -> asc -> desc -> none; new column starts asc
let s = nextSortState(null, "in");
assert.deepEqual(s, { column: "in", dir: "asc" });
s = nextSortState(s, "in");
assert.deepEqual(s, { column: "in", dir: "desc" });
assert.equal(nextSortState(s, "in"), null);
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

// missing oper_status must not throw (sorts after "up", empty string tiebreak)
assert.doesNotThrow(() => sortUnits([{ name: "a", bps_in: 0, bps_out: 0 }, { name: "b", bps_in: 0, bps_out: 0 }], { column: "status", dir: "asc" }));
assert.deepEqual(names(sortUnits([{ name: "a", bps_in: 0, bps_out: 0 }, { name: "up1", bps_in: 0, bps_out: 0, oper_status: "up" }], { column: "status", dir: "asc" })), ["up1", "a"]);

// summarize
assert.equal(summarize([]), null);
assert.deepEqual(summarize([5]), { min: 5, avg: 5, max: 5 });
assert.deepEqual(summarize([1, 2, 3, 6]), { min: 1, avg: 3, max: 6 });
assert.deepEqual(summarize([NaN, 2, Infinity, 4]), { min: 2, avg: 3, max: 4 });
assert.equal(summarize([NaN]), null);

console.log("table-sort: all assertions passed");

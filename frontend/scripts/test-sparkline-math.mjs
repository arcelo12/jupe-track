import assert from "node:assert/strict";
import { lastPoints, toPath } from "../.test-build/sparkline-math.js";

assert.deepEqual(lastPoints([1, 2, 3, 4, 5], 3), [3, 4, 5]);
assert.deepEqual(lastPoints([1, 2], 30), [1, 2]);
assert.deepEqual(lastPoints([], 30), []);

assert.equal(toPath([], 100, 40, 10), "");
assert.equal(toPath([5], 100, 40, 10), "");
assert.equal(toPath([0, 10], 100, 40, 10), "M0.00,40.00 L100.00,0.00");
assert.equal(toPath([0, 99], 100, 40, 10), "M0.00,40.00 L100.00,0.00");

console.log("sparkline-math: ok");

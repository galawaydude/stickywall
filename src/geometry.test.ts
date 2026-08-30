import assert from "node:assert/strict";
import { screenToWorld, zoomAt } from "./geometry.ts";

const view = { x: 320, y: 180, zoom: 1.25 };
const cursor = { x: 711, y: 493 };
const before = screenToWorld(view, cursor);
const after = screenToWorld(zoomAt(view, cursor, 2.1), cursor);

assert.deepEqual(after, before, "zoom must keep the world point under the cursor fixed");
assert.deepEqual(screenToWorld({ x: 500, y: 400, zoom: 1 }, { x: 500, y: 400 }), { x: 0, y: 0 });
console.log("geometry check passed");

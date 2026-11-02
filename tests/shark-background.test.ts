import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/lib/ascii-sharks/world";
import { escapeReadingArea, overlapsReadingArea } from "../src/lib/ascii-sharks/avoidance";

test("reading clearance includes the fins and leaves open water available", () => {
  const area = { left: 300, top: 250, right: 600, bottom: 350 };
  assert.equal(escapeReadingArea(200, 300, area, 30), null);
  const escape = escapeReadingArea(310, 300, area, 30)!;
  assert.deepEqual(escape, { x: -40, y: 0 });
  assert.equal(overlapsReadingArea(new Float32Array([280, 300]), 100, [area]), true);
  assert.equal(overlapsReadingArea(new Float32Array([200, 300]), 100, [area]), false);
});

test("a shark initially over copy is placed in visible open water and steers clear", () => {
  const world = new World([{ kind: "classic", size: .48 }], 10);
  world.resize(1200, 900, 10, 16);
  world.readingAreas = [{ left: 300, top: 350, right: 700, bottom: 480 }];
  const shark = world.sharks[0];
  for (let k = 0; k < shark.nodes.length; k += 2) {
    shark.nodes[k] = 450 + k;
    shark.nodes[k + 1] = 400;
  }
  world.placeSharks();
  assert.equal(overlapsReadingArea(shark.nodes, shark.length, world.readingAreas), false);
  for (let k = 0; k < shark.nodes.length; k += 2) {
    assert.ok(shark.nodes[k] >= 0 && shark.nodes[k] <= world.width);
    assert.ok(shark.nodes[k + 1] >= 0 && shark.nodes[k + 1] <= world.height);
  }
  for (let frame = 0; frame < 1800; frame++) {
    world.step(1 / 60);
    assert.equal(overlapsReadingArea(shark.nodes, shark.length, world.readingAreas), false);
  }
});

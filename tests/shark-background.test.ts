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

test("80 percent sharks keep swimming around the Stillness controls for two minutes", (t) => {
  let seed = 1234;
  t.mock.method(Math, "random", () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
  const world = new World([{ kind: "classic", size: .8 }, { kind: "classic", size: .8 }], 10);
  world.resize(1010, 805, 8, 12);
  world.readingAreas = [
    { left: 0, top: 30, right: 500, bottom: 185 },
    { left: 0, top: 230, right: 440, bottom: 280 },
    { left: 410, top: 310, right: 600, bottom: 500 },
    { left: 0, top: 555, right: 440, bottom: 610 },
    { left: 0, top: 635, right: 520, bottom: 650 },
    { left: 0, top: 710, right: 540, bottom: 780 },
  ];
  world.placeSharks();
  let previous = world.sharks.map(shark => [shark.nodes[0], shark.nodes[1]]);
  for (let frame = 0; frame < 7200; frame++) {
    const before = world.sharks.map(shark => [shark.nodes[0], shark.nodes[1]]);
    world.step(1 / 60);
    world.sharks.forEach((shark, i) => {
      assert.equal(overlapsReadingArea(shark.nodes, shark.length, world.readingAreas), false);
      assert.ok(Math.hypot(shark.nodes[0] - before[i][0], shark.nodes[1] - before[i][1]) < 3, "no collision jumps");
      if (frame % 120 === 119) {
        assert.ok(Math.hypot(shark.nodes[0] - previous[i][0], shark.nodes[1] - previous[i][1]) > 4, "no two-second stalls");
        previous[i] = [shark.nodes[0], shark.nodes[1]];
      }
    });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAppearance, parseAppearance, oceanSharkSpecs } from "../src/lib/appearance-preferences";
import { DEFAULT_OCEAN_SHARKS, MAX_OCEAN_SHARKS, SHARK_PALETTES } from "../src/lib/shark-palettes";
import { World } from "../src/lib/ascii-sharks/world";

test("appearance migrates old population settings and preserves valid theme colors", () => {
  const migrated = parseAppearance({ theme: "light", shark: "#123456", accent: "#654321", sharks: { large: { count: 6 } } });
  assert.equal(migrated.theme, "light");
  assert.equal(migrated.shark, "#123456");
  assert.equal(migrated.accent, "#654321");
  assert.deepEqual(migrated.sharks, DEFAULT_OCEAN_SHARKS);
  assert.equal(parseAppearance({ accent: "#fc7c59" }).accent, defaultAppearance.accent);
  assert.equal(parseAppearance({ shark: "red" }).shark, defaultAppearance.shark);
});

test("10 distinct palette colors enforce population and size budgets", () => {
  assert.equal(SHARK_PALETTES.length, 10);
  assert.equal(new Set(SHARK_PALETTES.map(palette => palette.color)).size, 10);
  assert.deepEqual(defaultAppearance.sharks.map(shark => shark.size), [1, .7, .84, .77]);
  const parsed = parseAppearance({ sharks: Array.from({ length: 99 }, () => ({ id: "duplicate", palette: "invalid", size: 999 })) });
  assert.equal(parsed.sharks.length, MAX_OCEAN_SHARKS);
  assert.equal(new Set(parsed.sharks.map(shark => shark.id)).size, MAX_OCEAN_SHARKS);
  assert.ok(parsed.sharks.every(shark => shark.size <= 1 && shark.palette === "steel"));
  assert.deepEqual(parseAppearance({ sharks: [] }).sharks, []);
});

test("per-shark color and size edits preserve every swimmer, snout, phase, target and fish", () => {
  const preferences = parseAppearance(null);
  const world = new World(oceanSharkSpecs(preferences), 96, true);
  world.resize(1440, 1000, 12, 17);
  world.step(1 / 60);
  const fish = world.fish;
  const before = [...world.sharks];
  const snapshots = before.map(shark => ({ nodes: [...shark.nodes], phase: shark.phase, target: shark.target, heading: shark.heading }));
  const selected = preferences.sharks[1];
  selected.palette = "rose";
  world.setSharks(oceanSharkSpecs(preferences));
  before.forEach((shark, i) => {
    assert.ok(world.sharks.includes(shark));
    assert.deepEqual([...shark.nodes], snapshots[i].nodes);
    assert.equal(shark.phase, snapshots[i].phase);
  });
  const edited = world.sharks.find(shark => shark.key === selected.id)!;
  assert.equal(edited.color, SHARK_PALETTES.find(palette => palette.id === "rose")!.color);
  const head = [...edited.nodes.slice(0, 2)];
  selected.size = 1;
  world.setSharks(oceanSharkSpecs(preferences));
  assert.ok(world.sharks.includes(edited), "resize retains the same animal");
  assert.deepEqual([...edited.nodes.slice(0, 2)], head);
  assert.equal(edited.length, 440);
  before.forEach((shark, i) => {
    assert.equal(shark.phase, snapshots[i].phase);
    assert.equal(shark.heading, snapshots[i].heading);
    assert.equal(shark.target, snapshots[i].target);
    if (shark !== edited) assert.deepEqual([...shark.nodes], snapshots[i].nodes);
  });
  assert.equal(world.fish, fish);
  preferences.sharks.push({ id: "added", kind: "classic", palette: "purple", size: .7 });
  world.setSharks(oceanSharkSpecs(preferences));
  assert.equal(world.sharks.length, 5);
  assert.ok(before.every(shark => world.sharks.includes(shark)));
  preferences.sharks = preferences.sharks.filter(shark => shark.id !== selected.id);
  world.setSharks(oceanSharkSpecs(preferences));
  assert.equal(world.sharks.length, 4);
  assert.ok(!world.sharks.includes(edited));
  assert.equal(world.fish, fish);
});

test("merged colors migrate without losing shark identity or resetting the ocean", () => {
  const preferences = parseAppearance({ sharks: [
    { id: "mine", palette: "maroon", size: 1 },
    { id: "other", palette: "lilac", size: .84 },
    { id: "warm", palette: "bronze", size: .7 },
  ] });
  assert.deepEqual(preferences.sharks, [
    { id: "mine", kind: "classic", palette: "rose", size: 1 },
    { id: "other", kind: "classic", palette: "purple", size: .84 },
    { id: "warm", kind: "classic", palette: "sand", size: .7 },
  ]);
});

test("reference scale follows the viewport, caps at 800px, and survives resize without respawning", () => {
  const world = new World(oceanSharkSpecs(parseAppearance(null)), 96, true);
  world.resize(1440, 1000, 12, 17);
  const sharks = [...world.sharks], fish = world.fish;
  assert.equal(Math.max(...world.sharks.map(shark => shark.length)), 440);
  for (const [width, height, length] of [[2560, 1440, 633.6], [3840, 2160, 800], [390, 844, 171.6]]) {
    world.resize(width, height, 12, 17);
    assert.ok(Math.abs(Math.max(...world.sharks.map(shark => shark.length)) - length) < .001);
    assert.ok(sharks.every(shark => world.sharks.includes(shark)));
    assert.ok(sharks.every(shark => shark.nodes[0] >= 0 && shark.nodes[0] <= width && shark.nodes[1] >= 0 && shark.nodes[1] <= height));
    assert.equal(world.fish, fish);
  }
});

test("each upstream species can be selected without changing identity, motion, size or color", () => {
  const preferences = parseAppearance(null);
  const world = new World(oceanSharkSpecs(preferences), 96, true);
  world.resize(1440, 1000, 12, 17);
  world.step(1 / 60);
  const selected = preferences.sharks[0];
  const animal = world.sharks.find(shark => shark.key === selected.id)!;
  const snapshots = world.sharks.map(shark => ({ shark, nodes: [...shark.nodes], phase: shark.phase, length: shark.length, color: shark.color }));
  for (const kind of ["hammerhead", "greathammer", "tiger", "zebra", "mako", "thresher", "nurse", "classic"] as const) {
    selected.kind = kind;
    world.setSharks(oceanSharkSpecs(preferences));
    assert.equal(animal.kind, kind);
    snapshots.forEach(before => {
      assert.ok(world.sharks.includes(before.shark));
      assert.deepEqual([...before.shark.nodes], before.nodes);
      assert.equal(before.shark.phase, before.phase);
      assert.equal(before.shark.length, before.length);
      assert.equal(before.shark.color, before.color);
    });
  }
  assert.equal(parseAppearance({ sharks: [{ id: "saved", kind: "hammerhead", palette: "teal", size: 1 }] }).sharks[0].kind, "hammerhead");
  assert.equal(parseAppearance({ sharks: [{ id: "invalid", kind: "unknown" }] }).sharks[0].kind, "classic");
});

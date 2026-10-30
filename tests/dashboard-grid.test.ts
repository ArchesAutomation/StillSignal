import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDashboard } from "../src/lib/process/dashboard";
import {
  dashboardGrid,
  placeCard,
  boundedBox,
  overlaps,
  rowsForHeight,
  type GridBox,
} from "../src/lib/process/dashboard-grid";
import { createRecord, recordSchema } from "../src/lib/process/model";
import { saveProcess, readProcess } from "../src/lib/process/storage";

test("legacy layouts pack without overlap and measured heights do not rewrite saved data", () => {
  const layout = freshDashboard(),
    before = JSON.stringify(layout);
  const grid = dashboardGrid(layout, { preparation: 680, thesis: 290 });
  assert.equal(grid.preparation!.h, rowsForHeight(680));
  const boxes = Object.values(grid);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.equal(overlaps(boxes[i], boxes[j]), false);
  assert.equal(JSON.stringify(layout), before);
});
test("free placement preserves empty space, resizes in both axes and pushes collisions", () => {
  let layout = freshDashboard();
  const grid = dashboardGrid(layout);
  layout = placeCard(layout, grid, "preparation", { x: 6, y: 4, w: 6, h: 12 });
  assert.deepEqual(layout.panels.find((p) => p.id === "preparation")!.grid, {
    x: 6,
    y: 4,
    w: 6,
    h: 12,
  });
  assert.equal(
    layout.panels.find((p) => p.id === "thesis")!.grid!.x,
    grid.thesis!.x,
  );
  let seed = 19;
  for (let i = 0; i < 120; i++) {
    seed = (seed * 16807) % 2147483647;
    const visible = layout.panels.filter((p) => p.visible),
      id = visible[i % visible.length].id;
    const target = boundedBox({
      x: seed % 13,
      y: seed % 45,
      w: (seed % 13) + 1,
      h: (seed % 24) + 1,
    });
    layout = placeCard(layout, dashboardGrid(layout), id, target);
    assert.deepEqual(layout.panels.find((p) => p.id === id)!.grid, target);
    recordSchema.parse(createRecord("layout", layout));
    const boxes = Object.values(dashboardGrid(layout));
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++)
        assert.equal(overlaps(boxes[a], boxes[b]), false);
  }
});
test("coordinates and sizes reload in the owning account and invalid geometry is rejected", async () => {
  const layout = placeCard(
    freshDashboard(),
    dashboardGrid(freshDashboard()),
    "thesis",
    { x: 3, y: 15, w: 9, h: 7 },
  );
  const record = createRecord("layout", layout);
  await saveProcess("grid-alice", [record]);
  assert.deepEqual((await readProcess("grid-alice"))[0], record);
  assert.deepEqual(await readProcess("grid-bob"), []);
  for (const bad of [
    { x: 11, y: 0, w: 4, h: 5 },
    { x: 0, y: -1, w: 4, h: 5 },
    { x: 0, y: 0, w: 0, h: 5 },
    { x: 0, y: 0, w: 4, h: 2 },
    { x: 0, y: 0, w: 4, h: Infinity },
  ] as GridBox[]) {
    assert.throws(() =>
      recordSchema.parse({
        ...record,
        body: {
          ...layout,
          panels: layout.panels.map((p, i) =>
            i === 0 ? { ...p, grid: bad } : p,
          ),
        },
      }),
    );
  }
});

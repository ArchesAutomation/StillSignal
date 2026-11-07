import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeRemovedModuleSpace,
  resizeModuleBox,
  snapModuleBox,
  canPlaceModule,
  alignModuleSpacing,
  limitModuleResize,
  type ResizeEdge,
} from "../src/lib/module-geometry";
import { moduleBoard, materializeBoard } from "../src/lib/module-board";
import { emptyModuleLayout, readModuleLayout } from "../src/lib/module-layout";

test("saved horizontal and vertical gutters survive viewport changes and repeated saves", () => {
  let layout = emptyModuleLayout();
  const source = {
    a: { x: 0, y: 0, w: 400, h: 300 },
    b: { x: 416, y: 0, w: 400, h: 300 },
    c: { x: 416, y: 316, w: 400, h: 300 },
  };
  const modules = Object.keys(source).map((id, order) => ({
    id,
    order,
    section: "main",
    width: 4,
    initiallyHidden: false,
  }));
  for (const [order, [id, box]] of Object.entries(source).entries())
    layout.modules[id] = {
      section: "main",
      order,
      width: 4,
      hidden: false,
      heightMode: "fixed",
      box,
    };
  for (const width of [900, 1800, 1200, 1024]) {
    const boxes = moduleBoard(layout, modules, {}, width);
    assert.ok(
      Math.abs(((boxes.b.x - boxes.a.x - boxes.a.w) * width) / 1200 - 16) <
        0.001,
    );
    assert.equal(boxes.c.y - boxes.b.y - boxes.b.h, 16);
    layout = readModuleLayout(
      JSON.stringify(materializeBoard(layout, modules, boxes, width)),
    );
  }
});

test("auto content keeps attached neighbors at the same gutter on growth and shrink", () => {
  const layout = emptyModuleLayout();
  layout.modules.a = {
    section: "main",
    order: 0,
    width: 4,
    hidden: false,
    heightMode: "auto",
    box: { x: 0, y: 0, w: 400, h: 300 },
  };
  layout.modules.b = {
    ...layout.modules.a,
    order: 1,
    box: { x: 0, y: 316, w: 400, h: 300 },
  };
  const modules = ["a", "b"].map((id, order) => ({
    id,
    order,
    section: "main",
    width: 4,
    initiallyHidden: false,
  }));
  for (const height of [200, 400]) {
    const boxes = moduleBoard(layout, modules, { a: height });
    assert.equal(boxes.b.y - boxes.a.h, 16);
  }
});

test("gutters take priority over distant alignment and occupied placements reject both axes", () => {
  const a = { x: 0, y: 0, w: 400, h: 300 };
  assert.equal(
    snapModuleBox(
      { x: 413, y: 0, w: 300, h: 300 },
      [a, { x: 412, y: 2000, w: 300, h: 300 }],
      1200,
      "move",
    ).x,
    416,
  );
  assert.equal(
    canPlaceModule({ x: 401, y: 0, w: 300, h: 300 }, [a], 1200),
    false,
  );
  assert.equal(
    canPlaceModule({ x: 0, y: 301, w: 300, h: 300 }, [a], 1200),
    false,
  );
  assert.equal(
    canPlaceModule({ x: 416, y: 0, w: 300, h: 300 }, [a], 1200),
    true,
  );
  const boxes = { a, b: { x: 425, y: 0, w: 300, h: 300 } };
  assert.equal(alignModuleSpacing(boxes, 1200).b.x, 416);
  assert.equal(boxes.b.x, 425, "spacing repair preserves its undo source");
  const cluster = alignModuleSpacing(
    {
      a: { ...a, w: 300 },
      b: { ...a, x: 301, w: 300 },
      c: { ...a, x: 602, w: 300 },
    },
    1200,
  );
  assert.equal(cluster.b.x, 316);
  assert.equal(cluster.c.x, 632, "a run of tight gaps is repaired together");
});

test("all eight resize directions anchor opposite edges and side resizing changes one axis", () => {
  const start = { x: 300, y: 300, w: 400, h: 300 };
  for (const edge of [
    "n",
    "s",
    "e",
    "w",
    "ne",
    "nw",
    "se",
    "sw",
  ] as ResizeEdge[]) {
    const box = resizeModuleBox(start, 24, 24, edge);
    if (edge.includes("w")) assert.equal(box.x + box.w, start.x + start.w);
    else assert.equal(box.x, start.x);
    if (edge.includes("n")) assert.equal(box.y + box.h, start.y + start.h);
    else assert.equal(box.y, start.y);
    if (edge === "e" || edge === "w") assert.equal(box.h, start.h);
    if (edge === "n" || edge === "s") assert.equal(box.w, start.w);
    const snapped = snapModuleBox(
      box,
      [{ x: 900, y: 0, w: 200, h: 304 }],
      1200,
      edge,
    );
    if (edge === "e" || edge === "w") assert.equal(snapped.h, start.h);
  }
});

test("resizing stops at occupied gutters instead of displacing a neighbor", () => {
  const start = { x: 0, y: 0, w: 300, h: 300 };
  const peers = [
    { x: 500, y: 0, w: 300, h: 300 },
    { x: 0, y: 500, w: 300, h: 300 },
  ];
  const before = JSON.stringify(peers);
  const wide = limitModuleResize(start, { ...start, w: 700 }, peers, 1200);
  const tall = limitModuleResize(start, { ...start, h: 700 }, peers, 1200);
  assert.ok(Math.abs(wide.w - 484) < 0.02);
  assert.ok(Math.abs(tall.h - 484) < 0.02);
  assert.equal(JSON.stringify(peers), before);
  const compact = { ...start, h: 86 };
  assert.equal(
    snapModuleBox(resizeModuleBox(compact, 20, 0, "e"), [], 1200, "e").h,
    86,
  );
});

test("an empty conditional module closes its attached gap and can reappear", () => {
  const layout = emptyModuleLayout();
  const modules = ["a", "invitation", "b"].map((id, order) => ({
    id,
    order,
    section: "main",
    width: 12,
    initiallyHidden: false,
  }));
  for (const [order, module] of modules.entries())
    layout.modules[module.id] = {
      section: "main",
      order,
      width: 12,
      hidden: false,
      box: { x: 0, y: order * 116, w: 1200, h: 100 },
    };
  const closed = moduleBoard(layout, modules, {
    a: 100,
    invitation: 0,
    b: 100,
  });
  assert.equal(closed.invitation, undefined);
  assert.equal(closed.b.y, 116);
  assert.equal(
    moduleBoard(layout, modules, { a: 100, invitation: 100, b: 100 }).b.y,
    232,
  );
});

test("left resizing anchors the right edge at minimum width and board boundary", () => {
  const start = { x: 700, y: 20, w: 400, h: 200 };
  assert.deepEqual(resizeModuleBox(start, 100, -24, true), {
    x: 800,
    y: 20,
    w: 300,
    h: 176,
  });
  const smallest = resizeModuleBox(start, 600, 0, true);
  assert.equal(smallest.w, 180);
  assert.equal(smallest.x + smallest.w, 1100);
  const widest = resizeModuleBox(start, -900, 0, true);
  assert.equal(widest.x, 0);
  assert.equal(widest.w, 1100);
});

test("snapping uses the same visible gap at different board widths", () => {
  for (const width of [900, 1200, 1800]) {
    const peer = { x: 0, y: 0, w: 400, h: 300 };
    const gapX = (16 * 1200) / width;
    const result = snapModuleBox(
      { x: 400 + gapX + 3, y: 4, w: 300, h: 300 },
      [peer],
      width,
      "move",
    );
    assert.ok(Math.abs(((result.x - 400) * width) / 1200 - 16) <= width / 1200);
    assert.equal(result.y, 0);
    assert.deepEqual(
      peer,
      { x: 0, y: 0, w: 400, h: 300 },
      "snapping does not change neighbors",
    );
  }
});

test("two stacked cards can share the exact bottom edge of a tall neighbor", () => {
  const tall = { x: 0, y: 0, w: 400, h: 340 };
  const top = { x: 416, y: 0, w: 300, h: 160 };
  const lower = snapModuleBox(
    { x: 416, y: 176, w: 300, h: 160 },
    [tall, top],
    1200,
    "resize",
  );
  assert.equal(lower.y - top.h, 16);
  assert.equal(lower.y + lower.h, tall.h);
});

test("hiding closes the removed space while retaining column, order, and other columns", () => {
  const boxes = {
    removed: { x: 0, y: 100, w: 400, h: 200 },
    below: { x: 0, y: 316, w: 400, h: 200 },
    last: { x: 0, y: 532, w: 400, h: 200 },
    other: { x: 416, y: 316, w: 300, h: 300 },
  };
  const result = closeRemovedModuleSpace(boxes, "removed");
  assert.equal(result.below.y, 100);
  assert.equal(result.last.y, 316);
  assert.deepEqual(result.other, boxes.other);
  assert.equal(boxes.below.y, 316, "undo source is untouched");
  const blocked = closeRemovedModuleSpace(
    { ...boxes, spanning: { x: 0, y: 0, w: 800, h: 150 } },
    "removed",
  );
  assert.equal(blocked.below.y, 166, "a remaining card prevents overlap");
});

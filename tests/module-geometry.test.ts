import { test } from "node:test";
import assert from "node:assert/strict";
import { closeRemovedModuleSpace, resizeModuleBox, snapModuleBox } from "../src/lib/module-geometry";

test("left resizing anchors the right edge at minimum width and board boundary", () => {
  const start = { x: 700, y: 20, w: 400, h: 200 };
  assert.deepEqual(resizeModuleBox(start, 100, -24, true), { x: 800, y: 20, w: 300, h: 176 });
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
    const gapX = 16 * 1200 / width;
    const result = snapModuleBox({ x: 400 + gapX + 3, y: 4, w: 300, h: 300 }, [peer], width, "move");
    assert.ok(Math.abs((result.x - 400) * width / 1200 - 16) <= width / 1200);
    assert.equal(result.y, 0);
    assert.deepEqual(peer, { x: 0, y: 0, w: 400, h: 300 }, "snapping does not change neighbors");
  }
});

test("two stacked cards can share the exact bottom edge of a tall neighbor", () => {
  const tall = { x: 0, y: 0, w: 400, h: 340 };
  const top = { x: 416, y: 0, w: 300, h: 160 };
  const lower = snapModuleBox({ x: 416, y: 176, w: 300, h: 160 }, [tall, top], 1200, "resize");
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
  const blocked = closeRemovedModuleSpace({ ...boxes, spanning: { x: 0, y: 0, w: 800, h: 150 } }, "removed");
  assert.equal(blocked.below.y, 166, "a remaining card prevents overlap");
});

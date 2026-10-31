import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyModuleLayout, readModuleLayout, boundModuleBox } from "../src/lib/module-layout";
import { moduleBoard, materializeBoard, placeModule } from "../src/lib/module-board";

test("legacy sections migrate to initial board positions and explicit coordinates retain empty space", () => {
  const layout = emptyModuleLayout();
  const modules = [{ id: "writing", section: "main", order: 0, width: 12, initiallyHidden: false }, { id: "calendar", section: "side", order: 0, width: 12, initiallyHidden: false }];
  const positions = moduleBoard(layout, modules, { writing: 500, calendar: 300 });
  assert.ok(positions.calendar.x > positions.writing.x);
  const initialized = materializeBoard(layout, modules, positions);
  const moved = placeModule(initialized, "writing", { x: 456, y: 1200, w: 480, h: 500 });
  assert.deepEqual(moduleBoard(moved, modules).writing, { x: 456, y: 1200, w: 480, h: 500 });
  assert.deepEqual(moved.modules.calendar.box, initialized.modules.calendar.box, "neighbors do not dictate where a card can go");
  const loaded = readModuleLayout(JSON.stringify(moved));
  assert.deepEqual(loaded.modules.writing.box, moved.modules.writing.box);
  assert.equal(layout.modules.writing, undefined, "migration does not mutate the saved layout");
});

test("custom modules roundtrip safely and invalid geometry cannot break the board", () => {
  const layout = emptyModuleLayout();
  layout.custom = [{ id: "custom-note", title: "Rules", text: "Wait for confirmation" }];
  layout.modules["custom-note"] = { section: "main", order: 0, width: 4, hidden: false, box: { x: 120, y: 144, w: 384, h: 288 } };
  const loaded = readModuleLayout(JSON.stringify(layout));
  assert.deepEqual(loaded.custom, layout.custom);
  assert.deepEqual(loaded.modules["custom-note"].box, layout.modules["custom-note"].box);
  assert.deepEqual(boundModuleBox({ x: -100, y: -200, w: 9000, h: -5 }), { x: 0, y: 0, w: 1200, h: 120 });
});

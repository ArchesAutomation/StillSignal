import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dashboardRecords,
  freshDashboard,
  moveCard,
  normalizeLayout,
} from "../src/lib/process/dashboard";
import { defaultLayout, validateAppend } from "../src/lib/process/engine";
import { createRecord, latest, recordSchema } from "../src/lib/process/model";
import { readProcess, saveProcess } from "../src/lib/process/storage";

test("six-card saved layouts retain order, visibility, widths and status choices", () => {
  const old = defaultLayout();
  old.body.panels.reverse();
  old.body.panels[0].visible = false;
  old.body.panels[2].width = "wide";
  old.body.statusWidgets = [];
  const loaded = recordSchema.parse(old);
  assert.equal(loaded.kind, "layout");
  const next = normalizeLayout(old.body);
  assert.deepEqual(next.panels.slice(0, 6), old.body.panels);
  assert.deepEqual(next.panels.at(-1), {
    id: "variables",
    visible: false,
    width: "normal",
  });
  assert.deepEqual(next.statusWidgets, []);
  assert.deepEqual(normalizeLayout(next), next);
  assert.equal(old.body.panels.length, 6);
});

test("hidden cards do not interfere with visible-card ordering, and schemas reject duplicates", () => {
  const layout = freshDashboard();
  layout.panels.find((p) => p.id === "thesis")!.visible = false;
  const moved = moveCard(layout, "preparation", "process");
  assert.deepEqual(
    moved.panels
      .filter((p) => p.visible)
      .map((p) => p.id)
      .slice(0, 2),
    ["process", "preparation"],
  );
  assert.equal(layout.panels[0].id, "preparation");
  const record = createRecord("layout", moved);
  assert.throws(() =>
    recordSchema.parse({
      ...record,
      body: {
        ...moved,
        panels: [...moved.panels.slice(0, -1), moved.panels[0]],
      },
    }),
  );
  const id = crypto.randomUUID();
  assert.throws(() =>
    recordSchema.parse(
      createRecord("layout", { ...moved, variableIds: [id, id] }),
    ),
  );
  assert.deepEqual(
    createRecord("layout", { ...moved, variableIds: [] }).body.variableIds,
    [],
  );
});

test("named dashboards, selected variables and a single home survive reloads without crossing owners", async () => {
  const owner = "dashboard-owner",
    other = "dashboard-other";
  const a = dashboardRecords(freshDashboard(), undefined, []);
  await saveProcess(owner, a.batch);
  const variableId = crypto.randomUUID();
  const b = dashboardRecords(
    {
      ...freshDashboard(),
      name: "During session",
      isDefault: true,
      variableIds: [variableId],
    },
    undefined,
    [a.record],
  );
  validateAppend(await readProcess(owner), b.batch, []);
  await saveProcess(owner, b.batch);
  const loaded = latest(await readProcess(owner), "layout");
  assert.equal(loaded.filter((r) => r.body.isDefault).length, 1);
  assert.deepEqual(
    loaded.find((r) => r.body.name === "During session")!.body.variableIds,
    [variableId],
  );
  assert.equal((await readProcess(other)).length, 0);
  const updated = dashboardRecords(
    {
      ...b.record.body,
      panels: b.record.body.panels.map((p) => ({ ...p, visible: false })),
    },
    b.record,
    loaded,
  );
  await saveProcess(owner, updated.batch);
  const head = latest(await readProcess(owner), "layout").find(
    (r) => r.rootId === b.record.rootId,
  )!;
  assert.ok(head.body.panels.every((p) => !p.visible));
  assert.equal(head.revision, 2);
  await assert.rejects(
    saveProcess(
      owner,
      dashboardRecords(
        { ...b.record.body, name: "Stale tab" },
        b.record,
        loaded,
      ).batch,
    ),
    /newer revision/,
  );
  assert.equal(
    latest(await readProcess(owner), "layout").find(
      (r) => r.rootId === b.record.rootId,
    )!.id,
    head.id,
  );
});

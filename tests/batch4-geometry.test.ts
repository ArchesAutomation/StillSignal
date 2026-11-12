import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import ModuleWorkspace, {
  WorkspaceModule,
} from "../src/components/module-workspace";
import DashboardCanvas from "../src/components/process/dashboard-canvas";
import { moduleBoard } from "../src/lib/module-board";
import { emptyModuleLayout, moduleLayoutKey } from "../src/lib/module-layout";
import { freshDashboard } from "../src/lib/process/dashboard";
import { dashboardGrid, placeCard } from "../src/lib/process/dashboard-grid";
import { createRecord, recordSchema } from "../src/lib/process/model";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {}, scrollIntoView() {} });
  const root = createRoot(document.getElementById("root")!);
  return { dom, root, async close() { await act(async () => root.unmount()); dom.window.close(); } };
}

test("dashboard vertical resizing survives its content measurement", async () => {
  const ui = setup();
  let measure: ResizeObserverCallback | undefined;
  const Observer = class {
    constructor(callback: ResizeObserverCallback) { measure = callback; }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(globalThis, "ResizeObserver", { value: Observer, configurable: true });
  Object.defineProperty(ui.dom.window, "ResizeObserver", { value: Observer, configurable: true });
  let layout = freshDashboard();
  const render = () => h(DashboardCanvas, { layout, editing: true, disabled: false, onInteracting() {}, onChange(next) { layout = next; }, children: h(WorkspaceModule, { id: "preparation", title: "Pre-market non-negotiables", children: "Measured content" }) });
  try {
    await act(async () => ui.root.render(render()));
    const inner = document.querySelector<HTMLElement>('[data-module-id="preparation"]')!;
    inner.getBoundingClientRect = () => ({ height: 180 } as DOMRect);
    await act(async () => measure!([{ target: inner } as unknown as ResizeObserverEntry], {} as ResizeObserver));
    const card = () => document.querySelector<HTMLElement>('[data-module-id="preparation"]')!;
    const before = 180;
    await act(async () => card().querySelector('[aria-label="Resize Pre-market non-negotiables"]')!.dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => ui.root.render(render()));
    assert.equal(card().style.height, `${before + 12}px`);
    await act(async () => measure!([{ target: inner } as unknown as ResizeObserverEntry], {} as ResizeObserver));
    assert.equal(card().style.height, `${before + 12}px`, "content measurement must not undo a manual resize");
    assert.equal(layout.workspace!.modules.preparation.heightMode, "fixed");
    recordSchema.parse(createRecord("layout", layout));
  } finally {
    await ui.close();
    Object.defineProperty(globalThis, "ResizeObserver", { value: undefined, configurable: true });
  }
});

test("Home fits a fixed module to live content instead of leaving it fixed", async () => {
  const ui = setup(), layout = emptyModuleLayout();
  layout.modules.writing = { section: "main", order: 0, width: 12, hidden: false, heightMode: "fixed", height: 400, box: { x: 0, y: 0, w: 800, h: 400 } };
  localStorage.setItem(moduleLayoutKey("batch4", "Journal"), JSON.stringify(layout));
  try {
    await act(async () => ui.root.render(h(ModuleWorkspace, { owner: "batch4", page: "Journal", children: h(WorkspaceModule, { id: "writing", title: "Writing", children: h("p", null, "Live content") }) })));
    await act(async () => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Customize workspace")!.click());
    await act(async () => document.querySelector('[aria-label="Resize Writing"]')!.dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    assert.equal(document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style.height, "");
  } finally { await ui.close(); }
});

test("saved height mode is optional for legacy dashboards and fixed sizing roundtrips", () => {
  const legacy = freshDashboard();
  assert.doesNotThrow(() => recordSchema.parse(createRecord("layout", legacy)));
  const fixed = placeCard(legacy, dashboardGrid(legacy), "thesis", { x: 0, y: 0, w: 6, h: 20 }, "fixed");
  const record = recordSchema.parse(JSON.parse(JSON.stringify(createRecord("layout", fixed))));
  assert.equal(record.kind, "layout");
  if (record.kind !== "layout") return;
  assert.equal(dashboardGrid(record.body, { thesis: 160 }).thesis!.h, 20);
  const auto = { ...record.body, panels: record.body.panels.map(p => p.id === "thesis" ? { ...p, heightMode: "auto" as const } : p) };
  assert.ok(dashboardGrid(auto, { thesis: 160 }).thesis!.h < 20);
  assert.equal(record.body.panels.find(p => p.id === "thesis")!.heightMode, "fixed");
});

test("long card content reflows its neighbor and closing restores saved spacing", () => {
  const layout = emptyModuleLayout();
  const modules = ["long", "neighbour"].map((id, order) => ({ id, order, section: "main", width: 12, initiallyHidden: false }));
  layout.modules.long = { section: "main", order: 0, width: 12, hidden: false, heightMode: "auto", box: { x: 0, y: 0, w: 1200, h: 300 } };
  layout.modules.neighbour = { section: "main", order: 1, width: 12, hidden: false, box: { x: 0, y: 340, w: 1200, h: 200 } };
  const saved = JSON.stringify(layout);
  const expanded = moduleBoard(layout, modules, { long: 3800, neighbour: 200 });
  assert.ok(expanded.neighbour.y >= expanded.long.y + expanded.long.h + 16);
  assert.equal(moduleBoard(layout, modules, { long: 300, neighbour: 200 }).neighbour.y, 340);
  assert.equal(JSON.stringify(layout), saved, "content measurements never rewrite the saved template");
});

test("an unpositioned long editor cannot overlap a neighbor with saved coordinates", () => {
  const layout = emptyModuleLayout();
  const modules = ["long", "neighbour"].map((id, order) => ({ id, order, section: "main", width: 12, initiallyHidden: false }));
  layout.modules.neighbour = { section: "main", order: 1, width: 12, hidden: false, box: { x: 0, y: 340, w: 1200, h: 200 } };
  const expanded = moduleBoard(layout, modules, { long: 3800, neighbour: 200 });
  assert.ok(expanded.neighbour.y >= expanded.long.y + 3800 + 16);
});

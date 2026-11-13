import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import ModuleWorkspace, {
  WorkspaceModule,
} from "../src/components/module-workspace";
import {
  emptyModuleLayout,
  moduleLayoutKey,
  moveModule,
  readModuleLayout,
} from "../src/lib/module-layout";

test("module layouts validate sections, reject invalid placement and move between sections", () => {
  const value = emptyModuleLayout();
  value.modules.a = { section: "main", order: 0, width: 6, hidden: false };
  value.modules.b = { section: "side", order: 0, width: 12, hidden: false };
  const moved = moveModule(value, "a", value.modules.a, "side", "b");
  assert.equal(moved.modules.a.section, "side");
  assert.equal(moved.modules.a.order, 0);
  assert.equal(moved.modules.b.order, 1);
  assert.equal(value.modules.a.section, "main", "original remains untouched");
  assert.equal(moveModule(value, "a", value.modules.a, "unknown"), value);
  const roundtrip = readModuleLayout(JSON.stringify(moved));
  assert.equal(roundtrip.modules.a.width, 6);
  assert.deepEqual(readModuleLayout("null"), emptyModuleLayout());
  assert.deepEqual(
    readModuleLayout(
      JSON.stringify({
        sections: value.sections,
        modules: { invalid: { ...value.modules.a, width: 999 } },
      }),
    ).modules,
    {},
  );
  assert.notEqual(
    moduleLayoutKey("one", "Journal"),
    moduleLayoutKey("two", "Journal"),
  );
});

test("free board movement, custom modules, hiding and adding preserve state across save and reload", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let mounts = 0;
  function Writing() {
    const [text, setText] = useState(() => {
      mounts++;
      return "Draft words";
    });
    return createElement("input", {
      "aria-label": "Draft words",
      value: text,
      onChange: (event) => setText(event.currentTarget.value),
    });
  }
  const render = (owner = "one") =>
    createElement(ModuleWorkspace, {
      owner,
      page: "Journal",
      children: [
        createElement(WorkspaceModule, {
          key: "writing",
          id: "writing",
          title: "Writing",
          section: "main",
          parts: [{ id: "hint", title: "Writing hint", selector: ".hint" }],
          children: createElement(
            "div",
            null,
            createElement(Writing),
            createElement("p", { className: "hint" }, "Optional writing hint"),
          ),
        }),
        createElement(WorkspaceModule, {
          key: "calendar",
          id: "calendar",
          title: "Calendar",
          section: "side",
          children: createElement("p", null, "Calendar content"),
        }),
        createElement(WorkspaceModule, {
          key: "optional",
          id: "optional",
          title: "Optional",
          initiallyHidden: true,
          children: createElement("p", null, "Optional content"),
        }),
      ],
    });
  const click = async (name: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
    );
    assert.ok(button, name);
    await act(async () => button.click());
  };
  const select = async (label: string, value: string) => {
    const node = document.querySelector<HTMLSelectElement>(
      `select[aria-label="${label}"]`,
    )!;
    assert.ok(node, label);
    await act(async () => {
      node.value = value;
      node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(render()));
    const input = document.querySelector('input[aria-label="Draft words"]');
    const initialTop = document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style.top;
    assert.ok(input);
    await click("Customize workspace");
    await click("Edit inside Writing");
    const hint = document.querySelector<HTMLInputElement>(
      ".ss-module-parts input",
    )!;
    await act(async () => hint.click());
    assert.equal(
      document.querySelector<HTMLElement>(".hint")?.style.display,
      "none",
      "internal content visibility changes immediately",
    );
    const grip = document.querySelector<HTMLButtonElement>(
      '[aria-label="Drag Writing module"]',
    )!;
    await act(async () => {
      grip.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
        }),
      );
    });
    assert.ok(
      document.querySelector('.ss-free-board > [data-module-id="writing"]'),
    );
    assert.equal(
      document.querySelector('input[aria-label="Draft words"]'),
      input,
    );
    assert.equal(mounts, 1, "moving never remounts the form");
    const resize = document.querySelector<HTMLButtonElement>(
      '[aria-label="Resize Writing"]',
    )!;
    await act(async () => {
      resize.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
        }),
      );
    });
    assert.equal(
      document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style
        .height,
      "312px",
    );
    await click("Undo");
    assert.equal(
      document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style
        .height,
      "",
    );
    await click("Redo");
    assert.equal(
      document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style
        .height,
      "312px",
    );
    await click("Hide Writing module");
    assert.ok(document.querySelector('[hidden] [data-module-id="writing"]'));
    await click("Add modules");
    const card = [
      ...document.querySelectorAll(".ss-module-library article"),
    ].find((n) => n.textContent?.startsWith("Writing"))!;
    await act(async () => card.querySelector("button")!.click());
    assert.equal(mounts, 1, "adding a hidden module preserves its state");
    const beforeMove = parseFloat(document.querySelector<HTMLElement>('[data-module-id="writing"]')!.style.top);
    await act(async () => {
      grip.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
        }),
      );
    });
    await click("Save layout");
    const stored = readModuleLayout(
      localStorage.getItem(moduleLayoutKey("one", "Journal")),
    );
    assert.equal(stored.modules.writing.box!.y, beforeMove + 12);
    assert.equal(stored.modules.writing.height, 312);
    await click("Customize workspace");
    await click("Reset");
    await click("Cancel");
    assert.equal(
      (document.querySelector('[data-module-id="writing"]') as HTMLElement)
        .style.top,
      `${beforeMove + 12}px`,
    );
    await act(async () => root.render(render("two")));
    assert.equal(
      (document.querySelector('[data-module-id="writing"]') as HTMLElement)
        .style.top,
      initialTop,
      "another owner gets defaults",
    );
    await act(async () => root.render(render()));
    assert.equal(
      (document.querySelector('[data-module-id="writing"]') as HTMLElement)
        .style.top,
      `${beforeMove + 12}px`,
      "saved configuration reloads",
    );
    assert.equal(
      document.querySelector<HTMLElement>(".hint")?.style.display,
      "none",
      "internal configuration also reloads",
    );
    await click("Customize workspace");
    await click("Create module");
    assert.ok(document.querySelector(".ss-custom-module"));
    await click("Undo");
    assert.equal(document.querySelector(".ss-custom-module"), null);
    await click("Redo");
    assert.ok(document.querySelector(".ss-custom-module"));
    assert.equal(
      document.querySelector('input[aria-label="Draft words"]'),
      input,
    );
    await click("Cancel");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("cards keep showing their content while the board is edited, but it is view-only", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const root = createRoot(document.getElementById("root")!);
  let presses = 0;
  const render = () =>
    createElement(ModuleWorkspace, {
      owner: "visible-cards",
      page: "Journal",
      children: [
        createElement(WorkspaceModule, {
          key: "notes",
          id: "notes",
          title: "Notes",
          children: createElement(
            "section",
            null,
            createElement("h2", null, "Your notes"),
            createElement(
              "button",
              { type: "button", onClick: () => presses++ },
              "Add a note",
            ),
          ),
        }),
        createElement(WorkspaceModule, {
          key: "chart",
          id: "chart",
          title: "Chart",
          children: createElement("p", null, "Heart rate chart"),
        }),
      ],
    });
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
    )!;
  try {
    await act(async () => root.render(render()));
    await act(async () => button("Customize workspace").click());
    assert.ok(document.querySelector(".ss-free-board-editing"), "board is in editing mode");
    for (const [id, text] of [
      ["notes", "Your notes"],
      ["chart", "Heart rate chart"],
    ]) {
      const card = document.querySelector<HTMLElement>(
        `.ss-free-board [data-module-id="${id}"]`,
      )!;
      assert.ok(card.classList.contains("ss-module-editing"), id);
      const content = card.querySelector<HTMLElement>(".ss-module-content")!;
      assert.ok(content, `${id} still renders its content`);
      assert.match(content.textContent!, new RegExp(text), `${id} content is shown`);
      assert.equal(content.closest("[hidden]"), null, `${id} content is not hidden`);
      assert.ok(content.hasAttribute("inert"), `${id} content is view-only`);
      assert.ok(
        card.querySelector(".ss-module-surface")!.hasAttribute("inert"),
        `${id} surface is view-only`,
      );
      assert.ok(
        card.querySelector(".ss-module-move-surface"),
        `${id} can still be moved`,
      );
    }
    const inner = button("Add a note");
    assert.ok(inner.closest("[inert]"), "buttons inside cards cannot be used while editing");
    await act(async () => button("Cancel").click());
    assert.equal(document.querySelector(".ss-module-move-surface"), null);
    assert.equal(
      document.querySelector('[data-module-id="notes"] [inert]'),
      null,
      "leaving editing restores interactivity",
    );
    await act(async () => button("Add a note").click());
    assert.equal(presses, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("the move surface stays see-through above app-wide button colours", async () => {
  const { readFile } = await import("node:fs/promises");
  // surfaces.css is unlayered, so it outranks the "legacy" layer that holds
  // module-layout.css. Its generic button colour once painted the move surface
  // solid and hid every card while editing.
  const surfaces = await readFile(
    new URL("../src/app/surfaces.css", import.meta.url),
    "utf8",
  );
  const rule = surfaces.match(
    /html \.ss-app :is\(\.ss-module-move-surface, \.ss-module-resize\)\s*\{([^}]*)\}/,
  );
  assert.ok(rule, "surfaces.css keeps the move surface and resize handle rule");
  assert.match(rule[1], /background:\s*transparent/);
  const generic = surfaces.indexOf("html .ss-app :is(button, summary)");
  assert.ok(generic >= 0 && generic < rule.index!, "the rule follows the generic button colour");
});

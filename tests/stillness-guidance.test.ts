import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { StillnessLibrary } from "../src/components/stillness-library";
import { catalogue, stillnessLibraryResults, stillnessMoments } from "../src/lib/stillness-catalogue";
import { defaultStillnessQuote } from "../src/lib/stillness-practices";
import { readProcess, saveProcess } from "../src/lib/process/storage";
import type { ProcessStore } from "../src/components/process/use-process";

async function setup() {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let owner = crypto.randomUUID();
  let writes = 0;
  let reflections = 0;
  const store: ProcessStore = {
    records: [], loaded: true, busy: false, error: "", syncState: "local", setError() {}, refresh: async () => {},
    save: async records => { writes++; await saveProcess(owner, records); store.records = await readProcess(owner); return true; },
  };
  async function render(nextOwner = owner, page: "Stillness" | "Preparation" | "Done" = "Stillness", active = true) {
    owner = nextOwner;
    await act(async () => root.render(createElement(StillnessLibrary, {
      owner, page, active, store, onPage() {}, onOpenDay() {}, onReflect: async () => { reflections++; },
    })));
  }
  function button(label: string, scope: ParentNode = document) {
    const found = [...scope.querySelectorAll("button")].find(button => button.textContent?.trim() === label);
    assert.ok(found, `button: ${label}`); return found;
  }
  async function click(label: string, scope?: ParentNode) { await act(async () => button(label, scope).click()); }
  async function choose(id: string) {
    const item = catalogue.find(item => item.id === id)!;
    const card = [...document.querySelectorAll<HTMLButtonElement>(".ss-support-card")].find(card => card.textContent?.includes(item.name));
    assert.ok(card); await act(async () => card.click());
  }
  function player() { const dialog = document.querySelector("dialog[open]"); assert.ok(dialog); return dialog; }
  async function language(value: string) {
    const select = player().querySelector("select")!;
    await act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  }
  async function field(selector: string, value: string) {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype = element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  await render();
  return { dom, render, click, choose, player, language, field, store, owner: () => owner, writes: () => writes, reflections: () => reflections,
    close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}

test("new practice language and deeper understanding preserve the current step; away never advances with time", async () => {
  const ui = await setup();
  try {
    await ui.choose("fix-a-loss"); await ui.click("Try sequence");
    assert.match(ui.player().textContent!, /STEP 1 OF 5/);
    assert.equal(ui.player().querySelector("details")!.open, false);
    await act(async () => ui.player().querySelector("summary")!.click());
    assert.equal(ui.player().querySelector("details")!.open, true);
    await ui.language("direct");
    assert.doesNotMatch(ui.player().textContent!, /Presence can begin/);
    assert.match(ui.player().textContent!, /STEP 1 OF 5/);
    await ui.language("spiritual");
    assert.match(ui.player().textContent!, /Presence can begin/);
    await act(async () => { window.dispatchEvent(new ui.dom.window.Event("blur")); window.dispatchEvent(new ui.dom.window.Event("focus")); await new Promise(resolve => setTimeout(resolve, 1100)); });
    assert.match(ui.player().textContent!, /STEP 1 OF 5/);
    assert.match(ui.player().querySelector(".ss-support-count")!.textContent!, /Take the time you need/);
    await ui.click("I’m back", ui.player());
    assert.match(ui.player().textContent!, /STEP 2 OF 5/);
    await ui.click("Take more time away");
    assert.match(ui.player().textContent!, /STEP 1 OF 5/);
    assert.equal(ui.writes(), 0);
  } finally { await ui.close(); }
});

test("library shows every card without a sidebar; a card opens the complete overview without starting a draft", async () => {
  const ui = await setup();
  try {
    assert.equal(document.querySelectorAll(".ss-support-card").length, catalogue.length);
    assert.equal(document.querySelector('[aria-label="Support preview"]'), null);
    assert.equal(document.querySelector("dialog[open]"), null);
    await ui.choose("fix-a-loss");
    assert.ok(ui.player().classList.contains("ss-support-overview"));
    assert.equal(ui.player().querySelectorAll(".ss-support-overview-steps li").length, 5);
    assert.match(ui.player().textContent!, /The question can remain unanswered while you are away/);
    assert.match(ui.player().textContent!, /A factual review can have its own time later/);
    await ui.language("direct");
    assert.doesNotMatch(ui.player().textContent!, /Presence can begin/);
    assert.equal(localStorage.getItem(`ss-stillness-practice:${ui.owner()}`), null);
    await act(async () => ui.player().querySelector<HTMLButtonElement>(".ss-support-overview-steps button")!.click());
    assert.match(ui.player().textContent!, /PREVIEW \/ INDIVIDUAL PIECE/);
    await ui.click("Back to preview");
    assert.equal(ui.player().querySelectorAll(".ss-support-overview-steps li").length, 5);
    await ui.click("Back to library");
    assert.equal(document.querySelectorAll(".ss-support-card").length, catalogue.length);
    assert.equal(ui.writes(), 0);
  } finally { await ui.close(); }
});

test("moment assignments cover the catalogue and combine once before focus, format and search narrow them", () => {
  assert.deepEqual(new Set(Object.values(stillnessMoments).flat()), new Set(catalogue.map(item => item.id)));
  assert.deepEqual(stillnessLibraryResults({ moments: ["As I step away"] }).slice(0, 2).map(item => item.id), ["feels-personal", "same-decision"]);
  const moments = ["Looking ahead", "A day away"] as const;
  const union = stillnessLibraryResults({ moments: [...moments] });
  assert.equal(union.length, 8);
  assert.equal(new Set(union.map(item => item.id)).size, union.length);
  assert.deepEqual(stillnessLibraryResults({ moments: [...moments], tags: ["Greed", "Fear"], filter: "Practice", search: " Victim " }).map(item => item.id), ["feels-personal"]);
  assert.equal(stillnessLibraryResults({ moments: ["Looking ahead"], search: "victim" }).length, 0);
});

test("post-loss practices share the player and deliberate pauses without writing day records", async () => {
  const ui = await setup();
  try {
    await ui.click("As I step away");
    assert.match(document.querySelector(".ss-support-card")!.textContent!, /When it feels personal/);
    await ui.choose("same-decision");
    const steps = ui.player().querySelectorAll(".ss-support-overview-steps li");
    assert.equal(steps.length, 4);
    assert.match(steps[1].textContent!, /lost, picture watching it hit your target.*won, picture watching it hit your stop/);
    await ui.click("Back to library");
    await ui.choose("feels-personal");
    await ui.click("Try practice");
    assert.match(ui.player().textContent!, /STEP 1 OF 4/);
    assert.match(ui.player().textContent!, /suggested pause/);
    await ui.language("direct");
    assert.doesNotMatch(ui.player().textContent!, /you can hear it saying that/);
    await ui.click("Continue", ui.player());
    assert.match(ui.player().textContent!, /STEP 2 OF 4/);
    assert.equal(ui.writes(), 0);
  } finally { await ui.close(); }
});

test("focus rails match readable labels and the Journal language picker works by keyboard inside the dialog", async () => {
  const ui = await setup();
  try {
    const card = [...document.querySelectorAll(".ss-support-card")].find(card => card.textContent?.includes("Make room for waiting"))!;
    assert.deepEqual([...card.querySelectorAll(".ss-focus-rail span")].map(node => node.getAttribute("data-focus")), ["Impatience", "Impulsiveness"]);
    assert.deepEqual([...card.querySelectorAll(".ss-focus-badge")].map(node => node.textContent), ["Impatience", "Impulsiveness"]);
    await ui.choose("fix-a-loss");
    const trigger = ui.player().querySelector<HTMLButtonElement>('[role="combobox"]')!;
    await act(async () => trigger.click());
    assert.ok(ui.player().querySelector('[role="listbox"]'), "menu stays within the native dialog top layer");
    await act(async () => trigger.dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    await act(async () => trigger.dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.equal(trigger.textContent?.trim(), "Direct");
    assert.equal(ui.player().querySelectorAll(".ss-step-context").length, 0);
    assert.ok(ui.player().classList.contains("ss-support-overview"));
    await act(async () => trigger.click());
    await act(async () => trigger.dispatchEvent(new ui.dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(ui.player().querySelector('[role="listbox"]'), null);
    assert.ok(ui.player().classList.contains("ss-support-overview"));
    assert.equal(ui.writes(), 0);
  } finally { await ui.close(); }
});

test("drafts survive navigation and reload without reopening or writing daily records, finish and discard clear them", async () => {
  const ui = await setup();
  try {
    await ui.choose("fix-a-loss"); await ui.click("Try sequence"); await ui.click("I’m back"); await ui.click("Continue");
    await ui.render(ui.owner(), "Preparation");
    assert.equal(document.querySelector("dialog[open]"), null);
    await ui.click("Resume practice"); assert.match(ui.player().textContent!, /STEP 3 OF 5/);
    await ui.click("×", ui.player());
    const saved = localStorage.getItem(`ss-stillness-practice:${ui.owner()}`)!;
    await ui.render("different-account");
    assert.doesNotMatch(document.body.textContent!, /Resume practice/);
    await ui.render(ui.owner() + "-reload");
    localStorage.setItem(`ss-stillness-practice:${ui.owner()}`, saved);
    // A fresh keyed component restores the persisted draft, like a reload.
    const restoredOwner = ui.owner(); await ui.render("temporary"); await ui.render(restoredOwner);
    assert.equal(document.querySelector("dialog[open]"), null);
    await ui.click("Resume practice"); assert.match(ui.player().textContent!, /STEP 3 OF 5/);
    await ui.click("Continue"); await ui.click("Continue"); await ui.click("Finish");
    assert.equal(JSON.parse(localStorage.getItem(`ss-stillness-practice:${ui.owner()}`)!), null);
    assert.match(ui.player().textContent!, /Nothing was added/);
    await ui.click("Back to library");
    await ui.choose("same-decision"); await ui.click("Try practice"); await ui.click("×", ui.player()); await ui.click("Discard");
    assert.doesNotMatch(document.body.textContent!, /Resume practice/);
    assert.equal(ui.writes(), 0); assert.equal(ui.reflections(), 0);
  } finally { await ui.close(); }
});

test("quote edit, cancel, hide, restore and preferences survive reload and remain account isolated", async () => {
  const ui = await setup();
  try {
    const originalOwner = ui.owner();
    assert.equal(document.querySelector("blockquote")!.textContent, defaultStillnessQuote.text);
    await ui.click("Edit quote"); await ui.field(".ss-quote-editor textarea", "My own reminder"); await ui.click("Cancel");
    assert.equal(document.querySelector("blockquote")!.textContent, defaultStillnessQuote.text);
    await ui.click("Edit quote"); await ui.field(".ss-quote-editor textarea", "My own reminder"); await ui.field(".ss-quote-editor input", "Me"); await ui.click("Save quote");
    assert.equal(document.querySelector("blockquote")!.textContent, "My own reminder");
    await act(async () => (document.querySelector('.ss-stillness-preferences input[type="checkbox"]') as HTMLInputElement).click());
    assert.equal(document.querySelector("blockquote"), null);
    await ui.render("other-account"); assert.equal(document.querySelector("blockquote")!.textContent, defaultStillnessQuote.text);
    await ui.render(originalOwner); assert.equal(document.querySelector("blockquote"), null);
    await ui.click("Restore default"); assert.equal(document.querySelector("blockquote")!.textContent, defaultStillnessQuote.text);
  } finally { await ui.close(); }
});

test("all new entries retain existing daily destinations and saved support without creating completion events", async () => {
  const ui = await setup();
  try {
    for (const [index, id] of ["feeling-explanation", "fix-a-loss", "same-decision", "yesterday-today"].entries()) {
      await ui.choose(id); await ui.click("Add to my day");
      // Stages are checkboxes now: Preparation, Done for the day, then the library bookmark.
      const boxes = () => [...ui.player().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      if (index % 2) {
        await act(async () => boxes()[1].click());
        await act(async () => boxes()[0].click());
      }
      await act(async () => boxes().at(-1)!.click());
      await act(async () => {
        ui.player().querySelector("form")!.dispatchEvent(new ui.dom.window.Event("submit", { bubbles: true, cancelable: true }));
        const deadline = Date.now() + 2000;
        while (ui.store.records.length < index + 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      });
      await ui.render();
    }
    const records = await readProcess(ui.owner());
    const choices = ui.store.records.at(-1)!.body as { stillness: { destination: string; saved: boolean }[] };
    assert.equal(choices.stillness.length, 4);
    assert.deepEqual(choices.stillness.map(choice => choice.destination), ["Preparation", "Done", "Preparation", "Done"]);
    assert.ok(choices.stillness.every(choice => choice.saved));
    await ui.click("Saved support (4)"); assert.match(ui.player().textContent!, /Same decision, different outcome/);
    assert.equal(records.some(record => record.kind !== "day"), false);
    assert.equal(ui.reflections(), 0);
  } finally { await ui.close(); }
});

test("unavailable storage and invalid persisted drafts remain usable and do not offer an unsafe resume", async () => {
  const ui = await setup();
  try {
    localStorage.setItem("ss-stillness-practice:invalid", JSON.stringify({ choice: { itemId: "fix-a-loss", piece: -1 }, step: 99, preview: true }));
    await ui.render("invalid");
    assert.doesNotMatch(document.body.textContent!, /Resume practice/);
    assert.match(document.body.textContent!, /could not be restored or saved/);
    await ui.choose("fix-a-loss");
    const prototype = ui.dom.window.Storage.prototype;
    const set = prototype.setItem;
    prototype.setItem = () => { throw new Error("storage unavailable"); };
    try {
      await ui.click("Try sequence");
      assert.match(ui.player().textContent!, /could not be saved/);
      await ui.click("I’m back"); assert.match(ui.player().textContent!, /STEP 2 OF 5/);
    } finally { prototype.setItem = set; }
  } finally { await ui.close(); }
});

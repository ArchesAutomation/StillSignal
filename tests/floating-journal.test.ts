import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { JSDOM } from "jsdom";
import { readClipboardScreenshot, validateScreenshotFile } from "../src/lib/clipboard-screenshot";
import { useFloatingJournal } from "../src/components/use-floating-journal";

test("clipboard screenshots preserve image bytes and reject unsupported or oversized files", async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const file = await readClipboardScreenshot({ read: async () => [{ types: ["text/plain", "image/png"], getType: async () => png } as unknown as ClipboardItem] });
  assert.equal(file.type, "image/png");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await png.arrayBuffer()));
  assert.throws(() => validateScreenshotFile(new File(["svg"], "chart.svg", { type: "image/svg+xml" })), /PNG, JPEG or WebP/);
  assert.throws(() => validateScreenshotFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "chart.png", { type: "image/png" })), /5 MB/);
  await assert.rejects(() => readClipboardScreenshot({ read: async () => [] }), /No screenshot/);
  await assert.rejects(() => readClipboardScreenshot(undefined), /Ctrl\+V/);
  await assert.rejects(() => readClipboardScreenshot({ read: async () => { throw new Error("Denied"); } }), /Ctrl\+V/);
});

test("floating journal preserves the editor and draft across PiP close and reopen, with a usable fallback", async () => {
  const dom = new JSDOM('<!doctype html><head><style>body { color: red }</style></head><body><div id="app"></div></body>', { url: "http://localhost" });
  const pip = new JSDOM('<!doctype html><head></head><body></body>', { url: "http://localhost" });
  const disposePip = pip.window.close.bind(pip.window);
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let closeCount = 0;
  const pipWindow = pip.window as unknown as Window;
  pipWindow.close = () => { closeCount++; pip.window.dispatchEvent(new pip.window.Event("pagehide")); };
  let requests = 0;
  Object.defineProperty(dom.window, "documentPictureInPicture", { configurable: true, value: {
    requestWindow: async () => { requests++; return pipWindow; },
  } });
  let controller!: ReturnType<typeof useFloatingJournal>;
  function Editor() {
    // A stable node is required to retain textarea, selection, and attachment state.
    return createElement("textarea", { defaultValue: "My unsaved entry" });
  }
  function Harness() {
    controller = useFloatingJournal();
    return controller.host ? createPortal(createElement(Editor), controller.host) : null;
  }
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => controller.open());
    assert.equal(requests, 1);
    assert.equal(controller.floating, true);
    const editor = pip.window.document.querySelector("textarea")!;
    editor.value = "Keep this draft and screenshot";
    assert.equal(pip.window.document.querySelectorAll("style").length, 1);
    await act(async () => pip.window.dispatchEvent(new pip.window.Event("pagehide")));
    assert.equal(controller.floating, false);
    assert.equal(dom.window.document.querySelector("textarea"), editor);
    assert.equal(editor.value, "Keep this draft and screenshot");
    await act(async () => controller.open());
    assert.equal(pip.window.document.querySelector("textarea"), editor);
    await act(async () => controller.close());
    assert.equal(closeCount, 1);
    assert.equal(dom.window.document.querySelector("textarea"), editor);
    assert.equal(editor.value, "Keep this draft and screenshot");
    Object.defineProperty(dom.window, "documentPictureInPicture", { configurable: true, value: undefined });
    Object.defineProperty(dom.window, "open", { configurable: true, value: () => null });
    await act(async () => controller.open());
    assert.match(controller.message, /unavailable/);
    assert.equal(controller.host?.hidden, false);
    assert.equal(dom.window.document.querySelector("textarea"), editor);
  } finally {
    await act(async () => root.unmount());
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
    disposePip();
  }
});

test("closing a session while PiP is opening cannot resurrect its window", async () => {
  const dom = new JSDOM('<body><div id="app"></div></body>', { url: "http://localhost" });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalAct = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  let finish!: (value: Window) => void;
  Object.defineProperty(dom.window, "documentPictureInPicture", { value: { requestWindow: () => new Promise<Window>((resolve) => { finish = resolve; }) } });
  let controller!: ReturnType<typeof useFloatingJournal>;
  function Harness() { controller = useFloatingJournal(); return null; }
  const root = createRoot(dom.window.document.getElementById("app")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    let opening!: Promise<void>;
    act(() => { opening = controller.open(); });
    act(() => controller.close());
    let closed = false;
    await act(async () => { finish({ close: () => { closed = true; } } as unknown as Window); await opening; });
    assert.equal(closed, true);
    assert.equal(controller.floating, false);
  } finally {
    await act(async () => root.unmount());
    for (const [key, original] of [["window", originalWindow], ["document", originalDocument], ["IS_REACT_ACT_ENVIRONMENT", originalAct]] as const) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});

test("a browser without document PiP opens a regular popup on the click and keeps the same draft on close", async () => {
  const dom = new JSDOM('<head><style>body{color:red}</style></head><body><div id="root"></div></body>', { url: "https://still-signal.test" });
  const popup = new JSDOM('<head></head><body></body>', { url: "https://still-signal.test" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const popupWindow = popup.window as unknown as Window;
  let clicks = 0, inClick = false, focuses = 0;
  popupWindow.focus = () => { focuses++; };
  const disposePopup = popup.window.close.bind(popup.window);
  popupWindow.close = () => { popup.window.dispatchEvent(new popup.window.Event("pagehide")); };
  Object.defineProperty(dom.window, "open", { configurable: true, value: () => { assert.equal(inClick, true); clicks++; return popupWindow; } });
  let controller!: ReturnType<typeof useFloatingJournal>;
  function Harness() {
    controller = useFloatingJournal();
    return controller.host ? createPortal(createElement("textarea", { defaultValue: "Keep my reflection" }), controller.host) : null;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => { inClick = true; const opening = controller.open(); assert.equal(clicks, 1); inClick = false; await opening; });
    assert.equal(controller.floating, true); assert.match(controller.message, /not always on top/);
    assert.equal(popup.window.document.querySelectorAll("style").length, 1);
    const editor = popup.window.document.querySelector("textarea")!;
    editor.value = "Do not lose these words";
    await act(async () => controller.open());
    assert.equal(clicks, 1); assert.equal(focuses, 1);
    await act(async () => controller.close());
    assert.equal(document.querySelector("textarea"), editor); assert.equal(editor.value, "Do not lose these words");
    await act(async () => { inClick = true; controller.openPopup(); inClick = false; });
    assert.equal(popup.window.document.querySelector("textarea"), editor);
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("pagehide")));
    assert.equal(controller.floating, false);
    assert.equal(document.querySelector("textarea"), editor);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close(); disposePopup();
  }
});

test("a rejected PiP request waits for a fresh popup click instead of losing activation to another asynchronous request", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://still-signal.test" });
  const popup = new JSDOM('<body></body>', { url: "https://still-signal.test" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  let popups = 0;
  Object.defineProperty(dom.window, "documentPictureInPicture", { configurable: true, value: { requestWindow: async () => { throw new Error("Not allowed"); } } });
  Object.defineProperty(dom.window, "open", { configurable: true, value: () => { popups++; return popup.window; } });
  let controller!: ReturnType<typeof useFloatingJournal>;
  function Harness() { controller = useFloatingJournal(); return null; }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => controller.open());
    assert.equal(popups, 0); assert.equal(controller.floating, false);
    assert.match(controller.message, /click Open popup window/);
    await act(async () => controller.openPopup());
    assert.equal(popups, 1); assert.equal(controller.floating, true);
  } finally {
    await act(async () => root.unmount());
    for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close(); popup.window.close();
  }
});

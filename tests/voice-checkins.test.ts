import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../src/components/dashboard";
import ReflectionEditor, {
  type Recognition,
} from "../src/components/reflection-editor";
import SmartCheckins from "../src/components/smart-checkins";
import { defaults, type JournalEntry } from "../src/lib/model";
import { updateExtensionLease } from "../src/lib/extension-bridge";
test("extension prompt ownership suppresses app announcements; a conflicting Alt+J cannot activate twice", async (t) => {
  const { dom, root } = setup();
  let prompts = 0,
    opens = 0;
  const owner = "extension-owner";
  Object.assign(dom.window, {
    chrome: {
      runtime: {
        sendMessage: async () => {
          prompts++;
          return { claimed: true };
        },
      },
    },
  });
  localStorage.setItem("pulse-extension:" + owner, "a".repeat(32));
  updateExtensionLease(owner, {
    connected: true,
    shortcut: "Alt+J",
    promptsPaused: false,
  });
  t.after(async () => {
    updateExtensionLease(owner, { connected: false });
    await act(async () => root.unmount());
    dom.window.close();
  });
  const now = Date.now(),
    event = {
      id: `hr-${now}`,
      t: now,
      end: now,
      baseline: 70,
      peak: 100,
      delta: 30,
      kind: "rise" as const,
    };
  await act(async () =>
    root.render(
      createElement(SmartCheckins, {
        owner,
        sessionId: "extension-session",
        settings: { ...defaults, sound: true, spokenPrompt: true },
        recording: true,
        now,
        latestSampleTime: now,
        moments: [event],
        blocked: false,
        onOpen: () => {
          opens++;
        },
      }),
    ),
  );
  assert.equal(prompts, 1);
  assert.equal(document.querySelector("aside"), null);
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "j",
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal(opens, 0);
  updateExtensionLease(owner, { connected: true, shortcut: "" });
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "j",
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  assert.equal(
    opens,
    1,
    "unassigned/conflicting extension shortcut preserves in-app Alt+J",
  );
});
test("enabled HR check-ins beep and speak once, snooze suppresses the next event", async (t) => {
  const { dom, root } = setup();
  let beeps = 0;
  const spoken: string[] = [];
  class AudioMock {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect() {},
        start() {
          beeps++;
        },
        stop() {},
      };
    }
    createGain() {
      return {
        connect() {},
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      };
    }
  }
  class Utterance {
    constructor(public text: string) {}
  }
  Object.defineProperty(globalThis, "AudioContext", {
    value: AudioMock,
    configurable: true,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: Utterance,
    configurable: true,
  });
  Object.assign(dom.window, {
    speechSynthesis: {
      speak: (u: Utterance) => spoken.push(u.text),
      cancel() {},
    },
  });
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    delete (globalThis as unknown as Record<string, unknown>).AudioContext;
    delete (globalThis as unknown as Record<string, unknown>)
      .SpeechSynthesisUtterance;
  });
  const now = Date.now(),
    event = {
      id: "hr-audio",
      t: now,
      end: now,
      baseline: 70,
      peak: 100,
      delta: 30,
      kind: "rise" as const,
    };
  const props = {
    owner: "audio-owner",
    sessionId: "audio-session",
    settings: { ...defaults, sound: true, spokenPrompt: true },
    recording: true,
    now,
    latestSampleTime: now,
    moments: [] as (typeof event)[],
    blocked: false,
    onOpen: () => {},
  };
  await act(async () => root.render(createElement(SmartCheckins, props)));
  await act(async () =>
    dom.window.dispatchEvent(new dom.window.MouseEvent("pointerdown")),
  );
  await act(async () =>
    root.render(createElement(SmartCheckins, { ...props, moments: [event] })),
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(beeps, 1);
  assert.deepEqual(spoken, ["Hey, what's going on? What are you feeling?"]);
  const snooze = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Snooze 10 min",
  )!;
  await act(async () => snooze.click());
  const next = { ...event, id: "second", t: now + 180000 };
  await act(async () =>
    root.render(
      createElement(SmartCheckins, {
        ...props,
        now: next.t,
        latestSampleTime: next.t,
        moments: [event, next],
      }),
    ),
  );
  assert.equal(document.querySelector("aside"), null);
  assert.equal(beeps, 1);
});
function setup() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://trade-pulse.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    FormData: dom.window.FormData,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  const root = createRoot(document.getElementById("root")!);
  return { dom, root };
}
test("Alt+J in an empty workspace asks for a session without opening a modal or requesting the microphone", async (t) => {
  const { dom, root } = setup();
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  await act(async () =>
    root.render(
      createElement(Dashboard, {
        user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }),
    ),
  );
  await act(async () =>
    dom.window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "j",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(document.querySelectorAll("dialog.modal").length, 0);
  assert.match(
    document.body.textContent!,
    /Start a session or choose a journal day first/,
  );
});

test("speech transcript is reviewed before saving and preserves the activation timestamp", async (t) => {
  const { dom, root } = setup();
  let rec: Recognition | undefined;
  const saved: JournalEntry[] = [];
  const timestamp = Date.now();
  class MockRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: Recognition["onresult"] = null;
    onerror: Recognition["onerror"] = null;
    onend: Recognition["onend"] = null;
    start() {
      rec = this;
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  Object.assign(dom.window, { webkitSpeechRecognition: MockRecognition });
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  await act(async () =>
    root.render(
      createElement(ReflectionEditor, {
        draft: { t: timestamp, autoListen: true },
        owner: "a",
        question: "What is happening?",
        prepareScreenshot: async () => "",
        onSave: async (n) => {
          saved.push(n);
        },
        onDone: () => {},
      }),
    ),
  );
  assert.equal(saved.length, 0);
  await act(async () =>
    rec!.onresult!({
      results: {
        length: 1,
        0: { isFinal: true, 0: { transcript: "I have fear of missing out" } },
      },
    }),
  );
  assert.match(
    (document.querySelector("textarea") as HTMLTextAreaElement).value,
    /fear of missing out/,
  );
  await act(async () => rec!.stop());
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(saved[0].t, timestamp);
  assert.equal(saved[0].source, "voice");
  assert.equal(saved[0].label, "Unlabelled");
});
test("unsupported browser offers typing; live HR check-ins never prompt from stale data or repeatedly", async (t) => {
  const { dom, root } = setup();
  let opened = 0;
  const now = Date.now(),
    moment = {
      id: "hr-1",
      t: now,
      end: now,
      peak: 100,
      baseline: 70,
      delta: 30,
      kind: "rise" as const,
    };
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  const props = {
    owner: "a",
    sessionId: "s",
    settings: defaults,
    recording: true,
    now,
    latestSampleTime: now,
    moments: [moment],
    blocked: false,
    onOpen: () => {
      opened++;
    },
  };
  await act(async () => root.render(createElement(SmartCheckins, props)));
  assert.match(document.body.textContent!, /what are you feeling/i);
  assert.equal(
    opened,
    0,
    "HR prompts must not open a microphone until the trader answers",
  );
  await act(async () =>
    (
      document.querySelector(
        'button[aria-label="Dismiss check-in"]',
      ) as HTMLButtonElement
    ).click(),
  );
  await act(async () =>
    root.render(createElement(SmartCheckins, { ...props, now: now + 1000 })),
  );
  assert.equal(document.querySelector("aside"), null);
  await act(async () =>
    root.render(
      createElement(SmartCheckins, {
        ...props,
        sessionId: "other",
        now: now + 20000,
      }),
    ),
  );
  assert.equal(
    document.querySelector("aside"),
    null,
    "stale readings cannot prompt",
  );
  await act(async () =>
    root.render(
      createElement(ReflectionEditor, {
        draft: { t: now },
        owner: "a",
        question: "Context",
        prepareScreenshot: async () => "",
        onSave: async () => {},
        onDone: () => {},
      }),
    ),
  );
  assert.match(document.body.textContent!, /Type or use device dictation/);
  assert.equal(
    (document.querySelector("textarea") as HTMLTextAreaElement).disabled,
    false,
  );
});

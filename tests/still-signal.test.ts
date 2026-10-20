import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import SignalCalendar from "../src/components/signal-calendar";
import SessionReview from "../src/components/session-review";
import Stillness from "../src/components/stillness";
import { sessionSchema } from "../src/lib/validation";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import type { JournalEntry, Session } from "../src/lib/model";

function setup() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://still-signal.test",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
  }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  return {
    root,
    async close() {
      await act(async () => root.unmount());
      dom.window.close();
    },
  };
}
const button = (text: string) => {
  const node = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  assert.ok(node, `Missing button: ${text}`);
  return node;
};

test("calendar uses real session dates, handles a leap month and keeps currency totals separate", async () => {
  const ui = setup();
  try {
    const fixture = reviewFixtures().session;
    const leap: Session = {
      ...fixture,
      startedAt: +new Date(2024, 1, 29, 12),
      id: "leap",
      journal: [],
    };
    const second: Session = {
      ...leap,
      id: "second",
      events: leap.events.map((e) => ({ ...e, currency: "EUR" })),
    };
    const opened: Session[] = [];
    const props = {
      sessions: [leap, second],
      selected: leap,
      recording: false,
      month: true,
      onOpen: (s: Session) => opened.push(s),
    };
    await act(async () => ui.root.render(createElement(SignalCalendar, props)));
    const day = document.querySelector(
      '[aria-label*="February 29, 2024"]',
    ) as HTMLButtonElement;
    assert.ok(day);
    assert.match(day.textContent!, /2 currencies/);
    assert.match(day.textContent!, /2 sessions/);
    await act(async () => day.click());
    assert.equal(opened[0].id, leap.id);
    await act(async () =>
      ui.root.render(
        createElement(SignalCalendar, { ...props, recording: true }),
      ),
    );
    assert.equal(
      (
        document.querySelector(
          '[aria-label*="February 29, 2024"]',
        ) as HTMLButtonElement
      ).disabled,
      true,
    );
    await act(async () =>
      (
        document.querySelector('[aria-label="Next month"]') as HTMLButtonElement
      ).click(),
    );
    assert.match(document.body.textContent!, /March 2024/);
  } finally {
    await ui.close();
  }
});

test("a full three-part review fits the existing cloud schema and updates its existing note", async () => {
  const ui = setup();
  try {
    const session = reviewFixtures().session;
    const text =
      "Session review\n\nBefore the trade\n" +
      "a".repeat(600) +
      "\n\nDuring the trade\n" +
      "b".repeat(600) +
      "\n\nExit and after\n" +
      "c".repeat(600);
    const previous: JournalEntry = {
      id: "review-note",
      t: session.startedAt + 60000,
      text,
      label: "Other",
      source: "typed",
    };
    const saved: JournalEntry[] = [];
    await act(async () =>
      ui.root.render(
        createElement(SessionReview, {
          session: { ...session, journal: [previous] },
          time: session.endedAt!,
          onJournal() {},
          onSave: async (note: JournalEntry) => {
            sessionSchema.parse({ ...session, journal: [note] });
            saved.push(note);
          },
        }),
      ),
    );
    await act(async () => button("Save review").click());
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, previous.id);
    assert.equal(saved[0].text, text);
    assert.ok(saved[0].text.length <= 2000);
    assert.match(document.body.textContent!, /Review saved/);
  } finally {
    await ui.close();
  }
});

test("review failure keeps the draft and exposes the error instead of claiming success", async () => {
  const ui = setup();
  try {
    const session = reviewFixtures().session;
    session.journal = [
      {
        id: "saved-review",
        t: session.startedAt,
        label: "Other",
        text: "Session review\n\nBefore the trade\nMy plan\n\nDuring the trade\n\n\nExit and after\n",
      },
    ];
    await act(async () =>
      ui.root.render(
        createElement(SessionReview, {
          session,
          time: session.endedAt!,
          onJournal() {},
          onSave: async () => {
            throw new Error("Storage unavailable");
          },
        }),
      ),
    );
    await act(async () => button("Save review").click());
    assert.match(
      document.querySelector('[role="alert"]')!.textContent!,
      /Storage unavailable/,
    );
    assert.equal(
      (document.querySelector("textarea") as HTMLTextAreaElement).value,
      "My plan",
    );
    assert.doesNotMatch(document.body.textContent!, /Review saved/);
  } finally {
    await ui.close();
  }
});

test("Stillness follows elapsed time, pauses and resets without opening the microphone", async (t) => {
  const ui = setup();
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
  try {
    let captures = 0;
    await act(async () =>
      ui.root.render(
        createElement(Stillness, {
          time: 1000,
          onReflect() {
            captures++;
          },
        }),
      ),
    );
    await act(async () => button("Begin").click());
    await act(async () => t.mock.timers.tick(16000));
    assert.match(document.body.textContent!, /Notice one physical sensation/);
    assert.equal(
      document.querySelector('[role="timer"]')!.textContent,
      "44s remaining",
    );
    await act(async () => button("Pause").click());
    await act(async () => t.mock.timers.tick(30000));
    assert.equal(
      document.querySelector('[role="timer"]')!.textContent,
      "44s remaining",
    );
    await act(async () => button("Continue").click());
    await act(async () => t.mock.timers.tick(44000));
    assert.equal(
      document.querySelector('[role="timer"]')!.textContent,
      "Practice complete",
    );
    assert.equal(captures, 0);
    await act(async () =>
      (
        document.querySelector(
          '[aria-label="Reset practice"]',
        ) as HTMLButtonElement
      ).click(),
    );
    assert.equal(
      document.querySelector('[role="timer"]')!.textContent,
      "60s remaining",
    );
  } finally {
    await ui.close();
    t.mock.timers.reset();
  }
});

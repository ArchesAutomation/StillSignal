import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { reviewFixtures, reviewOwner } from "../src/lib/staging-fixtures";
import {
  groupingSnapshot,
  splitGrouping,
  groupingEvidence,
} from "../src/lib/grouping-review";
import { sessionIdeas } from "../src/lib/position-ideas";
import { sessionSchema } from "../src/lib/validation";
import { contextMatches, excludedAt } from "../src/lib/context-comparison";
import { referenceAnalysis } from "../src/lib/reference-analysis";
import { pendingWeekly } from "../src/components/concept/weekly-reminder";
import { noCombination } from "../src/lib/blueprint-schema";
import type { JournalEntry, Session } from "../src/lib/model";
import { useMomentCapture } from "../src/components/use-moment-capture";
import { privateFile } from "../src/lib/private-files";
const base = () => reviewFixtures().session;
test("split preview partitions the six original fills by time, flags incomplete groups and Undo restores all identities", () => {
  const s = base(),
    t = s.startedAt;
  s.events = Array.from({ length: 6 }, (_, i) => ({
    ...s.events[0],
    id: `fill-${i}`,
    t: t + i * 1000,
    kind: i < 3 ? "entry" : "exit",
    quantity: 1,
    side: "long",
  })) as Session["events"];
  s.journal = [
    {
      id: "original-note",
      t,
      tradeId: "fill-0",
      section: "entry",
      text: "original words",
      label: "Calm",
      capture: {
        pressedAt: t,
        confirmedAt: t,
        imagePath: `local-image:${s.owner}:${crypto.randomUUID()}`,
      },
    },
  ];
  const before = groupingSnapshot(s),
    snapshot = structuredClone(s);
  const split = splitGrouping(s, "fill-0", "fill-2");
  assert.deepEqual(s, snapshot, "preview must not mutate the journal");
  assert.deepEqual(
    split.groups!.map((g) => g.fillIds),
    [
      ["fill-0", "fill-1"],
      ["fill-2", "fill-3", "fill-4", "fill-5"],
    ],
  );
  assert.ok(groupingEvidence(s, split).every((g) => g.incomplete));
  const divided = {
    ...s,
    blueprint: { updatedAt: Date.now(), grouping: split },
  };
  assert.equal(sessionIdeas(divided).length, 2);
  const restored = {
    ...divided,
    blueprint: { ...divided.blueprint, grouping: before },
  };
  assert.deepEqual(
    sessionIdeas(restored)[0].fillIds,
    s.events.map((e) => e.id),
  );
  assert.deepEqual(restored.journal, snapshot.journal);
});
test("blank caffeine stays unknown; explicit no stays separate; interval changes do not rewrite earlier location", () => {
  const s = base(),
    t = s.startedAt;
  s.blueprint = {
    updatedAt: t,
    combine: { ...noCombination, environment: true },
    environmentHistory: [
      {
        id: "home",
        effectiveAt: t,
        recordedAt: t,
        timezone: "UTC",
        location: "Home desk",
        country: "US",
        social: "Alone",
        setup: "Desk",
        interruptions: "",
      },
      {
        id: "cafe",
        effectiveAt: t + 60000,
        recordedAt: t + 60000,
        timezone: "UTC",
        location: "Cafe",
        country: "US",
        social: "Others nearby",
        setup: "Laptop",
        interruptions: "",
      },
    ],
    lifestyle: [],
  };
  assert.ok(
    contextMatches(s, t, {
      location: "Home desk",
      lifestyle: "Caffeine",
      answer: "unknown",
    }),
  );
  assert.equal(
    contextMatches(s, t, { lifestyle: "Caffeine", answer: "no" }),
    false,
  );
  s.blueprint.lifestyle!.push({
    id: "no-coffee",
    category: "Caffeine / exercise",
    categoryLabel: "Caffeine",
    answer: "no",
    text: "No caffeine",
    start: t,
    linkedDay: new Date(t).toISOString().slice(0, 10),
    timezone: "UTC",
    recordedAt: t,
  });
  assert.ok(contextMatches(s, t, { lifestyle: "Caffeine", answer: "no" }));
  assert.ok(contextMatches(s, t + 61000, { location: "Cafe" }));
  assert.equal(contextMatches(s, t, { location: "Cafe" }), false);
});
test("Patterns date range recomputes event counts and dates, while away samples are excluded", () => {
  const s = base(),
    next = {
      ...s,
      id: crypto.randomUUID(),
      startedAt: s.startedAt + 86400000,
      events: s.events.map((e) => ({
        ...e,
        id: "day2-" + e.id,
        t: e.t + 86400000,
      })),
      journal: [],
    };
  const from = new Date(s.startedAt).toISOString().slice(0, 10),
    to = new Date(next.startedAt).toISOString().slice(0, 10),
    filter = {
      from,
      to: from,
      origin: "all",
      stage: "all",
      scope: "",
      baselineSeconds: 300,
    };
  const one = referenceAnalysis([s, next], s.owner, {}, filter),
    both = referenceAnalysis([s, next], s.owner, {}, { ...filter, to });
  assert.equal(both.responses[0].count, one.responses[0].count * 2);
  assert.equal(both.responses[0].dates, 2);
  s.blueprint = {
    updatedAt: Date.now(),
    measurementPauses: [{ start: s.events[0].t, end: s.events.at(-1)!.t }],
  };
  assert.ok(excludedAt(s, s.events[0].t));
  assert.equal(
    referenceAnalysis([s], s.owner, {}, filter).responses.reduce(
      (n, r) => n + r.count,
      0,
    ),
    0,
  );
});
test("new provenance, frame history, pauses and grouping history survive the same API contract", () => {
  const s = base(),
    at = Date.now(),
    g = groupingSnapshot(s);
  s.journal = [
    {
      id: crypto.randomUUID(),
      t: at,
      eventTime: null,
      label: "Patient",
      text: "edited",
      capturedAt: at - 1000,
      labelAddedAt: at,
      transcriptStatus: "failed",
      originalTranscript: "original",
      captureSessionId: s.id,
    },
  ];
  s.blueprint = {
    updatedAt: at,
    chartFrames: [
      {
        id: crypto.randomUUID(),
        t: at,
        path: `local-image:${s.owner}:${crypto.randomUUID()}`,
        width: 1920,
        height: 1080,
      },
    ],
    measurementPauses: [{ start: at - 1000, end: at }],
    grouping: g,
    groupingVersions: [
      { id: crypto.randomUUID(), at, action: "Split", before: g, after: g },
    ],
  };
  assert.deepEqual(sessionSchema.parse(s), s);
});
test("Tuesday intentions retain their actual creation time and prior-week pending review takes precedence", () => {
  const s = base(),
    t = +new Date("2026-10-27T12:00:00");
  assert.equal(pendingWeekly([s], s.owner, t)?.kind, "intentions");
  s.blueprint = {
    updatedAt: t,
    weeks: {
      "2026-10-19": {
        intentions: "Keep patience",
        process: "",
        response: "",
        review: "",
        nextPractice: "",
        plannedAt: t - 86400000,
      },
    },
  };
  assert.equal(pendingWeekly([s], s.owner, t)?.key, "2026-10-19");
});
test("one keyboard action captures retained audio without a label; failed save retries the same capture and original transcript", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const original = new Map<string, PropertyDescriptor | undefined>();
  const values = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [k, v] of Object.entries(values)) {
    original.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { value: v, configurable: true });
  }
  let stops = 0,
    starts = 0;
  Object.defineProperty(dom.window.navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop() {
              stops++;
            },
          },
        ],
      }),
    },
  });
  class Recorder {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror = null;
    start() {
      this.state = "recording";
      starts++;
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["original audio bytes"], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  }
  original.set(
    "MediaRecorder",
    Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder"),
  );
  Object.defineProperty(globalThis, "MediaRecorder", {
    value: Recorder,
    configurable: true,
  });
  const s = { ...base(), owner: reviewOwner },
    attempts: JournalEntry[] = [];
  let controller!: ReturnType<typeof useMomentCapture>;
  function Harness() {
    controller = useMomentCapture({
      session: s,
      active: false,
      onSaveBlueprint: async () => {},
      onSave: async (n) => {
        attempts.push(structuredClone(n));
        if (attempts.length === 1) throw Error("Offline save");
      },
    });
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "j",
          altKey: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(starts, 1);
    assert.equal(controller.phase, "recording");
    await act(async () => {
      window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "j",
          altKey: true,
          repeat: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(starts, 1);
    await act(async () => controller.toggle());
    // IndexedDB audio persistence finishes asynchronously; wait for the actual
    // failed-save state instead of assuming a loaded CI runner finishes in 50ms.
    const saveFailed = () => controller.phase === "failed";
    for (let i = 0; i < 200 && !saveFailed(); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    assert.equal(controller.phase, "failed");
    assert.equal(attempts[0].label, "Unlabelled");
    assert.equal(attempts[0].transcriptStatus, "unavailable");
    const identity = attempts[0].id,
      pressed = attempts[0].capture!.pressedAt;
    assert.equal(
      await (await privateFile(attempts[0].audio!.path, s.owner)).text(),
      "original audio bytes",
    );
    await act(async () => controller.save());
    assert.equal(attempts[1].id, identity);
    assert.equal(attempts[1].capture!.pressedAt, pressed);
    assert.equal(controller.phase, "idle");
    assert.ok(stops);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [k, v] of original) {
      if (v) Object.defineProperty(globalThis, k, v);
      else Reflect.deleteProperty(globalThis, k);
    }
  }
});

test("opening a prior weekly review cannot count the currently selected day's trades in that week", async () => {
  const { weeklyActuals } = await import("../src/lib/journal-reference");
  const s = base();
  assert.equal(weeklyActuals([s], s, "2026-09-28").sessions, 0);
  assert.equal(weeklyActuals([s], s, "2026-09-28").completed, 0);
});

test("new capture metadata cannot be uploaded through an older backend that would strip it", async () => {
  const { requiresV4Save, api } = await import("../src/lib/cloud");
  const s = base();
  s.blueprint = { updatedAt: Date.now(), chartFrames: [] };
  assert.equal(requiresV4Save({ action: "save", session: s }), true);
  await assert.rejects(
    () => api({ action: "save", session: s }),
    /Cloud update required/,
  );
  assert.equal(requiresV4Save({ action: "save", session: base() }), false);
});

import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { previousSessionBaseline } from "../src/lib/capture-baseline";
import { reviewFixtures } from "../src/lib/staging-fixtures";
import { useMomentCapture } from "../src/components/use-moment-capture";
import { privateFile } from "../src/lib/private-files";
import type { Session, JournalEntry } from "../src/lib/model";
import { renderToStaticMarkup } from "react-dom/server";
import CapturePanel from "../src/components/concept/capture-panel";

test("historical baseline weights sessions equally and excludes current, foreign, demo, future, artifact and paused data", () => {
  const base = {
    ...reviewFixtures().session,
    demo: false,
    startedAt: 1000,
    endedAt: 1000000,
  };
  const current = { ...base, id: "current", startedAt: 2000000 };
  const a = {
    session: { ...base, id: "a" },
    samples: [
      { t: 1000, bpm: 60 },
      { t: 2000, bpm: 240, quality: "artifact" as const },
      { t: 400000, bpm: 150 },
    ],
  };
  const b = {
    session: {
      ...base,
      id: "b",
      blueprint: {
        updatedAt: 1,
        measurementPauses: [{ start: 4000, end: 5000 }],
      },
    },
    samples: [
      { t: 1000, bpm: 80 },
      { t: 2000, bpm: 80 },
      { t: 4500, bpm: 200 },
    ],
  };
  const bad = [
    current,
    { ...base, owner: "someone-else" },
    { ...base, demo: true },
    { ...base, endedAt: 3000000 },
  ];
  const result = previousSessionBaseline(
    [
      a,
      b,
      ...bad.map((session) => ({ session, samples: [{ t: 1000, bpm: 200 }] })),
    ],
    current,
    300,
  );
  assert.deepEqual(result, { bpm: 70, count: 2 });
  assert.deepEqual(previousSessionBaseline([], current, 300), {
    bpm: null,
    count: 0,
  });
});

test("expanded recorder displays a signed historical delta and hides stale or artifact HR", () => {
  const now = Date.now();
  const props = {
    expanded: true,
    session: reviewFixtures().session,
    samples: [{ t: now, bpm: 82 }],
    now,
    baselineSeconds: 300,
    active: true,
    recording: true,
    historicalBaseline: { bpm: 70, count: 3 },
    onClose() {},
    onReflect() {},
    onSave: async () => {},
  };
  const markup = (samples = props.samples) =>
    new JSDOM(
      renderToStaticMarkup(createElement(CapturePanel, { ...props, samples })),
    ).window.document;
  const fresh = markup();
  assert.equal(fresh.querySelector(".ss-capture-reading b")?.textContent, "82");
  assert.equal(fresh.querySelector(".ss-recorder-delta b")?.textContent, "+12");
  assert.match(
    fresh.querySelector(".ss-recorder-baseline")!.textContent!,
    /3 previous sessions/,
  );
  assert.equal(
    markup([{ t: now - 11000, bpm: 82 }]).querySelector(".ss-recorder-delta b")
      ?.textContent,
    "—",
  );
  const artifact = new JSDOM(
    renderToStaticMarkup(
      createElement(CapturePanel, {
        ...props,
        samples: [{ t: now, bpm: 82, quality: "artifact" }],
      }),
    ),
  ).window.document;
  assert.equal(
    artifact.querySelector(".ss-capture-reading b")?.textContent,
    "—",
  );
});

test("Record requests screen sharing once, captures each press, saves the chosen feeling and retains audio when sharing is denied", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost",
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const expose = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  expose("window", dom.window);
  expose("document", dom.window.document);
  expose("navigator", dom.window.navigator);
  expose("localStorage", dom.window.localStorage);
  expose("IS_REACT_ACT_ENVIRONMENT", true);
  let chooses = 0,
    shots = 0,
    audioStarts = 0,
    screenStops = 0,
    denied = false;
  const track = {
    readyState: "live",
    stop() {
      screenStops++;
      this.readyState = "ended";
    },
    addEventListener() {},
  };
  const share = { getTracks: () => [track], getVideoTracks: () => [track] };
  Object.defineProperty(dom.window.navigator, "mediaDevices", {
    value: {
      getDisplayMedia: async () => {
        chooses++;
        if (denied) throw Error("Permission denied");
        track.readyState = "live";
        return share;
      },
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    },
  });
  dom.window.HTMLMediaElement.prototype.play = async function () {};
  Object.defineProperty(dom.window.HTMLVideoElement.prototype, "videoWidth", {
    get: () => 1280,
  });
  Object.defineProperty(dom.window.HTMLVideoElement.prototype, "videoHeight", {
    get: () => 720,
  });
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", {
    value: () => ({
      drawImage() {
        shots++;
      },
    }),
  });
  dom.window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(
      new Blob(["screen " + shots], {
        type: "image/png",
      }) as unknown as globalThis.Blob,
    );
  };
  class Recorder {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
      audioStarts++;
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["audio"], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  }
  expose("MediaRecorder", Recorder);
  const session: Session = {
    ...reviewFixtures().session,
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: undefined,
  };
  const saves: JournalEntry[] = [];
  let active = true;
  let c!: ReturnType<typeof useMomentCapture>;
  function Harness() {
    c = useMomentCapture({
      session,
      active,
      onSave: async (n) => {
        saves.push(structuredClone(n));
      },
      onSaveBlueprint: async () => {},
    });
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  const flushSave = async () => {
    for (let i = 0; i < 20 && c.phase !== "idle"; i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
  };
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => c.chooseFeeling("Calm"));
    await act(async () => c.toggle());
    assert.equal(c.phase, "recording");
    assert.equal(chooses, 1);
    assert.equal(shots, 1);
    await act(async () => c.toggle());
    await flushSave();
    assert.equal(saves[0].label, "Calm");
    assert.ok(saves[0].capture?.imagePath);
    assert.equal(
      await (
        await privateFile(saves[0].capture!.imagePath!, session.owner)
      ).text(),
      "screen 1",
    );
    await act(async () => c.toggle());
    assert.equal(chooses, 1);
    assert.equal(shots, 2);
    await act(async () => c.toggle());
    await flushSave();
    assert.notEqual(saves[0].capture!.imagePath, saves[1].capture!.imagePath);
    active = false;
    await act(async () => root.render(createElement(Harness)));
    assert.equal(c.sharing, false);
    assert.ok(screenStops);
    active = true;
    denied = true;
    await act(async () => root.render(createElement(Harness)));
    await act(async () => c.toggle());
    assert.equal(c.phase, "recording");
    assert.equal(audioStarts, 3);
    assert.equal(chooses, 2);
    await act(async () => c.toggle());
    await flushSave();
    assert.ok(saves[2].audio);
    assert.equal(saves[2].capture!.imagePath, undefined);
    assert.match(saves[2].capture!.imageMissing!, /cancelled or unavailable/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

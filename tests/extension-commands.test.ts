import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVoiceCommand,
  resolveSession,
  journalMutationSchema,
  lastNote,
} from "../src/lib/journal-command";
import {
  frozenDestination,
  mayUpload,
  publicState,
  type State,
} from "../extension/src/state";
import { mergeSessions } from "../src/lib/workspace";
import type { Session } from "../src/lib/model";
import "fake-indexeddb/auto";
import { saveSession, listSessions } from "../src/lib/storage";
import { POST as extensionHandler } from "../src/lib/handlers/extension";
const user = "11111111-1111-4111-8111-111111111111",
  sid = "22222222-2222-4222-8222-222222222222";
const session: Session = {
  id: sid,
  owner: user,
  name: "ES",
  startedAt: 1000,
  source: "journal",
  events: [],
  journal: [],
  sampleCount: 0,
};
const state: State = {
  instanceId: crypto.randomUUID(),
  credential: {
    id: crypto.randomUUID(),
    userId: user,
    identity: "alice",
    token: "private",
    expiresAt: 9999999999999,
  },
  sessions: [session],
  selectedId: sid,
  pinned: true,
  status: "Microphone off",
  promptsPaused: false,
  autoRespond: false,
  outbox: [],
  wakeEnabled: false,
};
test("voice commands require final words, preserve reflections, and tag only explicit feelings", () => {
  assert.equal(parseVoiceCommand("Tag that as FOMO", false), null);
  assert.deepEqual(
    parseVoiceCommand("Log this: I’m feeling fear of missing out.", true),
    { kind: "log", text: "I’m feeling fear of missing out.", label: "FOMO" },
  );
  assert.deepEqual(parseVoiceCommand("My HR went up", true), {
    kind: "log",
    text: "My HR went up",
    label: "Other",
  });
  assert.deepEqual(parseVoiceCommand("Tag that as FOMO.", true), {
    kind: "tag",
    label: "FOMO",
  });
  assert.deepEqual(
    parseVoiceCommand("Correct my last note: These are my words", true),
    { kind: "correct", text: "These are my words" },
  );
  assert.deepEqual(parseVoiceCommand("Pause prompts", true), {
    kind: "prompts",
    paused: true,
  });
  assert.deepEqual(parseVoiceCommand("Resume prompts", true), {
    kind: "prompts",
    paused: false,
  });
  assert.deepEqual(parseVoiceCommand("Show today's review", true), {
    kind: "review",
  });
  assert.deepEqual(parseVoiceCommand("Switch to ES", true), {
    kind: "switch",
    target: "ES",
  });
  assert.deepEqual(parseVoiceCommand("Start a journal", true), {
    kind: "start",
  });
  assert.throws(
    () => parseVoiceCommand("Correct my last note:", true),
    /Finish/,
  );
  assert.equal(
    journalMutationSchema.safeParse({
      kind: "correct",
      noteId: "id",
      text: "x",
      expectedRevision: 1000,
      session: {},
    }).success,
    false,
  );
});
test("concurrent local and cloud storage writes preserve both notes inside one transaction", async () => {
  const s = { ...session, id: crypto.randomUUID(), owner: crypto.randomUUID() };
  await Promise.all([
    saveSession({
      ...s,
      journal: [
        {
          id: "local",
          t: 2000,
          text: "Unsent words",
          label: "Other",
          updatedAt: 5000,
        },
      ],
    }),
    saveSession({
      ...s,
      journal: [
        {
          id: "remote",
          t: 3000,
          text: "Voice words",
          label: "Other",
          updatedAt: 6000,
        },
      ],
    }),
  ]);
  assert.equal((await listSessions(s.owner))[0].journal.length, 2);
});
test("unauthenticated extension operations fail before touching a provider or database", async () => {
  const result = await extensionHandler(
    new Request("https://tradepulse.test/api/extension", {
      method: "POST",
      body: JSON.stringify({ action: "context" }),
    }),
  );
  assert.equal(result.status, 401);
  const invalid = await extensionHandler(
    new Request("https://tradepulse.test/api/extension", {
      method: "POST",
      body: JSON.stringify({ action: "mutate", session: { owner: user } }),
    }),
  );
  assert.equal(invalid.status, 400);
});
test("destination and UTC activation freeze before capture; ambiguity and account changes cannot redirect", () => {
  const d = frozenDestination(state, session, 3000, { id: "hr-2000", t: 2000 });
  assert.equal(d.t, 2000);
  assert.equal(d.activationAt, 3000);
  const changed = { ...state, selectedId: crypto.randomUUID() };
  assert.equal(d.sessionId, sid);
  assert.equal(resolveSession([session], user, sid, 3000)?.id, sid);
  assert.throws(
    () =>
      resolveSession(
        [session, { ...session, id: crypto.randomUUID() }],
        user,
        undefined,
        3000,
      ),
    /Choose/,
  );
  assert.throws(
    () => resolveSession([{ ...session, endedAt: 2000 }], user, sid, 3000),
    /closed/,
  );
  const pending = {
    destination: d,
    mutation: { kind: "delete" as const, noteId: "x", expectedRevision: 1000 },
  };
  assert.equal(mayUpload(pending, changed), true);
  assert.equal(
    mayUpload(pending, {
      ...changed,
      credential: { ...state.credential!, userId: crypto.randomUUID() },
    }),
    false,
  );
  assert.equal(mayUpload(pending, { ...state, credential: undefined }), false);
  assert.equal(
    publicState({ ...state, outbox: [pending] }).credential?.identity,
    "alice",
  );
  assert.equal("token" in publicState(state).credential!, false);
  assert.deepEqual(
    publicState({ ...state, outbox: [pending], credential: undefined }).outbox,
    [],
  );
});
test("dashboard merges committed extension notes without overwriting unsent local words or deletion tombstones", () => {
  const local = {
    ...session,
    journal: [
      {
        id: "local",
        t: 2000,
        text: "Unsent local",
        label: "Other",
        updatedAt: 5000,
      },
      {
        id: "deleted",
        t: 2500,
        text: "",
        label: "Other",
        updatedAt: 5000,
        deletedAt: 5000,
      },
    ],
  };
  const remote = {
    ...session,
    journal: [
      {
        id: "voice",
        t: 3000,
        text: "Committed extension",
        label: "FOMO",
        updatedAt: 6000,
        source: "voice" as const,
      },
      { id: "deleted", t: 2500, text: "old", label: "Other", updatedAt: 3000 },
    ],
  };
  const merged = mergeSessions(local, remote);
  assert.equal(merged.journal.length, 3);
  assert.equal(
    merged.journal.find((n) => n.id === "local")?.text,
    "Unsent local",
  );
  assert.ok(merged.journal.find((n) => n.id === "deleted")?.deletedAt);
  assert.equal(lastNote(merged)?.id, "voice");
});

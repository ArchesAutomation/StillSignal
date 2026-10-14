import { z } from "zod";
import { APP_ORIGIN } from "./config";
import { audioRead, audioRemove } from "./audio-store";
import {
  panelMessageSchema,
  publicState,
  frozenDestination,
  mayUpload,
  type State,
  type Destination,
  type Credential,
} from "./state";
import {
  parseVoiceCommand,
  resolveSession,
  lastNote,
  noteRevision,
  journalMutationSchema,
  reflectionSchema,
  type JournalMutation,
} from "../../src/lib/journal-command";
import { sessionSchema } from "../../src/lib/validation";
import type { JournalEntry, Session } from "../../src/lib/model";

let state: State,
  creation: Promise<void> | undefined,
  chain = Promise.resolve();
const loaded = (async () => {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const stored = (await chrome.storage.local.get("journal")).journal as
    | State
    | undefined;
  state = stored ?? {
    instanceId: crypto.randomUUID(),
    sessions: [],
    pinned: false,
    status: "Microphone off",
    promptsPaused: false,
    autoRespond: false,
    outbox: [],
    wakeEnabled: false,
  };
  const consent = await chrome.storage.session.get([
    "wakeConsent",
    "autoRespondConsent",
  ]);
  state.wakeEnabled = state.wakeEnabled && consent.wakeConsent === true;
  state.autoRespond = state.autoRespond && consent.autoRespondConsent === true;
  if (!state.wakeEnabled && state.status === "Awaiting wake phrase")
    state.status = "Microphone off";
  await chrome.storage.local.set({ journal: state });
  await chrome.alarms.create("journal-retry", { periodInMinutes: 1 });
})();
async function persist() {
  await chrome.storage.local.set({ journal: state });
  const badge =
    state.status === "Recording"
      ? "REC"
      : state.status === "Awaiting wake phrase"
        ? "ON"
        : state.review
          ? "?"
          : state.status === "Queued offline"
            ? "Q"
            : state.status === "Error"
              ? "!"
              : "";
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: "#fc7c59" });
  void chrome.runtime
    .sendMessage({ target: "panel", type: "changed" })
    .catch(() => {});
}
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  if (contexts.length) return;
  if (!creation)
    creation = chrome.offscreen
      .createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification:
          "Keep a user-activated journal recording alive across panel closure and trading tabs.",
      })
      .finally(() => {
        creation = undefined;
      });
  await creation;
}
async function capture(type: string, data: unknown = {}) {
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({
    target: "offscreen",
    type,
    data,
  });
  if (r?.error) throw new Error(r.error);
  return r;
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(
  body: unknown,
  token = state.credential?.token,
): Promise<T> {
  const r = await fetch(APP_ORIGIN + "/api/extension", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-extension-instance": state.instanceId,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok)
    throw new ApiError(r.status, d.error || "Journal service unavailable.");
  return d;
}
async function disconnect(
  message = "Connect Trade Pulse to continue.",
  revoke = false,
) {
  await chrome.storage.session.remove(["wakeConsent", "autoRespondConsent"]);
  if (revoke && state.credential) {
    try {
      await request({ action: "disconnect" });
    } catch {}
  }
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length) {
    await capture("capture-cancel").catch(() => {});
    await capture("wake-stop").catch(() => {});
  }
  if (state.review && state.transcript)
    state.reviews = [
      ...(state.reviews ?? []),
      { destination: state.review, text: state.transcript },
    ];
  if (state.active) {
    const record = await audioRead(state.active.noteId);
    if (record?.finished) {
      if (!state.audioOutbox?.some((p) => p.noteId === state.active!.noteId))
        state.audioOutbox = [...(state.audioOutbox ?? []), state.active];
    } else await audioRemove(state.active.noteId);
  }
  state.credential = undefined;
  state.active = undefined;
  state.review = undefined;
  state.latest = undefined;
  state.wakeEnabled = false;
  state.autoRespond = false;
  state.sessions = [];
  state.selectedId = undefined;
  state.scope = undefined;
  state.pendingStart = undefined;
  state.rotationToken = undefined;
  state.bridge = undefined;
  state.prompt = undefined;
  state.promptIds = [];
  state.transcript = "";
  state.status = "Microphone off";
  state.error = message;
  await persist();
}
async function refresh() {
  if (!state.credential) return;
  if (
    state.rotationToken ||
    state.credential.expiresAt - Date.now() < 86400000
  ) {
    state.rotationToken ??= "tp_ext_" + randomSecret();
    await persist();
    let expiresAt: number;
    try {
      expiresAt = (
        await request<{ expiresAt: number }>({
          action: "rotate",
          token: state.rotationToken,
        })
      ).expiresAt;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      expiresAt = (
        await request<{ expiresAt: number }>(
          { action: "rotate", token: state.rotationToken },
          state.rotationToken,
        )
      ).expiresAt;
    }
    state.credential.token = state.rotationToken;
    state.credential.expiresAt = expiresAt;
    state.rotationToken = undefined;
    await persist();
  }
  const d = await request<{ userId: string; sessions: Session[] }>({
    action: "context",
  });
  if (d.userId !== state.credential.userId) {
    await disconnect("Account mismatch. Reconnect.");
    return;
  }
  state.sessions = z
    .array(sessionSchema)
    .parse(d.sessions)
    .filter((s) => s.owner === d.userId);
  state.shortcut =
    (await chrome.commands.getAll()).find((c) => c.name === "toggle-recording")
      ?.shortcut || "";
  await persist();
}
const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
async function connect() {
  await disconnect("Complete connection in Trade Pulse.", true);
  const secret = randomSecret(),
    challenge = await digest(secret);
  state.pairing = { secret, challenge, createdAt: Date.now() };
  await persist();
  const url = new URL(APP_ORIGIN);
  url.searchParams.set("connectExtension", chrome.runtime.id);
  url.searchParams.set("instance", state.instanceId);
  url.searchParams.set("challenge", challenge);
  await chrome.tabs.create({ url: url.toString() });
}
async function newJournal(t = Date.now()) {
  if (!state.credential) throw new Error("Connect Trade Pulse first.");
  state.pendingStart ??= {
    requestId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    startedAt: t,
    name: new Date(t).toLocaleDateString() + " · Trading journal",
  };
  await persist();
  let d: { session: Session };
  try {
    d = await request<{ session: Session }>({
      action: "start",
      ...state.pendingStart,
    });
  } catch (e) {
    if (e instanceof ApiError && [400, 401, 409, 410].includes(e.status))
      throw e;
    const p = state.pendingStart;
    const local: Session = {
      id: p.sessionId,
      owner: state.credential.userId,
      name: p.name,
      startedAt: p.startedAt,
      source: "journal",
      events: [],
      journal: [],
      sampleCount: 0,
    };
    state.sessions = [
      local,
      ...state.sessions.filter((x) => x.id !== local.id),
    ];
    state.selectedId = local.id;
    state.pinned = true;
    state.status = "Queued offline";
    await persist();
    return local;
  }
  const s = sessionSchema.parse(d.session);
  if (s.owner !== state.credential.userId) throw new Error("Account mismatch.");
  state.pendingStart = undefined;
  state.sessions = [s, ...state.sessions.filter((x) => x.id !== s.id)];
  state.selectedId = s.id;
  state.pinned = true;
  await persist();
  return s;
}
async function start(activationAt: number, hr = false) {
  if (state.active || state.review)
    throw new Error("Finish or cancel the current recording first.");
  if (!state.credential) throw new Error("Connect Trade Pulse first.");
  if (
    !(await chrome.storage.local.get("microphoneGranted")).microphoneGranted
  ) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    throw new Error("Enable your microphone on the setup page.");
  }
  state.status = "Preparing microphone";
  state.error = "";
  state.transcript = "";
  await persist();
  try {
    await refresh();
  } catch (e) {
    if (e instanceof ApiError && [400, 401].includes(e.status)) throw e;
    state.error =
      "Offline. Recording stays on this device until transcription is available.";
  }
  let session = resolveSession(
    state.sessions,
    state.credential.userId,
    state.selectedId,
    hr && state.prompt ? state.prompt.t : activationAt,
  );
  session ??= await newJournal(activationAt);
  const prompt = hr ? state.prompt : undefined;
  if (prompt && prompt.sessionId !== session.id)
    throw new Error("Select the prompted journal before responding.");
  state.active = frozenDestination(state, session, activationAt, prompt);
  state.prompt = undefined;
  await persist();
  try {
    await capture("capture-start", state.active);
  } catch (e) {
    state.active = undefined;
    state.wakeEnabled = false;
    await persist();
    throw e;
  }
}
async function enqueue(destination: Destination, mutation: JournalMutation) {
  journalMutationSchema.parse(mutation);
  state.outbox.push({ destination, mutation });
  state.status = "Queued offline";
  await persist();
}
async function flush() {
  if (!state.credential) return;
  if (state.pendingStart) {
    await newJournal();
    if (state.pendingStart) return;
  }
  for (const item of [...state.outbox]) {
    if (!mayUpload(item, state)) continue;
    try {
      const d = await request<{ note: JournalEntry }>({
        action: "mutate",
        requestId: item.destination.requestId,
        sessionId: item.destination.sessionId,
        mutation: item.mutation,
      });
      const note = sessionSchema.shape.journal.element.parse(d.note);
      const session = state.sessions.find(
        (s) => s.id === item.destination.sessionId,
      );
      if (session)
        session.journal = [
          ...session.journal.filter((n) => n.id !== note.id),
          note,
        ];
      state.outbox = state.outbox.filter(
        (p) => p.destination.requestId !== item.destination.requestId,
      );
      if (item.mutation.kind !== "enrich")
        state.latest = note.deletedAt ? undefined : note;
      state.status = "Synced to your account";
      state.error = "";
      await persist();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await disconnect(e.message);
        return;
      }
      if (e instanceof ApiError && [400, 409, 410, 413].includes(e.status)) {
        item.blocked = e.message;
        state.error = e.message;
        await persist();
        continue;
      }
      state.status = "Queued offline";
      state.error =
        e instanceof Error ? e.message : "Will retry when connected.";
      await persist();
      break;
    }
  }
}
function targetSession(destination?: Destination) {
  const id = destination?.sessionId ?? state.selectedId;
  const session = state.sessions.find(
    (s) => s.id === id && s.owner === state.credential?.userId,
  );
  if (!session) throw new Error("Select a journal first.");
  return session;
}
async function command(text: string, destination: Destination) {
  if (destination.userId !== state.credential?.userId)
    throw new Error("This recording belongs to another account.");
  const c = parseVoiceCommand(text, true)!;
  if (c.kind === "log") {
    await enqueue(destination, {
      kind: "create",
      selection: destination.scope,
      note: {
        id: destination.noteId,
        t: destination.t,
        activationAt: destination.activationAt,
        recordingStartedAt: destination.recordingStartedAt,
        source: destination.hrEventId ? "hr-checkin" : "voice",
        label: destination.label ?? c.label,
        text: c.text,
        ...(destination.hrEventId
          ? { context: { hrEventId: destination.hrEventId } }
          : {}),
      },
    });
  } else if (c.kind === "tag" || c.kind === "correct") {
    await flush();
    if (
      state.outbox.some(
        (p) =>
          p.destination.sessionId === destination.sessionId &&
          p.destination.userId === destination.userId &&
          p.mutation.kind === "create",
      )
    )
      throw new Error(
        "Your last reflection is still queued. Sync it before correcting or tagging it.",
      );
    const note = lastNote(targetSession(destination));
    if (!note) throw new Error("There is no saved note in this journal yet.");
    await enqueue(
      destination,
      c.kind === "tag"
        ? {
            kind: "tag",
            noteId: note.id,
            expectedRevision: noteRevision(note),
            label: c.label,
          }
        : {
            kind: "correct",
            noteId: note.id,
            expectedRevision: noteRevision(note),
            text: c.text,
          },
    );
  } else if (c.kind === "prompts") {
    state.promptsPaused = c.paused;
    await persist();
  } else if (c.kind === "review") {
    await chrome.tabs.create({ url: APP_ORIGIN + "/?review=today" });
  } else if (c.kind === "start") {
    const selected = targetSession(destination);
    if (
      !(
        selected.source === "journal" &&
        selected.startedAt === destination.activationAt &&
        !selected.journal.length &&
        !selected.events.length
      )
    )
      await newJournal();
  } else if (c.kind === "switch") {
    const matches = state.sessions.filter(
      (s) =>
        s.name.toLowerCase() === c.target.toLowerCase() ||
        s.events.some((e) => e.symbol.toLowerCase() === c.target.toLowerCase()),
    );
    if (matches.length !== 1)
      throw new Error("Choose the matching journal in the session menu.");
    state.selectedId = matches[0].id;
    state.pinned = true;
    await persist();
  }
  state.review = undefined;
  await persist();
  await flush();
}
async function transcribe(destination: Destination) {
  const record = await audioRead(destination.noteId);
  if (!record?.finished) return;
  if (destination.userId !== state.credential?.userId) return;
  state.status = "Transcribing";
  state.active = destination;
  await persist();
  const bytes = new Uint8Array(
    await new Blob(record.chunks, { type: record.mime }).arrayBuffer(),
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = await request<{ text: string; review: boolean }>({
    action: "transcribe",
    audio: btoa(binary),
    mime: record.mime,
    durationMs: record.durationMs,
  });
  // Persist the transcript before erasing raw audio, including unclear speech.
  state.transcript = result.text;
  state.review = destination;
  state.active = undefined;
  state.audioOutbox = state.audioOutbox?.filter(
    (p) => p.noteId !== destination.noteId,
  );
  state.status = result.review ? "Review unclear speech" : "Saving";
  await persist();
  await audioRemove(destination.noteId);
  if (!result.review) {
    try {
      await command(result.text, destination);
    } catch (e) {
      state.review = destination;
      state.status = "Review transcript";
      throw e;
    }
  }
  await resumeWake();
}
async function resumeWake() {
  if (state.wakeEnabled && !state.active && !state.review && state.credential) {
    await capture("wake-start");
    state.status = "Awaiting wake phrase";
    await persist();
  }
}
async function recover() {
  if (!state.credential) return;
  await refresh();
  if (state.pendingStart) await newJournal();
  if (state.active) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    const live = contexts.length ? await capture("capture-state") : undefined;
    const record = await audioRead(state.active.noteId);
    if (record?.finished) await transcribe(state.active);
    else if (!live?.active) {
      state.status = "Error";
      state.error =
        "Recording was interrupted. Cancel it and record again; unfinished commands are never executed.";
      await persist();
    }
  }
  await flush();
  if (!state.active && !state.review) {
    const draft = state.reviews?.find(
      (p) => p.destination.userId === state.credential?.userId,
    );
    if (draft) {
      state.review = draft.destination;
      state.transcript = draft.text;
      state.reviews = state.reviews?.filter((p) => p !== draft);
      state.status = "Review transcript";
      await persist();
    } else {
      const audio = state.audioOutbox?.find(
        (p) => p.userId === state.credential?.userId,
      );
      if (audio) await transcribe(audio);
    }
  }
  // Enrich recent committed voice notes when WHOOP samples arrive after the reflection.
  let enrichments = 0;
  for (const session of state.sessions) {
    for (const note of session.journal
      .filter(
        (n) =>
          !n.deletedAt &&
          n.source !== "typed" &&
          Date.now() - n.t < 600000 &&
          ((!n.context?.bpm && session.sampleCount > 0) ||
            (!n.context?.eventId && session.events.length > 0)),
      )
      .slice(-3)) {
      if (
        enrichments < 3 &&
        !state.outbox.some(
          (p) =>
            p.destination.noteId === note.id && p.mutation.kind === "enrich",
        )
      ) {
        enrichments++;
        await enqueue(
          { ...frozenDestination(state, session, Date.now()), noteId: note.id },
          { kind: "enrich", noteId: note.id },
        );
      }
    }
  }
  await flush();
}
async function panel(input: unknown) {
  const p = panelMessageSchema.parse(input);
  if (p.type === "state") {
    state.shortcut =
      (await chrome.commands.getAll()).find(
        (c) => c.name === "toggle-recording",
      )?.shortcut || "";
    return {
      ...publicState(state),
      wakeAvailable: (await import("./config")).WAKE_CONFIG.available,
    };
  }
  if (p.type === "connect") await connect();
  else if (p.type === "disconnect")
    await disconnect(
      "Disconnected. Pending notes stay separated by account.",
      true,
    );
  else if (p.type === "refresh" || p.type === "retry") await recover();
  else if (p.type === "permission") {
    await chrome.storage.local.set({ microphoneGranted: p.granted });
  } else if (p.type === "start") await start(p.activationAt, p.hr);
  else if (p.type === "stop") {
    state.status = "Transcribing";
    await persist();
    await capture("capture-stop");
  } else if (p.type === "cancel") {
    await capture("capture-cancel");
    if (state.active) await audioRemove(state.active.noteId);
    if (state.active)
      state.audioOutbox = state.audioOutbox?.filter(
        (p) => p.noteId !== state.active!.noteId,
      );
    state.active = undefined;
    state.review = undefined;
    state.transcript = "";
    state.status = "Microphone off";
    state.error = "";
    await persist();
    await resumeWake();
  } else if (p.type === "select") {
    if (
      state.active ||
      (state.review &&
        parseVoiceCommand(state.transcript ?? "", true)?.kind !== "switch")
    )
      throw new Error("Finish this note before switching journals.");
    if (state.review) {
      state.review = undefined;
      state.status = "Microphone off";
    }
    targetSession({
      ...frozenDestination(
        state,
        state.sessions.find((s) => s.id === p.id)!,
        Date.now(),
      ),
      sessionId: p.id,
    });
    if (state.selectedId !== p.id)
      state.scope = {
        baselineSeconds: state.scope?.baselineSeconds,
        windowSeconds: state.scope?.windowSeconds,
      };
    state.selectedId = p.id;
    state.pinned = p.pinned;
    state.latest = lastNote(targetSession());
    await persist();
  } else if (p.type === "new-journal") await newJournal();
  else if (p.type === "scope") {
    if (state.active || state.review)
      throw new Error("Finish this note before changing context.");
    state.scope = {
      ...state.scope,
      instrumentId: p.instrumentId || undefined,
      accountId: p.accountId || undefined,
    };
    state.pinned = true;
    await persist();
  } else if (p.type === "pending-discard") {
    state.outbox = state.outbox.filter(
      (item) =>
        item.destination.requestId !== p.requestId ||
        item.destination.userId !== state.credential?.userId,
    );
    await persist();
  } else if (p.type === "pending-move") {
    const item = state.outbox.find(
      (item) =>
        item.destination.requestId === p.requestId &&
        item.destination.userId === state.credential?.userId,
    );
    if (!item || item.mutation.kind !== "create")
      throw new Error(
        "Only an owned queued reflection can move to another journal.",
      );
    const session = p.sessionId
      ? state.sessions.find(
          (s) => s.id === p.sessionId && s.owner === state.credential?.userId,
        )
      : await newJournal(item.mutation.note.t);
    if (!session) throw new Error("Choose an owned journal.");
    resolveSession(
      [session],
      state.credential!.userId,
      session.id,
      item.mutation.note.t,
    );
    const note = {
      ...item.mutation.note,
      id: crypto.randomUUID(),
      source: "voice" as const,
      context: undefined,
    };
    await enqueue(
      {
        ...item.destination,
        requestId: crypto.randomUUID(),
        noteId: note.id,
        sessionId: session.id,
      },
      { kind: "create", note },
    );
    state.outbox = state.outbox.filter((x) => x !== item);
    await persist();
    await flush();
  } else if (p.type === "pause") {
    state.promptsPaused = p.paused;
    state.prompt = undefined;
    await persist();
    await resumeWake();
  } else if (p.type === "snooze") {
    state.snoozeUntil = Date.now() + 600000;
    state.prompt = undefined;
    await persist();
    await resumeWake();
  } else if (p.type === "auto-respond") {
    state.autoRespond = p.enabled;
    await chrome.storage.session.set({ autoRespondConsent: p.enabled });
    await persist();
  } else if (p.type === "wake") {
    if (p.enabled && !state.credential)
      throw new Error("Connect Trade Pulse first.");
    if (state.active)
      throw new Error("Stop recording before changing wake listening.");
    if (p.enabled) {
      await capture("wake-start");
      state.wakeEnabled = true;
      await chrome.storage.session.set({ wakeConsent: true });
      state.status = "Awaiting wake phrase";
    } else {
      await capture("wake-stop");
      state.wakeEnabled = false;
      await chrome.storage.session.set({ wakeConsent: false });
      state.status = "Microphone off";
    }
    await persist();
  } else if (p.type === "review") {
    if (!state.review) throw new Error("No transcript to review.");
    state.transcript = p.text;
    await command(p.text, state.review);
    await resumeWake();
  } else if (p.type === "emotion" && state.active) {
    state.active.label = p.label;
    await persist();
  } else if (p.type === "emotion" && state.review) {
    state.review.label = p.label;
    await persist();
  } else if (
    p.type === "emotion" ||
    p.type === "correct" ||
    p.type === "undo"
  ) {
    await refresh();
    const session = targetSession(),
      note = lastNote(session);
    if (!note) throw new Error("No saved reflection in this journal.");
    const destination = frozenDestination(state, session, Date.now());
    await enqueue(
      destination,
      p.type === "emotion"
        ? {
            kind: "tag",
            noteId: note.id,
            expectedRevision: noteRevision(note),
            label: p.label,
          }
        : p.type === "correct"
          ? {
              kind: "correct",
              noteId: note.id,
              expectedRevision: noteRevision(note),
              text: p.text,
            }
          : {
              kind: "delete",
              noteId: note.id,
              expectedRevision: noteRevision(note),
            },
    );
    await flush();
  }
  return publicState(state);
}
function run(task: () => Promise<unknown>) {
  const result = chain
    .then(() => loaded)
    .then(task)
    .catch(async (e) => {
      if (e instanceof ApiError && e.status === 401)
        await disconnect(e.message);
      else {
        state.error = e instanceof Error ? e.message : "Journal error.";
        if (state.wakeEnabled) {
          await capture("wake-stop").catch(() => {});
          state.wakeEnabled = false;
        }
        if (
          state.active &&
          state.audioOutbox?.some((p) => p.noteId === state.active!.noteId)
        )
          state.status = "Queued offline";
        else if (state.status !== "Queued offline") state.status = "Error";
        await persist();
      }
      return { error: state.error };
    });
  chain = result.then(() => {});
  return result;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (
    message?.target === "worker" &&
    sender.url === chrome.runtime.getURL("offscreen.html")
  ) {
    void run(async () => {
      if (
        message.type === "capture-started" &&
        state.active &&
        message.data?.noteId === state.active.noteId
      ) {
        state.active.recordingStartedAt = message.data.recordingStartedAt;
        state.status = "Recording";
        await persist();
      } else if (
        message.type === "capture-finished" &&
        state.active &&
        message.data?.noteId === state.active.noteId
      ) {
        state.active.recordingStartedAt = message.data.recordingStartedAt;
        state.audioOutbox = [
          ...(state.audioOutbox ?? []).filter(
            (p) => p.noteId !== state.active!.noteId,
          ),
          state.active,
        ];
        await persist();
        await transcribe(state.active);
      } else if (message.type === "capture-error") {
        state.wakeEnabled = false;
        state.active = undefined;
        state.status = "Error";
        state.error = String(message.data?.error);
        await persist();
      } else if (message.type === "wake-detected") {
        await start(message.data.activationAt);
      }
      return { ok: true };
    }).then(respond);
    return true;
  }
  if (message?.target !== "worker") return;
  if (
    !["panel.html", "setup.html"].some(
      (p) => sender.url === chrome.runtime.getURL(p),
    )
  )
    return;
  void run(() => panel(message.payload)).then(respond);
  return true;
});
const bridgeSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("pair-result"),
      code: z.string().regex(/^[a-f0-9]{64}$/),
      instanceId: z.uuid(),
      challenge: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("context"),
      userId: z.uuid(),
      sessionId: z.uuid().optional(),
      scope: reflectionSchema.shape.captureScope,
    })
    .strict(),
  z
    .object({
      type: z.literal("hr-prompt"),
      userId: z.uuid(),
      sessionId: z.uuid(),
      momentId: z.string().regex(/^hr-\d+$/),
      t: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ type: z.literal("account-left"), userId: z.uuid() }).strict(),
]);
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  if (!sender.url || new URL(sender.url).origin !== APP_ORIGIN) return;
  const preview = bridgeSchema.safeParse(message);
  if (!preview.success) {
    respond({ error: "Invalid extension bridge payload." });
    return;
  }
  // Prompt delivery must not wait behind transcription. Silence app TTS while a
  // connected extension already owns capture, review, snooze, or prompt pause.
  if (
    preview.data.type === "hr-prompt" &&
    state?.credential?.userId === preview.data.userId &&
    (state.active ||
      state.review ||
      state.prompt ||
      state.promptsPaused ||
      (state.snoozeUntil ?? 0) > Date.now())
  ) {
    respond({ claimed: true });
    return;
  }
  void run(async () => {
    const m = bridgeSchema.parse(message);
    if (m.type === "pair-result") {
      const pair = state.pairing;
      if (
        !pair ||
        m.instanceId !== state.instanceId ||
        m.challenge !== pair.challenge ||
        Date.now() - pair.createdAt > 600000
      )
        throw new Error("Pairing expired. Start Connect Trade Pulse again.");
      const credential = await request<Credential>(
        {
          action: "exchange",
          instanceId: state.instanceId,
          code: m.code,
          secret: pair.secret,
        },
        undefined,
      );
      state.credential = credential;
      state.pairing = undefined;
      state.selectedId = undefined;
      state.pinned = false;
      state.error = "";
      await persist();
      await recover();
      return { ok: true, userId: credential.userId };
    }
    if (!state.credential) return { connected: false };
    if (m.type === "account-left" || m.userId !== state.credential.userId) {
      await disconnect(
        "Application account changed. Reconnect Trade Pulse.",
        true,
      );
      return { connected: false };
    }
    if (m.type === "context") {
      state.bridge = {
        userId: m.userId,
        sessionId: m.sessionId,
        updatedAt: Date.now(),
      };
      if (!state.pinned && !state.active && !state.review && m.sessionId) {
        state.selectedId = m.sessionId;
        state.scope = m.scope;
      }
      await persist();
      return {
        connected: true,
        shortcut: state.shortcut,
        promptsPaused: state.promptsPaused,
      };
    }
    if (
      state.promptsPaused ||
      (state.snoozeUntil ?? 0) > Date.now() ||
      state.active ||
      state.review ||
      state.prompt ||
      Date.now() - m.t > 10000 ||
      Date.now() < m.t ||
      state.selectedId !== m.sessionId
    )
      return { claimed: false };
    if (state.promptIds?.includes(m.momentId)) return { claimed: true };
    state.promptIds = [...(state.promptIds ?? []).slice(-99), m.momentId];
    state.prompt = { id: m.momentId, t: m.t, sessionId: m.sessionId };
    state.status = "Microphone off · HR prompt";
    await persist();
    // Acknowledge ownership before doing audio work, preventing timeout fallback in the app.
    void run(async () => {
      await capture("wake-stop");
      await capture("beep");
      if (state.autoRespond) {
        await new Promise((r) => setTimeout(r, 500));
        await start(Date.now(), true);
      }
    });
    return { claimed: true };
  }).then(respond);
  return true;
});
chrome.commands.onCommand.addListener((command) => {
  const activationAt = Date.now();
  if (command !== "toggle-recording") return;
  void run(async () => {
    if (activationAt - (state.lastShortcutAt ?? 0) < 750) return;
    state.lastShortcutAt = activationAt;
    await persist();
    if (state.active && state.status === "Recording") {
      await capture("capture-stop");
      state.status = "Transcribing";
      await persist();
    } else if (!state.active) await start(activationAt);
  });
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
});
chrome.runtime.onStartup.addListener(
  () =>
    void run(async () => {
      state.wakeEnabled = false;
      state.autoRespond = false;
      await persist();
      await recover();
    }),
);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "journal-retry") void run(recover);
});

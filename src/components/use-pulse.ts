"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyWorkspace,
  mergeSessions,
  type WorkspaceUser,
} from "@/lib/workspace";
import {
  defaults,
  type Session,
  type Sample,
  type Settings,
  type TradeEvent,
  type JournalEntry,
} from "@/lib/model";
import * as storage from "@/lib/storage";
import {
  api,
  sync,
  pullSession,
  pullSessions,
  cloudConfigured,
  authClient,
} from "@/lib/cloud";
import { eventSchema, sessionSchema } from "@/lib/validation";
import { connectHeartRate } from "@/lib/bluetooth";
import { mergeNotes, reflectionContext, liveNotes } from "@/lib/smart-journal";
import { removeSessionScreenshots } from "@/lib/screenshots";
import { mergeCsvEvents, planCsvSessions, type CsvDestination } from "@/lib/csv-session";
import { noteTime, validateDestination } from "@/lib/journal-routing";
export function usePulse(user: WorkspaceUser, onSessionStart?: () => void) {
  const owner = user.id,
    email = user.email || "";
  const [session, setSession] = useState<Session | null>(() =>
      emptyWorkspace(owner),
    ),
    [samples, setSamples] = useState<Sample[]>([]),
    [history, setHistory] = useState<Session[]>([]);
  const [active, setActive] = useState(false),
    [recording, setRecording] = useState(false),
    [device, setDevice] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [syncState, setSyncState] = useState("On this device"),
    [settings, setSettings] = useState<Settings>(defaults),
    [now, setNow] = useState(Date.now()),
    [insightTime, setInsightTime] = useState(Date.now());
  const current = useRef<Session | null>(emptyWorkspace(owner)),
    raw = useRef<Sample[]>([]),
    rec = useRef(false),
    connection = useRef<Awaited<ReturnType<typeof connectHeartRate>> | null>(
      null,
    ),
    writing = useRef(Promise.resolve()),
    insightLast = useRef(0);
  const sessionLoad = useRef(0);
  const noteWrites = useRef(Promise.resolve());
  const save = useCallback(async (s: Session) => {
    if (s.id !== "workspace") {
      await storage.saveSession(s);
      setHistory((h) =>
        [s, ...h.filter((x) => x.id !== s.id)].sort(
          (a, b) => b.startedAt - a.startedAt,
        ),
      );
    }
    current.current = s;
    setSession(s);
  }, []);
  const refreshHistory = useCallback(
    async () => setHistory(await storage.listSessions(owner)),
    [owner],
  );
  const resetWorkspace = useCallback(() => {
    if (rec.current) return;
    sessionLoad.current++;
    const s = emptyWorkspace(owner);
    current.current = s;
    raw.current = [];
    setSession(s);
    setSamples([]);
    setInsightTime(Date.now());
  }, [owner]);
  useEffect(() => {
    resetWorkspace();
    try {
      const saved = localStorage.getItem("pulse-settings:" + owner);
      if (saved) setSettings({ ...defaults, ...JSON.parse(saved) });
    } catch {}
  }, [owner, resetWorkspace]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const sessions = await pullSessions(owner);
        if (!alive) return;
        await refreshHistory();
        if (current.current?.id === "workspace" && !rec.current) {
          const latest = sessions.find(
            (s) => s.events.length || s.journal.length,
          );
          if (latest) await openSession(latest);
        }
      } catch {}
    };
    void refresh();
    const timer = setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [owner, refreshHistory]);
  useEffect(() => {
    refreshHistory().catch(() =>
      setError(
        "Browser storage is unavailable. Recording needs IndexedDB; try a normal browser window.",
      ),
    );
  }, [refreshHistory]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (rec.current) {
        setSamples([...raw.current]);
        if (Date.now() - insightLast.current >= settings.cadence * 1000) {
          setInsightTime(Date.now());
          insightLast.current = Date.now();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [settings.cadence]);
  useEffect(() => {
    let alive = true;
    const flush = () => {
      if (!cloudConfigured) {
        setSyncState("On this device");
        return;
      }
      if (!navigator.onLine) {
        setSyncState("Offline · saved locally");
        return;
      }
      sync(owner)
        .then((n) => {
          if (alive) setSyncState(n ? "Syncing batches…" : "Cloud connected");
        })
        .catch(() => {
          if (alive)
            setSyncState(
              cloudConfigured
                ? "Sync paused · saved locally"
                : "On this device",
            );
        });
    };
    flush();
    const t = setInterval(flush, 30000);
    window.addEventListener("online", flush);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("online", flush);
    };
  }, [owner]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (rec.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      sessionLoad.current++;
      connection.current?.disconnect();
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  function configure(s: Settings) {
    setSettings(s);
    localStorage.setItem("pulse-settings:" + owner, JSON.stringify(s));
    setInsightTime(Date.now());
  }
  async function stop() {
    rec.current = false;
    setActive(false);
    setRecording(false);
    connection.current?.disconnect();
    connection.current = null;
    setDevice("");
    await writing.current;
    await noteWrites.current;
    const s = current.current;
    if (s && s.id !== "workspace") {
      await save({
        ...s,
        endedAt: s.source === "tradingview" ? s.endedAt : Date.now(),
        sampleCount: raw.current.length,
      });
      setSamples([...raw.current]);
      await refreshHistory();
      setInsightTime(Date.now());
    }
  }
  async function start(name?: string, startedAt = Date.now()) {
    if (rec.current) return;
    onSessionStart?.();
    sessionLoad.current++;
    const selected = current.current;
    if (
      selected?.source === "tradingview" &&
      selected.startedAt <= Date.now() &&
      (selected.endedAt || 0) > Date.now()
    ) {
      rec.current = true;
      setActive(true);
      setNotice("Daily journal opened. A wearable is optional.");
      return;
    }
    const s: Session = {
      id: crypto.randomUUID(),
      name:
        name || new Date(startedAt).toLocaleDateString() + " · Trading journal",
      startedAt,
      source: "journal",
      owner,
      events: [],
      journal: [],
      sampleCount: 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    await save(s);
    raw.current = [];
    setSamples([]);
    rec.current = true;
    setActive(true);
    setError("");
    setDevice("");
    setInsightTime(Date.now());
    void sync(owner).catch(() =>
      setSyncState(
        cloudConfigured ? "Sync paused · saved locally" : "On this device",
      ),
    );
    setNotice("Journal session started. A wearable is optional.");
  }
  async function attachWhoop() {
    if (connection.current) return;
    if (!rec.current) await start();
    setError("");
    const c = await connectHeartRate(
      (p) => {
        const currentSession = current.current;
        if (!rec.current || !currentSession) return;
        if (
          raw.current.length >= 100000 ||
          p.t - (raw.current[0]?.t ?? p.t) > 43200000
        ) {
          void stop();
          setNotice("Session limit reached. Start a new session to continue.");
          return;
        }
        const sample = { ...p, provider: "whoop" as const };
        raw.current.push(sample);
        writing.current = writing.current
          .then(async () => {
            await storage.appendSamples(currentSession.id, [sample], owner);
            const latest = current.current;
            if (latest?.id === currentSession.id)
              await storage.saveSession({
                ...latest,
                sampleCount: raw.current.length,
              });
          })
          .catch(() => {
            connection.current?.disconnect();
            connection.current = null;
            setRecording(false);
            setDevice("");
            setError(
              "Heart-rate recording stopped because browser storage could not save a sample. Your journal remains available.",
            );
          });
      },
      () => {
        connection.current = null;
        setRecording(false);
        setDevice("");
        setNotice(
          "Wearable disconnected. Your journal and TradingView connection continue.",
        );
      },
    );
    connection.current = c;
    setDevice(c.name);
    setRecording(true);
    const currentSession = current.current!;
    await save({
      ...currentSession,
      wearable: { provider: "whoop", connection: "bluetooth" },
    });
    setNotice(
      "WHOOP attached. Keep this tab open and your device awake for heart-rate recording.",
    );
  }
  async function detachWearable() {
    connection.current?.disconnect();
    connection.current = null;
    setRecording(false);
    setDevice("");
    await writing.current;
    setSamples([...raw.current]);
    setNotice("Wearable disconnected. Your journal session continues.");
  }
  async function importEvents(
    events: TradeEvent[],
    name: string,
    destination: CsvDestination = "daily",
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {
    if (!events.length) throw new Error("There are no trade rows to import.");
    events.forEach((e) => eventSchema.parse(e));
    if (events.some((e) => e.t > Date.now() + 300000))
      throw new Error(
        "CSV timestamps cannot be more than five minutes in the future. Check the timezone.",
      );
    if (destination === "daily") {
      sessionLoad.current++;
      // Refresh the user's own journal index before matching dates. This never
      // connects a broker or sends the source CSV to a provider.
      if (cloudConfigured && navigator.onLine) {
        try { await pullSessions(owner); }
        catch { throw new Error("Could not refresh your saved sessions. Retry when cloud sync is available; your CSV is still here."); }
      }
      const saved = await storage.listSessions(owner);
      const selected = current.current;
      const sessions = selected && selected.id !== "workspace"
        ? [selected, ...saved.filter((s) => s.id !== selected.id)] : saved;
      const plans = planCsvSessions(events, sessions, owner, timezone, selected?.id, rec.current ? selected?.id : undefined);
      const updates = new Map<string, Session>();
      for (const plan of plans) {
        const base = plan.session || {
          id: crypto.randomUUID(), owner, name: `Trading day · ${plan.day}`,
          source: "csv" as const, startedAt: plan.events[0].t,
          endedAt: plan.events.at(-1)!.t, sampleCount: 0, events: [], journal: [],
        };
        updates.set(base.id, mergeCsvEvents(updates.get(base.id) || base, plan.events));
      }
      // Validate every date before writing any import. Preserve recording refs
      // and their original sample timestamps when the active session matches.
      for (const update of updates.values()) sessionSchema.parse(update);
      await writing.current;
      for (const update of updates.values()) {
        if (rec.current && update.id === current.current?.id) {
          const live = mergeCsvEvents(current.current, update.events);
          await save(live);
        } else await storage.saveSession(update);
      }
      const importedHistory = await storage.listSessions(owner);
      setHistory(importedHistory);
      if (!rec.current) {
        const target = updates.get(selected?.id || "") || [...updates.values()].at(-1)!;
        await openSession(importedHistory.find((s) => s.id === target.id) || target);
      }
      if (cloudConfigured)
        void sync(owner).catch(() => setSyncState("Sync paused · saved locally"));
      return events.length;
    }
    if (destination === "current" && current.current?.id !== "workspace")
      return addEvents(events);
    if (rec.current)
      throw new Error(
        "End the current session or import into it before creating another journal.",
      );
    const sorted = [...events].sort((a, b) => a.t - b.t);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            owner +
              ":" +
              sorted
                .map((e) => e.id)
                .sort()
                .join("|"),
          ),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const existing = (await storage.listSessions(owner)).find(
      (x) => x.id === id,
    );
    const imported: Session = {
      id,
      owner,
      name: name.slice(0, 120) || "Imported trades",
      source: "csv",
      startedAt: sorted[0].t,
      endedAt: sorted.at(-1)!.t,
      sampleCount: 0,
      events: sorted,
      journal: [],
    };
    if (existing)
      for (const event of sorted) {
        const old = existing.events.find((e) => e.id === event.id);
        if (old && old.pnl !== event.pnl)
          throw new Error(
            "This execution already exists with different P&L. Keep its original values or supply a different execution ID.",
          );
      }
    await save(mergeSessions(existing, imported));
    raw.current = [];
    setSamples([]);
    setInsightTime(Date.now());
    try {
      await sync(owner);
      setSyncState(cloudConfigured ? "Cloud connected" : "On this device");
    } catch {
      setSyncState(
        cloudConfigured ? "Sync paused · saved locally" : "On this device",
      );
    }
    return sorted.length;
  }
  async function openSession(s: Session) {
    if (s.owner !== owner)
      throw new Error("That session belongs to another workspace.");
    if (rec.current) {
      setError("End your active session before opening another one.");
      return;
    }
    const request = ++sessionLoad.current;
    const selectedId = current.current?.id;
    setError("");
    try {
      let pts = await storage.getSamples(s.id, owner);
      let loaded = s;
      if (navigator.onLine) {
        try {
          const cloud = await pullSession(s.id);
          if (cloud.session.owner !== owner)
            throw new Error("Workspace identity mismatch.");
          const map = new Map([...pts, ...cloud.samples].map((p) => [p.t, p]));
          pts = [...map.values()].sort((a, b) => a.t - b.t);
          loaded = {
            ...s,
            journal: mergeNotes(s.journal, cloud.session.journal),
            events: [
              ...new Map(
                [...s.events, ...cloud.events].map((e) => [e.id, e]),
              ).values(),
            ].sort((a, b) => a.t - b.t),
          };
        } catch {
          /* Local sessions remain usable during a cloud outage. */
        }
      }
      // A delayed history load must never replace a session started or selected
      // after this request began. This also discards older overlapping opens.
      if (
        request !== sessionLoad.current ||
        rec.current ||
        current.current?.id !== selectedId
      )
        return;
      current.current = loaded;
      raw.current = pts;
      setSession(loaded);
      setSamples(pts);
      setInsightTime(Date.now());
    } catch {
      setError("Could not open this saved session.");
    }
  }
  async function addEvents(events: TradeEvent[]) {
    events.forEach((e) => eventSchema.parse(e));
    if (current.current?.id === "workspace")
      await start(undefined, Math.min(Date.now(), ...events.map((e) => e.t)));
    const s = current.current;
    if (!s) throw new Error("Open a journal before adding events.");
    if (s.owner !== owner) throw new Error("Workspace identity mismatch.");
    const outOfRange = events.some(
      (e) =>
        e.t < s.startedAt ||
        (s.endedAt && e.t > s.endedAt) ||
        e.t > Date.now() + 300000,
    );
    if (outOfRange)
      throw new Error(
        "Event timestamps must fall inside this session. Select the matching session before importing.",
      );
    const merged = [
      ...new Map([...s.events, ...events].map((e) => [e.id, e])).values(),
    ].sort((a, b) => a.t - b.t);
    if (merged.length > 5000)
      throw new Error("This session supports up to 5,000 events.");
    await save({ ...s, events: merged });
    void sync(owner).catch(() =>
      setSyncState(
        cloudConfigured ? "Sync paused · saved locally" : "On this device",
      ),
    );
  }
  async function addNote(note: JournalEntry) {
    const task = noteWrites.current.then(() => persistNote(note));
    noteWrites.current = task.catch(() => {});
    return task;
  }
  async function persistNote(note: JournalEntry) {
    if (current.current?.id === "workspace")
      await start(undefined, Math.min(Date.now(), note.t));
    const s = current.current;
    if (!s) throw new Error("Open a journal before adding a reflection.");
    if (s.owner !== owner) throw new Error("Workspace identity mismatch.");
    if (s) {
      if (s.journal.length >= 1000 && !s.journal.some((j) => j.id === note.id))
        throw new Error("This session supports up to 1,000 journal entries.");
      const old = s.journal.find((j) => j.id === note.id);
      validateDestination(note, s);
      const occurredAt = noteTime(note);
      if (
        occurredAt !== null && (
          occurredAt < Math.min(s.startedAt, s.events[0]?.t ?? Infinity) ||
          (s.endedAt && occurredAt > Math.max(s.endedAt, s.events.at(-1)?.t ?? 0)) ||
          occurredAt > Date.now() + 300000)
      )
        throw new Error("Choose a moment inside this journal's time range.");
      const updated = {
        ...note,
        context: note.deletedAt || occurredAt === null || note.section === "stillness"
          ? undefined
          : {
              ...reflectionContext(raw.current, occurredAt, settings, s.events),
              ...note.context,
            },
        updatedAt: Math.max(Date.now(), (old?.updatedAt || old?.t || 0) + 1),
      };
      await save({ ...s, journal: mergeNotes(s.journal, [updated]) });
      void sync(owner).catch(() =>
        setSyncState(
          cloudConfigured ? "Sync paused · saved locally" : "On this device",
        ),
      );
    }
  }
  async function removeNote(id: string) {
    const s = current.current,
      old = s?.journal.find((j) => j.id === id);
    if (!s || !old || old.deletedAt) return;
    const revision = Math.max(Date.now(), (old.updatedAt || old.t) + 1);
    await addNote({
      id: old.id,
      t: old.t,
      label: "Other",
      text: "",
      updatedAt: revision,
      deletedAt: revision,
    });
  }
  async function prepareScreenshot(t: number) {
    if (current.current?.id === "workspace")
      await start(undefined, Math.min(Date.now(), t));
    const s = current.current!;
    await api({ action: "save", session: s });
    return s.id;
  }
  async function deleteSession() {
    const s = current.current;
    if (!s || s.id === "workspace" || rec.current) return;
    await api({ action: "delete", sessionId: s.id });
    await removeSessionScreenshots(owner, s.id).catch(() =>
      setNotice(
        "Journal deleted. Some screenshot files could not be removed; reconnect and retry cleanup.",
      ),
    );
    await storage.removeSession(s.id, owner);
    await refreshHistory();
    resetWorkspace();
  }
  useEffect(() => {
    if (!session || session.id === "workspace") return;
    let cursor = "";
    const t = setInterval(async () => {
      const s = current.current;
      if (!s) return;
      try {
        const status = await api<{ updatedAt: string }>({
          action: "change-status",
          sessionId: s.id,
        });
        if (status.updatedAt === cursor) return;
        const d = await api<{ events: TradeEvent[]; session: Session }>({
          action: "get",
          sessionId: s.id,
          cursor: "9223372036854775807",
        });
        if (current.current?.id !== s.id) return;
        const latest = current.current;
        const merged = [
          ...new Map(
            [...latest.events, ...d.events].map((e) => [e.id, e]),
          ).values(),
        ].sort((a, b) => a.t - b.t);
        const next = { ...mergeSessions(latest, d.session), events: merged };
        if (JSON.stringify(next) !== JSON.stringify(latest)) await save(next);
        cursor = status.updatedAt;
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [owner, session?.id, save]);
  useEffect(() => {
    const client = authClient();
    if (!client) return;
    let alive = true;
    const channel = client
      .channel("journal:" + owner)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pulse_sessions",
          filter: "user_id=eq." + owner,
        },
        (payload) => {
          const parsed = sessionSchema.safeParse(
            (payload.new as { data?: unknown }).data,
          );
          if (!alive || !parsed.success || parsed.data.owner !== owner) return;
          const remote = parsed.data,
            selected = current.current;
          void (async () => {
            if (selected?.id === remote.id)
              await save(mergeSessions(current.current ?? undefined, remote));
            else await storage.saveSession(remote);
            if (alive) await refreshHistory();
          })().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void client.removeChannel(channel);
    };
  }, [owner, save, refreshHistory]);
  return {
    session,
    samples,
    history,
    owner,
    email,
    active,
    recording,
    device,
    error,
    setError,
    notice,
    setNotice,
    syncState,
    settings,
    configure,
    now,
    insightTime,
    start,
    attachWhoop,
    detachWearable,
    importEvents,
    stop,
    resetWorkspace,
    openSession,
    addEvents,
    addNote,
    removeNote,
    prepareScreenshot,
    deleteSession,
    refreshHistory,
  };
}

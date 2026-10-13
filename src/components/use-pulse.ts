"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyWorkspace, type WorkspaceUser } from "@/lib/workspace";
import {
  defaults,
  type Session,
  type Sample,
  type Settings,
  type TradeEvent,
  type JournalEntry,
} from "@/lib/model";
import * as storage from "@/lib/storage";
import { api, sync, pullSession, pullSessions } from "@/lib/cloud";
import { eventSchema } from "@/lib/validation";
import { connectHeartRate } from "@/lib/bluetooth";
export function usePulse(user: WorkspaceUser) {
  const owner = user.id,
    email = user.email || "";
  const [session, setSession] = useState<Session | null>(() =>
      emptyWorkspace(owner),
    ),
    [samples, setSamples] = useState<Sample[]>([]),
    [history, setHistory] = useState<Session[]>([]);
  const [recording, setRecording] = useState(false),
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
  const save = useCallback(async (s: Session) => {
    current.current = s;
    setSession(s);
    if (s.id !== "workspace") await storage.saveSession(s);
  }, []);
  const refreshHistory = useCallback(
    async () => setHistory(await storage.listSessions(owner)),
    [owner],
  );
  const resetWorkspace = useCallback(() => {
    if (rec.current) return;
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
    pullSessions(owner)
      .then(() => {
        if (alive) void refreshHistory();
      })
      .catch(() => {});
    return () => {
      alive = false;
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
      if (!navigator.onLine) {
        setSyncState("Offline · saved locally");
        return;
      }
      sync(owner)
        .then((n) => {
          if (alive) setSyncState(n ? "Syncing batches…" : "Cloud connected");
        })
        .catch(() => {
          if (alive) setSyncState("Sync paused · saved locally");
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
    setRecording(false);
    connection.current?.disconnect();
    connection.current = null;
    setDevice("");
    await writing.current;
    const s = current.current;
    if (s && s.id !== "workspace") {
      await save({
        ...s,
        endedAt: Date.now(),
        sampleCount: raw.current.length,
      });
      setSamples([...raw.current]);
      await refreshHistory();
      setInsightTime(Date.now());
    }
  }
  async function start() {
    setError("");
    if (rec.current) return;
    const previous = current.current;
    try {
      const s: Session = {
        id: crypto.randomUUID(),
        name:
          new Date().toLocaleDateString([], {
            month: "short",
            day: "numeric",
          }) + " · Trading session",
        startedAt: Date.now(),
        source: "whoop",
        events: [],
        journal: [],
        owner,
        sampleCount: 0,
      };
      // Persist initial metadata before connecting. No sample is accepted until recording starts.
      await storage.saveSession(s);
      let c: Awaited<ReturnType<typeof connectHeartRate>>;
      try {
        c = await connectHeartRate(
          (p) => {
            if (!rec.current) return;
            const active = current.current;
            if (!active) return;
            if (
              raw.current.length >= 100000 ||
              p.t - active.startedAt > 43200000
            ) {
              void stop();
              setNotice(
                "Session limit reached. Start a new session to continue.",
              );
              return;
            }
            raw.current.push(p);
            writing.current = writing.current
              .then(async () => {
                await storage.appendSamples(active.id, [p], active.owner);
                const latest = current.current;
                if (latest?.id === active.id)
                  await storage.saveSession({
                    ...latest,
                    sampleCount: raw.current.length,
                  });
              })
              .catch(() => {
                rec.current = false;
                setRecording(false);
                connection.current?.disconnect();
                setError(
                  "Recording stopped: browser storage could not save a sample. Export the available session before continuing.",
                );
              });
          },
          () => {
            void stop();
            setNotice(
              "Sensor disconnected. The session has been saved. Reconnect to start a new session.",
            );
          },
        );
      } catch (e) {
        await storage.removeSession(s.id, owner);
        throw e;
      }
      connection.current = c;
      current.current = s;
      raw.current = [];
      setSession(s);
      setSamples([]);
      rec.current = true;
      setRecording(true);
      setDevice(c.name);
      insightLast.current = Date.now();
      setInsightTime(Date.now());
      await refreshHistory();
      setNotice("Recording. Keep this tab open and your device awake.");
    } catch (e) {
      current.current = previous;
      setError(e instanceof Error ? e.message : "Could not start recording.");
    }
  }
  async function openSession(s: Session) {
    if (s.owner !== owner)
      throw new Error("That session belongs to another workspace.");
    if (rec.current) {
      setError("End your active session before opening another one.");
      return;
    }
    setError("");
    try {
      let pts = await storage.getSamples(s.id, owner);
      let loaded = s;
      if (navigator.onLine) {
        try {
          const cloud = await pullSession(s.id);
          const map = new Map([...pts, ...cloud.samples].map((p) => [p.t, p]));
          pts = [...map.values()].sort((a, b) => a.t - b.t);
          loaded = {
            ...s,
            journal: [
              ...new Map(
                [...s.journal, ...cloud.session.journal].map((j) => [j.id, j]),
              ).values(),
            ].sort((a, b) => a.t - b.t),
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
    const s = current.current;
    if (!s || s.id === "workspace")
      throw new Error("Start or open a session before adding trade events.");
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
  }
  async function addNote(note: JournalEntry) {
    const s = current.current;
    if (!s || s.id === "workspace")
      throw new Error("Start or open a session before adding a reflection.");
    if (s.owner !== owner) throw new Error("Workspace identity mismatch.");
    if (s) {
      if (s.journal.length >= 1000)
        throw new Error("This session supports up to 1,000 journal entries.");
      await save({ ...s, journal: [...s.journal, note] });
    }
  }
  async function deleteSession() {
    const s = current.current;
    if (!s || s.id === "workspace" || rec.current) return;
    await api({ action: "delete", sessionId: s.id });
    await storage.removeSession(s.id, owner);
    await refreshHistory();
    resetWorkspace();
  }
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(async () => {
      const s = current.current;
      if (!s) return;
      try {
        const d = await api<{ events: TradeEvent[] }>({
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
        if (merged.length !== latest.events.length)
          await save({ ...latest, events: merged });
      } catch {}
    }, 15000);
    return () => clearInterval(t);
  }, [owner, recording, save]);
  return {
    session,
    samples,
    history,
    owner,
    email,
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
    stop,
    resetWorkspace,
    openSession,
    addEvents,
    addNote,
    deleteSession,
    refreshHistory,
  };
}

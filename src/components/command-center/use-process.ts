"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/model";
import { recordSchema, type ProcessRecord } from "@/lib/process/model";
import { cloudConfigured } from "@/lib/cloud";
import { readProcess, saveProcess, syncProcess } from "@/lib/process/storage";
import { validateAppend, withRefs } from "@/lib/process/engine";
export function useProcess(owner: string, sessions: Session[]) {
  const [records, setRecords] = useState<ProcessRecord[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [syncState, setSyncState] = useState("Loading process records…"),
    [busy, setBusy] = useState(false);
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const reload = useCallback(async () => {
    const rows = await readProcess(owner);
    if (currentOwner.current === owner) {
      setRecords(rows);
      setLoaded(true);
    }
    return rows;
  }, [owner]);
  const sync = useCallback(async () => {
    try {
      const pending = await syncProcess(owner);
      if (currentOwner.current === owner) {
        await reload();
        setSyncState(
          !cloudConfigured
            ? "Saved on this device"
            : pending
              ? `${pending} local changes awaiting sync`
              : "Process records synced",
        );
      }
    } catch (e) {
      if (currentOwner.current === owner)
        setSyncState(
          "Saved locally · " +
            (e instanceof Error ? e.message : "sync unavailable"),
        );
    }
  }, [owner, reload]);
  useEffect(() => {
    let alive = true;
    setRecords([]);
    setLoaded(false);
    void reload()
      .then(() => {
        if (alive) void sync();
      })
      .catch((e) => setError(String(e)));
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const timer = setInterval(onOnline, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [reload, sync]);
  async function save(batch: ProcessRecord[]) {
    setBusy(true);
    setError("");
    try {
      const existing = await readProcess(owner),
        prepared = batch.map((row) => withRefs(recordSchema.parse(row)));
      validateAppend(existing, prepared, sessions);
      await saveProcess(owner, prepared);
      await reload();
      setSyncState("Saved locally · syncing…");
      void sync();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save process records.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    records,
    loaded,
    error,
    setError,
    syncState,
    busy,
    save,
    refresh: sync,
  };
}
export type ProcessStore = ReturnType<typeof useProcess>;

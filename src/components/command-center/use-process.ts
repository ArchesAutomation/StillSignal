"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
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
  const saveInFlight = useRef(false);
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
        if (currentOwner.current !== owner) return;
        setSyncState(
          !cloudConfigured
            ? "Saved on this device"
            : !navigator.onLine
              ? pending
                ? `Offline · ${pending} local changes awaiting sync`
                : "Offline · saved on this device; cloud sync has not been checked"
            : pending
              ? `${pending} local changes awaiting sync`
              : "Process records synced",
        );
      }
    } catch (e) {
      if (currentOwner.current === owner) {
        // Sync may have downloaded cloud records even though an upload failed.
        await reload().catch(() => {});
        if (currentOwner.current !== owner) return;
        setSyncState(
          "Saved locally · " +
            (e instanceof Error ? e.message : "sync unavailable"),
        );
      }
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
    window.addEventListener("offline", onOnline);
    const timer = setInterval(onOnline, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, [reload, sync]);
  async function save(batch: ProcessRecord[]) {
    if (saveInFlight.current) return false;
    saveInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const existing = await readProcess(owner),
        prepared = batch.map((row) => withRefs(recordSchema.parse(row)));
      validateAppend(existing, prepared, sessions);
      await saveProcess(owner, prepared);
      // The transaction is committed. A read failure must not invite a duplicate retry.
      await reload().catch(() => {
        if (currentOwner.current === owner) setRecords([...existing, ...prepared]);
      });
      setSyncState("Saved locally · syncing…");
      void sync();
      return true;
    } catch (e) {
      setError(
        e instanceof ZodError
          ? "This change could not be saved. Your draft is still available. Check the fields and retry."
          : e instanceof Error ? e.message : "Could not save process records. Your draft is still available; please retry.",
      );
      return false;
    } finally {
      saveInFlight.current = false;
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

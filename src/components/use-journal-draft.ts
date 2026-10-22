"use client";
import { useEffect, useState } from "react";
/** Drafts are account/session scoped; never presented as committed journal entries. */
export function useJournalDraft(key: string) {
  const [value, setValue] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setValue(localStorage.getItem(key) || ""); } catch {}
    setReady(true);
  }, [key]);
  function update(text: string) {
    setValue(text);
    try { text ? localStorage.setItem(key, text) : localStorage.removeItem(key); } catch {}
  }
  useEffect(() => {
    if (!value) return;
    const warn = (event: BeforeUnloadEvent) => {
      // Even if storage is unavailable, leaving cannot silently discard writing.
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [value]);
  return [value, update, ready] as const;
}

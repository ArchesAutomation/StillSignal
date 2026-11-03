"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
export function clearFormDraft(key: string) { try { localStorage.removeItem(key); } catch {} }
/** Restores uncontrolled form fields; controlled state is persisted by its owner. */
export default function PersistentForm({ draftKey, children, onChange, ...props }: ComponentProps<"form"> & { draftKey: string }) {
  const form = useRef<HTMLFormElement>(null), [message, setMessage] = useState("");
  useLayoutEffect(() => {
    const node = form.current; if (!node) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Record<string, string[]> | null;
      if (saved && typeof saved === "object") for (const input of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name],textarea[name],select[name]")) {
        const values = saved[input.name];
        if (!Array.isArray(values) || !values.every(v => typeof v === "string") || input.dataset.controlled === "true" || input.type === "file") continue;
        if (input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type)) input.checked = values.includes(input.value);
        else input.value = values[0] ?? "";
      }
      if (saved) setMessage("Your unsaved draft was restored on this device.");
    } catch { setMessage("Draft storage is unavailable. Keep this form open until you save."); }
    node.scrollIntoView?.({ block: "nearest" });
  }, [draftKey]);
  function persist() {
    if (!form.current) return;
    const saved: Record<string, string[]> = {};
    for (const [name, value] of new FormData(form.current)) if (typeof value === "string") (saved[name] ??= []).push(value);
    try { localStorage.setItem(draftKey, JSON.stringify(saved)); setMessage("Draft saved on this device · save below to commit it."); }
    catch { setMessage("Could not store this draft. Keep the form open until you save."); }
  }
  useEffect(() => { const node = form.current; if (!node) return; node.addEventListener("input", persist); return () => node.removeEventListener("input", persist); }, [draftKey]);
  return <form {...props} ref={form} onChange={event => { persist(); onChange?.(event); }}>{children}{message && <p role="status">{message}</p>}</form>;
}

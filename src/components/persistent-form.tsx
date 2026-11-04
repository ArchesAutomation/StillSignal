"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}
/** Restores uncontrolled form fields; controlled state is persisted by its owner. */
export default function PersistentForm({
  draftKey,
  children,
  onChange,
  ...props
}: ComponentProps<"form"> & { draftKey: string }) {
  const form = useRef<HTMLFormElement>(null),
    [message, setMessage] = useState("");
  useLayoutEffect(() => {
    const node = form.current;
    if (!node) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(draftKey) ?? "null",
      ) as Record<string, string[]> | null;
      if (saved && typeof saved === "object")
        for (const input of node.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("input[name],textarea[name],select[name]")) {
          const values = saved[input.name];
          if (
            !Array.isArray(values) ||
            !values.every((v) => typeof v === "string") ||
            input.dataset.controlled === "true" ||
            input.type === "file"
          )
            continue;
          if (
            input.tagName === "INPUT" &&
            ["checkbox", "radio"].includes(input.type)
          )
            (input as HTMLInputElement).checked = values.includes(input.value);
          else if (input.tagName === "SELECT" && (input as HTMLSelectElement).multiple)
            for (const option of (input as HTMLSelectElement).options)
              option.selected = values.includes(option.value);
          else input.value = values[0] ?? "";
        }
      if (saved) setMessage("Your unsaved draft was restored on this device.");
    } catch {
      setMessage(
        "Draft storage is unavailable. Keep this form open until you save.",
      );
    }
    const opener = node.ownerDocument.activeElement as HTMLElement | null;
    const view = node.ownerDocument.defaultView;
    const position = { left: view?.scrollX ?? 0, top: view?.scrollY ?? 0 };
    const canFocus = !node.closest("[hidden],[inert],details:not([open])");
    if (canFocus) {
      node.scrollIntoView?.({ block: "start" });
      node.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled),textarea:not(:disabled),select:not(:disabled)")
        ?.focus({ preventScroll: true });
    }
    return () => {
      if (
        canFocus && opener?.isConnected && opener !== node.ownerDocument.body &&
        !node.contains(opener) && !opener.closest("[hidden],[inert],details:not([open])")
        && (node.contains(node.ownerDocument.activeElement) || node.ownerDocument.activeElement === node.ownerDocument.body)
      ) {
        opener.focus({ preventScroll: true });
        view?.scrollTo(position);
      }
    };
  }, [draftKey]);
  function persist() {
    if (!form.current) return;
    const saved: Record<string, string[]> = {};
    // FormData omits unchecked boxes and empty multi-selects. Persist their
    // empty state too, otherwise restoring the draft resurrects default values.
    for (const input of form.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name],textarea[name],select[name]"))
      if (input.type !== "file" && input.dataset.controlled !== "true")
        saved[input.name] ??= [];
    for (const [name, value] of new FormData(form.current))
      if (typeof value === "string") (saved[name] ??= []).push(value);
    try {
      localStorage.setItem(draftKey, JSON.stringify(saved));
      setMessage("Draft saved on this device · save below to commit it.");
    } catch {
      setMessage(
        "Could not store this draft. Keep the form open until you save.",
      );
    }
  }
  useEffect(() => {
    const node = form.current;
    if (!node) return;
    node.addEventListener("input", persist);
    return () => node.removeEventListener("input", persist);
  }, [draftKey]);
  return (
    <form
      {...props}
      ref={form}
      onChange={(event) => {
        persist();
        onChange?.(event);
      }}
    >
      {children}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

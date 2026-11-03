"use client";
import { useEffect, useRef, useState } from "react";
/** Account-scoped local drafts, never confused with committed process records. */
export function useSavedGuide<T>(
  key: string,
  initial: () => T,
  validate: (value: unknown) => T,
) {
  const [value, setValue] = useState(initial);
  const [loadedKey, setLoadedKey] = useState("");
  const current = useRef(value);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      current.current = saved ? validate(JSON.parse(saved)) : initial();
      setValue(current.current);
    } catch {
      current.current = initial();
      setValue(current.current);
      setStorageError(
        "This draft could not be restored. Your saved records are unchanged.",
      );
    }
    setLoadedKey(key);
    // The caller keys its guide by account and record; changes reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  function update(next: T | ((old: T) => T)) {
    const result =
      typeof next === "function"
        ? (next as (old: T) => T)(current.current)
        : next;
    current.current = result;
    setValue(result);
    try {
      localStorage.setItem(key, JSON.stringify(result));
      setStorageError("");
    } catch {
      setStorageError(
        "Draft is open here but could not be saved on this device. Keep this page open until you save.",
      );
    }
  }
  function clear() {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
  return { value, update, loaded: loadedKey === key, storageError, clear };
}

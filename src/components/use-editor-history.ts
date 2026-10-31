"use client";
import { useState, type SetStateAction } from "react";
export function useEditorHistory<T>(initial: T) {
  const [state, setState] = useState({
    value: initial,
    past: [] as T[],
    future: [] as T[],
  });
  const set = (action: SetStateAction<T>) =>
    setState((s) => {
      const value =
        typeof action === "function"
          ? (action as (old: T) => T)(s.value)
          : action;
      return JSON.stringify(value) === JSON.stringify(s.value)
        ? s
        : { value, past: [...s.past.slice(-39), s.value], future: [] };
    });
  return [
    state.value,
    set,
    {
      reset: (value: T) => setState({ value, past: [], future: [] }),
      undo: () =>
        setState((s) =>
          s.past.length
            ? {
                value: s.past.at(-1)!,
                past: s.past.slice(0, -1),
                future: [s.value, ...s.future],
              }
            : s,
        ),
      redo: () =>
        setState((s) =>
          s.future.length
            ? {
                value: s.future[0],
                past: [...s.past, s.value],
                future: s.future.slice(1),
              }
            : s,
        ),
      canUndo: !!state.past.length,
      canRedo: !!state.future.length,
    },
  ] as const;
}

"use client";
import { useRef } from "react";
import { journalDateValue } from "@/lib/journal-day";
import { cx } from "./shared";

export default function JournalDayPicker({ date, disabled, onOpen }: {
  date: number; disabled: boolean; onOpen: (date: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <form className={cx("journal-day-picker")} onSubmit={event => { event.preventDefault(); if (!disabled && input.current?.value) void onOpen(input.current.value); }}>
    <label>Journal date<input ref={input} aria-label="Journal date" type="date" required defaultValue={journalDateValue(date)}
      max={journalDateValue(Date.now())} disabled={disabled} /></label>
    <button className={cx("ghost")} disabled={disabled}>Open journal</button>
    <small>No trades or CSV required.</small>
  </form>;
}

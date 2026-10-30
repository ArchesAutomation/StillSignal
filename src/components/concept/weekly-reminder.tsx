"use client";
import { useEffect, useState } from "react";
import type { Session } from "@/lib/model";
import { weekKey } from "@/lib/journal-reference";
import { cx } from "./shared";
export function pendingWeekly(
  sessions: Session[],
  owner: string,
  now = Date.now(),
) {
  const key = weekKey(now),
    previous = weekKey(new Date(key + "T12:00:00").getTime() - 7 * 86400000);
  const saved = (week: string) =>
    sessions
      .filter((s) => s.owner === owner)
      .flatMap((s) =>
        s.blueprint?.weeks?.[week] ? [s.blueprint.weeks[week]] : [],
      );
  const previousRecords = saved(previous);
  if (
    (previousRecords.length ||
      sessions.some(
        (s) => s.owner === owner && weekKey(s.startedAt) === previous,
      )) &&
    !previousRecords.some((r) => r.reviewedAt)
  )
    return {
      key: previous,
      kind: "review",
      text: "Your weekly reflection is waiting.",
    };
  if (!saved(key).some((r) => r.plannedAt))
    return { key, kind: "intentions", text: "A few intentions for this week?" };
  return null;
}
export default function WeeklyReminder({
  sessions,
  owner,
  active,
  enabled,
  onOpen,
  onPreference,
}: {
  sessions: Session[];
  owner: string;
  active: boolean;
  enabled: boolean;
  onOpen: (key: string) => void;
  onPreference: (enabled: boolean) => void;
}) {
  const pending = pendingWeekly(sessions, owner),
    [hidden, setHidden] = useState(true),
    [status, setStatus] = useState("");
  const id = pending
    ? `ss-week-reminder:${owner}:${pending.key}:${pending.kind}`
    : "";
  useEffect(() => {
    if (!id) return;
    try {
      const v = JSON.parse(localStorage.getItem(id) || "null");
      setHidden(v?.dismissed || v?.until > Date.now());
    } catch {
      setHidden(false);
    }
  }, [id]);
  function dismiss(later = false) {
    try {
      localStorage.setItem(
        id,
        JSON.stringify(
          later ? { until: Date.now() + 86400000 } : { dismissed: true },
        ),
      );
      setHidden(true);
    } catch {
      setStatus("Could not save reminder preference. Please retry.");
    }
  }
  if (!enabled || active || hidden || !pending) return null;
  return (
    <aside
      className={cx("weekly-invitation")}
      aria-label="Pending weekly review"
    >
      <div>
        <strong>{pending.text}</strong>
        <p>Week of {pending.key}. Return when you have a quiet moment.</p>
      </div>
      <div>
        <button onClick={() => onOpen(pending.key)}>Open weekly review</button>
        <button onClick={() => dismiss(true)}>Later</button>
        <button onClick={() => dismiss()}>Dismiss</button>
        <button onClick={() => onPreference(false)}>Turn off reminders</button>
      </div>
      {status && <small role="status">{status}</small>}
    </aside>
  );
}

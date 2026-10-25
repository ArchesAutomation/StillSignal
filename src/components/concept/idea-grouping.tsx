"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { sessionIdeas } from "@/lib/position-ideas";
import { cx, time } from "./shared";
export default function IdeaGrouping({
  session,
  onSave,
}: {
  session: Session;
  onSave: (p: Partial<SessionBlueprint>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const ideas = sessionIdeas(session),
    grouping = session.blueprint?.grouping || { splits: [], merges: [] };
  const chosen = ideas.filter((t) => selected.includes(t.id));
  const canMerge =
    chosen.length >= 2 &&
    chosen.every(
      (t) =>
        t.account === chosen[0].account &&
        t.symbol === chosen[0].symbol &&
        t.currency === chosen[0].currency &&
        t.side === chosen[0].side &&
        t.provenance === chosen[0].provenance,
    );
  async function save(value: NonNullable<SessionBlueprint["grouping"]>) {
    setBusy(true);
    try {
      await onSave({ grouping: value });
      setSelected([]);
      setStatus("Grouping saved. Original executions kept.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={cx("grouping-tools")}>
      <summary>Adjust trade ideas · merge / split</summary>
      <p>
        Overrides change the journal grouping. Original fills stay in the source
        record.
      </p>
      {ideas.map((t, i) => (
        <div key={t.id}>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(t.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, t.id]
                    : s.filter((id) => id !== t.id),
                )
              }
            />
            Idea {i + 1} · {t.symbol} · {t.account} · {time(t.entry)}
          </label>
          {t.entryIds
            .filter((id) => id !== t.id)
            .map((id) => (
              <button
                key={id}
                className={cx("textlink")}
                disabled={busy}
                onClick={() =>
                  void save({
                    ...grouping,
                    splits: [...new Set([...grouping.splits, id])],
                  })
                }
              >
                Split here · {time(session.events.find((e) => e.id === id)!.t)}
              </button>
            ))}
        </div>
      ))}
      <button
        className={cx("ghost")}
        disabled={busy || !canMerge}
        onClick={() =>
          void save({ ...grouping, merges: [...grouping.merges, selected] })
        }
      >
        Merge into one idea
      </button>
      <button
        className={cx("textlink")}
        disabled={busy || (!grouping.splits.length && !grouping.merges.length)}
        onClick={() => void save({ splits: [], merges: [] })}
      >
        Restore automatic grouping
      </button>
      <span role="status">{status}</span>
    </details>
  );
}

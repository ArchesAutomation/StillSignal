"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { sessionIdeas } from "@/lib/position-ideas";
import {
  automatic,
  groupingSnapshot,
  groupingEvidence,
  splitGrouping,
  type Grouping,
} from "@/lib/grouping-review";
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
  const [preview, setPreview] = useState<{ action: string; value: Grouping }>();
  const ideas = sessionIdeas(session),
    versions = session.blueprint?.groupingVersions || [],
    last = versions.at(-1);
  const chosen = ideas.filter((i) => selected.includes(i.id));
  const canMerge =
    chosen.length > 1 &&
    chosen.every(
      (i) =>
        i.account === chosen[0].account &&
        i.symbol === chosen[0].symbol &&
        i.currency === chosen[0].currency &&
        i.side === chosen[0].side &&
        i.provenance === chosen[0].provenance,
    );
  async function apply(value: Grouping, action: string, undo = false) {
    setBusy(true);
    setStatus("Saving…");
    try {
      await onSave({
        grouping: value,
        groupingVersions: [
          ...versions,
          {
            id: crypto.randomUUID(),
            at: Date.now(),
            action,
            before: groupingSnapshot(session),
            after: value,
          },
        ].slice(-100),
      });
      setPreview(undefined);
      setSelected([]);
      setStatus(
        undo
          ? "Grouping restored. All original executions and evidence retained."
          : `${action} saved. Original executions and broker orders are unchanged.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={cx("grouping-tools")}>
      <summary>Review grouping · split / merge / undo</summary>
      <p>
        Split this journal idea here keeps earlier fills in one idea and moves
        this execution and all later fills into another. This changes journal
        grouping only. It does not place or close an order.
      </p>
      {ideas.map((idea, i) => (
        <div key={idea.id}>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(idea.id)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked
                    ? [...v, idea.id]
                    : v.filter((id) => id !== idea.id),
                )
              }
            />
            Idea {i + 1} · {idea.symbol} · {idea.fillIds.length} fills ·{" "}
            {time(idea.entry)}
          </label>
          {idea.fillIds.slice(1).map((id) => (
            <button
              key={id}
              disabled={busy}
              onClick={() =>
                setPreview({
                  action: "Split",
                  value: splitGrouping(session, idea.id, id),
                })
              }
            >
              Split this journal idea here ·{" "}
              {time(session.events.find((e) => e.id === id)!.t)}
            </button>
          ))}
        </div>
      ))}
      <button
        disabled={busy || !canMerge}
        onClick={() => {
          const current = groupingSnapshot(session),
            keep = current.groups!.filter((g) => !selected.includes(g.id));
          setPreview({
            action: "Merge",
            value: {
              ...current,
              groups: [
                ...keep,
                {
                  id: chosen[0].id,
                  allocations: chosen.reduce(
                    (values, i) => {
                      for (const id of i.fillIds)
                        values[id] =
                          (values[id] || 0) +
                          (i.allocations?.[id] ??
                            session.events.find((e) => e.id === id)!.quantity);
                      return values;
                    },
                    {} as Record<string, number>,
                  ),
                  fillIds: [...new Set(chosen.flatMap((i) => i.fillIds))].sort(
                    (a, b) =>
                      session.events.find((e) => e.id === a)!.t -
                      session.events.find((e) => e.id === b)!.t,
                  ),
                },
              ],
            },
          });
        }}
      >
        Merge selected ideas
      </button>
      <button
        disabled={busy}
        onClick={() =>
          setPreview({ action: "Restore suggested grouping", value: automatic })
        }
      >
        Preview importer’s suggested grouping
      </button>
      {last && (
        <button
          className={cx("primary")}
          disabled={busy}
          onClick={() =>
            void apply(
              last.before,
              last.action === "Split" ? "Undo split" : "Undo grouping",
              true,
            )
          }
        >
          {last.action === "Split" ? "Undo split" : "Undo grouping change"}
        </button>
      )}
      {preview && (
        <section
          className={cx("grouping-preview")}
          aria-label="Grouping preview"
        >
          <h3>{preview.action} preview</h3>
          <p>
            Notes and images keep their original identities and assignments. No
            evidence is deleted or reassigned.
          </p>
          {groupingEvidence(session, preview.value).map((g, i) => (
            <div key={g.id}>
              <b>
                Idea {i + 1}: {g.fills.length} fills ·{" "}
                {g.fills[0] ? time(g.fills[0].t) : "—"}–
                {g.fills.at(-1) ? time(g.fills.at(-1)!.t) : "—"}
              </b>
              <p>
                {g.notes.length} linked notes ·{" "}
                {g.notes.filter((n) => n.screenshot || n.capture?.imagePath)
                  .length + Number(!!g.chart)}{" "}
                images
                {g.incomplete
                  ? " · Incomplete position: this group is not flat to flat."
                  : " · Complete position."}
              </p>
            </div>
          ))}
          <button
            disabled={busy}
            onClick={() => void apply(preview.value, preview.action)}
          >
            Confirm {preview.action.toLowerCase()}
          </button>
          <button disabled={busy} onClick={() => setPreview(undefined)}>
            Cancel
          </button>
        </section>
      )}
      <p role="status">{status}</p>
    </details>
  );
}

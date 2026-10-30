"use client";
import { activeObservations, displayValue } from "@/lib/environment/values";
import { latest, type RecordOf } from "@/lib/process/model";
import { Empty, Panel, type Context } from "./shared";

export default function VariablesPanel({
  store,
  day,
  props,
  variableIds,
}: Context & { variableIds?: string[] }) {
  const definitions = latest(store.records, "variable").filter(
    (v) => !v.body.archived && (!variableIds || variableIds.includes(v.rootId)),
  );
  const observations = activeObservations(store.records)
    .filter((o) => o.body.dayId === day.rootId)
    .sort(
      (a, b) =>
        b.body.observedAt - a.body.observedAt || b.createdAt - a.createdAt,
    );
  return (
    <Panel
      title="Personal variables"
      detail="Your measurements for this trading day"
      action={
        <button onClick={() => props.onPage("Settings & Variables")}>
          Record variables
        </button>
      }
    >
      {!definitions.length && (
        <Empty>
          {variableIds
            ? "No variables selected. Edit this dashboard to choose what appears here."
            : "Add the conditions that matter to you, such as sleep, caffeine or time outdoors."}
        </Empty>
      )}
      <div className="cc-variable-values">
        {definitions.map((d) => {
          const observation = observations.find((o) =>
            store.records.some(
              (r) =>
                r.kind === "variable" &&
                r.id === o.body.definitionId &&
                r.rootId === d.rootId,
            ),
          );
          const pinned =
            observation &&
            store.records.find(
              (r): r is RecordOf<"variable"> =>
                r.kind === "variable" && r.id === observation.body.definitionId,
            );
          return (
            <div key={d.rootId}>
              <small>{d.body.name}</small>
              <strong>
                {observation && pinned
                  ? displayValue(observation, pinned)
                  : "Not recorded"}
              </strong>
              {observation && (
                <small>
                  {new Date(observation.body.observedAt).toLocaleTimeString(
                    [],
                    { hour: "2-digit", minute: "2-digit" },
                  )}{" "}
                  · {observation.body.phase.replaceAll("-", " ")}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

"use client";
import { useState } from "react";
import { createRecord, latest } from "@/lib/process/model";
import { activityOf } from "@/lib/process/preparation-workflow";
import {
  Panel,
  Field,
  Empty,
  Save,
  type Context,
} from "../command-center/shared";
import ThesisWorkspace, { relevantTheses } from "../trading-thesis/workspace";
import Missions from "../process-goals/workspace";
import Variables from "../variable-builder/workspace";
import Temperature from "../variable-builder/temperature";
import GuidedPreparation from "./guided-preparation";

const modules = [
  [
    "routine",
    "Guided routine",
    "Follow your saved workflow, or customize its sections and schedules.",
  ],
  [
    "thesis",
    "Trading thesis",
    "Create or revise your weekly outlook and daily trading plan.",
  ],
  [
    "missions",
    "Active missions",
    "Create, review and track your personal process goals.",
  ],
  [
    "variables",
    "Personal variables",
    "Define and record the conditions that matter to your trading.",
  ],
  ["intentions", "Intentions", "Set the process you want to follow today."],
  [
    "checks",
    "Pre-market non-negotiables",
    "Build and edit the rules and checks in your routines.",
  ],
  [
    "checkin",
    "Personal check-in",
    "Record your focus, energy and circumstances.",
  ],
] as const;
type ModuleId = (typeof modules)[number][0];

function Intentions({ store, day }: Context) {
  const current =
    latest(store.records, "day").find((d) => d.rootId === day.rootId) ?? day;
  const [saved, setSaved] = useState(false);
  return (
    <Panel
      title="Session intentions"
      detail="Your intention is saved as today's Command Center process goal. Recurring intentions can also be configured in your routine."
    >
      <form
        className="cc-form"
        key={current.id}
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (
            await store.save([
              createRecord(
                "day",
                { ...current.body, goal: String(data.get("intention") ?? "") },
                current,
              ),
            ])
          )
            setSaved(true);
        }}
      >
        <Field label="What does following my process look like today?">
          <textarea
            required
            name="intention"
            maxLength={8000}
            rows={5}
            defaultValue={current.body.goal}
          />
        </Field>
        <Save store={store}>Save intentions</Save>
        {saved && <p role="status">Intentions saved.</p>}
      </form>
    </Panel>
  );
}
export default function PreparationTools(context: Context) {
  const { store, day } = context;
  const [active, setActive] = useState<ModuleId>("routine");
  const [visited, setVisited] = useState<ModuleId[]>(["routine"]);
  const [editRequest, setEditRequest] = useState(0);
  const open = (id: ModuleId) => {
    setActive(id);
    setVisited((ids) => (ids.includes(id) ? ids : [...ids, id]));
  };
  const editRoutine = () => {
    open("routine");
    setEditRequest((n) => n + 1);
  };
  const templates = latest(store.records, "protocol");
  const status: Record<ModuleId, string> = {
    routine: `${templates.length} saved routine${templates.length === 1 ? "" : "s"}`,
    thesis: `${relevantTheses(store.records, day).length} plans for this day / week`,
    missions: `${latest(store.records, "goal").filter((g) => g.body.start <= day.body.date && g.body.end >= day.body.date).length} current missions`,
    variables: `${latest(store.records, "variable").filter((v) => !v.body.archived).length} active variables`,
    intentions: day.body.goal ? "Intention recorded" : "Set today's intention",
    checks: "Your own rules and checklists",
    checkin: latest(store.records, "checkin").some(
      (c) => c.body.dayId === day.rootId,
    )
      ? "Check-in recorded"
      : "Record today's check-in",
  };
  return (
    <div className="cc-stack">
      <Panel
        title="Preparation workspace"
        detail="All your preparation tools are available here, including when your saved routine does not contain them."
      >
        <nav className="prep-module-grid" aria-label="Preparation modules">
          {modules.map(([id, title, description]) => (
            <button
              key={id}
              type="button"
              aria-pressed={active === id}
              onClick={() => open(id)}
            >
              <strong>{title}</strong>
              <span>{description}</span>
              <small>{status[id]}</small>
            </button>
          ))}
        </nav>
      </Panel>
      {/* Keep visited tools mounted so switching tools preserves unfinished writing. */}
      {modules.map(
        ([id, title]) =>
          visited.includes(id) && (
            <section
              key={id}
              id={"prep-tool-" + id}
              className="prep-tool-panel"
              hidden={active !== id}
              aria-label={title}
            >
              {id === "routine" && (
                <GuidedPreparation {...context} editRequest={editRequest} />
              )}
              {id === "thesis" && <ThesisWorkspace {...context} />}
              {id === "missions" && <Missions {...context} />}
              {id === "variables" && <Variables {...context} preparation />}
              {id === "intentions" && <Intentions {...context} />}
              {id === "checkin" && <Temperature {...context} initiallyOpen />}
              {id === "checks" && (
                <Panel
                  title="Your pre-market non-negotiables"
                  detail="Checklists and requirements from your saved routines."
                  action={
                    <button onClick={editRoutine}>
                      {templates.length
                        ? "Edit my non-negotiables"
                        : "Set up my non-negotiables"}
                    </button>
                  }
                >
                  {!templates.length && (
                    <Empty>
                      Define your own rules and checks in the routine setup.
                    </Empty>
                  )}
                  {templates.map((t) => (
                    <article className="cc-thesis" key={t.id}>
                      <h3>{t.body.name}</h3>
                      <ul>
                        {t.body.steps
                          .filter(
                            (s) =>
                              activityOf(s) === "checklist" ||
                              s.requirement !== "optional",
                          )
                          .map((s) => (
                            <li key={s.id}>
                              <strong>{s.name}</strong>
                              {!!s.checklist?.length && (
                                <ul>
                                  {s.checklist.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                      </ul>
                    </article>
                  ))}
                </Panel>
              )}
            </section>
          ),
      )}
    </div>
  );
}

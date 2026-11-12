"use client";
import { Panel as Surface } from "@/components/ui/panel";
import {
  createRecord,
  dateInZone,
  dateSchema,
  latest,
  type BodyOf,
} from "@/lib/process/model";
import { useEffect, useState } from "react";
import Audits from "../audits/workspace";
import type { Props } from "../concept/shared";
import { ModuleScope, WorkspaceModule } from "../module-workspace";
import PreMarket, { PreparationPanel } from "../pre-market/workspace";
import { useSavedGuide } from "../use-saved-guide";
import Variables from "../variable-builder/workspace";
import JournalContext from "./journal-context";
import {
  Field,
  History,
  Input,
  Panel,
  Save,
  string,
  type Context,
} from "./shared";
import VariablesPanel from "./variables-panel";
const processPages = new Set([
  "Pre-Market",
  "Audits",
  "Settings & Variables",
  "Journal",
  "Live Session",
]);

export default function ProcessWorkspace({
  store,
  supportDay,
  onSupportDayOpened,
  ...props
}: Props & {
  store: Context["store"];
  supportDay?: { date: string; page: Props["page"] };
  onSupportDayOpened: () => void;
}) {
  const dateDraft = useSavedGuide(
    `ss-trading-date:${props.pulse.owner}`,
    () =>
      dateInZone(
        Date.now(),
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ),
    (value) => dateSchema.parse(value),
  );
  const date = dateDraft.value,
    setDate = dateDraft.update;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [editDay, setEditDay] = useState(false),
    days = latest(store.records, "day"),
    selectedDate =
      props.page === "Journal" || props.page === "Live Session"
        ? dateInZone(props.session.startedAt, zone)
        : date,
    day =
      days.find(
        (d) => d.body.date === selectedDate && d.body.timezone === zone,
      ) ?? days.find((d) => d.body.date === selectedDate);
  useEffect(() => {
    if (dateDraft.loaded && supportDay?.page === props.page) {
      setDate(supportDay.date);
      onSupportDayOpened();
    }
  }, [dateDraft.loaded, supportDay, props.page]);
  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return;
      setDate(requested);
      if (!days.some((d) => d.body.date === requested))
        void store.save([
          createRecord("day", {
            date: requested,
            timezone: zone,
            status: "reviewing",
            instrument: "",
            account: "",
            timeframes: [],
            sessionIds: [],
            goal: "",
          }),
        ]);
    };
    window.addEventListener("ss-review-day", open);
    return () => window.removeEventListener("ss-review-day", open);
  }, [store.records, zone]);
  if (!processPages.has(props.page)) return null;
  if (!store.loaded || !dateDraft.loaded)
    return (
      <div className="cc-workspace">
        <p role="status">Loading your process records…</p>
        {store.error && <p role="alert">{store.error}</p>}
      </div>
    );
  const context = day ? { store, day, props } : undefined;

  if (props.page === "Journal" || props.page === "Live Session")
    return (
      <>
        <WorkspaceModule
          id="process-context"
          title="Trading day context"
          section="side"
          order={3}
        >
          <div className="cc-workspace cc-context-strip">
            {context ? (
              <JournalContext key={props.session.id} {...context} />
            ) : (
              <details className="cc-journal-context">
                <summary>
                  Trading process context · no linked trading day
                </summary>
                <p>
                  Preparation and personal variables can be linked without
                  changing this journal.
                </p>
                <button
                  onClick={() => {
                    setDate(selectedDate);
                    props.onPage("Pre-Market");
                  }}
                >
                  Open preparation for this day
                </button>
              </details>
            )}
          </div>
        </WorkspaceModule>
        {(
          [
            ["preparation", "Pre-market non-negotiables", PreparationPanel],
            ["variables", "Personal variables", VariablesPanel],
          ] as const
        ).map(([id, title, Component]) => (
          <WorkspaceModule
            key={id}
            id={"linked-" + id}
            title={title}
            initiallyHidden
            section="side"
          >
            <ModuleScope active={false}>
              {context ? (
                <Component {...context} />
              ) : (
                <section className="cc-panel">
                  <h2>{title}</h2>
                  <p>
                    Link this journal date to a trading day to show the same
                    records used in Preparation.
                  </p>
                  <button
                    onClick={() => {
                      setDate(selectedDate);
                      props.onPage("Pre-Market");
                    }}
                  >
                    Open preparation
                  </button>
                </section>
              )}
            </ModuleScope>
          </WorkspaceModule>
        ))}
      </>
    );

  const daybar = (
    <Surface className="cc-daybar">
      {props.page !== "Preparation" && (
        <button onClick={() => props.onPage("Preparation")}>
          ← Preparation
        </button>
      )}
      <Field label="Trading date">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setEditDay(false);
          }}
        />
      </Field>
      <button onClick={() => setDate(dateInZone(Date.now(), zone))}>
        Today
      </button>
      <span role="status">{store.syncState}</span>
      {store.syncState.includes("awaiting") ||
      store.syncState.includes("Saved locally ·") ? (
        <button onClick={() => void store.refresh()}>Retry sync</button>
      ) : null}
      {store.error && (
        <button onClick={() => void store.refresh()}>Retry sync</button>
      )}
      {day && (
        <button onClick={() => setEditDay((v) => !v)}>
          Edit trading-day context
        </button>
      )}
    </Surface>
  );

  return (
    <div className="cc-workspace">
      {daybar}
      {store.error && (
        <div className="cc-error" role="alert">
          <p>{store.error}</p>
          <button onClick={() => store.setError("")}>Dismiss</button>
        </div>
      )}
      {!day && !editDay && props.page === "Pre-Market" && (
        <Panel
          title="Your pre-trading routine"
          detail="Set up your workflow once. Follow it each session."
        >
          <p>Open today's preparation to build or follow your saved routine.</p>
          <button
            className="cc-primary"
            disabled={store.busy}
            onClick={() =>
              void store.save([
                createRecord("day", {
                  date: selectedDate,
                  timezone: zone,
                  status: "preparing",
                  instrument: "",
                  account: "",
                  timeframes: [],
                  sessionIds: [],
                  goal: "",
                }),
              ])
            }
          >
            Open today's preparation →
          </button>
        </Panel>
      )}

      {editDay && (
        <Panel
          title={day ? "Trading-day context" : "Open a trading day"}
          detail="Instrument, account and session details"
          action={
            <button onClick={() => setEditDay(false)}>
              Close day settings
            </button>
          }
        >
          <form
            key={day?.id ?? date}
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body: BodyOf<"day"> = {
                ...day?.body,
                date,
                timezone: string(f, "timezone"),
                status: string(f, "status") as BodyOf<"day">["status"],
                instrument: string(f, "instrument"),
                account: string(f, "account"),
                timeframes: string(f, "timeframes")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                sessionIds: f.getAll("sessionId").map(String),
                goal: string(f, "goal"),
              };
              if (await store.save([createRecord("day", body, day)]))
                setEditDay(false);
            }}
          >
            <div className="cc-grid">
              <Input
                label="Trading timezone (IANA name)"
                name="timezone"
                value={day?.body.timezone ?? zone}
                required
              />
              <Input
                name="instrument"
                label="Selected instrument"
                value={day?.body.instrument}
              />
              <Input
                name="account"
                label="Selected trading account"
                value={day?.body.account}
              />
              <Field label="Day status">
                <select
                  name="status"
                  defaultValue={day?.body.status ?? "preparing"}
                >
                  {[
                    "preparing",
                    "active",
                    "reviewing",
                    "complete",
                    "no-trade",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Input
                name="timeframes"
                label="Timeframes (comma separated)"
                value={day?.body.timeframes.join(", ") ?? "15M, 1H, 4H, Daily"}
              />
              <Input
                name="goal"
                label="Daily process goal"
                value={day?.body.goal}
              />
            </div>
            <Field label="Linked sessions (optional; multiple allowed)">
              <select
                multiple
                name="sessionId"
                defaultValue={day?.body.sessionIds ?? []}
              >
                {props.history
                  .filter((s) => !s.demo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {new Date(s.startedAt).toLocaleDateString()}
                    </option>
                  ))}
              </select>
            </Field>
            <Save store={store}>
              {day ? "Save day revision" : "Open trading day"}
            </Save>
            {day && <History records={store.records} rootId={day.rootId} />}
          </form>
        </Panel>
      )}

      {context && (
        <>
          {props.page === "Pre-Market" && (
            <PreMarket key={day!.rootId} {...context} />
          )}
          {props.page === "Settings & Variables" && (
            <Variables key={day!.rootId} {...context} />
          )}
          {props.page === "Audits" && <Audits key={day!.rootId} {...context} />}
        </>
      )}
    </div>
  );
}

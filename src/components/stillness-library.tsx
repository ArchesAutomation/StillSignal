"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supportFocus } from "@/lib/process/journal-guide";
import {
  bigFour,
  createRecord,
  dateInZone,
  latest,
  type ProcessRecord,
  type StillnessSelection,
} from "@/lib/process/model";
import { emptyTradingDay, tradingDayFor } from "@/lib/process/trading-day";
import { readProcess } from "@/lib/process/storage";
import type { Page } from "./concept/shared";
import type { ProcessStore } from "./command-center/use-process";
import { catalogue } from "@/lib/stillness-catalogue";

type Item = (typeof catalogue)[number];
export type StillnessBrowse = { tags: string[]; itemId: Item["id"] };
type Destination = StillnessSelection["destination"];
type Choice = Pick<StillnessSelection, "itemId" | "piece">;
type Panel =
  | {
      type: "piece" | "add" | "player" | "finish";
      choice: Choice;
      step?: number;
      preview?: boolean;
    }
  | { type: "saved" };
type Undo = {
  dayId: string;
  added: StillnessSelection;
  previous?: StillnessSelection;
};
type Notice = {
  text: string;
  date?: string;
  undo?: Undo;
  destination?: Destination;
};
const types = ["All", "Sequence", "Practice", "Reminder"];
const find = (choice: Choice) =>
  catalogue.find((entry) => entry.id === choice.itemId)!;
const same = (a: Choice, b: Choice) =>
  a.itemId === b.itemId && a.piece === b.piece;
const title = (choice: Choice) =>
  choice.piece === undefined
    ? find(choice).name
    : find(choice).steps[choice.piece][0];
const steps = (choice: Choice) =>
  choice.piece === undefined
    ? find(choice).steps
    : [find(choice).steps[choice.piece]];
const known = (choice: Choice) => {
  const item = catalogue.find((entry) => entry.id === choice.itemId);
  return (
    item && (choice.piece === undefined || choice.piece < item.steps.length)
  );
};
const todayIn = (timezone: string) => dateInZone(Date.now(), timezone);

function Art({ item }: { item: Item }) {
  return (
    <div className="ss-support-art" data-tone={item.color} aria-hidden="true">
      <i />
      <i />
      <i />
      <span>✳</span>
    </div>
  );
}

export function StillnessLibrary({
  owner,
  store,
  page,
  browse,
  preparation,
  onPage,
  onOpenDay,
  onReflect,
}: {
  owner: string;
  store: ProcessStore;
  page: Page;
  browse?: StillnessBrowse;
  preparation?: { tags: string[]; suggestion?: Item; onBrowse: () => void };
  onPage: (page: Page) => void;
  onOpenDay: (destination: Destination, date: string) => void;
  onReflect: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(catalogue[0]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    if (!browse) return;
    setSearch("");
    setFilter("All");
    setTags(browse.tags);
    setSelected(catalogue.find((item) => item.id === browse.itemId) ?? catalogue[0]);
  }, [browse]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [destination, setDestination] = useState<Destination>("Preparation");
  const [keep, setKeep] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [writing, setWriting] = useState(false);
  const writeLock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [date, setDate] = useState(() => todayIn(timezone));
  const days = useMemo(() => latest(store.records, "day"), [store.records]);
  const today =
    days.find((day) => day.body.date === date && day.body.timezone === timezone)
      ?.body.stillness ?? [];
  const saved = useMemo(() => {
    const choices = new Map<string, StillnessSelection>();
    for (const day of days) {
      for (const choice of day.body.stillness ?? []) {
        if (choice.saved && known(choice)) {
          choices.set(JSON.stringify([choice.itemId, choice.piece]), choice);
        }
      }
    }
    return [...choices.values()];
  }, [days]);
  useEffect(() => {
    const update = () => setDate(todayIn(timezone));
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [timezone]);
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
    if (!panel && dialog.current?.open) dialog.current.close();
  }, [panel]);
  useEffect(() => {
    if (panel?.type !== "player" || paused) return;
    const timer = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [panel, paused]);

  function add(choice: Choice) {
    setDestination("Preparation");
    setKeep(false);
    setPanel({ type: "add", choice });
  }
  function run(choice: Choice, preview = false) {
    setPaused(false);
    setElapsed(0);
    setPanel({ type: "player", choice, preview, step: 0 });
  }
  async function write(action: (records: ProcessRecord[]) => Promise<void>) {
    if (writeLock.current) return;
    writeLock.current = true;
    setWriting(true);
    store.setError("");
    try {
      await action(await readProcess(owner));
    } catch (error) {
      store.setError(
        error instanceof Error
          ? error.message
          : "Could not save support. Try again.",
      );
    } finally {
      writeLock.current = false;
      setWriting(false);
    }
  }
  function addToday(choice: Choice) {
    void write(async (records) => {
      const currentDate = todayIn(timezone);
      setDate(currentDate);
      const day = tradingDayFor(records, currentDate, timezone);
      const choices = day?.body.stillness ?? [];
      const previous = choices.find(
        (entry) => entry.destination === destination && same(entry, choice),
      );
      const savedNow =
        keep &&
        !latest(records, "day").some((entry) =>
          entry.body.stillness?.some(
            (value) => value.saved && same(value, choice),
          ),
        );
      let undo: Undo | undefined;
      if (!previous || savedNow) {
        const added: StillnessSelection = {
          id: previous?.id ?? crypto.randomUUID(),
          itemId: choice.itemId,
          ...(choice.piece === undefined ? {} : { piece: choice.piece }),
          destination,
          ...(savedNow ? { saved: true } : {}),
        };
        const record = createRecord(
          "day",
          {
            ...(day?.body ?? emptyTradingDay(currentDate, timezone)),
            stillness: previous
              ? choices.map((entry) =>
                  entry.id === previous.id ? added : entry,
                )
              : [...choices, added],
          },
          day,
        );
        if (!(await store.save([record]))) return;
        undo = { dayId: record.rootId, added, previous };
      }
      setPanel(null);
      setNotice({
        text: `${previous ? "Already in" : "Added to"} today’s ${destination}${savedNow ? " and kept in Saved support." : "."}`,
        date: currentDate,
        undo,
        destination,
      });
    });
  }
  function undoAdd(undo: Undo) {
    void write(async (records) => {
      const day = latest(records, "day").find(
        (entry) => entry.rootId === undo.dayId,
      );
      const selections = day?.body.stillness ?? [];
      const choice = selections.find((entry) => entry.id === undo.added.id);
      if (
        !day ||
        !choice ||
        !same(choice, undo.added) ||
        choice.saved !== undo.added.saved ||
        choice.destination !== undo.added.destination
      ) {
        setNotice({
          text: "That choice has changed. Review today’s support before trying again.",
        });
        return;
      }
      const stillness = selections.flatMap((entry) =>
        entry.id !== choice.id ? [entry] : undo.previous ? [undo.previous] : [],
      );
      const { stillness: _previousSelections, ...body } = day.body;
      if (
        await store.save([
          createRecord(
            "day",
            stillness.length ? { ...body, stillness } : body,
            day,
          ),
        ])
      ) {
        setNotice({ text: "Stillness addition undone." });
      }
    });
  }

  const results = catalogue.filter(
    (item) =>
      (filter === "All" || item.kind === filter) &&
      (!tags.length || item.tags.some((tag) => tags.includes(tag))) &&
      [item.name, item.desc, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const daily =
    page === "Preparation" || page === "Pre-Market" || page === "Prepare"
      ? "Preparation"
      : page === "Trade Quality"
        ? "Done"
        : null;
  if (page !== "Stillness" && !daily) return null;
  const current = panel && "choice" in panel ? panel.choice : null;
  const ordered = current ? steps(current) : [];
  const index = panel && "step" in panel ? (panel.step ?? 0) : 0;
  const next = () => {
    if (panel?.type !== "player") return;
    setElapsed(0);
    setPaused(false);
    setPanel({
      ...panel,
      type: index === ordered.length - 1 ? "finish" : "player",
      step: index + 1,
    });
  };

  return (
    <section className="ss-support-root" aria-label="Stillness support">
      {page === "Stillness" ? (
        <>
          <div className="ss-support-heading">
            <div>
              <small>STILLNESS / SUPPORT LIBRARY</small>
              <h1>Find what meets you here.</h1>
              <p>
                Ready-made reminders, practices and complete sequences. Preview
                freely. Choose only what helps today.
              </p>
            </div>
            <button
              disabled={!store.loaded}
              onClick={() => setPanel({ type: "saved" })}
            >
              Saved support ({saved.length})
            </button>
          </div>
          <div className="ss-support-tools">
            <input
              aria-label="Search support"
              placeholder="Search support…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div
              className="ss-support-actions"
              role="group"
              aria-label="Big 4 filters"
            >
              {bigFour.map((focus) => {
                const { title } = supportFocus[focus];
                return (
                  <button
                    key={focus}
                    aria-pressed={tags.includes(title)}
                    onClick={() =>
                      setTags((previous) =>
                        previous.includes(title)
                          ? previous.filter((tag) => tag !== title)
                          : [...previous, title],
                      )
                    }
                  >
                    {title}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ss-support-layout">
            <div>
              <div
                className="ss-support-actions"
                role="group"
                aria-label="Support type"
              >
                {types.map((type) => (
                  <button
                    key={type}
                    aria-pressed={filter === type}
                    onClick={() => setFilter(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <p className="ss-support-count">
                {results.length} ways to make a little space
              </p>
              <div className="ss-support-cards">
                {results.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="ss-support-card"
                    aria-pressed={item.id === selected.id}
                    onClick={() => setSelected(item)}
                  >
                    <Art item={item} />
                    <div>
                      <small>
                        {item.kind} · {item.duration}
                      </small>
                      <h3>{item.name}</h3>
                      <p>{item.desc}</p>
                      <small>{item.tags.join(" · ")}</small>
                    </div>
                  </button>
                ))}
              </div>
              {!results.length && <p>No support matches those filters.</p>}
              <p className="ss-support-count">
                Personal routines, recordings and existing practices remain
                available below.
              </p>
            </div>
            <aside className="ss-support-preview" aria-label="Support preview">
              <small>A CLOSER LOOK</small>
              <Art item={selected} />
              <small>
                {selected.kind} · {selected.duration} · {selected.steps.length}{" "}
                {selected.steps.length === 1 ? "piece" : "pieces"}
              </small>
              <h2>{selected.name}</h2>
              <p>{selected.desc}</p>
              <ol>
                {selected.steps.map(([label], step) => (
                  <li key={label}>
                    <button
                      onClick={() =>
                        setPanel({
                          type: "piece",
                          choice: {
                            itemId: selected.id,
                            ...(selected.steps.length > 1
                              ? { piece: step }
                              : {}),
                          },
                        })
                      }
                    >
                      <span>{step + 1}</span> {label}{" "}
                      <b aria-hidden="true">↗</b>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="ss-support-actions">
                <button
                  className="ss-support-primary"
                  onClick={() => run({ itemId: selected.id }, true)}
                >
                  Try {selected.kind.toLowerCase()}
                </button>
                <button onClick={() => add({ itemId: selected.id })}>
                  Add to my day
                </button>
              </div>
              <p className="ss-support-count">
                Previewing adds nothing. Add for today, with the option to keep
                a copy for later.
              </p>
            </aside>
          </div>
        </>
      ) : (
        daily && (
          <>
            <div className="ss-support-heading">
              <div>
                <small>{daily.toUpperCase()} / STILLNESS SUPPORT</small>
                <h2>
                  {daily === "Done"
                    ? "Closing support for today"
                    : "Stillness support for today"}
                </h2>
                <p>
                  {!store.loaded
                    ? "Loading support…"
                    : today.some(
                          (choice) =>
                            choice.destination === daily && known(choice),
                        )
                      ? "Take what helps. This support is optional."
                      : "Nothing added for today."}
                </p>
              </div>
              <button onClick={preparation?.onBrowse ?? (() => onPage("Stillness"))}>
                Find support in Stillness
              </button>
            </div>
            {preparation && preparation.tags.length > 0 && (
              <div className="rr-preparation-from-home">
                <p>Support you chose on Home <strong>{preparation.tags.join(" · ")}</strong></p>
                {preparation.suggestion && !today.some((choice) =>
                  choice.destination === "Preparation" && choice.itemId === preparation.suggestion?.id && choice.piece === undefined
                ) && (
                  <button onClick={preparation.onBrowse}>Preview {preparation.suggestion.name} in Stillness <span aria-hidden="true">↗</span></button>
                )}
              </div>
            )}
            {today
              .filter((choice) => choice.destination === daily && known(choice))
              .map((choice) => (
                <article className="ss-support-row" key={choice.id}>
                  {preparation && <Art item={find(choice)} />}
                  <div>
                    <strong>{title(choice)}</strong>
                    <p>
                      {steps(choice)
                        .map(([name]) => name)
                        .join(" → ")}
                    </p>
                  </div>
                  <button
                    className="ss-support-primary"
                    onClick={() => run(choice)}
                  >
                    Begin {title(choice)}
                  </button>
                </article>
              ))}
          </>
        )
      )}
      {!panel && store.error && <p role="alert">{store.error}</p>}
      {notice && (!notice.date || notice.date === date) && (
        <div className="ss-support-notice" role="status">
          {notice.text}{" "}
          <div className="ss-support-actions">
            {notice.undo && (
              <button
                disabled={writing || store.busy}
                onClick={() => undoAdd(notice.undo!)}
              >
                Undo
              </button>
            )}
            {notice.destination && notice.destination !== daily && (
              <button onClick={() => onOpenDay(notice.destination!, date)}>
                Open {notice.destination}
              </button>
            )}
            <button
              aria-label="Dismiss support notice"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <dialog
        className="ss-support-dialog"
        ref={dialog}
        aria-label="Stillness support"
        onCancel={() => setPanel(null)}
      >
        {panel && (
          <>
            <button
              className="ss-support-close"
              aria-label="Close support dialog"
              onClick={() => setPanel(null)}
            >
              ×
            </button>
            {panel.type === "saved" ? (
              <>
                <small>AVAILABLE WHEN YOU CHOOSE</small>
                <h2>Saved support</h2>
                <p>
                  Keeping support here never adds it to a day. Choose when you
                  want to use it again.
                </p>
                {!saved.length && <p>No saved support yet.</p>}
                {saved.map((choice) => (
                  <div className="ss-support-row" key={choice.id}>
                    <strong>{title(choice)}</strong>
                    <button onClick={() => add(choice)}>
                      Use {title(choice)} today
                    </button>
                  </div>
                ))}
              </>
            ) : panel.type === "add" ? (
              <>
                <small>MAKE A LITTLE SPACE</small>
                <h2>Add {title(panel.choice)}</h2>
                <p>
                  {ordered.length > 1
                    ? "The sequence stays together. You can skip any step when you begin."
                    : "Add this piece to today’s support."}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addToday(panel.choice);
                  }}
                >
                  <fieldset>
                    <legend>Where would you like it?</legend>
                    {(["Preparation", "Done"] as const).map((target) => (
                      <label key={target}>
                        <input
                          type="radio"
                          name="destination"
                          checked={destination === target}
                          onChange={() => setDestination(target)}
                        />{" "}
                        {target === "Done" ? "Done for the day" : target}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    <input
                      type="checkbox"
                      checked={keep}
                      onChange={(event) => setKeep(event.target.checked)}
                    />{" "}
                    Also keep in Saved support
                  </label>
                  <p className="ss-support-count">
                    Saved support is reusable. It never gets added to future
                    days automatically.
                  </p>
                  {store.error && <p role="alert">{store.error}</p>}
                  <button
                    className="ss-support-primary"
                    type="submit"
                    disabled={writing || store.busy || !store.loaded}
                  >
                    {writing ? "Saving…" : "Add for today"}
                  </button>
                </form>
              </>
            ) : panel.type === "piece" ? (
              <>
                <small>PREVIEW / INDIVIDUAL PIECE</small>
                <h2>{title(panel.choice)}</h2>
                <p>{ordered[0][1]}</p>
                <div className="ss-support-actions">
                  <button onClick={() => setPanel(null)}>
                    Back to preview
                  </button>
                  <button
                    className="ss-support-primary"
                    onClick={() => add(panel.choice)}
                  >
                    Add this piece
                  </button>
                </div>
              </>
            ) : panel.type === "player" ? (
              <>
                <small>
                  {panel.preview ? "PREVIEW" : "YOUR SUPPORT"} / STEP{" "}
                  {index + 1} OF {ordered.length}
                </small>
                <h2>{ordered[index][0]}</h2>
                <p>{ordered[index][1]}</p>
                <p className="ss-support-count">
                  {paused
                    ? "Paused"
                    : elapsed
                      ? elapsed + "s · continue at your pace"
                      : "Continue whenever you like"}
                </p>
                <div className="ss-support-actions">
                  <button onClick={() => setPaused(!paused)}>
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={next}>Skip this step</button>
                  <button className="ss-support-primary" onClick={next}>
                    {index === ordered.length - 1 ? "Finish" : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <small>A LITTLE SPACE, TAKEN</small>
                <h2>
                  {panel.preview
                    ? "Preview complete"
                    : "Anything you want to keep?"}
                </h2>
                <p>
                  {panel.preview
                    ? "Nothing was added to your day."
                    : find(panel.choice).question}
                </p>
                <div className="ss-support-actions">
                  {panel.preview ? (
                    <button
                      className="ss-support-primary"
                      onClick={() => add(panel.choice)}
                    >
                      Add to my day
                    </button>
                  ) : (
                    <button
                      className="ss-support-primary"
                      onClick={() => {
                        setPanel(null);
                        void onReflect().catch((error) =>
                          setNotice({
                            text:
                              error instanceof Error
                                ? error.message
                                : "Today’s Journal could not open. Try again.",
                          }),
                        );
                      }}
                    >
                      Reflect in Journal
                    </button>
                  )}
                  <button onClick={() => setPanel(null)}>
                    {panel.preview
                      ? "Back to library"
                      : "Finish without reflection"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </dialog>
    </section>
  );
}

"use client";

import { supportFocus } from "@/lib/process/journal-guide";
import {
  bigFour,
  createRecord,
  dateInZone,
  latest,
  type ProcessRecord,
  type StillnessSelection,
} from "@/lib/process/model";
import { knownStillnessChoice, stillnessChoiceSummary } from "@/lib/process/preparation-status";
import { readProcess } from "@/lib/process/storage";
import { emptyTradingDay, tradingDayFor } from "@/lib/process/trading-day";
import { catalogue, stillnessLibraryResults } from "@/lib/stillness-catalogue";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Page } from "./concept/shared";
import type { ProcessStore } from "./process/use-process";
import { LanguageChoice, StillnessPreferences, Understanding, useStillnessDraft, useStillnessPreferences } from "./stillness-personal";

type Item = (typeof catalogue)[number];
export type StillnessBrowse = { tags: string[]; itemId: Item["id"] };
type Destination = StillnessSelection["destination"];
type Choice = Pick<StillnessSelection, "itemId" | "piece">;
type Panel =
  | {
      type: "overview" | "piece" | "add" | "player" | "finish";
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
const title = (choice: Choice) => stillnessChoiceSummary(choice).title;
const steps = (choice: Choice) =>
  choice.piece === undefined
    ? find(choice).steps
    : [find(choice).steps[choice.piece]];
const known = knownStillnessChoice;
const todayIn = (timezone: string) => dateInZone(Date.now(), timezone);
const focusColours: Record<string, string> = {
  Impulsiveness: "var(--theme-focus-impulse)",
  Impatience: "var(--theme-focus-wait)",
  Fear: "var(--theme-focus-fear)",
  Greed: "var(--theme-focus-greed)",
};
const focusStyle = (tag: string) => ({ "--ss-focus": focusColours[tag] ?? "var(--theme-link)" }) as CSSProperties;

function FocusBadges({ item }: { item: Item }) {
  return <div className="ss-focus-badges">{item.tags.map(tag =>
    <span className="ss-focus-badge" data-focus={tag} style={focusStyle(tag)} key={tag}><i aria-hidden="true" />{tag}</span>,
  )}</div>;
}

function FocusRail({ item }: { item: Item }) {
  return <div className="ss-focus-rail" aria-hidden="true">{item.tags.map(tag => <span key={tag} data-focus={tag} style={focusStyle(tag)} />)}</div>;
}

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

function StillnessLibraryForOwner({
  owner,
  store,
  page,
  active = true,
  browse,
  preparation,
  closing,
  closingBrowse,
  previewRequest,
  onPage,
  onOpenDay,
  onReflect,
}: {
  owner: string;
  store: ProcessStore;
  page: Page;
  active?: boolean;
  browse?: StillnessBrowse;
  preparation?: { tags: string[]; suggestion?: Item; onBrowse: () => void };
  closing?: { onBrowse: () => void };
  closingBrowse?: boolean;
  // Opens the existing preview for one item. Previewing adds nothing to the day.
  previewRequest?: { itemId: string; n: number };
  onPage: (page: Page) => void;
  onOpenDay: (destination: Destination) => void;
  onReflect: () => Promise<void>;
}) {
  const preferences = useStillnessPreferences(owner);
  const draft = useStillnessDraft(owner);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [tags, setTags] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  useEffect(() => {
    setPanel(null);
  }, [active, page]);
  useEffect(() => {
    if (!browse) return;
    setSearch("");
    setFilter("All");
    setTags(browse.tags);
    if (known({ itemId: browse.itemId })) setPanel({ type: "overview", choice: { itemId: browse.itemId } });
  }, [browse]);
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

  const previewed = useRef(0);
  useEffect(() => {
    if (!previewRequest || previewRequest.n === previewed.current) return;
    previewed.current = previewRequest.n;
    if (known({ itemId: previewRequest.itemId })) run({ itemId: previewRequest.itemId }, true);
  }, [previewRequest]);
  function add(choice: Choice) {
    setDestination(closingBrowse || page === "Done" ? "Done" : "Preparation");
    setKeep(false);
    setPanel({ type: "add", choice });
  }
  function run(choice: Choice, preview = false) {
    if (!draft.loaded) return;
    setPaused(false);
    setElapsed(0);
    setPanel({ type: "player", choice, preview, step: 0 });
    if (find(choice).guidance) draft.update({ choice, preview, step: 0 });
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

  const results = stillnessLibraryResults({ filter, tags, search });
  const daily =
    page === "Preparation" || page === "Pre-Market" || page === "Prepare"
      ? "Preparation"
      : page === "Done"
        ? "Done"
        : null;
  if (page !== "Stillness" && !daily) return null;
  const current = panel && "choice" in panel ? panel.choice : null;
  const ordered = current ? steps(current) : [];
  const index = panel && "step" in panel ? (panel.step ?? 0) : 0;
  const currentItem = current ? find(current) : null;
  const absoluteStep = current?.piece ?? index;
  const away = panel?.type === "player" && currentItem?.guidance?.awayStep === absoluteStep;
  const languageChoice = <LanguageChoice value={preferences.value.language} disabled={!preferences.loaded}
    onChange={language => preferences.update(previous => ({ ...previous, language }))} />;
  const next = () => {
    if (panel?.type !== "player") return;
    setElapsed(0);
    setPaused(false);
    if (find(panel.choice).guidance) {
      draft.update(index === ordered.length - 1 ? null : { choice: panel.choice, step: index + 1, preview: !!panel.preview });
    }
    setPanel({
      ...panel,
      type: index === ordered.length - 1 ? "finish" : "player",
      step: index + 1,
    });
  };

  return (
    <section className={page === "Stillness" ? "ss-support-root ss-support-page" : "ss-support-root"} aria-label="Stillness support">
      {!panel && draft.loaded && draft.value && <div className="ss-practice-resume">
        <p>Continue {title(draft.value.choice)} when you choose. Progress is kept for this account on this device.</p>
        <div className="ss-support-actions">
          <button onClick={() => {
            const saved = draft.value!;
            setPaused(false); setElapsed(0);
            setPanel({ type: "player", ...saved });
          }}>Resume practice</button>
          <button onClick={() => draft.update(null)}>Discard</button>
        </div>
      </div>}
      {draft.storageError && <p role="status">Practice progress could not be restored or saved on this device. You can continue here, but it may not be available after leaving.</p>}
      {page === "Stillness" ? (
        <>
          <StillnessPreferences preferences={preferences} />
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
                    className="ss-focus-filter"
                    data-focus={title}
                    style={focusStyle(title)}
                    aria-pressed={tags.includes(title)}
                    onClick={() =>
                      setTags((previous) =>
                        previous.includes(title)
                          ? previous.filter((tag) => tag !== title)
                          : [...previous, title],
                      )
                    }
                  >
                    <i aria-hidden="true" />{title}
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
                {results.length} {results.length === 1 ? "way" : "ways"} to make a little space
              </p>
              <div className="ss-support-cards">
                {results.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="ss-support-card"
                    aria-haspopup="dialog"
                    onClick={() => setPanel({ type: "overview", choice: { itemId: item.id } })}
                  >
                    <FocusRail item={item} />
                    <div>
                      <small>
                        {item.kind} · {item.duration}
                      </small>
                      <h3>{item.name}</h3>
                      <p>{item.desc}</p>
                      <FocusBadges item={item} />
                      <span className="ss-support-card-link">Take a closer look <span aria-hidden="true">↗</span></span>
                    </div>
                  </button>
                ))}
              </div>
              {!results.length && <p>No support matches those filters.</p>}
            </div>
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
              <button onClick={closing?.onBrowse ?? preparation?.onBrowse ?? (() => onPage("Stillness"))}>
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
                  {(preparation || closing) && <Art item={find(choice)} />}
                  <div>
                    <strong>{title(choice)}</strong>
                    <FocusBadges item={find(choice)} />
                    <p>
                      {steps(choice)
                        .map(([name]) => name)
                        .join(" → ")}
                    </p>
                  </div>
                  <button
                    className="ss-support-primary"
                    disabled={!draft.loaded}
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
              <button onClick={() => onOpenDay(notice.destination!)}>
                Open {notice.destination === "Done" ? "Done for the day" : notice.destination}
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
        className={`ss-support-dialog${panel?.type === "overview" ? " ss-support-overview" : ""}`}
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
            {panel.type === "overview" ? (
              <>
                <small>A CLOSER LOOK / {find(panel.choice).kind.toUpperCase()} · {find(panel.choice).duration}</small>
                <h2>{title(panel.choice)}</h2>
                <p>{find(panel.choice).desc}</p>
                <FocusBadges item={find(panel.choice)} />
                {currentItem?.guidance && languageChoice}
                <ol className="ss-support-overview-steps">
                  {ordered.map(([label, text], step) => <li key={step}>
                    <h3>{label}</h3>
                    <p className="ss-practice-copy">{text}</p>
                    {preferences.value.language === "spiritual" && currentItem?.guidance && <p className="ss-step-context">{currentItem.guidance.context[step]}</p>}
                    <button onClick={() => setPanel({ type: "piece", choice: { itemId: panel.choice.itemId, ...(ordered.length > 1 ? { piece: step } : {}) } })}>Use this piece</button>
                  </li>)}
                </ol>
                {currentItem && <Understanding item={currentItem} />}
                <p className="ss-support-count">Previewing adds nothing. Add for today, with the option to keep a copy for later.</p>
                <div className="ss-support-overview-actions ss-support-actions">
                  <button className="ss-support-primary" disabled={!draft.loaded} onClick={() => run(panel.choice, true)}>Try {find(panel.choice).kind.toLowerCase()}</button>
                  <button onClick={() => add(panel.choice)}>Add to my day</button>
                  <button onClick={() => setPanel(null)}>Back to library</button>
                </div>
              </>
            ) : panel.type === "saved" ? (
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
                <p className="ss-practice-copy">{ordered[0][1]}</p>
                {currentItem?.guidance && <>{languageChoice}
                  {preferences.value.language === "spiritual" && <p>{currentItem.guidance.context[current?.piece ?? 0]}</p>}
                  <Understanding item={currentItem} />
                </>}
                <div className="ss-support-actions">
                  <button onClick={() => setPanel({ type: "overview", choice: { itemId: panel.choice.itemId } })}>
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
                <p className="ss-practice-copy">{ordered[index][1]}</p>
                {currentItem?.guidance && <>{languageChoice}
                  {preferences.value.language === "spiritual" && <p>{currentItem.guidance.context[absoluteStep]}</p>}
                  <Understanding item={currentItem} />
                </>}
                <p className="ss-support-count">
                  {away ? "Take the time you need. Continue here when you return."
                    : paused
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
                    {away ? "I’m back" : index === ordered.length - 1 ? "Finish" : "Continue"}
                  </button>
                  {currentItem?.id === "fix-a-loss" && absoluteStep === 1 && <button onClick={() => {
                    const saved = { choice: { itemId: panel.choice.itemId }, step: 0, preview: !!panel.preview };
                    draft.update(saved); setPanel({ type: "player", ...saved }); setElapsed(0); setPaused(false);
                  }}>Take more time away</button>}
                </div>
                {draft.storageError && <p role="status">Progress is available here but could not be saved on this device. Keep this page open to continue.</p>}
                {preferences.storageError && <p role="status">This language choice could not be saved on this device.</p>}
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
                {panel.preview && currentItem?.guidance && <p>{currentItem.question}</p>}
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
                      ? page === "Stillness" ? "Back to library" : "Close preview"
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

// Reset all transient UI on account changes before it can show another account's draft.
export function StillnessLibrary(props: Parameters<typeof StillnessLibraryForOwner>[0]) {
  return <StillnessLibraryForOwner key={props.owner} {...props} />;
}

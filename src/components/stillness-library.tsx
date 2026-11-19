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
import type { AwayEvent, AwayEventBody } from "@/lib/process/away-days";
import { catalogue, stillnessLibraryResults } from "@/lib/stillness-catalogue";
import {
  carriesFor, carryUnchangedSince, choiceKey, destinationText, findCarry, formatCarryDate, libraryChoices,
  pendingCarries, planCarry, removeCarry, replaceCarry, sameChoice, stageLabel, type Carries, type Carry, type CarryChange,
} from "@/lib/stillness-carry";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Page } from "./concept/shared";
import type { ProcessStore } from "./process/use-process";
import { CarryForm, type CarryFormValue } from "./stillness-carry-form";
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
  | { type: "saved" | "planned" }
  | { type: "change"; carryId: string };
/** Everything one save changed, so Undo reverses that save and nothing else. */
type Undo = {
  day?: { dayId: string; added: StillnessSelection[]; replaced: { before: StillnessSelection; after: StillnessSelection }[] };
  carry?: CarryChange;
  library?: AwayEventBody[];
};
type Notice = {
  text: string;
  date?: string;
  undo?: Undo;
  destination?: Destination;
  away?: string;
};
/** Carried support and bookmarks, kept with the account's away-day changes. Absent while Away Days are off. */
export type CarrySupport = {
  ready: boolean;
  events: AwayEvent[];
  carries: Carries;
  isAway: (date: string) => boolean;
  save: (bodies: AwayEventBody[], success?: string) => Promise<boolean>;
  onOpenAway: (date: string) => void;
  onOpenReflection: (carry: Carry) => void;
  /** The words of a linked away reflection, shown when a carry has no note of its own. */
  reflectionText?: (carry: Carry) => string | undefined;
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
  playRequest,
  onPlayed,
  carry,
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
  // Opens one exact piece to use, from any page. Used by a day away's review.
  playRequest?: { choice: Choice; n: number };
  // Clears the request once used, so a later remount does not open it again.
  onPlayed?: () => void;
  carry?: CarrySupport;
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
  // Older bookmarks were kept on day selections. Newer ones are independent. Both stay listed.
  const saved = useMemo(() => {
    const daySaved = days.flatMap((day) => (day.body.stillness ?? []).filter((choice) => choice.saved && known(choice)));
    return libraryChoices(carry?.events ?? [], daySaved.map(({ itemId, piece }) => ({ itemId, ...(piece === undefined ? {} : { piece }) })))
      .filter(known);
  }, [days, carry?.events]);
  const planned = carry ? pendingCarries(carry.carries, date) : [];
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
  const played = useRef(0);
  useEffect(() => {
    if (!playRequest || playRequest.n === played.current || !draft.loaded) return;
    played.current = playRequest.n;
    if (known(playRequest.choice)) run(playRequest.choice);
    onPlayed?.();
  }, [playRequest, draft.loaded]);
  function add(choice: Choice) {
    setDestination(closingBrowse || page === "Done" ? "Done" : "Preparation");
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
  const choiceOf = (choice: Choice) => ({ itemId: choice.itemId, ...(choice.piece === undefined ? {} : { piece: choice.piece }) });
  const inLibrary = (choice: Choice) => saved.some((entry) => same(entry, choice));
  /** The note already saved with this piece for that day, if any. */
  function existingNote(target: string, choice?: Choice) {
    if (!carry || !choice) return undefined;
    return findCarry(carry.carries, target, todayIn(timezone), { choice: choiceOf(choice) })?.note;
  }
  async function saveCarry(change: CarryChange, keepChoice?: Choice) {
    if (!carry) return { ok: true, library: [] as AwayEventBody[] };
    const library: AwayEventBody[] = keepChoice && !inLibrary(keepChoice)
      ? [{ type: "library", date: todayIn(timezone), choice: choiceOf(keepChoice), saved: true }] : [];
    const ok = await carry.save([...change.bodies, ...library]);
    return { ok, library: library.map((body) => ({ ...body, saved: false }) as AwayEventBody) };
  }
  function addToDay(choice: Choice, value: CarryFormValue) {
    void write(async (records) => {
      const currentDate = todayIn(timezone);
      setDate(currentDate);
      const target = value.when === "next" ? "next" : value.date ?? currentDate;
      const away = target !== "next" && !!carry?.isAway(target);
      const note = value.note.trim();
      // Today on a trading day goes into today's record, as before. Everything else waits as a carry.
      if (target === currentDate && !away) {
        const day = tradingDayFor(records, currentDate, timezone);
        const choices = day?.body.stillness ?? [];
        const added: StillnessSelection[] = [];
        const replaced: { before: StillnessSelection; after: StillnessSelection }[] = [];
        // Without the carry log, bookmarks stay on the day selection, as they always have.
        const legacyKeep = !carry && value.keep && !inLibrary(choice);
        for (const stage of value.stages) {
          const previous = choices.find((entry) => entry.destination === stage && same(entry, choice));
          if (!previous) {
            added.push({ id: crypto.randomUUID(), ...choiceOf(choice), destination: stage, ...(legacyKeep && !added.length ? { saved: true as const } : {}) });
          }
        }
        if (legacyKeep && !added.length) {
          const before = choices.find((entry) => value.stages.includes(entry.destination) && same(entry, choice))!;
          replaced.push({ before, after: { ...before, saved: true } });
        }
        let dayUndo: Undo["day"];
        if (added.length || replaced.length) {
          const record = createRecord("day", {
            ...(day?.body ?? emptyTradingDay(currentDate, timezone)),
            stillness: [
              ...choices.map((entry) => replaced.find((item) => item.before.id === entry.id)?.after ?? entry),
              ...added,
            ],
          }, day);
          if (!(await store.save([record]))) return;
          dayUndo = { dayId: record.rootId, added, replaced };
        }
        const change = carry && (note || value.editNote)
          ? planCarry(carry.carries, { source: currentDate, today: currentDate, target, stages: value.stages, choice: choiceOf(choice), note, editNote: value.editNote })
          : undefined;
        const kept = await saveCarry(change ?? { status: "unchanged", carryId: "", bodies: [], undo: [] }, value.keep ? choice : undefined);
        if (!kept.ok) {
          store.setError("Today’s support is saved, but the note could not be kept. Try saving the note again.");
          return;
        }
        setPanel(null);
        const stages = value.stages.filter((stage) => added.some((entry) => entry.destination === stage));
        const already = value.stages.filter((stage) => !stages.includes(stage));
        setNotice({
          text: [
            stages.length ? `Added to today’s ${stageLabel(stages)}.` : "",
            already.length ? `Already in today’s ${stageLabel(already)}.` : "",
            change?.status === "added" || change?.status === "updated" ? "Your note is with it." : "",
            kept.library.length || (legacyKeep) ? "Saved to your Stillness library." : "",
          ].filter(Boolean).join(" "),
          date: currentDate,
          undo: dayUndo || change?.bodies.length || kept.library.length
            ? { day: dayUndo, carry: change?.bodies.length ? change : undefined, library: kept.library }
            : undefined,
          destination: value.stages.length === 1 ? value.stages[0] : undefined,
        });
        return;
      }
      if (!carry) return;
      const change = planCarry(carry.carries, {
        source: currentDate, today: currentDate, target, stages: away ? ["Preparation"] : value.stages,
        choice: choiceOf(choice), note, editNote: value.editNote,
      });
      const kept = await saveCarry(change, value.keep ? choice : undefined);
      if (!kept.ok) {
        store.setError("This could not be saved. Try again.");
        return;
      }
      setPanel(null);
      const where = destinationText(target, value.stages, currentDate, away);
      setNotice({
        text: [
          change.status === "unchanged" ? `Already saved for ${where}.` : `${change.status === "added" ? "Saved" : "Updated"} for ${where}.`,
          target === "next" && change.status !== "unchanged" ? "It will be there when you open it on a day you trade." : "",
          kept.library.length ? "Saved to your Stillness library." : "",
        ].filter(Boolean).join(" "),
        undo: change.bodies.length || kept.library.length ? { carry: change.bodies.length ? change : undefined, library: kept.library } : undefined,
        away: away ? target : undefined,
      });
    });
  }
  function changeCarry(change: CarryChange, text: string) {
    void write(async () => {
      if (!carry || !(await carry.save(change.bodies))) {
        store.setError("This could not be saved. Try again.");
        return;
      }
      setPanel({ type: "planned" });
      setNotice({ text, undo: { carry: change } });
    });
  }
  function undoAdd(undo: Undo) {
    void write(async (records) => {
      const changed = () => setNotice({
        text: "That choice has changed since. Review your support before trying again.",
      });
      if (undo.carry && carry && !carryUnchangedSince(carry.carries, undo.carry)) return changed();
      if (undo.day) {
        const { dayId, added, replaced } = undo.day;
        const day = latest(records, "day").find((entry) => entry.rootId === dayId);
        const selections = day?.body.stillness ?? [];
        const unchanged = (expected: StillnessSelection) => {
          const current = selections.find((entry) => entry.id === expected.id);
          return !!current && same(current, expected) && current.saved === expected.saved && current.destination === expected.destination;
        };
        if (!day || !added.every(unchanged) || !replaced.every((item) => unchanged(item.after))) return changed();
        // Only this save's placements are removed. Placements that were already there stay.
        const stillness = selections.flatMap((entry) =>
          added.some((item) => item.id === entry.id) ? []
          : [replaced.find((item) => item.after.id === entry.id)?.before ?? entry]);
        const { stillness: _previousSelections, ...body } = day.body;
        if (!(await store.save([createRecord("day", stillness.length ? { ...body, stillness } : body, day)]))) return;
      }
      const away = [...(undo.carry?.undo ?? []), ...(undo.library ?? [])];
      if (away.length && carry && !(await carry.save(away))) {
        store.setError("Undo could not be finished. Try again.");
        return;
      }
      setNotice({ text: "Undone." });
    });
  }

  const results = stillnessLibraryResults({ filter, tags, search });
  const daily =
    page === "Preparation" || page === "Pre-Market" || page === "Prepare"
      ? "Preparation"
      : page === "Done"
        ? "Done"
        : null;
  // Away from Stillness, Preparation and Done, only an opened piece is shown.
  const dialogOnly = page !== "Stillness" && !daily;
  if (dialogOnly && !panel) return null;
  // Today's placements, then support carried here, matched to the same piece so it shows once.
  const dueCarries = carry && daily ? carriesFor(carry.carries, date, daily) : [];
  const rows: { key: string; choice?: Choice; notes: Carry[] }[] = today
    .filter((choice) => choice.destination === daily && known(choice))
    .map((choice) => ({ key: choice.id, choice, notes: dueCarries.filter((entry) => sameChoice(entry.choice, choiceOf(choice))) }));
  for (const entry of dueCarries) {
    if (entry.choice && !known(entry.choice)) continue;
    const row = entry.choice && rows.find((item) => item.choice && same(item.choice, entry.choice!));
    if (row) { if (!row.notes.includes(entry)) row.notes.push(entry); }
    else rows.push({ key: entry.id, choice: entry.choice, notes: [entry] });
  }
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
    <section className={dialogOnly ? undefined : page === "Stillness" ? "ss-support-root ss-support-page" : "ss-support-root"} aria-label="Stillness support">
      {!dialogOnly && <>
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
            <div className="ss-support-actions">
              {carry && <button disabled={!carry.ready} onClick={() => setPanel({ type: "planned" })}>
                Planned ahead ({planned.length})
              </button>}
              <button
                disabled={!store.loaded}
                onClick={() => setPanel({ type: "saved" })}
              >
                Saved support ({saved.length})
              </button>
            </div>
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
                    : rows.length
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
            {rows.map((row) => (
                <article className="ss-support-row" key={row.key} data-carried={row.notes.length > 0 || undefined}>
                  {row.choice && (preparation || closing) && <Art item={find(row.choice)} />}
                  <div>
                    {row.choice ? <>
                      <strong>{title(row.choice)}</strong>
                      <FocusBadges item={find(row.choice)} />
                      <p>
                        {steps(row.choice)
                          .map(([name]) => name)
                          .join(" → ")}
                      </p>
                    </> : <strong>Something you left for today</strong>}
                    {row.notes.map((entry) => <CarriedNote key={entry.id} carry={entry} today={date} words={entry.note ?? carry?.reflectionText?.(entry)} onOpen={carry?.onOpenReflection} />)}
                  </div>
                  {!row.choice && carry && <button disabled={writing} onClick={() => void write(async () => {
                    if (!(await carry.save(row.notes.map((entry) => ({ type: "carry-removed" as const, date: entry.source, carryId: entry.id }))))) store.setError("This could not be saved. Try again.");
                  })}>Mark as seen</button>}
                  {row.choice && <button
                    className="ss-support-primary"
                    disabled={!draft.loaded}
                    onClick={() => run(row.choice!)}
                  >
                    Begin {title(row.choice)}
                  </button>}
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
            {notice.away && carry && <button onClick={() => carry.onOpenAway(notice.away!)}>Open that day away</button>}
            <button
              aria-label="Dismiss support notice"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      </>}
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
                  Your Stillness library. Keeping support here never adds it to a day. Choose when you
                  want to use it again.
                </p>
                {!saved.length && <p>No saved support yet.</p>}
                {saved.map((choice) => (
                  <div className="ss-support-row" key={choiceKey(choice)}>
                    <strong>{title(choice)}</strong>
                    <button onClick={() => add(choice)}>
                      Use {title(choice)}
                    </button>
                  </div>
                ))}
              </>
            ) : panel.type === "planned" ? (
              <>
                <small>WAITING FOR ITS DAY</small>
                <h2>Planned ahead</h2>
                <p>Support and notes you have carried to a later day. Nothing here starts a session or changes a day.</p>
                {!planned.length && <p>Nothing is waiting for a later day.</p>}
                {planned.map((entry) => (
                  <div className="ss-support-row ss-carry-planned" key={entry.id}>
                    <div>
                      <small>{entry.target === "next" ? "Your next trading day" : formatCarryDate(entry.target)}
                        {entry.target !== "next" && carry?.isAway(entry.target) ? " · day away" : ` · ${stageLabel(entry.stages)}`}</small>
                      <strong>{entry.choice && known(entry.choice) ? title(entry.choice) : "A note"}</strong>
                      {entry.note && <p className="ss-carry-planned-note">{entry.note}</p>}
                    </div>
                    <div className="ss-support-actions">
                      <button onClick={() => setPanel({ type: "change", carryId: entry.id })}>Change</button>
                      <button disabled={writing} onClick={() => changeCarry(removeCarry(entry), `Removed from ${entry.target === "next" ? "your next trading day" : formatCarryDate(entry.target)}.`)}>Remove</button>
                    </div>
                  </div>
                ))}
              </>
            ) : panel.type === "change" ? (() => {
              const entry = carry?.carries[panel.carryId];
              if (!entry) return <p>This support is no longer waiting.</p>;
              return <>
                <small>CHANGE WHAT IS WAITING</small>
                <h2>{entry.choice && known(entry.choice) ? title(entry.choice) : "Your note"}</h2>
                <CarryForm key={entry.id} today={date} allowToday={false} bookmark={false}
                  initialWhen={entry.target === "next" ? "next" : "date"} initialDate={entry.target === "next" ? undefined : entry.target}
                  initialStages={entry.stages} initialNote={entry.note ?? ""}
                  choice={entry.noteId ? undefined : entry.choice} choosePiece={!!entry.noteId} initialChoice={entry.choice} allowEmpty={!!entry.noteId}
                  isAway={carry?.isAway ?? (() => false)} existingNote={() => undefined}
                  busy={writing} error={store.error} onOpenAway={carry?.onOpenAway}
                  onCancel={() => setPanel({ type: "planned" })}
                  onSubmit={(value) => {
                    const target = value.when === "next" ? "next" : value.date!;
                    const note = value.note.trim() || undefined;
                    if (!value.choice && !note && !entry.noteId) { store.setError("Choose a piece or write a note."); return; }
                    changeCarry(replaceCarry(entry, { target, stages: value.stages, note, choice: value.choice }),
                      `Now saved for ${destinationText(target, value.stages, date, target !== "next" && !!carry?.isAway(target))}.`);
                  }} />
              </>;
            })() : panel.type === "add" ? (
              <>
                <small>MAKE A LITTLE SPACE</small>
                <h2>Add {title(panel.choice)}</h2>
                <p>
                  {ordered.length > 1
                    ? "The sequence stays together. You can skip any step when you begin."
                    : "This exact piece is what you will see."}
                </p>
                <CarryForm key={choiceKey(choiceOf(panel.choice))} today={date} todayStage={destination}
                  allowToday choice={choiceOf(panel.choice)}
                  initialWhen="today"
                  isAway={carry?.isAway ?? (() => false)}
                  existingNote={({ when, date: day }) => existingNote(when === "next" ? "next" : day ?? date, panel.choice)}
                  busy={writing || store.busy || !store.loaded || (!!carry && !carry.ready)}
                  error={store.error || undefined}
                  onOpenAway={carry ? (day) => { setPanel(null); carry.onOpenAway(day); } : undefined}
                  onSubmit={(value) => addToDay(panel.choice, value)}
                  todayOnly={!carry} />
                <p className="ss-support-count">
                  Your Stillness library is reusable. Nothing in it is added to a day automatically.
                </p>
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
            ) : panel.type === "finish" ? (
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
                  ) : dialogOnly ? null : (
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
                      : dialogOnly ? "Finish" : "Finish without reflection"}
                  </button>
                </div>
              </>
            ) : null}
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

/** A note carried to this day, shown beside its piece. */
function CarriedNote({ carry, today, words, onOpen }: { carry: Carry; today: string; words?: string; onOpen?: (carry: Carry) => void }) {
  return <figure className="ss-carry-note">
    {words && <blockquote>{words}</blockquote>}
    <figcaption>
      {carry.source === today ? "Your note for today" : `${carry.note ? "A note" : "A reflection"} you left on ${formatCarryDate(carry.source)}`}
    </figcaption>
    {carry.noteId && onOpen && <button onClick={() => onOpen(carry)}>Open reflection</button>}
  </figure>;
}

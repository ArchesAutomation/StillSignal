import {
  preparationChanges,
  type DailyPreparation,
} from "@/lib/process/daily-preparation";
import { preparationStatus } from "@/lib/process/preparation-status";
import {
  arrivalFeelings,
  dateInZone,
  type ProcessRecord,
} from "@/lib/process/model";
import { readProcess } from "@/lib/process/storage";
import { tradingDayFor } from "@/lib/process/trading-day";
import { catalogue } from "@/lib/stillness-catalogue";
import { intentionExample, preparationGuidance } from "@/lib/adaptive-guidance";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProcessStore } from "../process/use-process";
import GuidanceCard from "./guidance-card";

export function preparationSupport(records: ProcessRecord[], date: string, timezone: string) {
  const day = tradingDayFor(records, date, timezone);
  const tags = preparationStatus(records, date, timezone).homeFocus;
  const suggestion = catalogue.find((item) => item.id !== "release" && item.tags.some((tag) => tags.includes(tag)));
  return { day, tags, suggestion, browse: { tags, itemId: suggestion?.id ?? catalogue[0].id } };
}

export default function ReadingRoomPreparation({
  active, owner, now, store, sessionActive, capturePending, onSetup, onStart, onJournal, onPreview, onGuidance, children,
}: {
  active: boolean;
  owner: string;
  now: number;
  store: ProcessStore;
  sessionActive: boolean;
  capturePending: boolean;
  onSetup: () => void;
  onStart: () => Promise<void>;
  onJournal: () => void;
  onPreview: (itemId: string) => void;
  onGuidance: (key?: string) => void;
  children: ReactNode;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = dateInZone(now, timezone);
  const day = tradingDayFor(store.records, date, timezone);
  // Saved values come from the same helper as the assistant's read-only preparation_status tool.
  const saved = preparationStatus(store.records, date, timezone);
  const savedArrival = saved.arrival;
  const [draft, setDraft] = useState<{ date: string; edits: Partial<DailyPreparation> }>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // A section opens itself when it holds a saved answer, then stays however the trader left it.
  const [opened, setOpened] = useState<{ arrival?: boolean; intention?: boolean }>({});
  const busy = useRef(false);
  const edits = draft?.date === date ? draft.edits : {};
  const arrival = edits.arrival ?? savedArrival;
  const intention = edits.intention ?? saved.intention;
  const boundary = edits.boundary ?? saved.boundary;
  const dirty = Object.keys(edits).length > 0;
  const unavailable = !store.loaded || store.busy || saving;
  // Reads the current selection, saved or not, so the offer follows each change.
  const guidance = preparationGuidance({ arrival });
  const [dismissed, setDismissed] = useState<string>();
  const shown = active && guidance && dismissed !== `${date}:${guidance.key}` ? guidance : undefined;
  const example = intentionExample({ arrival });
  const previewId = shown?.practice?.itemId;
  const added = !!previewId && !!day?.body.stillness?.some((choice) =>
    choice.destination === "Preparation" && choice.itemId === previewId && choice.piece === undefined);
  useEffect(() => onGuidance(shown?.key), [shown?.key, onGuidance]);

  function update(change: Partial<DailyPreparation>) {
    if (change.arrival) setDismissed(undefined);
    setDraft({ date, edits: { ...edits, ...change } });
    setMessage("");
    setError("");
  }

  async function submit(start: boolean) {
    if (busy.current || unavailable || (start && (capturePending || sessionActive))) return;
    busy.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      if (dirty) {
        const changes = preparationChanges(await readProcess(owner), date, timezone, edits, Date.now());
        if (changes.length && !(await store.save(changes))) return;
        setDraft(undefined);
        if (changes.length) setMessage("Saved for today.");
      }
      if (start) await onStart();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not finish. Please try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={active ? "rr-preparation" : undefined}>
      {active && (
        <>
          <header className="rr-preparation-heading">
            <p className="rr-preparation-kicker">Preparation</p>
            <h1>Take a quiet moment as you sit down. Notice what’s already there.</h1>
          </header>
          <section className="rr-preparation-start" aria-label="Session controls">
            <div>
              <strong>{sessionActive ? "Session in progress" : "Ready when you are"}</strong>
              <p>{capturePending ? "Confirm or discard your capture draft before starting." : "Everything below is optional."}</p>
              {message && <p role="status">{message}</p>}
              {(error || store.error) && <p role="alert">{error || store.error}</p>}
            </div>
            {dirty && <button disabled={unavailable} onClick={() => void submit(false)}>Save for today</button>}
            {sessionActive
              ? <button className="ss-primary" onClick={onJournal}>Open Daily journal →</button>
              : <button className="ss-primary" disabled={unavailable || capturePending} onClick={() => void submit(true)}>Start session →</button>}
          </section>
          {/* Closed until used, so the invitation and Start stay in view. A saved answer opens its section. */}
          <details className="rr-preparation-card rr-preparation-more" open={opened.arrival ?? arrival.length > 0} onToggle={(event) => { const open = event.currentTarget.open; setOpened((state) => ({ ...state, arrival: open })); }}>
            <summary>Name how you’re arriving</summary>
            <p>Choose anything that fits. Your saved check-in appears in the Journal’s Daily reference.</p>
            <div className="rr-preparation-chips" role="group" aria-label="How are you arriving?">
              {arrivalFeelings.map((feeling) => (
                <button
                  key={feeling}
                  disabled={unavailable}
                  aria-pressed={arrival.includes(feeling)}
                  onClick={() => update({ arrival: arrival.includes(feeling)
                    ? arrival.filter((item) => item !== feeling)
                    : [...arrival, feeling] })}
                >{feeling}</button>
              ))}
            </div>
            {shown && <GuidanceCard guidance={shown}
              note={added ? "It’s already in today’s support below." : undefined}
              onPractice={onPreview}
              onDismiss={() => setDismissed(`${date}:${shown.key}`)} />}
          </details>
          <details className="rr-preparation-card rr-preparation-more" open={opened.intention ?? !!(intention || boundary)} onToggle={(event) => { const open = event.currentTarget.open; setOpened((state) => ({ ...state, intention: open })); }}>
            <summary>Set an intention</summary>
            <p>Something to return to during the session, and a limit that helps you protect it.</p>
            <div className="rr-preparation-fields">
              <label>Intention<textarea rows={2} maxLength={8000} disabled={unavailable} value={intention} onChange={(event) => update({ intention: event.target.value })} /></label>
              <label>Boundary<textarea rows={2} maxLength={8000} disabled={unavailable} value={boundary} onChange={(event) => update({ boundary: event.target.value })} /></label>
            </div>
            {/* Follows the current arrival selection. The trader's own words are never replaced. */}
            <p className="rr-preparation-example-text" data-intention-example>An example, if it helps: “{example}”</p>
            {!intention.trim() && <button className="rr-preparation-example" disabled={unavailable} onClick={() => update({ intention: example })}>Use this example</button>}
          </details>
        </>
      )}
      {children}
      {active && (
        <p className="rr-preparation-setup">
          Set up your process when it changes. There’s no need to repeat it each morning.
          <button onClick={onSetup}>Initial setup <span aria-hidden="true">↗</span></button>
        </p>
      )}
    </div>
  );
}

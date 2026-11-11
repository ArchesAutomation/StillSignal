import { useRef, useState, type ReactNode } from "react";
import type { ProcessStore } from "../command-center/use-process";
import { arrivalFeelings, dateInZone, type ProcessRecord } from "@/lib/process/model";
import { arrivalCheckin, preparationChanges, type DailyPreparation } from "@/lib/process/daily-preparation";
import { supportFocus } from "@/lib/process/journal-guide";
import { readProcess } from "@/lib/process/storage";
import { tradingDayFor } from "@/lib/process/trading-day";
import { catalogue } from "@/lib/stillness-catalogue";

export function preparationSupport(records: ProcessRecord[], date: string, timezone: string) {
  const day = tradingDayFor(records, date, timezone);
  const tags: string[] = day?.body.supportFocuses?.map((focus) => supportFocus[focus].title) ?? [];
  const suggestion = catalogue.find((item) => item.id !== "release" && item.tags.some((tag) => tags.includes(tag)));
  return { day, tags, suggestion, browse: { tags, itemId: suggestion?.id ?? catalogue[0].id } };
}

export default function ReadingRoomPreparation({
  active, owner, now, store, sessionActive, capturePending, onBrowse, onSetup, onStart, onJournal, children,
}: {
  active: boolean;
  owner: string;
  now: number;
  store: ProcessStore;
  sessionActive: boolean;
  capturePending: boolean;
  onBrowse: () => void;
  onSetup: () => void;
  onStart: () => Promise<void>;
  onJournal: () => void;
  children: ReactNode;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = dateInZone(now, timezone);
  const day = tradingDayFor(store.records, date, timezone);
  const savedArrival = arrivalCheckin(store.records, day?.rootId)?.body.arrival ?? [];
  const support = day?.body.stillness?.filter((choice) => choice.destination === "Preparation") ?? [];
  const [draft, setDraft] = useState<{ date: string; edits: Partial<DailyPreparation> }>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const edits = draft?.date === date ? draft.edits : {};
  const arrival = edits.arrival ?? savedArrival;
  const dirty = Object.keys(edits).length > 0;
  const unavailable = !store.loaded || store.busy || saving;

  function update(change: Partial<DailyPreparation>) {
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
            <div>
              <p className="rr-preparation-kicker">Preparation / Arrive</p>
              <h1>Before the next decision.</h1>
              <p>A little support for the person making the decisions.</p>
            </div>
            <button onClick={onBrowse}>+ Find support</button>
          </header>
          <aside className="rr-preparation-rail" aria-label="Today’s path">
            <p className="rr-preparation-kicker">Today’s path</p>
            <ol>
              <li><a href="#preparation-arrive">Check in with yourself<small>A few words is enough</small></a></li>
              <li><a href="#preparation-support">Your chosen support<small>{support.length} {support.length === 1 ? "experience" : "experiences"}</small></a></li>
              <li><a href="#preparation-intention">Intention and boundary<small>Always optional</small></a></li>
            </ol>
            <div className="rr-preparation-setup">
              <p>Set up your process when it changes. There’s no need to repeat it each morning.</p>
              <button onClick={onSetup}>Initial setup <span aria-hidden="true">↗</span></button>
            </div>
          </aside>
          <section className="rr-preparation-card rr-preparation-arrive" id="preparation-arrive" aria-labelledby="preparation-arrive-title">
            <div className="rr-preparation-label"><span className="rr-preparation-kicker">01 / Arrive</span><span className="rr-preparation-optional">Optional</span></div>
            <h2 id="preparation-arrive-title">How are you arriving?</h2>
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
          </section>
          <div className="rr-preparation-support-heading" id="preparation-support">
            <h2>02 / Your support for today</h2>
          </div>
        </>
      )}
      {children}
      {active && (
        <>
          <section className="rr-preparation-card" id="preparation-intention" aria-labelledby="preparation-intention-title">
            <div className="rr-preparation-label"><span className="rr-preparation-kicker">03 / Intention and boundary</span><span className="rr-preparation-optional">Optional</span></div>
            <h2 id="preparation-intention-title">What would you like to return to?</h2>
            <p>A direction for the session and a limit that helps you protect it.</p>
            <div className="rr-preparation-fields">
              <label>Intention<textarea rows={2} maxLength={8000} disabled={unavailable} value={edits.intention ?? day?.body.goal ?? ""} onChange={(event) => update({ intention: event.target.value })} placeholder="I want to wait for my setup before acting." /></label>
              <label>Boundary<textarea rows={2} maxLength={8000} disabled={unavailable} value={edits.boundary ?? day?.body.boundary ?? ""} onChange={(event) => update({ boundary: event.target.value })} placeholder="I’ll step away if I catch myself chasing." /></label>
            </div>
          </section>
          <footer className="rr-preparation-start">
            <div>
              <strong>{sessionActive ? "Session in progress" : "Ready when you are"}</strong>
              <p>{capturePending ? "Confirm or discard your capture draft before starting." : "Everything above is optional."}</p>
              {message && <p role="status">{message}</p>}
              {(error || store.error) && <p role="alert">{error || store.error}</p>}
            </div>
            <button disabled={!dirty || unavailable} onClick={() => void submit(false)}>Save for today</button>
            {sessionActive
              ? <button className="ss-primary" onClick={onJournal}>Open Daily journal →</button>
              : <button className="ss-primary" disabled={unavailable || capturePending} onClick={() => void submit(true)}>Start session →</button>}
          </footer>
        </>
      )}
    </div>
  );
}

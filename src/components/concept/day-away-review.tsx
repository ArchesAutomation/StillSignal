import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { validateScreenshotFile } from "@/lib/clipboard-screenshot";
import { keepPrivateFile, privateFile, removePrivateFile } from "@/lib/private-files";
import { useEffect, useRef, useState } from "react";

type Image = { path: string; name: string; timeframe: string; caption: string };
type Note = {
  id: string;
  text: string;
  images: Image[];
  followups: { date: string; text: string }[];
  reminder?: { text: string; preparation?: string };
};
type Day = { away: boolean; reason?: { text: string; recordedAt: number }; notes: Note[]; started?: boolean };
type Days = Record<string, Day | undefined>;
type Entry = { date: string; note: Note };

const emptyDay = (): Day => ({ away: false, notes: [] });
const formatDate = (date: string) => new Intl.DateTimeFormat("en-GB", {
  dateStyle: "full", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

// The synthetic review account keeps its proposal drafts apart from process and session storage.
export function useDayAwayReview(owner: string, enabled: boolean) {
  const key = `ss-day-away-review:${owner}`;
  const [days, setDays] = useState<Days>({});
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    try {
      setDays(JSON.parse(localStorage.getItem(key) || "{}") as Days);
      setReady(true);
    } catch {
      setMessage("This review’s local storage could not be loaded.");
    }
  }, [enabled, key]);

  function update(change: (current: Days) => Days, success = "") {
    if (!ready) return false;
    try {
      const current = JSON.parse(localStorage.getItem(key) || "{}") as Days;
      const next = change(current);
      localStorage.setItem(key, JSON.stringify(next));
      setDays(next);
      setMessage(success);
      return true;
    } catch {
      setMessage("This change could not be saved. Your draft is still here.");
      return false;
    }
  }

  function write(date: string, change: (day: Day) => Day, success?: string) {
    return update(current => ({ ...current, [date]: change(current[date] ?? emptyDay()) }), success);
  }

  const entries = Object.entries(days).flatMap(([date, day]) => day?.notes.map(note => ({ date, note })) ?? []);
  function writeNote(entry: Entry, change: (note: Note) => Note, success?: string) {
    return write(entry.date, day => ({ ...day, notes: day.notes.map(note => note.id === entry.note.id ? change(note) : note) }), success);
  }

  return {
    days, entries, ready, message, write, writeNote,
    setAway: (date: string, away: boolean) => write(date, day => ({ ...day, away }), away ? "Day away saved." : "Trading day restored."),
    beginPreparation: (date: string) => {
      if (!entries.some(entry => entry.date < date && entry.note.reminder && !entry.note.reminder.preparation)) return;
      update(current => Object.fromEntries(Object.entries(current).map(([origin, day]) => [origin, day && {
        ...day,
        notes: day.notes.map(note => origin < date && note.reminder && !note.reminder.preparation
          ? { ...note, reminder: { ...note.reminder, preparation: date } } : note),
      }])));
    },
  };
}

type Review = ReturnType<typeof useDayAwayReview>;

export function CarriedThoughts({ entries, onOpen, onSeen }: {
  entries: Entry[]; onOpen: (entry: Entry) => void; onSeen: (entry: Entry) => void;
}) {
  return entries.map(entry => <Panel key={entry.note.id} className="rr-preparation-card rr-away-thought">
    <p className="rr-preparation-kicker">From {formatDate(entry.date)}</p>
    <blockquote>{entry.note.reminder?.text || entry.note.text || "A chart review you saved."}</blockquote>
    <div className="rr-home-actions">
      <Button onClick={() => onOpen(entry)}>{entry.note.images.length ? "Open reflection and charts" : "Open reflection"}</Button>
      <Button onClick={() => onSeen(entry)}>Mark as seen</Button>
    </div>
  </Panel>);
}

function ChartImage({ image, owner }: { image: Image; owner: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void privateFile(image.path, owner).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.path, owner]);
  if (failed) return <p>Screenshot unavailable on this device.</p>;
  return url ? <img src={url} alt={image.timeframe ? `${image.timeframe} chart screenshot` : image.name} /> : <p>Loading screenshot…</p>;
}

export default function DayAwayReview({ owner, date, today, view, review, openEntry, onEntry, onHome, onJournal, onStillness, onDate, savedPreparation, onActivity, onReturn }: {
  owner: string; date: string; today: string; view: "home" | "journal" | "prep" | "done";
  review: Review; openEntry?: { date: string; id: string }; onEntry: (entry?: Entry) => void;
  onHome: () => void; onJournal: () => void; onStillness: () => void; onDate: (date: string) => void;
  savedPreparation?: string; onActivity?: () => void; onReturn: () => void;
}) {
  const [editor, setEditor] = useState<"reason" | "reflection" | "charts" | "reminder" | "followup">();
  const [continuing, setContinuing] = useState(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<Image[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const enlarged = useRef<HTMLDialogElement>(null);
  const day = review.days[date] ?? emptyDay();
  const entry = review.entries.find(item => item.date === openEntry?.date && item.note.id === openEntry.id);
  const shownDay = entry ? review.days[entry.date] : day;
  const gallery = editor === "charts" ? images : entry?.note.images ?? [];
  const selected = gallery[index];
  const otherNotes = review.entries.filter(item => item.date < date).sort((a, b) => b.date.localeCompare(a.date));
  const title = entry ? "Reflection" : view === "journal" ? "Daily journal" : "Day away from charts";

  function edit(next: typeof editor) {
    setEditor(next);
    setText("");
    setImages([]);
    setIndex(0);
    setError("");
  }

  async function attach(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    setError("");
    const added: Image[] = [];
    try {
      files.forEach(validateScreenshotFile);
      for (const file of files) {
        const { path } = await keepPrivateFile(owner, crypto.randomUUID(), "image", file);
        added.push({ path, name: file.name, timeframe: "", caption: "" });
      }
      setIndex(images.length);
      setImages([...images, ...added]);
    } catch (failure) {
      await Promise.allSettled(added.map(image => removePrivateFile(image.path, owner)));
      setError(failure instanceof Error ? failure.message : "Could not save the screenshots.");
    } finally { setUploading(false); }
  }

  function moveImage(direction: number) {
    const next = index + direction;
    const ordered = [...images];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    setImages(ordered);
    setIndex(next);
  }

  function save() {
    const value = text.trim();
    if (!value && (editor !== "charts" || !images.length) && editor !== "reminder") {
      setError(editor === "charts" ? "Add a screenshot or write a reflection." : "Write a few words before saving.");
      return;
    }
    let saved = false;
    if (editor === "reason") saved = review.write(date, current => ({ ...current, reason: { text: value, recordedAt: Date.now() } }), "Reason saved.");
    if (editor === "reflection" || editor === "charts") {
      const note: Note = { id: crypto.randomUUID(), text: value, images, followups: [] };
      saved = review.write(date, current => ({ ...current, notes: [...current.notes, note] }), "Reflection saved.");
      if (saved) onEntry({ date, note });
    }
    if (entry && editor === "reminder") saved = review.writeNote(entry, note => ({ ...note, reminder: { text: value } }), "Saved for your next preparation.");
    if (entry && editor === "followup") saved = review.writeNote(entry, note => ({ ...note, followups: [...note.followups, { date, text: value }] }), "Follow-up saved.");
    if (saved) edit(undefined);
  }

  const screenshots = selected && <div className="rr-away-images">
    <ChartImage key={selected.path} image={selected} owner={owner} />
    {selected.caption && editor !== "charts" && <p>{selected.caption}</p>}
    <div className="rr-home-actions">
      {gallery.map((image, position) => <Button key={image.path} aria-pressed={position === index} onClick={() => setIndex(position)}>{image.timeframe || `Image ${position + 1}`}</Button>)}
      <Button onClick={() => enlarged.current?.showModal()}>Enlarge screenshot</Button>
    </div>
    {editor === "charts" && <>
      <Input label="Timeframe (optional)" value={selected.timeframe} onChange={event => setImages(images.map((image, position) => position === index ? { ...image, timeframe: event.target.value } : image))} />
      <Input label="Caption (optional)" value={selected.caption} onChange={event => setImages(images.map((image, position) => position === index ? { ...image, caption: event.target.value } : image))} />
      <div className="rr-home-actions">
        <Button disabled={index === 0} onClick={() => moveImage(-1)}>Move earlier</Button>
        <Button disabled={index === images.length - 1} onClick={() => moveImage(1)}>Move later</Button>
      </div>
    </>}
  </div>;

  const entryList = (entries: Entry[]) => entries.map(item => <div key={item.note.id} className="rr-away-note">
    <small>{formatDate(item.date)}</small>
    <p>{item.note.text || "Saved chart review"}</p>
    <Button onClick={() => { setContinuing(false); edit(undefined); onEntry(item); }}>{item.note.images.length ? "Open reflection and charts" : "Open reflection"}</Button>
  </div>);

  return <article className="rr-home rr-away-review" aria-label={title}>
    <header className="rr-journal-heading">
      <p className="rr-home-date">{formatDate(entry?.date ?? date)}</p>
      <h1>{title}</h1>
      {!entry && view === "journal" && <p>{day.away ? "Day away from charts" : "Earlier reflection"}</p>}
    </header>
    {(shownDay?.reason || (!entry && !editor && day.away && (view === "home" || view === "journal"))) && <Panel className="rr-away-card">
      <h2>Why I stayed away</h2>
      {shownDay?.reason ? <><blockquote>{shownDay.reason.text}</blockquote><small>Recorded {new Date(shownDay.reason.recordedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></> : <>
        <p>Anything you’d like to remember about why you stayed away?</p>
        <div className="rr-home-actions"><Button onClick={() => edit("reason")}>Add a reason</Button></div>
      </>}
    </Panel>}
    {editor ? <Panel className="rr-away-card">
      <form onSubmit={event => { event.preventDefault(); if (!uploading) save(); }}>
        <div className={editor === "charts" ? "rr-away-columns" : undefined}>
          <div className="rr-away-writing">
            <label htmlFor="rr-away-writing">{{reason: "Why I stayed away", reflection: "Reflection", charts: "Reflection (optional)", reminder: "What would you like to bring back to mind?", followup: "Follow-up"}[editor]}</label>
            <textarea id="rr-away-writing" value={text} onChange={event => setText(event.target.value)} rows={5} autoFocus />
            {editor === "charts" && <details><summary>Reflect on a setup</summary><p>You can see how the move unfolded now. What would still have been uncertain at the time?</p></details>}
          </div>
          {editor === "charts" && <div className="rr-away-writing">{screenshots}<Input label="Add screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} onChange={event => { void attach(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></div>}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="rr-home-actions"><Button className="ss-primary" type="submit" disabled={uploading}>{editor === "reminder" ? "Save for next preparation" : "Save"}</Button><Button disabled={uploading} onClick={() => { void Promise.allSettled(images.map(image => removePrivateFile(image.path, owner))); edit(undefined); }}>Cancel</Button></div>
      </form>
    </Panel> : entry ? <Panel className="rr-away-card">
      <div className={gallery.length ? "rr-away-columns" : undefined}>
        <div className="rr-away-writing">
          {entry.note.text && <p>{entry.note.text}</p>}
          {entry.note.followups.map((followup, position) => <div className="rr-away-note" key={position}><small>{formatDate(followup.date)}</small><p>{followup.text}</p></div>)}
          {entry.note.reminder && <div className="rr-away-note"><small>At your next preparation</small><p>{entry.note.reminder.text || entry.note.text || "Saved chart review"}</p></div>}
          <div className="rr-home-actions">
            {entry.note.reminder ? <Button onClick={() => review.writeNote(entry, note => ({ ...note, reminder: undefined }), "Reminder removed.")}>Remove reminder</Button> : <Button onClick={() => edit("reminder")}>Show at my next preparation</Button>}
            {day.away && entry.date < date && <Button onClick={() => edit("followup")}>Add a follow-up</Button>}
            <Button onClick={() => { setIndex(0); onEntry(); }}>Back to the day</Button>
          </div>
        </div>
        {screenshots}
      </div>
    </Panel> : view === "prep" || view === "done" ? <Panel className="rr-away-card">
      <p>{view === "prep" ? "You’ve set today aside. If your plans change, you can return to a trading day." : "You’ve set today aside. Anything you saved is in your journal."}</p>
      <div className="rr-home-actions"><Button onClick={onJournal}>Open Daily journal</Button><Button onClick={onHome}>Back to Home</Button></div>
    </Panel> : <>
      {day.away && <Panel className="rr-away-card">
        <h2>A little room to reflect</h2>
        <div className="rr-home-actions"><Button className="ss-primary" onClick={() => edit("reflection")}>Write a reflection</Button><Button onClick={() => edit("charts")}>Review charts</Button><Button onClick={() => setContinuing(!continuing)} aria-expanded={continuing}>Continue a thought</Button></div>
        {continuing && (otherNotes.length ? entryList(otherNotes) : <p>Reflections from earlier dates will appear here.</p>)}
      </Panel>}
      {entryList(review.entries.filter(item => item.date === date || item.note.followups.some(followup => followup.date === date)))}
    </>}
    {savedPreparation && <details className="rr-away-links"><summary>View saved preparation</summary><p>{savedPreparation}</p></details>}
    {onActivity && <div className="rr-away-links"><p>Trades were recorded for this date.</p><Button onClick={onActivity}>View trading activity</Button></div>}
    <div className="rr-home-actions">
      {view === "home" && <><Button onClick={onJournal}>Open Daily journal</Button><Button onClick={onStillness}>Explore Stillness</Button></>}
      {day.away && (view === "home" || view === "prep" || view === "journal") && <Button disabled={uploading} onClick={onReturn}>Return to trading day</Button>}
    </div>
    {view === "journal" && <details className="rr-away-links"><summary>Find another date</summary><form onSubmit={event => { event.preventDefault(); onDate(String(new FormData(event.currentTarget).get("date"))); }}><Input label="Journal date" name="date" type="date" defaultValue={date} max={today} required /><Button type="submit">Open date</Button></form></details>}
    {review.message && <p className="rr-away-links" role="status">{review.message}</p>}
    <dialog className="rr-away-zoom" ref={enlarged} aria-label="Enlarged screenshot"><Button onClick={() => enlarged.current?.close()}>Close screenshot</Button>{selected && <ChartImage key={selected.path} image={selected} owner={owner} />}</dialog>
  </article>;
}

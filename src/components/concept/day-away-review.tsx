import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { awayEntries, emptyAwayDay, foldAwayEvents, type AwayDay as Day, type AwayEntry as Entry } from "@/lib/away-day-state";
import { awayScreenshotUrl, createAwayEvent, discardAwayScreenshot, keepAwayScreenshot, readAwayEvents, saveAwayEvents, syncAwayDays } from "@/lib/away-day-storage";
import { validateScreenshotFile } from "@/lib/clipboard-screenshot";
import type { JournalEntry } from "@/lib/model";
import type { AwayEvent, AwayEventBody, AwayImage as Image } from "@/lib/process/away-days";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WorkspaceModule } from "../module-workspace";

const emptyDay = emptyAwayDay;
export const formatAwayDate = (date: string) => new Intl.DateTimeFormat("en-GB", {
  dateStyle: "full", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));
const formatDate = formatAwayDate;

// Away days are saved on this device first, then synced to the account. They never open a session.
export function useDayAwayReview(owner: string, enabled: boolean) {
  const [events, setEvents] = useState<AwayEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    // A failed sync keeps its changes pending and retries on the next pass.
    await syncAwayDays(owner).catch(() => {});
    setEvents(await readAwayEvents(owner));
  }, [owner]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void readAwayEvents(owner).then(saved => {
      if (!active) return;
      setEvents(saved);
      setReady(true);
      void refresh().catch(() => {});
    }).catch(() => { if (active) setMessage("Your away days could not be loaded."); });
    const sync = () => { if (document.visibilityState === "visible") void refresh().catch(() => {}); };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = setInterval(sync, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled, owner, refresh]);

  async function append(bodies: AwayEventBody[], success = "") {
    if (!ready) return false;
    try {
      const rows = bodies.map(body => createAwayEvent(body));
      await saveAwayEvents(owner, rows);
      setEvents(current => [...current, ...rows]);
      setMessage(success);
      void refresh().catch(() => {});
      return true;
    } catch {
      setMessage("This change could not be saved. Your draft is still here.");
      return false;
    }
  }

  const days = useMemo(() => foldAwayEvents(events), [events]);
  const entries = useMemo(() => awayEntries(days), [days]);

  return {
    days, entries, ready, message,
    setAway: (date: string, away: boolean) => append([{ type: "day", date, away }], away ? "Day away saved." : "Trading day restored."),
    markStarted: (date: string) => append([{ type: "started", date }]),
    setReason: (date: string, text: string) => append([{ type: "reason", date, text }], "Reason saved."),
    addNote: (date: string, noteId: string, text: string, images: Image[]) => append([{ type: "note", date, noteId, text, images }], "Reflection saved."),
    addFollowup: (entry: Entry, followupDate: string, text: string) => append([{ type: "followup", date: entry.date, noteId: entry.note.id, followupDate, text }], "Follow-up saved."),
    setReminder: (entry: Entry, text: string | null, success = "") => append([{ type: "reminder", date: entry.date, noteId: entry.note.id, text }], success),
    saveBook: (date: string, notes: JournalEntry[]) => append(notes.map(entry => ({ type: "book" as const, date, entry }))),
    beginPreparation: (date: string) => {
      const due = entries.filter(entry => entry.date < date && entry.note.reminder && !entry.note.reminder.preparation);
      if (due.length) void append(due.map(entry => ({ type: "reminder-surfaced" as const, date: entry.date, noteId: entry.note.id, preparation: date })));
    },
  };
}

type Review = ReturnType<typeof useDayAwayReview>;

function AwayReason({ reason }: { reason: NonNullable<Day["reason"]> }) {
  return <>
    <blockquote>{reason.text}</blockquote>
    <small>Recorded {new Date(reason.recordedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small>
  </>;
}

function SetupPrompt() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="rr-away-prompt" data-open={open}>
    <Button className="rr-away-prompt-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      Reflect on a setup <span aria-hidden="true">⌄</span>
    </Button>
    <div className="rr-away-prompt-motion" id={id} inert={!open} aria-hidden={!open}>
      <div><p>You can see how the move unfolded now. What would still have been uncertain at the time?</p></div>
    </div>
  </div>;
}

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
    let release = () => {};
    void awayScreenshotUrl(owner, image).then(loaded => {
      if (!active) { loaded.release(); return; }
      release = loaded.release;
      setUrl(loaded.url);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; release(); };
  }, [image, owner]);
  if (failed) return <p>This screenshot has not finished syncing to this device.</p>;
  return url ? <img src={url} alt={image.timeframe ? `${image.timeframe} chart screenshot` : image.name} /> : <p>Loading screenshot…</p>;
}

export default function DayAwayReview({ owner, date, review, openEntry, onEntry, savedPreparation, onActivity, onReturn, reflectionRequested, onReflectionOpened }: {
  owner: string; date: string;
  review: Review; openEntry?: { date: string; id: string }; onEntry: (entry?: Entry) => void;
  savedPreparation?: string; onActivity?: () => void; onReturn: () => void;
  reflectionRequested: boolean; onReflectionOpened: () => void;
}) {
  const [editor, setEditor] = useState<"reason" | "reflection" | "charts" | "reminder" | "followup">();
  const [continuing, setContinuing] = useState(false);
  const [text, setText] = useState("");
  const [images, setImages] = useState<Image[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickEditor, setQuickEditor] = useState(false);
  const quickDialog = useRef<HTMLDialogElement>(null);
  const enlarged = useRef<HTMLDialogElement>(null);
  const day = review.days[date] ?? emptyDay();
  const entry = review.entries.find(item => item.date === openEntry?.date && item.note.id === openEntry.id);
  const shownDay = entry ? review.days[entry.date] : day;
  const gallery = editor === "charts" ? images : entry?.note.images ?? [];
  const selected = gallery[index];
  const otherNotes = review.entries.filter(item => item.date < date).sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    if (!reflectionRequested) return;
    if (!editor) {
      edit("reflection");
      setQuickEditor(true);
    }
    onReflectionOpened();
  }, [reflectionRequested]);

  useEffect(() => {
    if (quickEditor) quickDialog.current?.showModal();
  }, [quickEditor]);

  function edit(next: typeof editor) {
    setQuickEditor(false);
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
      if (images.length + files.length > 12) throw new Error("Keep each reflection to 12 screenshots.");
      for (const file of files) added.push(await keepAwayScreenshot(owner, file));
      setIndex(images.length);
      setImages([...images, ...added]);
    } catch (failure) {
      await Promise.allSettled(added.map(image => discardAwayScreenshot(owner, image)));
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

  async function save() {
    const value = text.trim();
    if (!value && (editor !== "charts" || !images.length) && editor !== "reminder") {
      setError(editor === "charts" ? "Add a screenshot or write a reflection." : "Write a few words before saving.");
      return;
    }
    setSaving(true);
    let saved = false;
    if (editor === "reason") saved = await review.setReason(date, value);
    if (editor === "reflection" || editor === "charts") {
      const note = { id: crypto.randomUUID(), text: value, images, followups: [] };
      saved = await review.addNote(date, note.id, value, images);
      if (saved) onEntry({ date, note });
    }
    if (entry && editor === "reminder") saved = await review.setReminder(entry, value, "Saved for your next preparation.");
    if (entry && editor === "followup") saved = await review.addFollowup(entry, date, value);
    setSaving(false);
    if (saved) edit(undefined);
    else setError("This could not be saved. Your words are still here. Try again.");
  }

  const screenshots = selected && <div className="rr-away-images">
    <ChartImage key={selected.id} image={selected} owner={owner} />
    {selected.caption && editor !== "charts" && <p>{selected.caption}</p>}
    <div className="rr-home-actions">
      {gallery.map((image, position) => <Button key={image.id} aria-pressed={position === index} onClick={() => setIndex(position)}>{image.timeframe || `Image ${position + 1}`}</Button>)}
      <Button onClick={() => enlarged.current?.showModal()}>Enlarge screenshot</Button>
    </div>
    {editor === "charts" && <>
      <Input label="Timeframe (optional)" maxLength={80} value={selected.timeframe} onChange={event => setImages(images.map((image, position) => position === index ? { ...image, timeframe: event.target.value } : image))} />
      <Input label="Caption (optional)" maxLength={500} value={selected.caption} onChange={event => setImages(images.map((image, position) => position === index ? { ...image, caption: event.target.value } : image))} />
      <div className="rr-home-actions">
        <Button disabled={index === 0} onClick={() => moveImage(-1)}>Move earlier</Button>
        <Button disabled={index === images.length - 1} onClick={() => moveImage(1)}>Move later</Button>
      </div>
    </>}
  </div>;

  const entryList = (entries: Entry[], earlier = false) => entries.map(item => <div key={item.note.id} className="rr-away-note">
    <small>{earlier || item.date !== date ? `From Day in Action · ${formatDate(item.date)}` : formatDate(item.date)}</small>
    <p>{item.note.text || "Saved chart review"}</p>
    <Button onClick={() => { setContinuing(false); edit(undefined); onEntry(item); }}>{item.note.images.length ? "Open reflection and charts" : "Open reflection"}</Button>
  </div>);

  const editorForm = editor && <form onSubmit={event => { event.preventDefault(); if (!uploading && !saving) void save(); }}>
    <div className={editor === "charts" ? "rr-away-columns" : undefined}>
      <div className="rr-away-writing">
        <label htmlFor="rr-away-writing">{{reason: "Why I stayed away", reflection: "Reflection", charts: "Reflection (optional)", reminder: "What would you like to bring back to mind?", followup: "Follow-up"}[editor]}</label>
        <textarea id="rr-away-writing" value={text} onChange={event => setText(event.target.value)} rows={5} maxLength={8000} autoFocus />
        {editor === "charts" && <SetupPrompt />}
      </div>
      {editor === "charts" && <div className="rr-away-writing">{screenshots}<Input label="Add screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} onChange={event => { void attach(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></div>}
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="rr-home-actions"><Button className="ss-primary" type="submit" disabled={uploading || saving}>{editor === "reminder" ? "Save for next preparation" : "Save"}</Button><Button disabled={uploading || saving} onClick={() => { void Promise.allSettled(images.map(image => discardAwayScreenshot(owner, image))); edit(undefined); }}>Cancel</Button></div>
  </form>;

  return <>
    {(shownDay?.reason || day.away) && <WorkspaceModule id="away-reason" title="Why I stayed away" order={1}>
      <section className="rr-away-reason">
        <h2 className="rr-away-widget-label">Why I stayed away</h2>
        {editor === "reason" ? editorForm : shownDay?.reason ? <AwayReason reason={shownDay.reason} /> : <>
          <p>Anything you’d like to remember about why you stayed away?</p>
          <div className="rr-home-actions"><Button onClick={() => edit("reason")} disabled={!!editor}>Add a reason</Button></div>
        </>}
      </section>
    </WorkspaceModule>}
    <WorkspaceModule id="away-reflection" title="Reflection" order={2}>
      <section className="rr-away-review">
        <h2 className="rr-away-widget-label">Reflection</h2>
        {entry && <p>From Day in Action · {formatDate(entry.date)}</p>}
        {!quickEditor && editor && editor !== "reason" ? editorForm : entry ? <div className="rr-away-card">
          <div className={gallery.length ? "rr-away-columns" : undefined}>
            <div className="rr-away-writing">
              {entry.note.text && <p>{entry.note.text}</p>}
              {entry.note.followups.map((followup, position) => <div className="rr-away-note" key={position}><small>{formatDate(followup.date)}</small><p>{followup.text}</p></div>)}
              {entry.note.reminder && <div className="rr-away-note"><small>At your next preparation</small><p>{entry.note.reminder.text || entry.note.text || "Saved chart review"}</p></div>}
              <div className="rr-home-actions">
                {entry.note.reminder ? <Button onClick={() => void review.setReminder(entry, null, "Reminder removed.")}>Remove reminder</Button> : <Button onClick={() => edit("reminder")}>Show at my next preparation</Button>}
                {day.away && entry.date < date && <Button onClick={() => edit("followup")}>Add a follow-up</Button>}
                <Button onClick={() => { setIndex(0); onEntry(); }}>Back to the day</Button>
              </div>
            </div>
            {screenshots}
          </div>
        </div> : <>
          {day.away && <div className="rr-away-card">
            <div className="rr-home-actions"><Button className="ss-primary" onClick={() => edit("reflection")} disabled={!!editor}>Write a reflection</Button><Button onClick={() => edit("charts")} disabled={!!editor}>Review charts</Button><Button onClick={() => setContinuing(!continuing)} aria-expanded={continuing} disabled={!!editor}>Continue a thought</Button></div>
            {continuing && <div className="rr-away-earlier"><h3>Earlier journal reflections</h3>{otherNotes.length ? entryList(otherNotes, true) : <p>When you save a reflection on an earlier date, you can carry it on here.</p>}</div>}
          </div>}
          {entryList(review.entries.filter(item => item.date === date || item.note.followups.some(followup => followup.date === date)))}
        </>}
        {savedPreparation && <details className="rr-away-links"><summary>View saved preparation</summary><p>{savedPreparation}</p></details>}
        {onActivity && <div className="rr-away-links"><p>Trades were recorded for this date.</p><Button onClick={onActivity}>View trading activity</Button></div>}
        {day.away && <div className="rr-home-actions"><Button disabled={uploading} onClick={onReturn}>Return to trading day</Button></div>}
        <p className="sr-only" role="status">{review.message}</p>
        <dialog className="rr-away-zoom" ref={enlarged} aria-label="Enlarged screenshot"><Button onClick={() => enlarged.current?.close()}>Close screenshot</Button>{selected && <ChartImage key={selected.id} image={selected} owner={owner} />}</dialog>
      </section>
    </WorkspaceModule>
    {quickEditor && createPortal(<dialog className="rr-away-date-dialog" ref={quickDialog} aria-label="Write a reflection" onCancel={() => edit(undefined)}>{editorForm}</dialog>, document.body)}
  </>;
}

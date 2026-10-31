"use client";
import JournalSelect from "./journal-select";
import { WorkspaceModule } from "../module-workspace";
import StageLabelModule from "./stage-label-module";
import { DayLabelSummary } from "./reflection-stream";
import JournalTrades from "./journal-trades";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry, Sample } from "@/lib/model";
import { money } from "@/lib/model";
import {
  filterMoments,
  momentHeartRate,
  type MomentFilters,
} from "@/lib/journal-space";
import { noteTime, sectionName, sessionTrades } from "@/lib/journal-routing";
import { momentPnl } from "@/lib/journal-reference";
import { phaseColors } from "@/lib/phase-colors";
import { detectHrMoments } from "@/lib/smart-journal";
import InlineMoment from "./inline-moment";
import Writing from "./writing";
import Destination from "./destination";
import FinalReviewChart from "./final-review-chart";
import EvidenceImage from "./evidence-image";
import IdeaGrouping from "./idea-grouping";
import PnlTimeline from "./pnl-timeline";
import ReferenceContext from "./reference-context";
import { AudioPlayback } from "../reflection-audio";
import { cx, time, type Props, type Moment } from "./shared";

const empty: MomentFilters = { search: "", trade: "", stage: "", capture: "" };
export default function JournalSpace({
  props,
  session,
  samples,
  selected,
  reveal,
  timezone,
  onSelect,
  onReview,
}: {
  props: Props;
  session: Props["session"];
  samples: Sample[];
  selected: Moment | null;
  reveal?: { section: JournalEntry["section"]; tradeId: string };
  timezone: string;
  onSelect: (m: Moment | null) => void;
  onReview: () => void;
}) {
  const [filters, setFilters] = useState(empty),
    [status, setStatus] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false),
    [reviewText, setReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const companion = useRef<HTMLElement>(null);
  useEffect(() => {
    if (companion.current) companion.current.scrollTop = 0;
  }, [selected?.id]);
  const trades = sessionTrades(session),
    p = props.pulse;
  const displayTime = (t: number) => time(t, true, timezone);
  useEffect(() => {
    setFilters(empty);
    setStatus("");
    setReviewText("");
  }, [session.id]);
  useEffect(() => {
    if (reveal || selected?.note) setFilters(empty);
  }, [reveal, selected?.id]);
  const notes = filterMoments(session, filters);
  const all = session.journal.filter((n) => !n.deletedAt);
  const highlighted = new Set(reveal ? all.filter(n=>{
    const trade=trades.find(t=>t.id===reveal.tradeId);
    return n.section===reveal.section && (n.tradeId===reveal.tradeId || (!!n.tradeId && !!trade?.entryIds.includes(n.tradeId)));
  }).map(n=>n.id) : []);
  // A chart marker can point at an unassigned live capture. Highlight that
  // source moment without silently assigning it to a trade or stage.
  if(reveal && selected?.note && all.some(n=>n.id===selected.note!.id))highlighted.add(selected.note.id);
  useEffect(()=>{
    if(!reveal)return;
    const first=[...highlighted][0];
    const frame=requestAnimationFrame(()=>{
      const target=(first ? document.getElementById(`moment-${first}`) : null) || document.querySelector<HTMLElement>('[aria-label="Journal moments"]');
      target?.scrollIntoView({behavior:"smooth",block:first?"center":"start"});
    });
    return()=>cancelAnimationFrame(frame);
  },[reveal]);
  const current = selected?.note
    ? session.journal.find((n) => n.id === selected.note!.id && !n.deletedAt)
    : undefined;
  const live = all.filter((n) => n.captureMode === "live").length;
  const unlabelled = all.filter((n) => !n.label || n.label === "Unlabelled");
  const rises = session.blueprint?.combine?.hr
    ? detectHrMoments(
        samples.filter(
          (n) =>
            n.quality !== "artifact" &&
            !session.blueprint?.measurementPauses?.some(
              (g) => n.t >= g.start && n.t <= (g.end ?? Infinity),
            ),
        ),
        {
          baselineSeconds: p.settings.baselineSeconds,
          threshold: props.threshold,
        },
      ).slice(0, 2)
    : [];
  function pick(note: JournalEntry) {
    onSelect({
      id: note.id,
      t: noteTime(note) ?? note.t,
      note,
      phase: note.section || "REFLECTION",
      label: note.label,
      text: note.text,
      bpm: momentHeartRate(session, samples, note),
    });
  }
  function changeFilters(next:MomentFilters) {
    if(reveal)onSelect(null);
    setFilters(next);
  }
  async function patch(note: JournalEntry, change: Partial<JournalEntry>) {
    try {
      await p.saveJournalNote({ ...note, ...change });
      setStatus("Moment updated.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save. Try again.");
    }
  }
  return (
    <>
      <WorkspaceModule id="day-summary" title="Day summary" section="top" order={2} parts={[{id:"moments",title:"Journal moment count",selector:".ss-space-summary > span:nth-child(1)"},{id:"captures",title:"Live capture count",selector:".ss-space-summary > span:nth-child(2)"},{id:"trades",title:"Trade idea count",selector:".ss-space-summary > span:nth-child(3)"},{id:"hr",title:"Heart-rate measurement count",selector:".ss-space-summary > span:nth-child(4)"}]}><div className={cx("space-summary")}>
        <span>
          <strong>{all.length}</strong> journal moments
        </span>
        <span>
          <strong>{live}</strong> live captures
        </span>
        <span>
          <strong>{trades.length}</strong> trade ideas
        </span>
        <span>
          <strong>{samples.length}</strong> HR measurements
        </span>
      </div></WorkspaceModule>
      <div className={cx("journal-space")}>
        <section className={cx("space-writing")} aria-label="Journal moments">
          <WorkspaceModule id="moments" title="Journal moments" order={2} parts={[{id:"filters",title:"Search and filters",selector:".ss-space-filters"},{id:"origin",title:"Capture origin and stage",selector:".ss-inline-moment-head small"},{id:"evidence",title:"Evidence thumbnails",selector:".ss-space-thumb"}]}>
          <div className={cx("space-section-heading")}>
            <div>
              <h2>Your journal, moment by moment</h2>
              <small>
                {notes.filter((n) => !n.deletedAt).length} moments in this view
                · edits save when you leave a field
              </small>
            </div>
            <button
              onClick={() =>
                document
                  .getElementById("guided-reflection")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              ＋ Add moment
            </button>
          </div>
          <div className={cx("space-filters")}>
            <input
              aria-label="Search moments"
              placeholder="Search your words…"
              value={filters.search}
              onChange={(e) =>
                changeFilters({ ...filters, search: e.target.value })
              }
            />
            <JournalSelect
              aria-label="Filter trade"
              value={filters.trade}
              onChange={(e) =>
                changeFilters({ ...filters, trade: e.target.value })
              }
            >
              <option value="">All trades + session</option>
              {trades.map((t, i) => (
                <option key={t.id} value={t.id}>
                  Trade idea {i + 1} · {t.symbol}
                </option>
              ))}
              <option value="session">Session notes</option>
            </JournalSelect>
            <JournalSelect
              aria-label="Filter stage"
              value={filters.stage}
              onChange={(e) =>
                changeFilters({ ...filters, stage: e.target.value })
              }
            >
              <option value="">All stages</option>
              {[
                "before",
                "entry",
                "management",
                "exit",
                "after",
                "day-review",
              ].map((s) => (
                <option key={s} value={s}>
                  {sectionName(s as JournalEntry["section"])}
                </option>
              ))}
              <option value="unassigned">No stage</option>
            </JournalSelect>
            <JournalSelect
              aria-label="Filter capture origin"
              value={filters.capture}
              onChange={(e) =>
                changeFilters({ ...filters, capture: e.target.value })
              }
            >
              <option value="">Live + later</option>
              <option value="live">Live captures</option>
              <option value="later">Later reflections</option>
              <option value="unlabelled">Needs a label</option>
            </JournalSelect>
          </div>
          {reveal && <div className={cx("log-highlight-notice")} role="status" style={{color:phaseColors[reveal.section || "reflection"]}}><span>{highlighted.size ? `${sectionName(reveal.section)} highlighted · all moments remain visible` : `No saved ${sectionName(reveal.section).toLowerCase()} moments for this trade yet · all moments remain visible`}</span><button onClick={()=>onSelect(null)}>Clear highlight</button></div>}
          <div className={cx("space-moments")}>
            {notes.map((n) => (
              <InlineMoment
                key={n.id}
                note={n}
                session={session}
                onSave={p.saveJournalNote}
                onSelect={pick}
                selected={current?.id === n.id || highlighted.has(n.id)}
                highlightColor={reveal && highlighted.has(n.id) ? phaseColors[reveal.section || "reflection"] : undefined}
                bpm={momentHeartRate(session, samples, n)}
                timezone={timezone}
              />
            ))}
            {!notes.length && (
              <div className={cx("space-empty")}>
                <p>
                  {all.length
                    ? "No moments match these filters."
                    : "Your words, recordings and chart captures will appear here. No trade or stage is required."}
                </p>
                {all.length > 0 && (
                  <button onClick={() => setFilters(empty)}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
          </WorkspaceModule>
          <WorkspaceModule id="writing" title="Write a reflection" order={3} parts={[{id:"prompt",title:"Reflection prompt",selector:".ss-reference-composer-head"},{id:"timing",title:"Linked time controls",selector:".ss-time-link"}]}><div id="guided-reflection">
            <Writing
              key={session.id}
              session={session}
              time={p.now}
              samples={samples}
              labels={p.settings.phaseLabels}
              selection={reveal}
              onSave={p.addNote}
              onReflect={props.onReflect}
              timezone={timezone}
            />
          </div></WorkspaceModule>
          <WorkspaceModule id="intentions" title="Review your intentions" order={4} parts={[{id:"links",title:"Related review links",selector:".ss-space-review-links"},{id:"intention",title:"Original intention",selector:".ss-intention-review .ss-space-section-heading p"}]}><section className={cx("space-card", "intention-review")}>
            <div className={cx("space-section-heading")}>
              <div>
                <h3>Return to your intentions</h3>
                <p>
                  {session.blueprint?.plan?.intention ||
                    session.blueprint?.context?.intention ||
                    "What did you intend? What happened? What would you keep or change?"}
                </p>
              </div>
              <button
                onClick={() => setReviewOpen(!reviewOpen)}
                aria-expanded={reviewOpen}
              >
                Review the day {reviewOpen ? "↑" : "↓"}
              </button>
            </div>
            {reviewOpen && (
              <div>
                {(session.blueprint?.commitments || []).map((c) => (
                  <label key={c.id}>
                    {c.rule}
                    <JournalSelect
                      aria-label={`Review commitment: ${c.rule}`}
                      value={c.result}
                      onChange={async (e) => {
                        const result = e.target.value as typeof c.result;
                        try {
                          await p.updateBlueprint({
                            commitments: session.blueprint!.commitments!.map(
                              (x) =>
                                x.id === c.id
                                  ? { ...x, result, assessedAt: Date.now() }
                                  : x,
                            ),
                          });
                        } catch (err) {
                          setStatus((err as Error).message);
                        }
                      }}
                    >
                      <option value="pending">Not reviewed yet</option>
                      <option value="followed">Followed</option>
                      <option value="deviated">Deviated</option>
                    </JournalSelect>
                  </label>
                ))}
                <textarea
                  aria-label="Day review reflection"
                  placeholder="What helped, or what would you try next time?"
                  value={reviewText}
                  maxLength={2000}
                  onChange={(e) => setReviewText(e.target.value)}
                />
                <p>Noticing what happened is useful, whatever the result.</p>
                <button
                  disabled={reviewBusy || !reviewText.trim()}
                  onClick={async () => {
                    setReviewBusy(true);
                    try {
                      await p.addNote({
                        id: crypto.randomUUID(),
                        t: Date.now(),
                        eventTime: null,
                        text: reviewText,
                        label: "Unlabelled",
                        section: "day-review",
                        captureMode: "post-session",
                        origin: "free-writing",
                        source: "typed",
                      });
                      setReviewText("");
                      setReviewOpen(false);
                      setStatus("Day review saved to your journal.");
                    } catch (e) {
                      setStatus((e as Error).message);
                    } finally {
                      setReviewBusy(false);
                    }
                  }}
                >
                  Save review
                </button>
              </div>
            )}
            <div className={cx("space-review-links")}>
              <button onClick={onReview}>Mindful trade review →</button>
              <button onClick={() => props.onPage("Patterns")}>
                View today in Patterns →
              </button>
            </div>
          </section></WorkspaceModule>
          {!!session.blueprint?.dailyWriting && (
            <WorkspaceModule id="previous-writing" title="Previous day writing" section="bottom"><details className={cx("space-card")}>
              <summary>Previous day writing</summary>
              <p>{session.blueprint.dailyWriting}</p>
            </details></WorkspaceModule>
          )}
          <WorkspaceModule id="session-context" title="Session context" section="bottom" initiallyHidden><ReferenceContext {...props} compact /></WorkspaceModule>
          <WorkspaceModule id="execution-grouping" title="Execution grouping" section="bottom" initiallyHidden><IdeaGrouping session={session} onSave={p.updateBlueprint} /></WorkspaceModule>
          <WorkspaceModule id="pnl-timeline" title="P&amp;L sources and timeline" section="bottom" initiallyHidden><PnlTimeline
              session={session}
              samples={samples}
              onSave={p.updateBlueprint}
            /></WorkspaceModule>
          <p className={cx("space-status")} role="status">
            {status}
          </p>
        </section>
        <aside
          ref={companion}
          className={cx("space-companion")}
          aria-label="Evidence and session observations"
        >
          <WorkspaceModule id="evidence" title="Moment evidence" section="side" order={1} parts={[{id:"images",title:"Chart images",selector:".ss-space-evidence img"},{id:"transcript",title:"Original transcript",selector:".ss-space-evidence > details"},{id:"destination",title:"Stage and trade controls",selector:".ss-space-evidence .ss-destinations"}]}>{current ? (
            <section
              className={cx("space-card", "space-evidence")}
              aria-label="Selected moment evidence"
            >
              <div className={cx("space-section-heading")}>
                <div>
                  <small>SELECTED MOMENT</small>
                  <h3>
                    {noteTime(current) === null
                      ? "Session reflection"
                      : displayTime(noteTime(current)!)}{" "}
                    ·{" "}
                    {current.label === "Unlabelled"
                      ? "No label yet"
                      : current.label}
                  </h3>
                </div>
                <button
                  aria-label="Close evidence"
                  onClick={() => onSelect(null)}
                >
                  ×
                </button>
              </div>
              <p>{current.text || "No writing added yet."}</p>
              {current.capture?.imagePath && (
                <EvidenceImage
                  path={current.capture.imagePath}
                  owner={session.owner}
                />
              )}
              {current.screenshot && (
                <EvidenceImage {...current.screenshot} owner={session.owner} />
              )}
              {!current.capture?.imagePath && !current.screenshot && (
                <p className={cx("space-missing")}>
                  {current.capture?.imageMissing ||
                    "No chart image attached to this moment."}
                </p>
              )}
              {current.audio && (
                <AudioPlayback
                  owner={session.owner}
                  audio={current.audio}
                  onDelete={() => patch(current, { audio: undefined })}
                />
              )}
              <details>
                <summary>
                  Original transcript ·{" "}
                  {current.transcriptStatus || "not recorded"}
                </summary>
                <blockquote>
                  {current.originalTranscript ||
                    "No original transcript available. Your edited writing is separate."}
                </blockquote>
              </details>
              <small>
                {noteTime(current) === null
                  ? "Session scope · no arbitrary HR match"
                  : `${momentHeartRate(session, samples, current) ?? "No measured"} BPM at linked time`}
                {(() => {
                  const point = momentPnl(session, current);
                  return point
                    ? ` · Open P&L ${point.unrealised === undefined ? "unavailable" : money(point.unrealised, point.currency)}`
                    : " · P&L unavailable";
                })()}
              </small>
              <Destination
                timezone={timezone}
                session={session}
                section={current.section}
                tradeId={current.tradeId || ""}
                custom={current.customSection || ""}
                onSection={(section) => void patch(current, { section })}
                onTrade={(tradeId) =>
                  void patch(current, { tradeId: tradeId || undefined })
                }
                onCustom={(customSection) =>
                  void patch(current, { customSection })
                }
              />
              <small>
                Captured {displayTime(current.capturedAt ?? current.t)}
                {current.updatedAt
                  ? ` · edited ${displayTime(current.updatedAt)}`
                  : ""}
              </small>
              <button
                onClick={() => {
                  document
                    .getElementById("guided-reflection")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Add another reflection below
              </button>
            </section>
          ) : <section className={cx("space-card")}><h3>Moment evidence</h3><p>Select a journal moment to see its chart image, audio, transcript and linked context here.</p></section>}</WorkspaceModule>
          <WorkspaceModule id="observations" title="Session observations" section="side" order={2} parts={[{id:"context",title:"Recorded observations",selector:".ss-space-observation"},{id:"explanation",title:"Supporting explanation",selector:".ss-space-observations > p"}]}><section
            className={cx("space-card", "space-observations")}
            aria-label="Session observations"
          >
            <div className={cx("eyebrow")}>Alongside your words</div>
            <h3>A few things to revisit</h3>
            {rises.map((m) => (
              <div className={cx("space-observation")} key={m.id}>
                <b>Recorded heart-rate change · {displayTime(m.t)}</b>
                <p>
                  A measured change in this recording. What was happening here?
                </p>
                <button
                  onClick={() =>
                    onSelect({
                      id: m.id,
                      t: m.t,
                      label: "Recorded change",
                      text: "",
                      phase: "MOMENT",
                      bpm: m.peak,
                    })
                  }
                >
                  Highlight on chart →
                </button>
              </div>
            ))}
            {unlabelled.length > 0 && (
              <div className={cx("space-observation")}>
                <b>{unlabelled.length} moments without a label</b>
                <p>
                  Your original words and evidence are kept. Add a feeling when
                  it helps.
                </p>
                <button
                  onClick={() =>
                    setFilters({ ...empty, capture: "unlabelled" })
                  }
                >
                  Show these moments →
                </button>
              </div>
            )}
            <div className={cx("space-observation")}>
              <b>Session context</b>
              <p>
                {session.blueprint?.environmentHistory?.at(-1)?.location ||
                  "No environment recorded yet."}{" "}
                · {samples.length} HR measurements · {all.length} moments.
              </p>
              <button onClick={() => props.onPage("Prepare")}>
                Return to intentions →
              </button>
            </div>
            {!rises.length && (
              <p>
                More recordings may support comparisons. No emotional state is
                inferred from heart rate.
              </p>
            )}
          </section></WorkspaceModule>
          <WorkspaceModule id="review-chart" title="Final review chart" section="side" order={3}><FinalReviewChart
            session={props.session}
            ideaId="day"
            onSave={p.updateBlueprint}
            prepare={p.prepareScreenshot}
          /></WorkspaceModule>
          <WorkspaceModule id="label-summary" title="Your day in labels" section="side" initiallyHidden><DayLabelSummary session={session} /></WorkspaceModule>
          <WorkspaceModule id="stage-labels" title="Your stage suggestions" section="side" initiallyHidden><StageLabelModule onSettings={() => props.onPage("Settings")} /></WorkspaceModule>
          <WorkspaceModule id="trade-activity" title="Trade activity and stage notes" section="main" initiallyHidden><JournalTrades session={session} samples={samples} onReflect={props.onReflect} onEdit={note => props.onReflect({ t: note.t, entry: note })} onSelect={(id, phase, t) => onSelect({ id, t: t ?? session.startedAt, phase: phase.toUpperCase(), label: sectionName(phase), text: "", bpm: null })} onInspect={props.onSelectTrade} onSaveNote={p.saveJournalNote} onSaveBlueprint={p.updateBlueprint} prepareScreenshot={p.prepareScreenshot} /></WorkspaceModule>
        </aside>
      </div>
    </>
  );
}

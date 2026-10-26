"use client";
import PrivateImage from "../private-image";
import InlineMoment from "./inline-moment";
import { useMemo } from "react";
import type { JournalEntry, Sample, Session, TradeEvent } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import { Screenshot } from "../reflection-editor";
import {
  journalPhaseLink,
  journalTradeGroups,
  type TradePhase,
} from "@/lib/journal-phases";
import { destination, noteTime, sectionName } from "@/lib/journal-routing";
import { journalSources } from "@/lib/journal-collection";
import { cx, time } from "./shared";
import FinalReviewChart from "./final-review-chart";
import type { SessionBlueprint } from "@/lib/blueprint-schema";

export default function JournalTrades({
  session,
  samples,
  onReflect,
  onEdit,
  onSelect,
  onInspect,
  account = "",
  instrument = "",
  onSaveNote,
  onSaveBlueprint,
  prepareScreenshot,
}: {
  session: Session;
  samples: Sample[];
  onReflect: (draft: ReflectionDraft) => void;
  onEdit: (note: JournalEntry) => void;
  onSelect: (tradeId: string, phase: TradePhase, t: number | null) => void;
  onInspect: (event: TradeEvent) => void;
  account?: string;
  instrument?: string;
  onSaveNote?: (n: JournalEntry) => Promise<void>;
  onSaveBlueprint?: (p: Partial<SessionBlueprint>) => Promise<void>;
  prepareScreenshot?: (t: number) => Promise<string>;
}) {
  const groups = useMemo(() => journalTradeGroups(session), [session]);
  const covered = new Set(groups.trades.flatMap((g) => g.trade.fillIds));
  const matches = (e: TradeEvent) =>
    (!account || (e.broker?.accountId || e.account || "manual") === account) &&
    (!instrument || (e.instrument?.id || e.symbol) === instrument);
  const unmatched = session.events.filter(
    (e) => !e.voided && !covered.has(e.id) && matches(e),
  );
  return (
    <div className={cx("journal-trades")} aria-label="Trade journal sequence">
      {groups.trades.map(({ trade, phases }, index) =>
        phases.some((p) => p.executions.some(matches)) ? (
          <details
            key={trade.id}
            open={index === 0}
            className={cx("journey-card", "journal-trade")}
          >
            <summary className={cx("journey-card-head")}>
              <div>
                <span className={cx("eyebrow")}>
                  Trade idea {index + 1} · {trade.fillIds.length} fills
                  {trade.incomplete ? " · incomplete position" : ""}
                </span>
                <h3>
                  {trade.symbol} <small>{trade.side}</small>
                </h3>
              </div>
              <span className={cx("journey-date")}>
                Entry{" "}
                {session.events.find((e) => e.id === trade.entryEventId)
                  ?.timePrecision === "day"
                  ? "Date only"
                  : time(trade.entry)}
                <br />
                Exit{" "}
                {trade.exit === undefined
                  ? "Open position"
                  : session.events.find((e) => e.id === trade.exitEventId)
                        ?.timePrecision === "day"
                    ? "Date only"
                    : time(trade.exit)}{" "}
                · ⌄
              </span>
            </summary>
            <div className={cx("journey-stages", "compact-stages")}>
              {phases.map(({ phase, notes, executions }) => {
                const link = journalPhaseLink(
                  session,
                  trade.id,
                  phase,
                  samples,
                  Date.now(),
                  trade,
                );
                return (
                  <details
                    key={phase}
                    className={cx("journey-stage")}
                    data-phase={phase}
                    aria-label={`Trade ${index + 1} ${sectionName(phase)}`}
                  >
                    <summary className={cx("journey-stage-head")}>
                      <span>{sectionName(phase)}</span>
                      <strong>
                        {link?.bpm ?? "—"}{" "}
                        <small>{link?.bpm == null ? "no HR" : "BPM"}</small>
                      </strong>
                      <small>
                        {notes.length} notes · {executions.length} fills
                      </small>
                      <p>{notes[0]?.text.slice(0, 70) || "Open to reflect"}</p>
                    </summary>
                    <p className={cx("journey-sample-note")}>
                      {!link
                        ? "No linked time yet"
                        : link.start === link.end
                          ? time(link.t)
                          : `${time(link.start)}–${time(link.end)} · ${link.sampleCount} recorded HR samples`}
                    </p>
                    {executions.map((event) => (
                      <div key={event.id} className={cx("journal-execution")}>
                        <span>
                          {event.source === "csv"
                            ? "Imported execution"
                            : "Recorded execution"}{" "}
                          · {event.quantity} @ {event.price}
                        </span>
                        {(() => {
                          const frame = session.blueprint?.chartFrames
                            ?.filter((f) => f.t <= event.t)
                            .sort((a, b) => b.t - a.t)[0];
                          return frame ? (
                            <details>
                              <summary>
                                Stored chart · {time(frame.t)} ·{" "}
                                {Math.round((event.t - frame.t) / 1000)}s before
                                execution
                              </summary>
                              <PrivateImage
                                path={frame.path}
                                owner={session.owner}
                              />
                              <small>
                                This periodic frame is the actual stored view,
                                not a tick replay.
                              </small>
                            </details>
                          ) : null;
                        })()}
                        <button
                          className={cx("textlink")}
                          onClick={() => onInspect(event)}
                        >
                          Inspect
                        </button>
                      </div>
                    ))}
                    <div className={cx("journey-notes")}>
                      {notes.map((note) => (
                        <InlineMoment
                          key={note.id}
                          note={note}
                          session={session}
                          onSave={
                            onSaveNote ||
                            (async () => {
                              throw Error("Saving unavailable");
                            })
                          }
                          onEdit={onEdit}
                        />
                      ))}
                    </div>
                    <div className={cx("journal-phase-actions")}>
                      <button
                        className={cx("ghost")}
                        onClick={() =>
                          onSelect(trade.id, phase, link?.t ?? null)
                        }
                      >
                        Select phase
                      </button>
                      <button
                        className={cx("ghost")}
                        onClick={() =>
                          onReflect({
                            t: link?.t ?? session.startedAt,
                            eventTime: link?.t ?? null,
                            section: phase,
                            tradeId: trade.id,
                            origin: "timeline",
                          })
                        }
                      >
                        Write / add screenshot
                      </button>
                      <button
                        className={cx("ghost")}
                        onClick={() =>
                          onReflect({
                            t: link?.t ?? session.startedAt,
                            eventTime: link?.t ?? null,
                            section: phase,
                            tradeId: trade.id,
                            origin: "timeline",
                            source: "voice",
                            autoListen: true,
                          })
                        }
                      >
                        Speak
                      </button>
                    </div>
                  </details>
                );
              })}
            </div>
            {onSaveBlueprint && prepareScreenshot && (
              <FinalReviewChart
                session={session}
                ideaId={trade.id}
                onSave={onSaveBlueprint}
                prepare={prepareScreenshot}
              />
            )}
          </details>
        ) : null,
      )}
      {!!unmatched.length && (
        <details className={cx("journal-day-notes")}>
          <summary>Other session executions · {unmatched.length}</summary>
          {unmatched.map((event) => (
            <p key={event.id}>
              {event.symbol} ·{" "}
              {event.timePrecision === "day" ? "Date only" : time(event.t)} ·{" "}
              {event.kind} · {event.quantity} @ {event.price}{" "}
              <button
                className={cx("textlink")}
                onClick={() => onInspect(event)}
              >
                Inspect execution
              </button>
            </p>
          ))}
        </details>
      )}
      {!groups.trades.length && (
        <p className={cx("empty-note")}>
          No trades in this day. Your day-level writing is available in My
          journal.
        </p>
      )}
    </div>
  );
}

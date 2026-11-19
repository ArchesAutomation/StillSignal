"use client";
import { useChat } from "@ai-sdk/react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useEffect, useRef, useState } from "react";
import {
  doneHistory,
  journalHistory,
  journalPeriod,
  type DoneHistory,
  type JournalHistory,
  type JournalReadEntry,
} from "@/lib/assistant-journal";
import { JOURNAL_LINK_EVENT, openAssistantLink, type AssistantLink } from "@/lib/assistant-links";
import {
  sessionHistory,
  stillnessPractices,
  type SessionHistory,
  type StillnessPractices,
  type TradeRow,
} from "@/lib/assistant-screens";
import {
  DONE_TOOL,
  JOURNAL_TOOL,
  NO_READS,
  PREPARATION_TOOL,
  SESSIONS_TOOL,
  STILLNESS_TOOL,
  SUPPORT_HISTORY_TOOL,
  type AssistantReads,
} from "@/lib/assistant-tool";
import { cloudConfigured } from "@/lib/cloud";
import { dateInZone } from "@/lib/process/model";
import { PeriodError, resolvePeriod } from "@/lib/process/periods";
import {
  preparationForPeriod,
  type PreparationDay,
  type PreparationHistory,
  type PreparationStatus,
} from "@/lib/process/preparation-status";
import { readProcess } from "@/lib/process/storage";
import {
  supportHistory,
  type SupportDay,
  type SupportHistory,
  type SupportPractice,
} from "@/lib/process/support-history";
import { listSessions } from "@/lib/storage";
import "./preparation-assistant.css";

// The day timezone the app's screens use when they save and look up a day.
const dayTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
// Reads never sync, so a cloud account is reported as "not-checked".
const sync = () => (cloudConfigured ? "not-checked" : "local-only");

/**
 * Runs in the browser: only this account's records on this device, for the resolved dates.
 * The period is checked before anything is read, so a bad period never looks like a read failure.
 */
export async function readPreparation(
  owner: string,
  input: unknown = {},
  now = Date.now(),
  timezone = dayTimezone(),
) {
  resolvePeriod(input, dateInZone(now, timezone));
  return preparationForPeriod(await readProcess(owner), input, now, timezone, sync());
}

export async function readSupportHistory(
  owner: string,
  input: unknown = {},
  now = Date.now(),
  timezone = dayTimezone(),
) {
  resolvePeriod(input, dateInZone(now, timezone));
  return supportHistory(await readProcess(owner), input, now, timezone, sync());
}

export async function readJournal(
  owner: string,
  input: unknown = {},
  now = Date.now(),
  timezone = dayTimezone(),
) {
  journalPeriod(input, dateInZone(now, timezone));
  return journalHistory(await listSessions(owner), owner, input, now, timezone, sync());
}

export async function readDone(
  owner: string,
  input: unknown = {},
  now = Date.now(),
  timezone = dayTimezone(),
) {
  resolvePeriod(input, dateInZone(now, timezone));
  return doneHistory(await listSessions(owner), await readProcess(owner), owner, input, now, timezone, sync());
}

export async function readSessionHistory(
  owner: string,
  input: unknown = {},
  now = Date.now(),
  timezone = dayTimezone(),
) {
  const { symbol: _symbol, ...period } = (input ?? {}) as Record<string, unknown>;
  resolvePeriod(period, dateInZone(now, timezone));
  return sessionHistory(await listSessions(owner), owner, input, now, timezone, sync());
}

export async function readStillnessPractices(_owner: string, input: unknown = {}) {
  return stillnessPractices(input);
}

function OpenLink({ link, children }: { link: AssistantLink; children: string }) {
  return (
    <button type="button" className="ss-assistant-link" onClick={() => openAssistantLink(link)}>
      {children}
    </button>
  );
}
const Source = ({ children }: { children: string }) => <p className="ss-assistant-source">Source: {children}</p>;
/** Today has its own screen. A past day opens that day's Journal, which shows what was saved. */
const dayLink = (date: string, page: "Preparation" | "Done"): AssistantLink =>
  date === dateInZone(Date.now(), dayTimezone()) ? { page } : { date };

const periodSpan = (history: { from: string; to: string; label: string }) =>
  `${history.label.toUpperCase()} · ${history.from === history.to ? history.from : `${history.from} to ${history.to}`}`;

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PreparationDayRows({ day }: { day: PreparationDay }) {
  const rows: [string, string][] = [];
  if (day.arrival.length) rows.push(["Arriving", day.arrival.join(" · ")]);
  if (day.intention) rows.push(["Intention", day.intention]);
  if (day.boundary) rows.push(["Boundary", day.boundary]);
  if (day.homeFocus.length) rows.push(["Support you chose on Home", day.homeFocus.join(" · ")]);
  if (day.support.length) rows.push(["Stillness support for Preparation", day.support.map((item) => item.title).join(" · ")]);
  return (
    <li data-preparation-day={day.date}>
      <strong>
        {day.weekday} · {day.date}
      </strong>
      {rows.length ? <Rows rows={rows} /> : (
        <p>{day.recorded ? "Day saved · nothing recorded in Preparation." : "Nothing saved."}</p>
      )}
      {day.recorded && <OpenLink link={dayLink(day.date, "Preparation")}>Open this day</OpenLink>}
    </li>
  );
}

export function PreparationHistoryCard({ history }: { history: PreparationHistory }) {
  return (
    <section className="ss-assistant-card" aria-label="Preparation history" data-preparation-history>
      <small>PREPARATION · {periodSpan(history)}</small>
      {history.result === "empty" && <p>No Preparation was saved for these dates.</p>}
      {history.sync === "not-checked" && (
        <p>Read from this device without syncing. Days saved on another device may be missing.</p>
      )}
      <ol>
        {history.days.map((day) => (
          <PreparationDayRows key={day.date} day={day} />
        ))}
      </ol>
      <Source>Preparation saved on this device.</Source>
    </section>
  );
}

const practices = (items: SupportPractice[]) =>
  items.map((item) => `${item.title} (${item.kind})`).join(" · ");

function SupportDayRows({ day }: { day: SupportDay }) {
  const rows: [string, string][] = [];
  if (day.homeFocus.length) rows.push(["Chosen on Home", day.homeFocus.join(" · ")]);
  if (day.preparation.length) rows.push(["Added to Preparation", practices(day.preparation)]);
  if (day.done.length) rows.push(["Added to Done for the Day", practices(day.done)]);
  return (
    <li data-support-day={day.date}>
      <strong>
        {day.weekday} · {day.date}
      </strong>
      {rows.length ? <Rows rows={rows} /> : (
        <p>{day.saved ? "Day saved · no support chosen." : "Nothing saved."}</p>
      )}
      {day.saved && <OpenLink link={dayLink(day.date, "Preparation")}>Open this day</OpenLink>}
    </li>
  );
}

export function SupportHistoryCard({ history }: { history: SupportHistory }) {
  return (
    <section className="ss-assistant-card" aria-label="Support history" data-support-history>
      <small>SUPPORT · {periodSpan(history)}</small>
      {history.result === "empty" && <p>No support was saved for these dates.</p>}
      {history.sync === "not-checked" && (
        <p>Read from this device without syncing. Days saved on another device may be missing.</p>
      )}
      <ol>
        {history.days.map((day) => (
          <SupportDayRows key={day.date} day={day} />
        ))}
      </ol>
      {history.result === "found" && (
        <p className="ss-assistant-footnote">
          These are additions. Still Signal doesn’t record whether a practice was completed.
        </p>
      )}
      <Source>Home, Preparation and Done for the Day saved on this device.</Source>
    </section>
  );
}

function JournalEntryRow({ entry }: { entry: JournalReadEntry }) {
  const heading = [entry.kind, entry.time, entry.label].filter(Boolean).join(" · ");
  return (
    <article className="ss-assistant-entry" data-journal-entry>
      <small>{heading}</small>
      {entry.question && <p className="ss-assistant-footnote">{entry.question}</p>}
      <blockquote>{entry.text}</blockquote>
      <OpenLink link={entry.link}>Open in Journal</OpenLink>
    </article>
  );
}

const leftOut = (omitted: number) =>
  omitted > 0 && (
    <p className="ss-assistant-footnote">
      {omitted === 1 ? "1 earlier entry was" : `${omitted} earlier entries were`} left out. Ask about a shorter period to read {omitted === 1 ? "it" : "them"}.
    </p>
  );

export function JournalHistoryCard({ history }: { history: JournalHistory }) {
  return (
    <section className="ss-assistant-card" aria-label="Journal entries" data-journal-history>
      <small>JOURNAL · {periodSpan(history)}</small>
      {history.topic && <p className="ss-assistant-footnote">Entries using the words “{history.topic}”.</p>}
      {history.result === "empty" && <p>Nothing was written for these dates.</p>}
      {history.result === "no-match" && <p>No entries for these dates use those words. Related wording isn’t searched.</p>}
      {history.sync === "not-checked" && (
        <p>Read from this device without syncing. Days saved on another device may be missing.</p>
      )}
      <ol>
        {history.days.map((day) => (
          <li key={day.date} data-journal-day={day.date}>
            <strong>
              {day.weekday} · {day.date}
            </strong>
            {day.entries.map((entry) => (
              <JournalEntryRow key={`${entry.link.sessionId}:${entry.link.noteId ?? entry.kind}`} entry={entry} />
            ))}
          </li>
        ))}
      </ol>
      {leftOut(history.omitted)}
      <Source>Daily Journal entries saved on this device.</Source>
    </section>
  );
}

export function DoneHistoryCard({ history }: { history: DoneHistory }) {
  return (
    <section className="ss-assistant-card" aria-label="Done for the Day" data-done-history>
      <small>DONE FOR THE DAY · {periodSpan(history)}</small>
      {history.result === "empty" && <p>Nothing was saved in Done for the Day for these dates.</p>}
      {history.sync === "not-checked" && (
        <p>Read from this device without syncing. Days saved on another device may be missing.</p>
      )}
      <ol>
        {history.days.map((day) => (
          <li key={day.date} data-done-day={day.date}>
            <strong>
              {day.weekday} · {day.date}
            </strong>
            <Rows
              rows={[
                ["How the day turned out", day.outcome ?? empty],
                ["How you followed your plan", day.process ?? empty],
                ...(day.practices.length ? [["Added to Done for the Day", practices(day.practices)] as [string, string]] : []),
              ]}
            />
            {day.writing.map((entry) => (
              <JournalEntryRow key={`${entry.link.sessionId}:${entry.link.noteId ?? entry.kind}`} entry={entry} />
            ))}
            <OpenLink link={day.link}>{"page" in day.link ? "Open Done for the Day" : "Open this day"}</OpenLink>
          </li>
        ))}
      </ol>
      {leftOut(history.omitted)}
      {history.result === "found" && (
        <p className="ss-assistant-footnote">“What changed?” stays on the Done screen and isn’t saved.</p>
      )}
      <Source>Done for the Day and that day’s Journal, saved on this device.</Source>
    </section>
  );
}

const amounts = (rows: { text: string }[]) => rows.map((row) => row.text).join(" · ");

function TradeLine({ trade }: { trade: TradeRow }) {
  const times = trade.exitTime ? `${trade.entryTime}–${trade.exitTime}` : `${trade.entryTime} · open`;
  const prices = trade.exitPrice === null ? String(trade.entryPrice) : `${trade.entryPrice} → ${trade.exitPrice}`;
  return (
    <li data-trade={trade.symbol}>
      <strong>
        {trade.symbol} · {trade.side} {trade.quantity}
      </strong>
      <span>
        {times} · {prices}
      </span>
      <span>{trade.pnl?.text ?? "P&L not recorded"}</span>
      <small>{trade.source}</small>
    </li>
  );
}

export function SessionHistoryCard({ history }: { history: SessionHistory }) {
  const { totals } = history;
  const rows: [string, string][] = [
    ["Recordings", String(totals.recordings)],
    ["Orders executed", String(totals.orders)],
    ["Closed trades", String(totals.closedTrades)],
  ];
  if (totals.realised.length) rows.push(["Realised P&L", amounts(totals.realised)]);
  if (totals.winRate !== null)
    rows.push(["Win rate", `${totals.winRate} of ${totals.completedWithKnownPnl} closed with recorded P&L`]);
  return (
    <section className="ss-assistant-card" aria-label="Saved sessions" data-session-history>
      <small>
        SESSIONS · {periodSpan(history)}
        {history.symbol ? ` · ${history.symbol}` : ""}
      </small>
      {history.result === "empty" && <p>No sessions were saved for these dates.</p>}
      {history.result === "no-match" && <p>No trades for {history.symbol} were saved for these dates.</p>}
      {history.sync === "not-checked" && (
        <p>Read from this device without syncing. Days saved on another device may be missing.</p>
      )}
      {history.result === "found" && <Rows rows={rows} />}
      <ol>
        {history.days.map((day) => (
          <li key={day.date} data-session-day={day.date}>
            <strong>
              {day.weekday} · {day.date}
            </strong>
            <p>
              {day.recordings} recording{day.recordings === 1 ? "" : "s"} · {day.orders} order{day.orders === 1 ? "" : "s"} ·{" "}
              {day.closedTrades} closed{day.realised.length ? ` · ${amounts(day.realised)}` : ""}
            </p>
            {!!day.trades.length && (
              <ul className="ss-assistant-trades">
                {day.trades.map((trade, index) => (
                  <TradeLine key={`${trade.symbol}:${trade.entryTime}:${index}`} trade={trade} />
                ))}
              </ul>
            )}
            {day.sessions.map((session, index) => (
              <OpenLink key={index} link={session.link}>
                {`Open ${session.start} recording`}
              </OpenLink>
            ))}
          </li>
        ))}
      </ol>
      {history.omittedTrades > 0 && (
        <p className="ss-assistant-footnote">
          {history.omittedTrades} earlier trade{history.omittedTrades === 1 ? " is" : "s are"} not listed but count in the totals.
        </p>
      )}
      <OpenLink link={{ page: "Sessions" }}>Open Saved sessions</OpenLink>
      <Source>Saved sessions and recorded executions on this device. Realised P&L is as recorded.</Source>
    </section>
  );
}

export function StillnessPracticesCard({ result }: { result: StillnessPractices }) {
  return (
    <section className="ss-assistant-card" aria-label="Stillness practices" data-stillness-practices>
      <small>STILLNESS LIBRARY</small>
      {result.result === "no-match" && <p>No practices in the library match that.</p>}
      <ol>
        {result.practices.map((practice) => (
          <li key={practice.name} data-practice={practice.name}>
            <strong>{practice.name}</strong>
            <p className="ss-assistant-footnote">
              {practice.kind} · {practice.duration} · {practice.focus.join(" · ")}
            </p>
            <p>{practice.description}</p>
            <OpenLink link={practice.link}>Open in Stillness</OpenLink>
          </li>
        ))}
      </ol>
      {result.omitted > 0 && <p className="ss-assistant-footnote">{result.omitted} more match. Narrow the question to see them.</p>}
      <Source>Still Signal’s Stillness library.</Source>
    </section>
  );
}

const empty = "Not recorded";
export function PreparationStatusCard({ status }: { status: PreparationStatus }) {
  const rows: [string, string][] = [
    ["Arriving", status.arrival.join(" · ") || empty],
    ["Intention", status.intention || empty],
    ["Boundary", status.boundary || empty],
    ["Support you chose on Home", status.homeFocus.join(" · ") || empty],
    ["Stillness support for today", status.support.map((item) => item.title).join(" · ") || "Nothing added for today."],
  ];
  return (
    <section className="ss-assistant-card" aria-label="Preparation status" data-preparation-status>
      <small>PREPARATION · {status.date}</small>
      {!status.recorded && <p>Nothing saved in Preparation for today.</p>}
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <OpenLink link={{ page: "Preparation" }}>Open Preparation</OpenLink>
      <Source>Preparation saved on this device.</Source>
    </section>
  );
}

function PreparationTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading saved Preparation…</p>;
  return "days" in (result as object)
    ? <PreparationHistoryCard history={result as PreparationHistory} />
    : <PreparationStatusCard status={result as PreparationStatus} />;
}

function SupportHistoryTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading saved support…</p>;
  return <SupportHistoryCard history={result as SupportHistory} />;
}

function JournalTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading your journal…</p>;
  return <JournalHistoryCard history={result as JournalHistory} />;
}

function DoneTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading Done for the Day…</p>;
  return <DoneHistoryCard history={result as DoneHistory} />;
}

function SessionsTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading saved sessions…</p>;
  return <SessionHistoryCard history={result as SessionHistory} />;
}

function StillnessTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Looking through the Stillness library…</p>;
  return <StillnessPracticesCard result={result as StillnessPractices} />;
}

const parts = {
  tools: {
    by_name: {
      [PREPARATION_TOOL]: PreparationTool,
      [SUPPORT_HISTORY_TOOL]: SupportHistoryTool,
      [JOURNAL_TOOL]: JournalTool,
      [DONE_TOOL]: DoneTool,
      [SESSIONS_TOOL]: SessionsTool,
      [STILLNESS_TOOL]: StillnessTool,
    },
  },
};
function UserMessage() {
  return (
    <MessagePrimitive.Root className="ss-assistant-message" data-role="user">
      <MessagePrimitive.Parts components={parts} />
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="ss-assistant-message" data-role="assistant">
      <MessagePrimitive.Parts components={parts} />
    </MessagePrimitive.Root>
  );
}

/**
 * AI SDK chat messages as assistant-ui messages: text, plus tool calls with their results.
 * (@assistant-ui/ai-sdk is not used: its MCP helpers cannot be bundled for the Worker.)
 */
export function toThreadMessage(message: UIMessage): ThreadMessageLike {
  const content: Exclude<ThreadMessageLike["content"], string>[number][] = [];
  for (const part of message.parts) {
    if (part.type === "text") content.push({ type: "text", text: part.text });
    else if (part.type.startsWith("tool-") && "toolCallId" in part) {
      content.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.type.slice(5),
        args: {},
        result:
          part.state === "output-available"
            ? part.output
            : part.state === "output-error"
              ? part.errorText
              : undefined,
        isError: part.state === "output-error" || undefined,
      });
    }
  }
  return { id: message.id, role: message.role, content };
}

const textOf = (message: AppendMessage) =>
  message.content.map((part) => (part.type === "text" ? part.text : "")).join("").trim();

/** Error text from the route or the stream. Never includes request details or keys. */
export function assistantError(error: Error | undefined) {
  if (!error) return "";
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {}
  return error.message || "The assistant could not answer. Try again.";
}

type ToolAnswer =
  | { tool: string; output: unknown }
  | { state: "output-error"; tool: string; errorText: string };

/**
 * Answers a read-only tool call from this device's records. Unknown tools are left unanswered.
 * An unsupported period, a failed read and an empty result are reported differently.
 */
export async function answerTool(
  owner: string,
  tool: string,
  input: unknown,
  read: {
    preparation: (owner: string, input: unknown) => Promise<unknown>;
    support: (owner: string, input: unknown) => Promise<unknown>;
    journal?: (owner: string, input: unknown) => Promise<unknown>;
    done?: (owner: string, input: unknown) => Promise<unknown>;
    sessions?: (owner: string, input: unknown) => Promise<unknown>;
    stillness?: (owner: string, input: unknown) => Promise<unknown>;
  } = {
    preparation: readPreparation,
    support: readSupportHistory,
    journal: readJournal,
    done: readDone,
    sessions: readSessionHistory,
    stillness: readStillnessPractices,
  },
  /** These records are read only when the server has said this account may use them. */
  allowed: AssistantReads = NO_READS,
): Promise<ToolAnswer | undefined> {
  const journalRead = tool === JOURNAL_TOOL || tool === DONE_TOOL;
  if (
    (journalRead && !allowed.journal) ||
    (tool === SESSIONS_TOOL && !allowed.trades) ||
    (tool === STILLNESS_TOOL && !allowed.stillness)
  )
    return { state: "output-error", tool, errorText: "That reading isn’t turned on for this account." };
  const reader =
    tool === PREPARATION_TOOL
      ? read.preparation
      : tool === SUPPORT_HISTORY_TOOL
        ? read.support
        : tool === JOURNAL_TOOL
          ? read.journal
          : tool === DONE_TOOL
            ? read.done
            : tool === SESSIONS_TOOL
              ? read.sessions
              : tool === STILLNESS_TOOL
                ? read.stillness
                : undefined;
  if (!reader) return;
  try {
    return { tool, output: await reader(owner, input) };
  } catch (error) {
    if (error instanceof PeriodError) return { state: "output-error", tool, errorText: error.message };
    return {
      state: "output-error",
      tool,
      errorText:
        tool === PREPARATION_TOOL
          ? "Preparation could not be read on this device, so this is not an empty result. Try again."
          : journalRead
            ? "Your journal could not be read on this device, so this is not an empty result. Try again."
            : tool === SESSIONS_TOOL
              ? "Saved sessions could not be read on this device, so this is not an empty result. Try again."
              : "Saved support could not be read on this device, so this is not an empty result. Try again.",
    };
  }
}

// A question needs one read. The allowance covers a model correcting itself, without letting it loop.
const MAX_TOOL_CALLS = 3;

/** Continues after a tool answer, but never after a call the server rejected. */
export function continueAfterTools(options: Parameters<typeof lastAssistantMessageIsCompleteWithToolCalls>[0]) {
  const parts = options.messages.at(-1)?.parts ?? [];
  return (
    lastAssistantMessageIsCompleteWithToolCalls(options) &&
    !parts.some((part) => part.type === "dynamic-tool") &&
    parts.filter((part) => part.type.startsWith("tool-")).length <= MAX_TOOL_CALLS
  );
}

/** Says exactly which records this account's assistant reads and what leaves the device. */
export function pilotDisclosure(reads: AssistantReads) {
  const records = [
    "Preparation",
    "support",
    ...(reads.journal ? ["Daily Journal", "Done for the Day"] : []),
    ...(reads.trades ? ["saved sessions and trades"] : []),
  ];
  const list = `${records.slice(0, -1).join(", ")} and ${records.at(-1)}`;
  const sent = [...(reads.journal ? ["your journal words"] : []), ...(reads.trades ? ["recorded prices and P&L"] : [])];
  const library = reads.stillness ? " It can also suggest practices from the Stillness library." : "";
  if (!sent.length) return `Reads ${list} saved on this device, and sends what it reads to OpenRouter to write the answer.${library} It can’t change anything.`;
  return `Reads ${list} on this device. What it reads, including ${sent.join(" and ")}, goes to OpenRouter to write the answer.${library} It can’t change anything.`;
}

export default function PreparationAssistant({
  owner,
  pilotHeaders,
  reads = NO_READS,
}: {
  owner: string;
  /** Present only for a signed-in pilot account. Supplies a current session token per request. */
  pilotHeaders?: () => Promise<Record<string, string>>;
  /** The extra records the server has allowed this account to read. */
  reads?: AssistantReads;
}) {
  const [open, setOpen] = useState(false);
  // On a narrow screen the panel would cover the entry a card has just opened.
  useEffect(() => {
    const close = () => {
      if (window.matchMedia("(max-width: 760px)").matches) setOpen(false);
    };
    window.addEventListener(JOURNAL_LINK_EVENT, close);
    return () => window.removeEventListener(JOURNAL_LINK_EVENT, close);
  }, []);
  const output = useRef<ReturnType<typeof useChat>["addToolOutput"]>(undefined);
  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant", headers: pilotHeaders }),
    sendAutomaticallyWhen: continueAfterTools,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.dynamic) return;
      const answer = await answerTool(owner, toolCall.toolName, toolCall.input, undefined, reads);
      if (answer) void output.current?.({ ...answer, toolCallId: toolCall.toolCallId });
    },
  });
  output.current = chat.addToolOutput;
  const runtime = useExternalStoreRuntime({
    messages: chat.messages,
    convertMessage: toThreadMessage,
    isRunning: chat.status === "submitted" || chat.status === "streaming",
    onNew: async (message) => {
      const text = textOf(message);
      if (text) await chat.sendMessage({ text });
    },
    onCancel: async () => chat.stop(),
  });
  const error = assistantError(chat.error);
  return (
    <div className="ss-assistant" data-open={open || undefined}>
      <button className="ss-assistant-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? "Close assistant" : "Ask Still Signal"}
      </button>
      {open && (
        <AssistantRuntimeProvider runtime={runtime}>
          <aside className="ss-assistant-panel" aria-label="Still Signal assistant">
            <header>
              {pilotHeaders ? (
                <>
                  <small>PRIVATE PILOT</small>
                  <p>{pilotDisclosure(reads)}</p>
                </>
              ) : (
                <>
                  <small>LOCAL PROTOTYPE · SYNTHETIC REVIEW</small>
                  <p>Reads synthetic Preparation, support, Journal, Done, session and trade records on this device. It can’t change anything.</p>
                </>
              )}
            </header>
            <ThreadPrimitive.Root className="ss-assistant-thread">
              <ThreadPrimitive.Viewport className="ss-assistant-viewport">
                <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              </ThreadPrimitive.Viewport>
              {error && <p className="ss-assistant-error" role="alert">{error}</p>}
              <ComposerPrimitive.Root className="ss-assistant-composer">
                <ComposerPrimitive.Input
                  aria-label="Ask Still Signal"
                  placeholder="What’s my preparation status?"
                  rows={1}
                />
                <ComposerPrimitive.Send className="ss-primary">Ask</ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          </aside>
        </AssistantRuntimeProvider>
      )}
    </div>
  );
}

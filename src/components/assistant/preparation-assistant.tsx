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
import { JOURNAL_LINK_EVENT, openJournalLink } from "@/lib/assistant-links";
import { DONE_TOOL, JOURNAL_TOOL, PREPARATION_TOOL, SUPPORT_HISTORY_TOOL } from "@/lib/assistant-tool";
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
      <button type="button" className="ss-assistant-link" onClick={() => openJournalLink(entry.link)}>
        Open in Journal
      </button>
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
          </li>
        ))}
      </ol>
      {leftOut(history.omitted)}
      {history.result === "found" && (
        <p className="ss-assistant-footnote">“What changed?” stays on the Done screen and isn’t saved.</p>
      )}
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

const parts = {
  tools: {
    by_name: {
      [PREPARATION_TOOL]: PreparationTool,
      [SUPPORT_HISTORY_TOOL]: SupportHistoryTool,
      [JOURNAL_TOOL]: JournalTool,
      [DONE_TOOL]: DoneTool,
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
  } = { preparation: readPreparation, support: readSupportHistory, journal: readJournal, done: readDone },
  /** Journal text is read only when the server has said this account may use it. */
  journalAllowed = false,
): Promise<ToolAnswer | undefined> {
  const journalRead = tool === JOURNAL_TOOL || tool === DONE_TOOL;
  if (journalRead && !journalAllowed)
    return { state: "output-error", tool, errorText: "Journal reading isn’t turned on for this account." };
  const reader =
    tool === PREPARATION_TOOL
      ? read.preparation
      : tool === SUPPORT_HISTORY_TOOL
        ? read.support
        : tool === JOURNAL_TOOL
          ? read.journal
          : tool === DONE_TOOL
            ? read.done
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

export default function PreparationAssistant({
  owner,
  pilotHeaders,
  journal = false,
}: {
  owner: string;
  /** Present only for a signed-in pilot account. Supplies a current session token per request. */
  pilotHeaders?: () => Promise<Record<string, string>>;
  /** The server has allowed this account to read Daily Journal and Done for the Day. */
  journal?: boolean;
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
      const answer = await answerTool(owner, toolCall.toolName, toolCall.input, undefined, journal);
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
                  <p>
                    {journal
                      ? "Reads Preparation, support, Daily Journal and Done for the Day saved on this device, and sends what it reads, including your journal words, to OpenRouter to write the answer. It can’t change anything."
                      : "Reads Preparation and support saved on this device, and sends what it reads to OpenRouter to write the answer. It can’t change anything."}
                  </p>
                </>
              ) : (
                <>
                  <small>LOCAL PROTOTYPE · SYNTHETIC REVIEW</small>
                  <p>Reads synthetic Preparation, support, Journal and Done records on this device. It can’t change anything.</p>
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

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
import { useRef, useState } from "react";
import {
  PREPARATION_TOOL,
  SUPPORT_HISTORY_TOOL,
  SUPPORT_RANGES,
  type SupportRange,
} from "@/lib/assistant-tool";
import { cloudConfigured } from "@/lib/cloud";
import { dateInZone } from "@/lib/process/model";
import { preparationStatus, type PreparationStatus } from "@/lib/process/preparation-status";
import { readProcess } from "@/lib/process/storage";
import {
  supportHistory,
  type SupportDay,
  type SupportHistory,
  type SupportPractice,
} from "@/lib/process/support-history";
import "./preparation-assistant.css";

// The day timezone the app's screens use when they save and look up a day.
const dayTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Runs in the browser: the same local records and helper as the Preparation screen. Read-only. */
export async function readPreparationStatus(owner: string, now = Date.now()) {
  const timezone = dayTimezone();
  return preparationStatus(await readProcess(owner), dateInZone(now, timezone), timezone);
}

/**
 * Runs in the browser: only this account's records on this device, for the requested dates.
 * Read-only: it never syncs, so a cloud account is reported as "not-checked".
 */
export async function readSupportHistory(
  owner: string,
  range: SupportRange,
  now = Date.now(),
  timezone = dayTimezone(),
) {
  return supportHistory(
    await readProcess(owner),
    range,
    now,
    timezone,
    cloudConfigured ? "not-checked" : "local-only",
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
      {rows.length ? (
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{day.saved ? "Day saved · no support chosen." : "Nothing saved."}</p>
      )}
    </li>
  );
}

export function SupportHistoryCard({ history }: { history: SupportHistory }) {
  const span =
    history.from === history.to ? history.from : `${history.from} to ${history.to}`;
  const label = history.range === "yesterday" ? "YESTERDAY" : "LAST WEEK";
  return (
    <section className="ss-assistant-card" aria-label="Support history" data-support-history>
      <small>
        SUPPORT · {label} · {span}
      </small>
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
    return <p className="ss-assistant-note">Reading today’s Preparation…</p>;
  return <PreparationStatusCard status={result as PreparationStatus} />;
}

function SupportHistoryTool({ result, status, isError }: ToolCallMessagePartProps) {
  if (isError) return <p className="ss-assistant-error" role="alert">{String(result)}</p>;
  if (status.type === "running" || result === undefined)
    return <p className="ss-assistant-note">Reading saved support…</p>;
  return <SupportHistoryCard history={result as SupportHistory} />;
}

const parts = {
  tools: {
    by_name: {
      [PREPARATION_TOOL]: PreparationTool,
      [SUPPORT_HISTORY_TOOL]: SupportHistoryTool,
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

/** Answers a read-only tool call from this device's records. Unknown tools are left unanswered. */
export async function answerTool(
  owner: string,
  tool: string,
  input: unknown,
  read = { preparation: readPreparationStatus, support: readSupportHistory },
): Promise<ToolAnswer | undefined> {
  if (tool === PREPARATION_TOOL) {
    try {
      return { tool, output: await read.preparation(owner) };
    } catch {
      return { state: "output-error", tool, errorText: "Today’s Preparation could not be read on this device." };
    }
  }
  if (tool === SUPPORT_HISTORY_TOOL) {
    const range = (input as { range?: unknown } | undefined)?.range;
    if (!SUPPORT_RANGES.includes(range as SupportRange))
      return { state: "output-error", tool, errorText: "Support history covers yesterday or last week." };
    try {
      return { tool, output: await read.support(owner, range as SupportRange) };
    } catch {
      return {
        state: "output-error",
        tool,
        errorText: "Saved support could not be read on this device, so this is not an empty result. Try again.",
      };
    }
  }
}

export default function PreparationAssistant({ owner }: { owner: string }) {
  const [open, setOpen] = useState(false);
  const output = useRef<ReturnType<typeof useChat>["addToolOutput"]>(undefined);
  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (toolCall.dynamic) return;
      const answer = await answerTool(owner, toolCall.toolName, toolCall.input);
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
              <small>LOCAL PROTOTYPE · SYNTHETIC REVIEW</small>
              <p>Reads today’s Preparation and recent support on this device. It can’t change anything.</p>
            </header>
            <ThreadPrimitive.Root className="ss-assistant-thread">
              <ThreadPrimitive.Viewport className="ss-assistant-viewport">
                <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              </ThreadPrimitive.Viewport>
              {error && <p className="ss-assistant-error" role="alert">{error}</p>}
              <ComposerPrimitive.Root className="ss-assistant-composer">
                <ComposerPrimitive.Input
                  aria-label="Ask about today"
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

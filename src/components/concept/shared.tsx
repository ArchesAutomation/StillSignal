import type { ReactNode } from "react";
import type { JournalEntry, Sample, Session, TradeEvent } from "@/lib/model";
import type { ReflectionDraft } from "../reflection-editor";
import type { usePulse } from "../use-pulse";
export const cx = (...names: (string | false | undefined)[]) =>
  names
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => "ss-" + n)
    .join(" ");
export type Page =
  | "Command Center"
  | "Pre-Market"
  | "Trading Thesis"
  | "Trade Quality"
  | "Live Session"
  | "Rule Violations"
  | "Audits"
  | "Missions"
  | "Settings & Variables"
  | "Overview"
  | "Journal"
  | "Patterns"
  | "Sessions"
  | "Stillness"
  | "Connections"
  | "Settings";
export type Pulse = ReturnType<typeof usePulse>;
export type Props = {
  threshold: number;
  pulse: Pulse;
  session: Session;
  history: Session[];
  page: Page;
  onPage: (page: Page) => void;
  onReflect: (draft: ReflectionDraft) => void;
  onTrade: () => void;
  onCsv: () => void;
  onAdvanced: (event?: TradeEvent) => void;
  onFloat: () => void;
  onExport: () => void;
  onDelete: () => void;
  onSelectTrade: (event: TradeEvent) => void;
  onToday: () => void;
};
export const time = (t: number, seconds = true) =>
  new Date(t).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
  });
export const signed = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}`;
export const dateKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
export function Metric({
  label,
  value,
  detail,
  subtle = false,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  subtle?: boolean;
}) {
  return (
    <div className={cx("metric")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={cx(subtle && "subtle")}>{detail}</small>
    </div>
  );
}
export function Title({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("sectiontitle")}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export type Moment = {
  id: string;
  t: number;
  phase: string;
  label: string;
  text: string;
  bpm: number | null;
  note?: JournalEntry;
  event?: TradeEvent;
};
export type Series = {
  samples: Sample[];
  baseline: number | null;
  start: number;
  end: number;
};

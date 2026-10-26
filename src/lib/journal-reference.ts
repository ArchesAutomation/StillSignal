import { Temporal } from "@js-temporal/polyfill";
import type { JournalEntry, Session } from "./model";
import { sessionIdeas } from "./position-ideas";
import { journalDateValue } from "./journal-day";

export const stages = [
  "before",
  "entry",
  "management",
  "exit",
  "after",
] as const;
export type Stage = (typeof stages)[number];
export const stageLabels: Record<Stage, string[]> = {
  before: [
    "Calm",
    "Focused",
    "Patient",
    "Anticipating",
    "Uncertain",
    "Following plan / model",
  ],
  entry: [
    "Following plan / model",
    "Confident",
    "Hesitant",
    "FOMO",
    "Rushed",
    "Focused",
  ],
  management: [
    "Calm",
    "Focused",
    "Urge to add",
    "Protective of profit",
    "Impatient",
    "Uncertain",
  ],
  exit: [
    "Following plan / model",
    "Relieved",
    "Hesitant to close",
    "Fear of giving back",
    "Satisfied",
  ],
  after: ["Calm", "Satisfied", "Frustrated", "Regret", "Grateful", "Curious"],
};
export function labelsFor(
  section?: JournalEntry["section"],
  custom?: Partial<Record<Stage, string[]>>,
) {
  return section && stages.includes(section as Stage)
    ? (custom?.[section as Stage] ?? stageLabels[section as Stage])
    : [
        "Calm",
        "Focused",
        "Following plan / model",
        "Uncertain",
        "Grateful",
        "Other",
      ];
}
export function localInstant(value: string, timezone: string) {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, {
    disambiguation: "reject",
  }).epochMilliseconds;
}
export function environmentAt(
  session: Session,
  at: number,
  knownAt = Infinity,
) {
  return session.blueprint?.environmentHistory
    ?.filter((e) => e.effectiveAt <= at && e.recordedAt <= knownAt)
    .sort(
      (a, b) => b.effectiveAt - a.effectiveAt || b.recordedAt - a.recordedAt,
    )[0];
}
export function proximityEvents(session: Session) {
  const plan = session.blueprint?.plan;
  if (!plan) return [];
  const day = journalDateValue(session.startedAt),
    zone = session.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = localInstant(`${day}T${plan.start}`, zone);
  const nextDay = Temporal.PlainDate.from(day).add({ days: 1 }).toString();
  const end = localInstant(
    `${plan.end <= plan.start ? nextDay : day}T${plan.end}`,
    zone,
  );
  return (session.blueprint?.lifestyle || []).filter(
    (e) =>
      e.category === "Upcoming commitment" &&
      e.linkedDay === day &&
      e.start >= start &&
      e.start <= end + 90 * 60000,
  );
}
export function weekKey(t: number) {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return journalDateValue(d.getTime());
}
export function weeklyActuals(
  sessions: Session[],
  selected: Session,
  key = weekKey(selected.startedAt),
) {
  const rows = [
    ...new Map(
      [...sessions, selected]
        .filter(
          (s) => s.owner === selected.owner && weekKey(s.startedAt) === key,
        )
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const eligible = rows.flatMap((s) =>
    sessionIdeas(s).filter(
      (i) =>
        i.exit !== undefined && i.pnl !== undefined && Number.isFinite(i.pnl),
    ),
  );
  const currencies = [...new Set(eligible.map((i) => i.currency))];
  return {
    sessions: rows.length,
    completed: eligible.length,
    winRate: eligible.length
      ? (eligible.filter((i) => i.pnl! > 0).length / eligible.length) * 100
      : null,
    pnl: currencies.map(
      (currency) =>
        [
          currency,
          eligible
            .filter((i) => i.currency === currency)
            .reduce((sum, i) => sum + i.pnl!, 0),
        ] as const,
    ),
    demo: rows.some((s) => s.demo),
  };
}

export type Quote = {
  price: number;
  symbol: string;
  source: string;
  observedAt: number;
  currency: string;
};
export function captureSymbol(session: Session, tradeId?: string) {
  if (tradeId)
    return (
      sessionIdeas(session).find(
        (idea) => idea.id === tradeId || idea.entryIds.includes(tradeId),
      )?.symbol || ""
    );
  const symbols = [
    ...new Set(session.events.filter((e) => !e.voided).map((e) => e.symbol)),
  ];
  return symbols.length === 1 ? symbols[0] : "";
}
export function momentPnl(session: Session, note: JournalEntry) {
  const at = note.eventTime === undefined ? note.t : note.eventTime;
  if (at === null) return null;
  const idea = note.tradeId
    ? sessionIdeas(session).find(
        (i) => i.id === note.tradeId || i.entryIds.includes(note.tradeId!),
      )
    : undefined;
  const points = session.blueprint?.pnl || [],
    accounts = [...new Set(points.map((p) => p.account))];
  const account =
    idea?.account ||
    session.blueprint?.leaderAccount ||
    (accounts.length === 1 ? accounts[0] : undefined);
  if (!account) return null;
  const eligible = points.filter(
    (p) =>
      p.account === account &&
      (!idea ||
        (p.currency === idea.currency &&
          (p.symbol === idea.symbol || p.symbol === "Account"))),
  );
  const scopes = [
    ...new Set(eligible.map((p) => JSON.stringify([p.symbol, p.currency]))),
  ];
  const scope =
    scopes.find((s) => (JSON.parse(s) as string[])[0] === "Account") ||
    (scopes.length === 1 ? scopes[0] : undefined);
  if (!scope) return null;
  return (
    eligible
      .filter(
        (p) =>
          JSON.stringify([p.symbol, p.currency]) === scope &&
          p.t <= at &&
          at - p.t <= 10000,
      )
      .sort((a, b) => a.t - b.t)
      .at(-1) || null
  );
}
export function validQuote(
  value: Quote | null,
  at: number,
  symbol: string,
  maxAgeMs = 10000,
): Quote | null {
  return value &&
    value.symbol === symbol &&
    Number.isFinite(value.price) &&
    value.price > 0 &&
    Number.isFinite(value.observedAt) &&
    value.observedAt <= at &&
    at - value.observedAt <= maxAgeMs &&
    !!value.source &&
    /^[A-Z]{3}$/.test(value.currency)
    ? value
    : null;
}

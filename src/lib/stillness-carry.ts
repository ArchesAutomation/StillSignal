import type { AwayEvent, AwayEventBody, CarryChoice, CarryStage } from "./process/away-days";

/**
 * Stillness support carried to a later day. Carries live in the away-day change log, never in a
 * trading-day record, so planning ahead cannot make a future day look prepared or completed.
 */
export type Carry = {
  id: string;
  /** The day the support was chosen on. */
  source: string;
  target: "next" | string;
  stages: CarryStage[];
  choice?: CarryChoice;
  note?: string;
  noteId?: string;
  /** For "next": the later trading day it was first opened on. */
  day?: string;
  removed: boolean;
};
export type Carries = Record<string, Carry>;
type Snapshot = Extract<AwayEventBody, { type: "carry" }>;

export const stageOrder: CarryStage[] = ["Preparation", "Done"];
export const choiceKey = (choice: CarryChoice) => `${choice.itemId}:${choice.piece ?? "all"}`;
export const sameChoice = (a?: CarryChoice, b?: CarryChoice) =>
  !!a && !!b && a.itemId === b.itemId && a.piece === b.piece;
const ordered = (events: AwayEvent[]) =>
  [...events].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

/** Replays carry changes in time order, so every device resolves each carry to the same day. */
export function foldCarries(events: AwayEvent[]): Carries {
  const carries: Carries = {};
  const sorted = ordered(events);
  for (const { body } of sorted) {
    if (body.type === "carry") {
      carries[body.carryId] = {
        id: body.carryId, source: body.date, target: body.target, stages: stageOrder.filter(stage => body.stages.includes(stage)),
        ...(body.choice ? { choice: body.choice } : {}), ...(body.note ? { note: body.note } : {}),
        ...(body.noteId ? { noteId: body.noteId } : {}), day: carries[body.carryId]?.day, removed: false,
      };
    }
    if (body.type === "carry-removed" && carries[body.carryId]) carries[body.carryId].removed = true;
  }
  // The earliest opening fixes the day. Clock differences cannot attach it to a second day.
  for (const { body } of sorted) {
    if (body.type !== "carry-surfaced") continue;
    const carry = carries[body.carryId];
    if (carry && !carry.day && carry.target === "next") carry.day = body.day;
  }
  return carries;
}

export const resolvedDate = (carry: Carry) => carry.target === "next" ? carry.day : carry.target;

/** Still waiting for its day: not yet opened, or dated after today. */
export const isPending = (carry: Carry, today: string) =>
  !carry.removed && (carry.target === "next" ? !carry.day : carry.target > today);

export const pendingCarries = (carries: Carries, today: string) =>
  Object.values(carries).filter(carry => isPending(carry, today))
    .sort((a, b) => (a.target === "next" ? "" : a.target).localeCompare(b.target === "next" ? "" : b.target) || a.source.localeCompare(b.source));

/** Support that belongs to a date, optionally for one stage. */
export const carriesFor = (carries: Carries, date: string, stage?: CarryStage) =>
  Object.values(carries).filter(carry => !carry.removed && resolvedDate(carry) === date && (!stage || carry.stages.includes(stage)));

/**
 * "Next trading day" carries that opening this stage on a trading day would fix to it.
 * Only a later day qualifies, so reopening the day it was chosen on leaves it waiting.
 */
export const claimableCarries = (carries: Carries, date: string, stage: CarryStage) =>
  Object.values(carries).filter(carry =>
    !carry.removed && carry.target === "next" && !carry.day && carry.source < date && carry.stages.includes(stage));

/** The open carry a repeated choice would update, so a second save never adds a second placement. */
export function findCarry(carries: Carries, target: string, today: string, match: { choice?: CarryChoice; noteId?: string }) {
  return Object.values(carries).find(carry => carry.target === target &&
    (target !== "next" || isPending(carry, today)) && !carry.removed &&
    (match.noteId ? carry.noteId === match.noteId : !carry.noteId && sameChoice(carry.choice, match.choice)));
}

const snapshot = (carry: Omit<Carry, "day" | "removed">): Snapshot => ({
  type: "carry", date: carry.source, carryId: carry.id, target: carry.target, stages: carry.stages,
  ...(carry.choice ? { choice: carry.choice } : {}), ...(carry.note ? { note: carry.note } : {}),
  ...(carry.noteId ? { noteId: carry.noteId } : {}),
});

export type CarryChange = {
  status: "added" | "updated" | "unchanged";
  carryId: string;
  /** The changes to save. Empty when nothing would change. */
  bodies: AwayEventBody[];
  /** The changes that put the carry back exactly as it was before this save. */
  undo: AwayEventBody[];
  /** What this save wrote, so Undo can refuse once something else has changed it. */
  written?: Snapshot;
};

/**
 * Adds or merges one carry. Stages are added, never taken away. An existing note is kept unless
 * the trader chose to edit it; a note is only written into an empty place otherwise.
 */
export function planCarry(carries: Carries, input: {
  source: string; today: string; target: string; stages: CarryStage[];
  choice?: CarryChoice; note?: string; noteId?: string; editNote?: boolean;
}): CarryChange {
  const note = input.note?.trim() || undefined;
  const existing = findCarry(carries, input.target, input.today, input);
  if (!existing) {
    const carryId = crypto.randomUUID();
    const written = snapshot({ id: carryId, source: input.source, target: input.target,
      stages: stageOrder.filter(stage => input.stages.includes(stage)), choice: input.choice, note, noteId: input.noteId });
    return { status: "added", carryId, bodies: [written], undo: [{ type: "carry-removed", date: input.source, carryId }], written };
  }
  const stages = stageOrder.filter(stage => existing.stages.includes(stage) || input.stages.includes(stage));
  const nextNote = input.editNote ? note : existing.note ?? note;
  if (stages.length === existing.stages.length && nextNote === existing.note) {
    return { status: "unchanged", carryId: existing.id, bodies: [], undo: [] };
  }
  const written = snapshot({ ...existing, stages, note: nextNote });
  return { status: "updated", carryId: existing.id, bodies: [written], undo: [snapshot(existing)], written };
}

/** Replaces a pending carry with the trader's edited version. */
export function replaceCarry(carry: Carry, change: Partial<Pick<Carry, "target" | "stages" | "note" | "choice">>): CarryChange {
  const written = snapshot({ ...carry, ...change, stages: stageOrder.filter(stage => (change.stages ?? carry.stages).includes(stage)) });
  return { status: "updated", carryId: carry.id, bodies: [written], undo: [snapshot(carry)], written };
}

export const removeCarry = (carry: Carry): CarryChange => ({
  status: "updated", carryId: carry.id,
  bodies: [{ type: "carry-removed", date: carry.source, carryId: carry.id }], undo: [snapshot(carry)],
});

/** True while the carry still holds exactly what a save wrote. */
export function carryUnchangedSince(carries: Carries, change: CarryChange) {
  const carry = carries[change.carryId];
  if (!change.written) return !!carry?.removed;
  return !!carry && !carry.removed && JSON.stringify(snapshot(carry)) === JSON.stringify(change.written);
}

/** Bookmarks: older ones live on day selections, newer ones in the change log. Both stay visible. */
export function libraryChoices(events: AwayEvent[], daySaved: CarryChoice[]) {
  const latest = new Map<string, boolean>();
  for (const { body } of ordered(events)) if (body.type === "library") latest.set(choiceKey(body.choice), body.saved);
  const result = new Map<string, CarryChoice>();
  for (const choice of daySaved) result.set(choiceKey(choice), choice);
  for (const { body } of ordered(events)) {
    if (body.type === "library" && latest.get(choiceKey(body.choice))) result.set(choiceKey(body.choice), body.choice);
  }
  return [...result.values()];
}

export const formatCarryDate = (date: string) => new Intl.DateTimeFormat("en-GB", {
  weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

export const stageLabel = (stages: CarryStage[]) =>
  stages.length === 2 ? "Preparation and Done for the day" : stages[0] === "Done" ? "Done for the day" : "Preparation";

/** Plain-language destination, e.g. "your next trading day’s Preparation". */
export function destinationText(target: string, stages: CarryStage[], today: string, away = false) {
  if (away) return target === today ? "today, a day away" : `${formatCarryDate(target)}, a day away`;
  const day = target === "next" ? "your next trading day’s" : target === today ? "today’s" : `${formatCarryDate(target)}’s`;
  return `${day} ${stageLabel(stages)}`;
}

/** Adds whole days to a calendar date. */
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

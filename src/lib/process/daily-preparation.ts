import { arrivalFeelings, createRecord, latest, type ProcessRecord } from "./model";
import { emptyTradingDay, tradingDayFor } from "./trading-day";

export type DailyPreparation = {
  arrival: (typeof arrivalFeelings)[number][];
  intention: string;
  boundary: string;
};

export function arrivalCheckin(records: ProcessRecord[], dayId: string | undefined) {
  if (!dayId) return undefined;
  return latest(records, "checkin")
    .filter((checkin) => checkin.body.dayId === dayId && checkin.body.arrival !== undefined)
    .sort((a, b) => b.body.observedAt - a.body.observedAt)[0];
}

export function preparationChanges(
  records: ProcessRecord[],
  date: string,
  timezone: string,
  edits: Partial<DailyPreparation>,
  now: number,
): ProcessRecord[] {
  const day = tradingDayFor(records, date, timezone);
  const checkin = arrivalCheckin(records, day?.rootId);
  const goal = edits.intention?.trim() ?? day?.body.goal ?? "";
  const boundary = edits.boundary?.trim() ?? day?.body.boundary ?? "";
  const arrival = edits.arrival === undefined
    ? undefined
    : arrivalFeelings.filter((feeling) => edits.arrival?.includes(feeling));
  const arrivalChanged = arrival !== undefined &&
    arrival.join() !== (checkin?.body.arrival ?? []).join();
  const changes: ProcessRecord[] = [];
  let current = day;
  if (goal !== (day?.body.goal ?? "") || boundary !== (day?.body.boundary ?? "") ||
      (!day && arrivalChanged)) {
    current = createRecord("day", {
      ...(day?.body ?? emptyTradingDay(date, timezone)),
      goal,
      boundary: boundary || undefined,
    }, day);
    changes.push(current);
  }
  if (current && arrival && arrivalChanged) {
    const record = createRecord("checkin", {
      dayId: current.rootId,
      answers: [],
      physical: "",
      circumstances: "",
      reflection: "",
      ...checkin?.body,
      observedAt: now,
      phase: "pre-market",
      arrival,
    }, checkin);
    changes.push({ ...record, archived: arrival.length === 0 });
  }
  return changes;
}

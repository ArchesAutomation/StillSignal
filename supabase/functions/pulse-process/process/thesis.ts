import type { RecordOf } from "./model.ts";

/** The same scope rules are used by preparation evidence and its plan editor. */
export function thesisMatchesDay(
  thesis: RecordOf<"thesis">,
  day: RecordOf<"day">,
) {
  if (thesis.body.scope !== "weekly") return thesis.body.dayId === day.rootId;
  const end = new Date(
    Date.parse(thesis.body.periodStart + "T12:00:00Z") + 6 * 86400000,
  ).toISOString().slice(0, 10);
  return thesis.body.periodStart <= day.body.date && day.body.date <= end;
}

export function thesisMatchesInstrument(
  thesis: RecordOf<"thesis">,
  instrument: string,
) {
  const plan = thesis.body.instrument.trim().toUpperCase();
  const selected = instrument.trim().toUpperCase();
  return !selected || !plan || plan === selected;
}

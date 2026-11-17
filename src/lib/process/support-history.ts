import type { SupportRange } from "../assistant-tool";
import { catalogue } from "../stillness-catalogue";
import { supportFocus } from "./journal-guide";
import { dateInZone, weekOf, type ProcessRecord } from "./model";
import { knownStillnessChoice, stillnessChoiceSummary } from "./preparation-status";
import { tradingDayFor } from "./trading-day";

/** Moves a YYYY-MM-DD calendar date by whole days. The date is already local to the day's timezone. */
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar dates a range covers, counted from today's local date. Last week is the previous Monday to Sunday. */
export function supportRangeDates(range: SupportRange, today: string) {
  if (range === "yesterday") return [shiftDate(today, -1)];
  const monday = shiftDate(weekOf(today), -7);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SupportPractice = { title: string; kind: string };
export type SupportDay = {
  date: string;
  weekday: string;
  /** A day record exists for this date, whether or not it holds support. */
  saved: boolean;
  homeFocus: string[];
  preparation: SupportPractice[];
  done: SupportPractice[];
};
/**
 * local-only: no cloud account, so this device holds every record.
 * not-checked: a cloud account exists, but this read does not sync, so days saved on another device may be missing.
 */
export type SupportSync = "local-only" | "not-checked";
export type SupportHistory = {
  range: SupportRange;
  from: string;
  to: string;
  timezone: string;
  sync: SupportSync;
  result: "found" | "empty";
  days: SupportDay[];
  /** Still Signal saves what was added to a day, not whether a practice was then completed. */
  completion: "not-recorded";
};

function practice(choice: Parameters<typeof stillnessChoiceSummary>[0]): SupportPractice {
  const item = catalogue.find((entry) => entry.id === choice.itemId)!;
  return {
    title: stillnessChoiceSummary(choice).title,
    kind: choice.piece === undefined ? item.kind : `Step of ${item.name}`,
  };
}

/**
 * Support saved for the requested dates, read with the same day lookup and labels as Home,
 * Preparation and Done for the Day. Read-only.
 */
export function supportHistory(
  records: ProcessRecord[],
  range: SupportRange,
  now: number,
  timezone: string,
  sync: SupportSync,
): SupportHistory {
  const dates = supportRangeDates(range, dateInZone(now, timezone));
  const days = dates.map((date): SupportDay => {
    const day = tradingDayFor(records, date, timezone);
    const added = (day?.body.stillness ?? []).filter(knownStillnessChoice);
    return {
      date,
      weekday: weekdays[new Date(date + "T12:00:00Z").getUTCDay()],
      saved: !!day,
      homeFocus: day?.body.supportFocuses?.map((focus) => supportFocus[focus].title) ?? [],
      preparation: added.filter((choice) => choice.destination === "Preparation").map(practice),
      done: added.filter((choice) => choice.destination === "Done").map(practice),
    };
  });
  const found = days.some((day) => day.homeFocus.length || day.preparation.length || day.done.length);
  return {
    range,
    from: dates[0],
    to: dates[dates.length - 1],
    timezone,
    sync,
    result: found ? "found" : "empty",
    days,
    completion: "not-recorded",
  };
}

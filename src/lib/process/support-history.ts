import { catalogue } from "../stillness-catalogue";
import { supportFocus } from "./journal-guide";
import { dateInZone, type ProcessRecord } from "./model";
import { resolvePeriod, weekdayOf, type RecordSync } from "./periods";
import { knownStillnessChoice, stillnessChoiceSummary } from "./preparation-status";
import { tradingDayFor } from "./trading-day";

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
export type SupportHistory = {
  label: string;
  from: string;
  to: string;
  timezone: string;
  sync: RecordSync;
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
 * Support saved for the requested period, read with the same day lookup and labels as Home,
 * Preparation and Done for the Day. Read-only. Throws PeriodError for an unsupported period.
 */
export function supportHistory(
  records: ProcessRecord[],
  input: unknown,
  now: number,
  timezone: string,
  sync: RecordSync,
): SupportHistory {
  const period = resolvePeriod(input, dateInZone(now, timezone));
  const days = period.dates.map((date): SupportDay => {
    const day = tradingDayFor(records, date, timezone);
    const added = (day?.body.stillness ?? []).filter(knownStillnessChoice);
    return {
      date,
      weekday: weekdayOf(date),
      saved: !!day,
      homeFocus: day?.body.supportFocuses?.map((focus) => supportFocus[focus].title) ?? [],
      preparation: added.filter((choice) => choice.destination === "Preparation").map(practice),
      done: added.filter((choice) => choice.destination === "Done").map(practice),
    };
  });
  const found = days.some((day) => day.homeFocus.length || day.preparation.length || day.done.length);
  return {
    label: period.label,
    from: period.from,
    to: period.to,
    timezone,
    sync,
    result: found ? "found" : "empty",
    days,
    completion: "not-recorded",
  };
}

import { PERIODS, WEEK_CHOICES, WEEKDAYS, type PeriodInput } from "../assistant-tool";
import { weekOf } from "./model";

/** A period the trader asked about could not be turned into dates. Distinct from a read failure. */
export class PeriodError extends Error {}

/** Moves a YYYY-MM-DD calendar date by whole days. The date is already local to the day's timezone. */
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const weekdayOf = (date: string) => weekdayNames[new Date(date + "T12:00:00Z").getUTCDay()];
const spoken = (date: string) => `${Number(date.slice(8))} ${monthNames[Number(date.slice(5, 7)) - 1]}`;
const realDate = (value: string) => {
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const span = (from: string, to: string) => {
  const dates = [from];
  while (dates[dates.length - 1] < to) dates.push(shiftDate(dates[dates.length - 1], 1));
  return dates;
};

/** Longest range and furthest look-back a question may cover. */
export const MAX_DAYS = 31;
export const MAX_LOOKBACK_DAYS = 366;

/**
 * local-only: no cloud account, so this device holds every record.
 * not-checked: a cloud account exists, but this read does not sync, so days saved on another device may be missing.
 */
export type RecordSync = "local-only" | "not-checked";

export type ResolvedPeriod ={ label: string; from: string; to: string; dates: string[] };

const keys = new Set(["period", "weekday", "which", "monthDay", "date"]);

/**
 * Resolves a period against today's local date.
 * - last week is the previous Monday to Sunday; this week and this month end today;
 * - a bare weekday, or a day and month without a year, is the most recent one on or before today;
 * - future dates, ranges over 31 days and dates more than 366 days back are refused.
 */
export function resolvePeriod(input: unknown, today: string): ResolvedPeriod {
  const value = (input ?? {}) as Record<string, unknown>;
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.has(key)))
    throw new PeriodError("That period isn't supported. Ask about today, yesterday, a weekday, a date, this or last week, or this or last month.");
  const { period, weekday, which, monthDay, date } = value as PeriodInput;
  const forms = [period, weekday, monthDay, date].filter((form) => form !== undefined).length;
  if (forms > 1) throw new PeriodError("Ask about one period at a time.");
  if (which !== undefined && (weekday === undefined || !WEEK_CHOICES.includes(which)))
    throw new PeriodError("“This” or “last” only applies to a weekday.");

  let resolved: ResolvedPeriod;
  const day = (label: string, at: string) => ({ label, from: at, to: at, dates: [at] });
  if (forms === 0 || period === "today") resolved = day("Today", today);
  else if (period !== undefined) {
    if (!PERIODS.includes(period)) throw new PeriodError("That period isn't supported.");
    const monday = weekOf(today);
    const firstOfMonth = today.slice(0, 8) + "01";
    const lastMonthEnd = shiftDate(firstOfMonth, -1);
    const range = {
      yesterday: ["Yesterday", shiftDate(today, -1), shiftDate(today, -1)],
      "this-week": ["This week", monday, today],
      "last-week": ["Last week", shiftDate(monday, -7), shiftDate(monday, -1)],
      "this-month": ["This month", firstOfMonth, today],
      "last-month": ["Last month", lastMonthEnd.slice(0, 8) + "01", lastMonthEnd],
    }[period as Exclude<typeof period, "today">];
    resolved = { label: range[0], from: range[1], to: range[2], dates: span(range[1], range[2]) };
  } else if (weekday !== undefined) {
    const index = WEEKDAYS.indexOf(weekday);
    if (index < 0) throw new PeriodError("That weekday isn't recognised.");
    const name = weekdayNames[(index + 1) % 7];
    const thisWeek = shiftDate(weekOf(today), index);
    let at: string;
    if (which === "last") at = shiftDate(thisWeek, -7);
    else if (which === "this") {
      if (thisWeek > today) throw new PeriodError(`${name} this week hasn’t happened yet.`);
      at = thisWeek;
    } else at = thisWeek > today ? shiftDate(thisWeek, -7) : thisWeek;
    resolved = day(which ? `${which === "this" ? "This" : "Last"} ${name}` : name, at);
  } else if (monthDay !== undefined) {
    if (!/^\d{2}-\d{2}$/.test(monthDay)) throw new PeriodError("That date isn't recognised.");
    const year = Number(today.slice(0, 4));
    const at = [year, year - 1].map((y) => `${y}-${monthDay}`).find((d) => realDate(d) && d <= today);
    if (!at) throw new PeriodError("That date isn't within the last year.");
    resolved = day(spoken(at), at);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date!) || !realDate(date!)) throw new PeriodError("That date isn't recognised.");
    if (date! > today) throw new PeriodError("That date is in the future.");
    resolved = day(spoken(date!), date!);
  }
  if (resolved.from < shiftDate(today, -MAX_LOOKBACK_DAYS))
    throw new PeriodError("Ask about the last year at most.");
  if (resolved.dates.length > MAX_DAYS) throw new PeriodError("Ask about 31 days at most.");
  return resolved;
}

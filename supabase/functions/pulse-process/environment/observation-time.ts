import { Temporal } from "@js-temporal/polyfill";

export function observationTimeInput(at: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(timezone).toPlainDateTime()
    .toString({ smallestUnit: "minute", roundingMode: "trunc" });
}

export function currentTimeOnDay(date: string, timezone: string, now = Date.now()) {
  return `${date}T${observationTimeInput(now, timezone).slice(11)}`;
}

export function observationTime(value: string, timezone: string, original?: number) {
  // An amount-only correction must retain the original instant, including
  // seconds and the offset of a repeated daylight-saving hour.
  if (original !== undefined && observationTimeInput(original, timezone) === value)
    return original;
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone, {
      disambiguation: "reject",
    }).epochMilliseconds;
  } catch {
    throw new Error(`Choose a valid, unambiguous date and time in ${timezone}. Daylight-saving changes can skip or repeat an hour.`);
  }
}

export function earlierObservationTime(value: string, minutes: number) {
  return Temporal.PlainDateTime.from(value).subtract({ minutes })
    .toString({ smallestUnit: "minute" });
}

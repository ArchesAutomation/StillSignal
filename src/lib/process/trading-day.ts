import { latest, type BodyOf, type ProcessRecord } from "./model";

export function tradingDayFor(records: ProcessRecord[], date: string, timezone: string) {
  return latest(records, "day").find(
    (day) => day.body.date === date && day.body.timezone === timezone,
  );
}

export function emptyTradingDay(date: string, timezone: string): BodyOf<"day"> {
  return {
    date,
    timezone,
    status: "preparing",
    instrument: "",
    account: "",
    timeframes: [],
    sessionIds: [],
    goal: "",
  };
}

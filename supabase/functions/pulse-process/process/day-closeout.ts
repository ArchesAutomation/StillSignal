import { createRecord, type DayCloseout, type ProcessRecord } from "./model.ts";
import { emptyTradingDay, tradingDayFor } from "./trading-day.ts";

export function dayCloseoutChange(
  records: ProcessRecord[],
  date: string,
  timezone: string,
  edit: Partial<DayCloseout>,
) {
  const day = tradingDayFor(records, date, timezone);
  const previous = day?.body.closeout;
  const next = { ...previous, ...edit };
  if (next.outcome === previous?.outcome && next.process === previous?.process) return;

  const { closeout: _previous, ...body } = day?.body ?? emptyTradingDay(date, timezone);
  return createRecord("day", {
    ...body,
    ...(next.outcome || next.process ? { closeout: next } : {}),
  }, day);
}

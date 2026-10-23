/** Parse a calendar date in the trader's local timezone, including DST days. */
export function journalDayRange(value: string, now = Date.now()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid journal date.");
  const [, year, month, day] = match.map(Number);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day)
    throw new Error("Choose a valid journal date.");
  if (start.getTime() > now) throw new Error("Choose today or an earlier day.");
  const next = new Date(year, month - 1, day + 1);
  return { start: start.getTime(), end: Math.min(now, next.getTime() - 1) };
}

export function journalDateValue(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

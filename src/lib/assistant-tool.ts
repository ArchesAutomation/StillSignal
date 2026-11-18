// Shared by the browser panel and the generated pulse-assistant Edge Function.
// The model is fixed to a free OpenRouter variant. There is no model list or paid fallback.
export const ASSISTANT_MODEL = "inclusionai/ling-3.2-flash:free";
export const PREPARATION_TOOL = "preparation_status";
export const SUPPORT_HISTORY_TOOL = "support_history";
// Offered only to accounts listed for journal reads. See docs/assistant-journal-reads.md.
export const JOURNAL_TOOL = "journal_entries";
export const DONE_TOOL = "done_for_the_day";

// Both tools take the same period. The model names it; the browser resolves it to dates in
// the screens' day timezone, so the model never computes dates.
export const PERIODS = ["today", "yesterday", "this-week", "last-week", "this-month", "last-month"] as const;
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const WEEK_CHOICES = ["this", "last"] as const;
export type Period = (typeof PERIODS)[number];
export type Weekday = (typeof WEEKDAYS)[number];
/** Exactly one of period, weekday, monthDay or date. No input means today. */
export type PeriodInput = {
  period?: Period;
  weekday?: Weekday;
  which?: (typeof WEEK_CHOICES)[number];
  monthDay?: string;
  date?: string;
};

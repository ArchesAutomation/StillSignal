// Shared by the browser panel and the generated pulse-assistant Edge Function.
// The model is fixed to a free OpenRouter variant. There is no model list or paid fallback.
export const ASSISTANT_MODEL = "nvidia/nemotron-3.5-lightning:free";
export const PREPARATION_TOOL = "preparation_status";
export const SUPPORT_HISTORY_TOOL = "support_history";
/** "last-week" is the previous Monday through Sunday in the app's day timezone. */
export const SUPPORT_RANGES = ["yesterday", "last-week"] as const;
export type SupportRange = (typeof SUPPORT_RANGES)[number];

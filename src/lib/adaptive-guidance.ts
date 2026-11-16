import { arrivalFeelings, type DayCloseout } from "./process/model";

// Adaptive guidance: the authored support rubric for Preparation and Done for the day.
// Each screen shows at most one optional suggestion, built only from what the trader has
// chosen on that screen today. Where the rubric says to stay quiet, nothing is returned and
// the ordinary path stays as it is. Results (profit, loss, heart rate) are never read as feelings.

export type Guidance = {
  // Stable while the matching answers stay the same; a new key means a new suggestion.
  key: string;
  // Plain words connecting the suggestion to what the trader chose.
  because?: string;
  prompt: string;
  practice?: { itemId: string; label: string };
  reflect?: { question: string; label: string };
};

// ---------- Preparation ----------

type Arrival = (typeof arrivalFeelings)[number];
export type PreparationAnswers = { arrival: readonly string[] };

const arrivalRows: Record<Arrival, { prompt: string; because?: string; practice?: Guidance["practice"]; example: string }> = {
  Settled: {
    prompt: "Take a moment to notice what feeling settled is like today.",
    example: "If the session speeds up, I’ll notice what helps me keep my pace.",
  },
  Restless: {
    because: "You marked Restless.",
    prompt: "Want a minute to settle before you start?",
    practice: { itemId: "body", label: "Preview Back to the room" },
    example: "If I feel pulled to act, I’ll take a moment to notice what’s driving it.",
  },
  Tired: {
    prompt: "Take a moment to notice where your attention is today.",
    example: "If I notice my attention drifting, I’ll pause and decide how I want to continue.",
  },
  Uncertain: {
    prompt: "Give yourself a moment to notice what feels unclear.",
    practice: { itemId: "awareness", label: "Preview Open awareness" },
    example: "When I feel unsure, I’ll pause and notice what I’m unsure about.",
  },
  Hopeful: {
    prompt: "Take a moment to notice what you’re looking forward to and what you expect from today.",
    example: "I’ll notice if looking forward to today starts to feel like needing something to happen.",
  },
};
const severalArrivals = {
  prompt: "A few things can be present at once. What would you like to make room for as you begin?",
  practice: { itemId: "arrive", label: "Preview Arrive with what’s here" },
  example: "If I notice my state shifting, I’ll take a moment before deciding how to respond.",
};
export const defaultIntentionExample = "When I notice pressure, I’ll give myself a moment before acting.";

const known = (arrival: readonly string[]) =>
  arrivalFeelings.filter((choice) => arrival.includes(choice));

export function preparationGuidance({ arrival }: PreparationAnswers): Guidance | undefined {
  const chosen = known(arrival);
  // Nothing selected: the quiet opening is the only invitation.
  if (!chosen.length) return undefined;
  // One response for a mix, so the trader decides what matters today.
  if (chosen.length > 1) return { key: "arrival:several", prompt: severalArrivals.prompt, practice: severalArrivals.practice };
  const { example: _example, ...row } = arrivalRows[chosen[0]];
  return { key: `arrival:${chosen[0].toLowerCase()}`, ...row };
}

export function intentionExample({ arrival }: PreparationAnswers) {
  const chosen = known(arrival);
  if (!chosen.length) return defaultIntentionExample;
  return chosen.length > 1 ? severalArrivals.example : arrivalRows[chosen[0]].example;
}

// ---------- Done for the day ----------

// "What changed?" — an optional answer after Partly or Not today. Kept on the screen only; not saved with the day.
// Deliberately short: the Journal is where the trader explores what happened.
export const closingDetailChoices = ["hesitated", "deviated", "early", "late"] as const;
export type ClosingDetail = (typeof closingDetailChoices)[number];
export const detailProcesses: readonly DayCloseout["process"][] = ["partial", "broken"];
export const closingDetails: Record<ClosingDetail, {
  label: string;
  phrase: string;
  prompt: string;
  question: string;
  practice?: Guidance["practice"];
}> = {
  hesitated: {
    label: "Hesitated",
    phrase: "hesitated",
    prompt: "Want a moment to settle first?",
    question: "What did you notice just before you held back?",
    practice: { itemId: "after-decision", label: "Preview Settle after a charged decision" },
  },
  deviated: {
    label: "Deviated",
    phrase: "deviated from your plan",
    prompt: "What do you remember noticing in yourself just before you changed course?",
    question: "What do you remember noticing in yourself just before you changed course?",
  },
  early: {
    label: "Got in too early",
    phrase: "got in too early",
    prompt: "Want a moment to settle first?",
    question: "What do you remember noticing just before you went in?",
    practice: { itemId: "waiting", label: "Preview Make room for waiting" },
  },
  late: {
    label: "Got in too late",
    phrase: "got in too late",
    prompt: "Want a moment to settle first?",
    question: "What do you remember noticing in the moments before you went in?",
    practice: { itemId: "after-decision", label: "Preview Settle after a charged decision" },
  },
};
export type ClosingAnswers = Pick<DayCloseout, "outcome" | "process"> & { detail?: ClosingDetail };

type OutcomeRow = "profit" | "loss" | "breakeven" | "no-trade" | "unsaid";
type ProcessColumn = "followed" | "partial" | "broken" | "skipped";

// null means: keep a quiet finish and the ordinary Journal route.
export const closingQuestions: Record<OutcomeRow, Record<ProcessColumn, string | null>> = {
  profit: {
    followed: "Before you knew the result, what did you do that you’d want to repeat?",
    partial: "Which part of your plan did you stay with, and where did you notice yourself changing course?",
    broken: "What do you remember noticing when you moved away from your plan?",
    skipped: "What do you remember about how you made a decision before you knew how it turned out?",
  },
  loss: {
    followed: "Thinking back to what you did before you knew the result, what would you give yourself credit for?",
    partial: "Where did you stay with your plan, and what was happening when that changed?",
    broken: "What do you remember feeling at the point you moved away from your plan?",
    skipped: "When you feel ready, what moment from today would you like to understand better?",
  },
  breakeven: {
    followed: "What helped you follow your plan through to the point you finished?",
    partial: "Which decision would you like to revisit now that the day is over?",
    broken: "What do you remember noticing in yourself when you changed course?",
    skipped: "Is there a moment from today you’d like to come back to?",
  },
  "no-trade": {
    followed: "What helped you stick to your plan today?",
    partial: "What did you notice about yourself as you watched and waited?",
    broken: "Was there a moment you’d like to understand better about how you decided whether to act?",
    skipped: null,
  },
  // Rather not say, or outcome skipped.
  unsaid: {
    followed: "What helped you stick to your plan today?",
    partial: "Which part of how you followed your plan would you like to look back on?",
    broken: "What do you remember noticing when your approach changed?",
    skipped: null,
  },
};

// The read-back says the trader's own answers back to them in a plain sentence, without adding a feeling.
const outcomePhrases: Record<Exclude<OutcomeRow, "unsaid">, string> = {
  profit: "made a profit", loss: "took a loss", breakeven: "broke even", "no-trade": "didn’t take a trade",
};
const processPhrases: Record<Exclude<ProcessColumn, "skipped">, string> = {
  followed: "followed your plan", partial: "partly followed your plan", broken: "moved away from your plan today",
};
const readBack = (...parts: (string | undefined)[]) => `You ${parts.filter(Boolean).join(" and ")}.`;
const reflectLabel = "Take this to your journal";

export function closingGuidance({ outcome, process, detail }: ClosingAnswers): Guidance | undefined {
  const row: OutcomeRow = !outcome || outcome === "rather-not-say" ? "unsaid" : outcome;
  // "What changed?" is preferred over the general combination question, and only counts after Partly or Not today.
  if (detail && detailProcesses.includes(process)) {
    const { phrase, prompt, question, practice } = closingDetails[detail];
    return {
      key: `closing:detail:${detail}`,
      because: readBack(row === "unsaid" ? undefined : outcomePhrases[row], phrase),
      prompt,
      ...(practice ? { practice } : {}),
      reflect: { question, label: reflectLabel },
    };
  }
  // Older days may hold "not-reviewed"; it counts as skipped.
  const column: ProcessColumn = !process || process === "not-reviewed" ? "skipped" : process;
  const question = closingQuestions[row][column];
  if (!question) return undefined;
  return {
    key: `closing:${row}:${column}`,
    because: readBack(row === "unsaid" ? undefined : outcomePhrases[row], column === "skipped" ? undefined : processPhrases[column]),
    prompt: question,
    reflect: { question, label: reflectLabel },
  };
}

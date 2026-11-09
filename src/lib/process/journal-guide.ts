import { z } from "zod";
import type { BodyOf } from "./model";

export const journalProfileSchema = z
  .object({
    focus: z.enum(["impulsiveness", "impatience", "fear", "greed", "general"]).optional(),
    holding: z.enum(["scalp", "intraday", "position"]),
    instruments: z.string().max(40),
    timeframes: z.string().max(160),
    capture: z.enum(["writing", "voice", "both"]),
    habit: z.enum(["results", "forget-plan", "rush", "custom"]),
    experience: z.string().max(8000),
    perspective: z.string().max(8000),
    risk: z.string().max(8000),
    pace: z.enum(["full", "short"]),
    modules: z
      .array(
        z.enum([
          "thesis",
          "temperature",
          "missions",
          "physiology",
          "variables",
          "process",
        ]),
      )
      .max(6),
    reviewOrder: z.enum(["stillness-first", "rules-first"]),
    stillness: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(["breathing", "grounding", "words", "audio"]),
            content: z.string().max(8000),
            context: z.enum(["any", "profit", "loss", "uncomfortable"]),
            audioPath: z.string().max(1000).optional(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type JournalProfile = z.infer<typeof journalProfileSchema>;
export const starterProfile = (): JournalProfile => ({
  focus: "general",
  holding: "intraday",
  instruments: "",
  timeframes: "15M, 1H, Daily",
  capture: "both",
  habit: "rush",
  experience: "",
  perspective: "",
  risk: "",
  pace: "full",
  modules: ["temperature", "physiology", "process"],
  reviewOrder: "stillness-first",
  stillness: [],
});
export function habitPrompt(habit: JournalProfile["habit"]) {
  return {
    results: "What would progress look like today regardless of the result?",
    "forget-plan":
      "What would remind me to return to my narrative before acting?",
    rush: "What will I notice before acting on an urge to enter?",
    custom: "What would I like to ask myself before today's session?",
  }[habit];
}
export const supportFocus = {
  impulsiveness: { title: "Impulsiveness", question: "What could help me notice an urge before acting on it?" },
  impatience: { title: "Impatience", question: "What would help me allow time for a setup, including not trading?" },
  fear: { title: "Fear", question: "What uncertainty am I carrying, and what support would help me meet it?" },
  greed: { title: "Greed", question: "What would help me respect my chosen limits when I want more?" },
  general: { title: "General mindful review", question: "What would I like to notice about my decisions today?" },
} as const;
export function supportQuestion(profile: JournalProfile) {
  return profile.focus ? supportFocus[profile.focus].question : habitPrompt(profile.habit);
}
export function moduleRecommendation(profile: JournalProfile) {
  return [
    {
      id: "temperature" as const,
      title: "Personal check-in",
      why: "Record how you describe feeling; reuse the same check-in throughout your day.",
    },
    {
      id: "physiology" as const,
      title: "Heart-rate context",
      why: "Inspect measured heart rate beside entries and reflections. You can journal without a wearable.",
    },
    {
      id: "process" as const,
      title: "Rule review",
      why: "Review behaviour separately from profit or loss, one rule at a time.",
    },
    {
      id: "variables" as const,
      title: "Personal conditions",
      why: "Optionally record caffeine, sleep or other context alongside the shared timeline.",
    },
  ];
}
export function suggestedSteps(
  profile: JournalProfile,
): BodyOf<"protocol">["steps"] {
  const prompt = (label: string) => ({
    id: crypto.randomUUID(),
    label,
    type: "text" as const,
    required: false,
    choices: [],
  });
  const definitions = [
    [
      "Arrive & check in",
      "Describe your own experience. These answers are shared with your journal and Command Center.",
      "checkin",
      "checkin",
      "session",
    ],
    [
      "Set your risk boundaries",
      "Keep your own commitments in view. These reminders do not establish adherence or decide whether you should trade.",
      "checklist",
      "manual",
      "session",
    ],
    [
      "Record my personal variables",
      "Optional context such as caffeine or sleep. Your check-in answers are already shared; there is no need to enter them twice.",
      "variables",
      "manual",
      "daily",
    ],
    [
      "Set my intentions",
      "Put today's process in the context of your longer-term goals. A saved routine is a reference, not a readiness score.",
      "intentions",
      "manual",
      "daily",
    ],
  ] as const;
  return definitions.map(
    ([name, description, activity, verification, cadence], order) => ({
      id: crypto.randomUUID(),
      name,
      description,
      activity,
      verification,
      cadence,
      order,
      category: "Preparation",
      requirement: "optional",
      condition: "",
      window: "Before my session",
      checklistMode: "reminder",
      allowReflectionSkip: true,
      checklist:
        activity === "checklist"
          ? profile.risk
              .split("\n")
              .filter(Boolean)
              .map((s) => s.slice(0, 160))
          : [],
      prompts:
        activity === "intentions"
          ? [prompt(supportQuestion(profile))]
          : activity === "checklist"
            ? [prompt("What risk commitments am I choosing for today?")]
            : [],
    }),
  );
}

import { z } from "npm:zod@4.6.7";
import type { BodyOf } from "./model.ts";

export const journalProfileSchema = z
  .object({
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
  holding: "intraday",
  instruments: "",
  timeframes: "15M, 1H, Daily",
  capture: "both",
  habit: "rush",
  experience: "",
  perspective: "",
  risk: "",
  pace: "full",
  modules: ["thesis", "temperature", "physiology", "process"],
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
export function moduleRecommendation(profile: JournalProfile) {
  return [
    {
      id: "thesis" as const,
      title: "Pinned market plan",
      why:
        profile.habit === "forget-plan"
          ? "You said your narrative can get lost during trading. Keep it within reach."
          : "Keep your market narrative and later changes beside your journal.",
    },
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
      id: "missions" as const,
      title: "Process mission",
      why: "Carry a practice goal across sessions instead of making a new goal every day.",
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
      "Review the bigger picture",
      profile.holding === "position"
        ? "Review the market context for positions carried across days. Keep an existing weekly thesis or revise it."
        : "Keep or revise this week's market context. This is separate from your longer-term personal perspective.",
      "thesis",
      "weekly-thesis",
      "weekly",
    ],
    [
      "Build today's trading plan",
      "What are you looking for today? Save a short narrative, key levels and invalidation. News notes or links can be added here.",
      "thesis",
      "daily-thesis",
      "daily",
    ],
    [
      "Set your risk boundaries",
      "Keep your own commitments in view. These reminders do not establish adherence or decide whether you should trade.",
      "checklist",
      "manual",
      "session",
    ],
    [
      "Review your process goal",
      "Carry an active mission forward. Creating one is optional; a goal can span several days.",
      "missions",
      "manual",
      "daily",
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
      thesisFields:
        activity === "thesis"
          ? ["primary", "levels", "invalidation", "events", "screenshots"]
          : undefined,
      checklist:
        activity === "checklist"
          ? profile.risk
              .split("\n")
              .filter(Boolean)
              .map((s) => s.slice(0, 160))
          : [],
      prompts:
        activity === "intentions"
          ? [
              prompt("What is today's process goal?"),
              prompt(
                "What monthly or career perspective do I want to remember?",
              ),
            ]
          : activity === "checklist"
            ? [prompt("What risk commitments am I choosing for today?")]
            : [],
    }),
  );
}

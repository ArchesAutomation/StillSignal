import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closingGuidance,
  closingQuestions,
  defaultIntentionExample,
  intentionExample,
  preparationGuidance,
} from "../src/lib/adaptive-guidance";
import { catalogue } from "../src/lib/stillness-catalogue";
import { arrivalFeelings, dayOutcomes, dayProcessChoices } from "../src/lib/process/model";

const exists = (id?: string) => !id || catalogue.some((item) => item.id === id);

test("each single arrival has its authored invitation and intention example", () => {
  const expected = {
    Settled: ["Take a moment to notice what feeling settled is like today.", "If the session speeds up, I’ll notice what helps me keep my pace."],
    Restless: ["Want a minute to settle before you start?", "If I feel pulled to act, I’ll take a moment to notice what’s driving it."],
    Tired: ["Take a moment to notice where your attention is today.", "If I notice my attention drifting, I’ll pause and decide how I want to continue."],
    Uncertain: ["Give yourself a moment to notice what feels unclear.", "When I feel unsure, I’ll pause and notice what I’m unsure about."],
    Hopeful: ["Take a moment to notice what you’re looking forward to and what you expect from today.", "I’ll notice if looking forward to today starts to feel like needing something to happen."],
  } as const;
  for (const feeling of arrivalFeelings) {
    const guidance = preparationGuidance({ arrival: [feeling] });
    assert.equal(guidance?.prompt, expected[feeling][0], feeling);
    assert.equal(intentionExample({ arrival: [feeling] }), expected[feeling][1], feeling);
    assert.ok(exists(guidance?.practice?.itemId), feeling);
    assert.equal(guidance?.reflect, undefined);
  }
});

test("Restless keeps the verified wording and Back to the room", () => {
  const guidance = preparationGuidance({ arrival: ["Restless"] });
  assert.equal(guidance?.because, "You marked Restless.");
  assert.deepEqual(guidance?.practice, { itemId: "body", label: "Preview Back to the room" });
  assert.equal(catalogue.find((item) => item.id === "body")?.name, "Back to the room");
});

test("several arrivals share one response; none keeps the quiet opening", () => {
  const several = preparationGuidance({ arrival: ["Restless", "Tired"] });
  assert.equal(several?.prompt, "A few things can be present at once. What would you like to make room for as you begin?");
  assert.equal(several?.key, preparationGuidance({ arrival: ["Hopeful", "Uncertain", "Settled"] })?.key);
  assert.ok(exists(several?.practice?.itemId));
  assert.equal(intentionExample({ arrival: ["Restless", "Tired"] }), "If I notice my state shifting, I’ll take a moment before deciding how to respond.");
  assert.equal(preparationGuidance({ arrival: [] }), undefined);
  assert.equal(intentionExample({ arrival: [] }), defaultIntentionExample);
  assert.equal(defaultIntentionExample, "When I notice pressure, I’ll give myself a moment before acting.");
});

test("every outcome × process cell matches the authored table", () => {
  const rowFor = (outcome?: string) => (!outcome || outcome === "rather-not-say" ? "unsaid" : outcome) as keyof typeof closingQuestions;
  const columnFor = (process?: string) => (!process || process === "not-reviewed" ? "skipped" : process) as "followed" | "partial" | "broken" | "skipped";
  let tailored = 0;
  for (const outcome of [undefined, ...dayOutcomes]) {
    for (const process of [undefined, ...dayProcessChoices]) {
      const guidance = closingGuidance({ outcome, process });
      const question = closingQuestions[rowFor(outcome)][columnFor(process)];
      assert.equal(guidance?.prompt, question ?? undefined, `${outcome} / ${process}`);
      if (guidance) {
        tailored++;
        assert.equal(guidance.reflect?.question, question);
        assert.equal(guidance.practice, undefined);
      }
    }
  }
  assert.equal(tailored, 24); // 30 cells; quiet: No trade, Rather not say and no outcome, each with no process (skipped or legacy)
});

test("spot checks against the rubric wording", () => {
  assert.equal(closingGuidance({ outcome: "no-trade", process: "followed" })?.prompt, "What helped you stick to your plan today?");
  assert.equal(closingGuidance({ outcome: "no-trade", process: "followed" })?.because, "You didn’t take a trade and followed your plan.");
  assert.equal(closingGuidance({ outcome: "loss", process: "followed" })?.prompt, "Thinking back to what you did before you knew the result, what would you give yourself credit for?");
  assert.equal(closingGuidance({ outcome: "profit" })?.because, "You made a profit.");
  assert.equal(closingGuidance({ outcome: "rather-not-say", process: "followed" })?.because, "You followed your plan.");
  assert.equal(closingGuidance({ outcome: "loss", process: "followed" })?.because, "You took a loss and followed your plan.");
  assert.equal(closingGuidance({ outcome: "breakeven", process: "partial" })?.because, "You broke even and partly followed your plan.");
  assert.equal(closingGuidance({ outcome: "profit", process: "broken" })?.because, "You made a profit and moved away from your plan today.");
  assert.equal(closingGuidance({ outcome: "no-trade" }), undefined);
  assert.equal(closingGuidance({ outcome: "rather-not-say" }), undefined);
  assert.equal(closingGuidance({}), undefined);
});

test("What changed? wins over the combination, after Partly or Not today only", () => {
  const hesitated = closingGuidance({ outcome: "no-trade", process: "partial", detail: "hesitated" });
  assert.equal(hesitated?.because, "You didn’t take a trade and hesitated.");
  assert.equal(hesitated?.prompt, "Want a moment to settle first?");
  assert.equal(hesitated?.reflect?.question, "What did you notice just before you held back?");
  assert.ok(hesitated?.practice && exists(hesitated.practice.itemId));
  const deviated = closingGuidance({ outcome: "loss", process: "broken", detail: "deviated" });
  assert.equal(deviated?.because, "You took a loss and deviated from your plan.");
  assert.equal(deviated?.reflect?.question, "What do you remember noticing in yourself just before you changed course?");
  assert.equal(deviated?.practice, undefined);
  const early = closingGuidance({ outcome: "profit", process: "partial", detail: "early" });
  assert.equal(early?.because, "You made a profit and got in too early.");
  assert.equal(early?.reflect?.question, "What do you remember noticing just before you went in?");
  assert.ok(early?.practice && exists(early.practice.itemId));
  assert.equal(closingGuidance({ process: "broken", detail: "early" })?.because, "You got in too early.");
  const late = closingGuidance({ outcome: "breakeven", process: "partial", detail: "late" });
  assert.equal(late?.because, "You broke even and got in too late.");
  assert.equal(late?.reflect?.question, "What do you remember noticing in the moments before you went in?");
  assert.ok(late?.practice && exists(late.practice.itemId));
  // Ignored without Partly or Not today.
  assert.equal(closingGuidance({ outcome: "loss", process: "followed", detail: "hesitated" })?.key, "closing:loss:followed");
  assert.equal(closingGuidance({ outcome: "profit", detail: "early" })?.key, "closing:profit:skipped");
  assert.equal(closingGuidance({ outcome: "no-trade", detail: "hesitated" }), undefined);
});

test("draft practices exist, keep stable ids and are appended after reviewed content", () => {
  const ids = catalogue.map((item) => item.id);
  assert.deepEqual(ids.slice(0, 6), ["waiting", "release", "body", "enough", "awareness", "identity"]);
  for (const id of ["arrive", "after-decision", "wider-view"]) assert.ok(ids.includes(id));
});

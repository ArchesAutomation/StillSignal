import { test } from "node:test";
import assert from "node:assert/strict";
import { timelinePhase } from "../src/lib/timeline-phase";

test("timeline colors follow the five objective trade phases", () => {
  const trades = [{ entry: 100, exit: 200 }, { entry: 300, exit: 400 }];
  assert.equal(timelinePhase("REFLECTION", 50, trades), "before");
  assert.equal(timelinePhase("REFLECTION", 100, trades), "entry");
  assert.equal(timelinePhase("REFLECTION", 150, trades), "management");
  assert.equal(timelinePhase("REFLECTION", 200, trades), "exit");
  assert.equal(timelinePhase("REFLECTION", 225, trades), "after");
  assert.equal(timelinePhase("REFLECTION", 275, trades), "before");
  assert.equal(timelinePhase("REFLECTION", 450, trades), "after");
  assert.equal(timelinePhase("FILL", 150, trades), "management");
  assert.equal(timelinePhase("ENTRY", 100, []), "entry");
  assert.equal(timelinePhase("EXIT", 200, []), "exit");
  assert.equal(timelinePhase("REFLECTION", 150, []), "reflection");
  assert.equal(timelinePhase("REFLECTION", 175, [{ entry: 100 }]), "management");
});

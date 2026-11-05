import { test } from "node:test";
import assert from "node:assert/strict";
import { searchLearningTopics } from "../src/lib/learning-content";
test("task search understands practical rule, dose and missing-data questions",()=>{
  assert.ok(searchLearningTopics(" FIRST rule ").some(t=>t.id==="rules"&&t.page==="Trade Quality"));
  assert.ok(searchLearningTopics("caffeine dose").some(t=>t.id==="variables"));
  assert.ok(searchLearningTopics("heart rate unavailable").some(t=>t.id==="capture"));
  assert.equal(searchLearningTopics("unfindablezz123").length,0);
});

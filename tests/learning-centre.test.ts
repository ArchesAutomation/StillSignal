import { test } from "node:test";
import assert from "node:assert/strict";
import { searchLearningTopics } from "../src/lib/learning-content";
test("task search understands practical closing, dose and missing-data questions",()=>{
  assert.ok(searchLearningTopics(" close the DAY ").some(t=>t.id==="review"&&t.page==="Done")&&!searchLearningTopics("first rule").length);
  assert.ok(searchLearningTopics("caffeine dose").some(t=>t.id==="variables"));
  assert.ok(searchLearningTopics("heart rate unavailable").some(t=>t.id==="capture"));
  assert.equal(searchLearningTopics("unfindablezz123").length,0);
});

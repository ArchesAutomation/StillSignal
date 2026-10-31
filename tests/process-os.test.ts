import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecord, recordSchema, type BodyOf } from "../src/lib/process/model";
import { applicability, conditionSchema } from "../src/lib/process/conditions";
import { preparation } from "../src/lib/process/engine";
const day = createRecord("day", {date:"2026-10-31",timezone:"UTC",status:"preparing",instrument:"ES",account:"",timeframes:[],sessionIds:[],goal:""}, undefined, [], 100);
test("conditional preparation preserves unknown and excludes only evidenced false conditions", () => {
  const step: BodyOf<"protocol">["steps"][number] = {id:crypto.randomUUID(),name:"Event review",description:"",category:"Risk",requirement:"conditional",condition:"",verification:"manual",window:"",order:0};
  const template = createRecord("protocol", {name:"Routine",description:"",instrument:"",strategy:"",session:"",steps:[step]}, undefined, [], 100);
  const run = createRecord("run", {dayId:day.id,templateId:template.id,steps:[step],startedAt:100}, undefined, [], 100);
  assert.equal(preparation([day,template,run],day.id,200).unknown,1);
  const conditional = {...run,body:{...run.body,steps:[{...step,applicability:{type:"instrument" as const,value:"NQ"}}]}};
  assert.equal(preparation([day,template,conditional],day.id,200).excluded,1);
  assert.equal(applicability({type:"variable-above",definitionId:crypto.randomUUID(),threshold:2},[day],day.id,200),null);
  assert.equal(conditionSchema.safeParse({type:"javascript",code:"true"}).success,false);
  assert.equal(recordSchema.safeParse(template).success,true);
});

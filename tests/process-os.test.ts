import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecord, recordSchema, type BodyOf } from "../src/lib/process/model";
import { applicability, conditionSchema } from "../src/lib/process/conditions";
import { preparation } from "../src/lib/process/engine";
import { replayContext, replayTimeline } from "../src/lib/process/replay";
import { workspaceSchema } from "../src/lib/process/workspace-schema";
import { emptyModuleLayout } from "../src/lib/module-layout";
import type { Session } from "../src/lib/model";
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
test("workspace snapshots validate coordinates and preserve legacy empty boards", () => {
  assert.equal(workspaceSchema.safeParse(emptyModuleLayout()).success,true);
  const layout=emptyModuleLayout();
  layout.modules.test={section:"main",order:0,width:4,hidden:false,box:{x:1100,y:0,w:400,h:300}};
  assert.equal(workspaceSchema.safeParse(layout).success,false);
});
test("replay excludes revisions and backdated notes unavailable at the cursor", () => {
  const checkin=createRecord("checkin",{dayId:day.id,observedAt:120,answers:[],physical:"",circumstances:"",reflection:"Later interpretation"},undefined,[],300);
  assert.equal(replayContext([day,checkin],day.id,200).available.length,1);
  const session={id:crypto.randomUUID(),events:[],journal:[{id:"note",t:110,eventTime:100,label:"Reflection",text:"Edited later",updatedAt:400}]} as unknown as Session;
  const timeline=replayTimeline([day,checkin],day.id,session);
  assert.equal(timeline.filter(e => e.at <= 200).length,0);
  assert.equal(timeline.find(e => e.type === "journal")?.at,400);
});

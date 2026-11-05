import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { routineSessionId } from "../src/lib/process/routine-session";
import { emptyWorkspace } from "../src/lib/workspace";
import { createRecord } from "../src/lib/process/model";
import { starterProfile, suggestedSteps } from "../src/lib/process/journal-guide";
import { readProcess, saveProcess } from "../src/lib/process/storage";
import { freshDashboard } from "../src/lib/process/dashboard";
import { dashboardGrid, swapCardSlots, overlaps } from "../src/lib/process/dashboard-grid";

const day = () => createRecord("day", { date:"2026-11-05", timezone:"America/Denver", status:"preparing", instrument:"", account:"", timeframes:[], sessionIds:[], goal:"" });
test("routine sessions omit placeholders, demo and unrelated dates while retaining genuine same-day or linked sessions", () => {
  const d=day(), placeholder=emptyWorkspace("four-fix");
  const session={...placeholder, id:crypto.randomUUID(), startedAt:Date.parse("2026-11-05T18:00:00Z")};
  assert.equal(routineSessionId(placeholder,d),undefined);
  assert.equal(routineSessionId(undefined,d),undefined);
  assert.equal(routineSessionId(session,d),session.id);
  assert.equal(routineSessionId({...session,demo:true},d),undefined);
  const earlier={...session,startedAt:Date.parse("2026-11-04T18:00:00Z")};
  assert.equal(routineSessionId(earlier,d),undefined);
  d.body.sessionIds=[session.id];
  assert.equal(routineSessionId(earlier,d),session.id);
});
test("a rejected routine batch writes nothing; corrected retry is atomic and replay creates no duplicates", async () => {
  const d=day(), protocol=createRecord("protocol",{name:"Recovery routine",description:"",instrument:"",strategy:"",session:"",steps:suggestedSteps(starterProfile())});
  const run=createRecord("run",{dayId:d.rootId,templateId:protocol.id,steps:protocol.body.steps,startedAt:Date.now(),sessionId:routineSessionId(emptyWorkspace("four-fix"),d)});
  const bad={...run,body:{...run.body,sessionId:"workspace"}};
  await assert.rejects(saveProcess("four-fix-atomic",[d,protocol,bad]));
  assert.deepEqual(await readProcess("four-fix-atomic"),[]);
  await saveProcess("four-fix-atomic",[d,protocol,run]);
  await saveProcess("four-fix-atomic",[d,protocol,run]);
  assert.equal((await readProcess("four-fix-atomic")).length,3);
});
test("reorder swaps neighboring columns without creating an empty row or changing unrelated positions", () => {
  const layout=freshDashboard();
  layout.panels=layout.panels.filter(p=>["thesis","temperature","missions"].includes(p.id)).map((p,i)=>({...p,visible:true,grid:{x:i*4,y:0,w:4,h:8}}));
  const grid=dashboardGrid(layout), next=swapCardSlots(layout,grid,"thesis","temperature"), result=dashboardGrid(next);
  assert.deepEqual(result.thesis,grid.temperature);
  assert.deepEqual(result.temperature,grid.thesis);
  assert.deepEqual(result.missions,grid.missions);
  const boxes=Object.values(result);
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) assert.equal(overlaps(boxes[i],boxes[j]),false);
});

import type { Session } from "../model.ts";
import { positionIdeas, type TradeIdea } from "../position-ideas.ts";
import { mergeEvents } from "../trade-context.ts";
import { dateInZone, latest, type ProcessRecord } from "./model.ts";
export function completedIdeas(sessions: Session[]) {
  return positionIdeas(mergeEvents(sessions.filter(s => !s.demo && s.id !== "workspace").flatMap(s => s.events))).filter(i => i.exit !== undefined && i.openQuantity === 0 && !i.incomplete);
}
export const reviewInvitationKey = (idea: TradeIdea) => JSON.stringify([idea.account, idea.symbol, idea.entryEventId, idea.exitIds.slice().sort()]);
export function tradeRuleStatuses(records: ProcessRecord[], idea: TradeIdea) {
  const assessment = latest(records, "assessment").filter(a => !!a.body.tradeId && idea.fillIds.includes(a.body.tradeId)).sort((a,b) => b.createdAt - a.createdAt)[0];
  const playbook = records.find(r => r.kind === "playbook" && r.id === assessment?.body.playbookId);
  const evaluations = latest(records, "evaluation").filter(e => e.body.assessmentId === assessment?.id);
  return playbook?.kind === "playbook" ? playbook.body.rules.map(rule => ({ rule, assessment, evaluation: evaluations.find(e => e.body.ruleId === rule.id), status: evaluations.find(e => e.body.ruleId === rule.id)?.body.adherence ?? "unknown" })) : [];
}
export function completedOn(sessions: Session[], date: string, zone: string) {
  return completedIdeas(sessions).filter(i => dateInZone(i.exit!, zone) === date);
}

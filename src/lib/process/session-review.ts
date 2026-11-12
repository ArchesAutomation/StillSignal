import type { Session } from "../model";
import { positionIdeas, type TradeIdea } from "../position-ideas";
import { mergeEvents } from "../trade-context";
import { dateInZone } from "./model";
export function completedIdeas(sessions: Session[]) {
  return positionIdeas(
    mergeEvents(
      sessions
        .filter((s) => !s.demo && s.id !== "workspace")
        .flatMap((s) => s.events),
    ),
  ).filter(
    (i) => i.exit !== undefined && i.openQuantity === 0 && !i.incomplete,
  );
}
export const reviewInvitationKey = (idea: TradeIdea) =>
  JSON.stringify([
    idea.account,
    idea.symbol,
    idea.entryEventId,
    idea.exitIds.slice().sort(),
  ]);
export function completedOn(sessions: Session[], date: string, zone: string) {
  return completedIdeas(sessions).filter(
    (i) => dateInZone(i.exit!, zone) === date,
  );
}

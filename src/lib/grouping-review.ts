import type { Session } from "./model";
import type { SessionBlueprint } from "./blueprint-schema";
import { sessionIdeas } from "./position-ideas";
export type Grouping = NonNullable<SessionBlueprint["grouping"]>;
export const automatic: Grouping = { splits: [], merges: [] };
export function groupingSnapshot(s: Session): Grouping {
  return {
    ...automatic,
    ...s.blueprint?.grouping,
    groups: sessionIdeas(s).map((i) => ({
      id: i.id,
      fillIds: [...i.fillIds],
      allocations: i.allocations,
    })),
  };
}
export function splitGrouping(
  s: Session,
  ideaId: string,
  fillId: string,
): Grouping {
  const grouping = groupingSnapshot(s),
    group = grouping.groups!.find((g) => g.id === ideaId);
  if (!group) throw Error("Choose an existing journal idea.");
  const index = group.fillIds.indexOf(fillId);
  if (index < 1) throw Error("Keep at least one execution before the split.");
  return {
    ...grouping,
    groups: grouping.groups!.flatMap((g) =>
      g !== group
        ? [g]
        : [
            {
              id: g.id,
              fillIds: g.fillIds.slice(0, index),
              allocations: g.allocations,
            },
            {
              id: fillId,
              fillIds: g.fillIds.slice(index),
              allocations: g.allocations,
            },
          ],
    ),
  };
}
export function groupingEvidence(s: Session, g: Grouping) {
  return (
    g.groups ||
    sessionIdeas({
      ...s,
      blueprint: {
        ...s.blueprint,
        updatedAt: s.blueprint?.updatedAt || 0,
        grouping: g,
      },
    }).map((i) => ({
      id: i.id,
      fillIds: i.fillIds,
      allocations: i.allocations,
    }))
  ).map((group) => {
    const fills = group.fillIds
      .map((id) => s.events.find((e) => e.id === id))
      .filter((e) => !!e)
      .map((e) => ({
        ...e,
        quantity: group.allocations?.[e.id] ?? e.quantity,
      }));
    const net = fills.reduce(
      (n, e) =>
        n +
        e.quantity *
          (e.action
            ? e.action === "buy"
              ? 1
              : -1
            : e.kind === "exit"
              ? e.side === "long"
                ? -1
                : 1
              : e.side === "long"
                ? 1
                : -1),
      0,
    );
    return {
      ...group,
      fills,
      incomplete:
        !fills.length || fills[0].kind === "exit" || Math.abs(net) > 1e-8,
      notes: s.journal.filter(
        (n) =>
          !n.deletedAt &&
          (n.tradeId === group.id ||
            (!!n.tradeId && group.fillIds.includes(n.tradeId))),
      ),
      chart: s.blueprint?.finalCharts?.[group.id],
    };
  });
}

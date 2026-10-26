import type { Session, TradeEvent } from "./model";
import { isActualExecution } from "./trade-context";
import { reconstructTrades, type CompletedTrade } from "./smart-journal";
export type TradeIdea = CompletedTrade & {
  id: string;
  account: string;
  currency: string;
  fillIds: string[];
  entryIds: string[];
  exitIds: string[];
  openQuantity: number;
  pnl?: number;
  allocations?: Record<string, number>;
  incomplete?: boolean;
};
const epsilon = 1e-8;
const accountOf = (e: TradeEvent) =>
  e.broker?.accountId || e.account || "manual";
const keyOf = (e: TradeEvent) =>
  JSON.stringify([
    accountOf(e),
    e.instrument?.id || e.symbol,
    e.currency || "USD",
    e.provenance || "execution",
  ]);
/** Journal ideas follow net exposure from flat to flat. Raw fills remain unchanged. */
export function positionIdeas(events: TradeEvent[]): TradeIdea[] {
  const open = new Map<
    string,
    { idea: TradeIdea; cost: number; exitValue: number; exited: number }
  >();
  const result: TradeIdea[] = [];
  // A normalized reversal has an exit and a new entry at the same instant.
  // Close the existing idea first even after cloud storage reorders equal times.
  for (const e of [...events]
    .filter(isActualExecution)
    .sort(
      (a, b) =>
        a.t - b.t ||
        Number(b.kind === "exit") - Number(a.kind === "exit") ||
        a.id.localeCompare(b.id),
    )) {
    if (e.positionKnown === false || (e.side === "unknown" && !e.action))
      continue;
    if (e.kind === "fill" && (!e.action || e.positionKnown !== true)) continue;
    const key = keyOf(e),
      previous = open.get(key);
    const direction = e.action
      ? e.action === "buy"
        ? "long"
        : "short"
      : e.kind === "exit"
        ? e.side === "long"
          ? "short"
          : "long"
        : e.side;
    let remaining = e.quantity;
    if (previous && previous.idea.side !== direction) {
      const qty = Math.min(previous.idea.openQuantity, remaining),
        idea = previous.idea;
      idea.fillIds.push(e.id);
      idea.exitIds.push(e.id);
      previous.exitValue += qty * e.price;
      previous.exited += qty;
      idea.openQuantity -= qty;
      remaining -= qty;
      idea.exitPrice = previous.exitValue / previous.exited;
      if (e.pnl !== undefined) idea.pnl = (idea.pnl || 0) + e.pnl;
      if (idea.openQuantity < epsilon) {
        idea.openQuantity = 0;
        idea.exit = e.t;
        idea.exitEventId = e.id;
        open.delete(key);
      }
    }
    if (remaining < epsilon) continue;
    // An exit without its entry is incomplete evidence, never an invented position.
    if (e.kind === "exit") continue;
    const current = open.get(key);
    if (current && current.idea.side === direction) {
      current.idea.quantity += remaining;
      current.idea.openQuantity += remaining;
      current.cost += remaining * e.price;
      current.idea.entryPrice = current.cost / current.idea.quantity;
      current.idea.fillIds.push(e.id);
      current.idea.entryIds.push(e.id);
    } else {
      const idea: TradeIdea = {
        id: e.id,
        symbol: e.symbol,
        side: direction as "long" | "short",
        entry: e.t,
        entryPrice: e.price,
        entryEventId: e.id,
        quantity: remaining,
        openQuantity: remaining,
        account: accountOf(e),
        currency: e.currency || "USD",
        provenance: e.provenance,
        fillIds: [e.id],
        entryIds: [e.id],
        exitIds: [],
      };
      result.push(idea);
      open.set(key, {
        idea,
        cost: remaining * e.price,
        exitValue: 0,
        exited: 0,
      });
    }
  }
  return result;
}
export function sessionIdeas(session: Session): TradeIdea[] {
  let ideas = positionIdeas(session.events);
  const grouping = session.blueprint?.grouping;
  if (grouping?.groups) {
    const assigned = new Set(grouping.groups.flatMap((g) => g.fillIds));
    const manual = grouping.groups.flatMap((g) => {
      const fills = g.fillIds
        .map((id) => session.events.find((e) => e.id === id && !e.voided))
        .filter((e): e is TradeEvent => !!e)
        .map((e) => ({ ...e, quantity: g.allocations?.[e.id] ?? e.quantity }));
      if (!fills.length) return [];
      const original = ideas.find((i) =>
        i.fillIds.some((id) => g.fillIds.includes(id)),
      );
      if (!original) return [];
      const entries = fills.filter((e) => e.kind !== "exit"),
        exits = fills.filter((e) => e.kind === "exit");
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
      return [
        {
          ...original,
          id: g.id,
          fillIds: fills.map((e) => e.id),
          entryIds: entries.map((e) => e.id),
          exitIds: exits.map((e) => e.id),
          entry: fills[0].t,
          entryEventId: fills[0].id,
          exit:
            Math.abs(net) < 1e-8 && fills[0].kind !== "exit"
              ? fills.at(-1)!.t
              : undefined,
          exitEventId: exits.at(-1)?.id,
          openQuantity: Math.abs(net),
          incomplete: fills[0].kind === "exit" || Math.abs(net) > 1e-8,
          quantity: entries.reduce((n, e) => n + e.quantity, 0),
          allocations: g.allocations,
          entryPrice: entries.length
            ? entries.reduce((n, e) => n + e.price * e.quantity, 0) /
              entries.reduce((n, e) => n + e.quantity, 0)
            : original.entryPrice,
          exitPrice: exits.length
            ? exits.reduce((n, e) => n + e.price * e.quantity, 0) /
              exits.reduce((n, e) => n + e.quantity, 0)
            : undefined,
          pnl:
            exits.length && exits.every((e) => e.pnl !== undefined)
              ? exits.reduce(
                  (n, e) =>
                    n +
                    e.pnl! *
                      (e.quantity /
                        (session.events.find((raw) => raw.id === e.id)
                          ?.quantity || e.quantity)),
                  0,
                )
              : undefined,
        },
      ];
    });
    return [
      ...manual,
      ...positionIdeas(session.events.filter((e) => !assigned.has(e.id))),
    ].sort((a, b) => a.entry - b.entry);
  }
  for (const split of grouping?.splits || []) {
    const index = ideas.findIndex(
      (i) => i.entryIds.includes(split) && i.id !== split,
    );
    if (index < 0) continue;
    const original = ideas[index],
      boundary = original.entryIds.indexOf(split);
    const sourceEvents = session.events.filter((e) =>
      original.fillIds.includes(e.id),
    );
    const lots = reconstructTrades(sourceEvents);
    const before = lots.filter(
        (l) => original.entryIds.indexOf(l.entryEventId!) < boundary,
      ),
      after = lots.filter(
        (l) => original.entryIds.indexOf(l.entryEventId!) >= boundary,
      );
    if (!before.length || !after.length) continue;
    const make = (parts: CompletedTrade[]): TradeIdea => {
      parts.sort((a, b) => a.entry - b.entry);
      const quantity = parts.reduce((n, l) => n + l.quantity, 0),
        closed = parts.filter((l) => l.exit !== undefined),
        exited = closed.reduce((n, l) => n + l.quantity, 0);
      const entries = [...new Set(parts.map((l) => l.entryEventId!))],
        exits = [...new Set(closed.map((l) => l.exitEventId!))];
      const allocations: Record<string, number> = {};
      for (const l of parts) {
        allocations[l.entryEventId!] =
          (allocations[l.entryEventId!] || 0) + l.quantity;
        if (l.exitEventId)
          allocations[l.exitEventId] =
            (allocations[l.exitEventId] || 0) + l.quantity;
      }
      const end = closed.sort((a, b) => a.exit! - b.exit!).at(-1);
      return {
        ...original,
        id: entries[0],
        entryEventId: entries[0],
        entry: parts[0].entry,
        quantity,
        entryPrice:
          parts.reduce((n, l) => n + l.entryPrice * l.quantity, 0) / quantity,
        exit: closed.length === parts.length ? end?.exit : undefined,
        exitEventId: end?.exitEventId,
        exitPrice: exited
          ? closed.reduce((n, l) => n + l.exitPrice! * l.quantity, 0) / exited
          : undefined,
        openQuantity: quantity - exited,
        entryIds: entries,
        exitIds: exits,
        fillIds: original.fillIds.filter(
          (id) => entries.includes(id) || exits.includes(id),
        ),
        allocations,
        pnl:
          closed.length &&
          closed.every(
            (l) =>
              sourceEvents.find((e) => e.id === l.exitEventId)?.pnl !==
              undefined,
          )
            ? closed.reduce((n, l) => {
                const e = sourceEvents.find((e) => e.id === l.exitEventId)!;
                return n + (e.pnl! * l.quantity) / e.quantity;
              }, 0)
            : undefined,
      };
    };
    ideas.splice(index, 1, make(before), make(after));
  }
  for (const ids of grouping?.merges || []) {
    const selected = ideas.filter((i) => ids.includes(i.id));
    if (
      selected.length < 2 ||
      selected.some(
        (i) =>
          i.account !== selected[0].account ||
          i.symbol !== selected[0].symbol ||
          i.currency !== selected[0].currency ||
          i.side !== selected[0].side ||
          i.provenance !== selected[0].provenance,
      )
    )
      continue;
    selected.sort((a, b) => a.entry - b.entry);
    const first = selected[0],
      last = selected.at(-1)!;
    const quantity = selected.reduce((n, i) => n + i.quantity, 0);
    const merged: TradeIdea = {
      ...first,
      quantity,
      entryPrice:
        selected.reduce((n, i) => n + i.entryPrice * i.quantity, 0) / quantity,
      exit: selected.every((i) => i.exit !== undefined) ? last.exit : undefined,
      exitPrice: undefined,
      exitEventId: last.exitEventId,
      openQuantity: selected.reduce((n, i) => n + i.openQuantity, 0),
      pnl: selected.every((i) => i.pnl !== undefined)
        ? selected.reduce((n, i) => n + i.pnl!, 0)
        : undefined,
      fillIds: [...new Set(selected.flatMap((i) => i.fillIds))],
      entryIds: selected.flatMap((i) => i.entryIds),
      exitIds: selected.flatMap((i) => i.exitIds),
      allocations: selected.some((i) => i.allocations)
        ? selected.reduce(
            (values, i) => {
              for (const id of i.fillIds)
                values[id] =
                  (values[id] || 0) +
                  (i.allocations?.[id] ??
                    session.events.find((e) => e.id === id)?.quantity ??
                    0);
              return values;
            },
            {} as Record<string, number>,
          )
        : undefined,
    };
    ideas = ideas.filter((i) => !ids.includes(i.id));
    ideas.push(merged);
  }
  return ideas.sort((a, b) => a.entry - b.entry || a.id.localeCompare(b.id));
}

import type {
  JournalEntry,
  Sample,
  Session,
  Settings,
  TradeEvent,
} from "./model";
import { nearest } from "./analytics";

export type HrMoment = {
  id: string;
  t: number;
  end: number;
  peak: number;
  baseline: number;
  delta: number;
  kind: "rise" | "elevation";
};
export const liveNotes = (notes: JournalEntry[]) =>
  notes.filter((n) => !n.deletedAt);
const revision = (n: JournalEntry) =>
  Math.max(n.updatedAt || n.t, n.deletedAt || 0);
export function mergeNotes(...sets: JournalEntry[][]) {
  const map = new Map<string, JournalEntry>();
  for (const notes of sets)
    for (const n of notes) {
      const old = map.get(n.id);
      if (
        !old ||
        revision(n) > revision(old) ||
        (revision(n) === revision(old) && !!n.deletedAt)
      )
        map.set(n.id, n);
    }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

// One episode per elevation, rearmed only after 30 seconds below half threshold.
// Opening baseline must complete; gaps never count as sustained measurements.
export function detectHrMoments(
  samples: Sample[],
  settings: Pick<Settings, "baselineSeconds" | "threshold">,
): HrMoment[] {
  if (samples.length < 30) return [];
  const start = samples[0].t,
    ready = start + settings.baselineSeconds * 1000;
  const opening = samples.filter((p) => p.t < ready);
  if (
    opening.length < 30 ||
    opening.at(-1)!.t - start < settings.baselineSeconds * 800
  )
    return [];
  const baseline = opening.reduce((a, p) => a + p.bpm, 0) / opening.length;
  const result: HrMoment[] = [];
  let high: number | null = null,
    low: number | null = null,
    episode: HrMoment | null = null,
    lookback = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (p.t < ready) continue;
    if (i && p.t - samples[i - 1].t > 10000) {
      high = low = null;
      episode = null;
      lookback = i;
    }
    while (lookback < i && samples[lookback].t < p.t - 15000) lookback++;
    const delta = p.bpm - baseline;
    if (episode) {
      episode.end = p.t;
      episode.peak = Math.max(episode.peak, p.bpm);
      episode.delta = episode.peak - baseline;
      if (delta < settings.threshold / 2) {
        low ??= p.t;
        if (p.t - low >= 30000) {
          episode = null;
          high = null;
          low = null;
        }
      } else low = null;
      continue;
    }
    if (delta >= settings.threshold) high ??= p.t;
    else high = null;
    const rise =
      i > lookback &&
      p.bpm - samples[lookback].bpm >= settings.threshold &&
      delta >= settings.threshold;
    if (rise || (high !== null && p.t - high >= 15000)) {
      episode = {
        id: `hr-${p.t}`,
        t: p.t,
        end: p.t,
        peak: p.bpm,
        baseline,
        delta,
        kind: rise ? "rise" : "elevation",
      };
      result.push(episode);
    }
  }
  return result;
}

export function reflectionContext(
  samples: Sample[],
  t: number,
  settings: Settings,
  events: TradeEvent[],
  hrEventId?: string,
): JournalEntry["context"] {
  const point = nearest(samples, t);
  const opening = samples.filter(
    (p) => p.t < (samples[0]?.t || 0) + settings.baselineSeconds * 1000,
  );
  const baseline =
    opening.length >= 30 &&
    t >= (samples[0]?.t || 0) + settings.baselineSeconds * 1000
      ? opening.reduce((a, p) => a + p.bpm, 0) / opening.length
      : undefined;
  const event = events
    .filter(
      (e) =>
        e.provenance !== "alert" &&
        Math.abs(e.t - t) <= settings.windowSeconds * 1000,
    )
    .sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  return {
    ...(point ? { bpm: point.bpm } : {}),
    ...(baseline !== undefined && point
      ? { baseline, delta: point.bpm - baseline }
      : {}),
    ...(event ? { eventId: event.id } : {}),
    ...(hrEventId ? { hrEventId } : {}),
  };
}

export function personalProfile(sessions: Session[], owner: string) {
  const owned = sessions.filter(
    (s) => s.owner === owner && s.id !== "workspace",
  );
  const records = owned.flatMap((s) =>
    liveNotes(s.journal).map((note) => ({ note, session: s })),
  );
  const labels = new Map<
    string,
    {
      label: string;
      count: number;
      elevated: number;
      afterLoss: number;
      examples: { sessionId: string; noteId: string; t: number }[];
    }
  >();
  for (const { note, session } of records) {
    const row = labels.get(note.label) || {
      label: note.label,
      count: 0,
      elevated: 0,
      afterLoss: 0,
      examples: [],
    };
    row.count++;
    if ((note.context?.delta || 0) >= 10) row.elevated++;
    const lastExit = session.events
      .filter(
        (e) =>
          e.provenance !== "alert" &&
          e.kind === "exit" &&
          e.t <= note.t &&
          note.t - e.t < 600000,
      )
      .at(-1);
    if (lastExit?.pnl !== undefined && lastExit.pnl < 0) row.afterLoss++;
    if (row.examples.length < 5)
      row.examples.push({ sessionId: session.id, noteId: note.id, t: note.t });
    labels.set(note.label, row);
  }
  const patterns = [...labels.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  const deltas = records
    .map((r) => r.note.context?.delta)
    .filter((n): n is number => n !== undefined && n >= 10)
    .sort((a, b) => a - b);
  const enough =
    records.length >= 8 && new Set(records.map((r) => r.session.id)).size >= 3;
  const suggestedThreshold =
    enough && deltas.length >= 5
      ? Math.max(
          10,
          Math.min(
            40,
            Math.round(deltas[Math.floor((deltas.length - 1) * 0.5)]),
          ),
        )
      : null;
  return {
    count: records.length,
    sessionCount: owned.length,
    patterns,
    enough,
    suggestedThreshold,
  };
}

export function personalQuestion(
  profile: ReturnType<typeof personalProfile>,
  events: TradeEvent[],
  t: number,
) {
  const lastExit = events
    .filter(
      (e) =>
        e.provenance !== "alert" &&
        e.kind === "exit" &&
        e.t <= t &&
        t - e.t < 600000,
    )
    .at(-1);
  if (lastExit?.pnl !== undefined && lastExit.pnl < 0)
    return "You recorded a loss recently. What changed in your thoughts or urge to act?";
  const recurring = profile.patterns.find(
    (p) => p.count >= 3 && p.label !== "Other",
  );
  if (recurring)
    return `You have marked ${recurring.label.toLowerCase()} in ${recurring.count} reflections. Does that describe this moment, or does it feel different?`;
  return "What was happening, and what were you feeling or thinking?";
}

export type CompletedTrade = {
  symbol: string;
  side: "long" | "short";
  entry: number;
  exit?: number;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  provenance?: TradeEvent["provenance"];
};
export function reconstructTrades(events: TradeEvent[]) {
  const queues = new Map<string, { event: TradeEvent; remaining: number }[]>();
  const trades: CompletedTrade[] = [];
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    if (event.provenance === "alert") continue;
    const key = `${event.account || ""}:${event.symbol}:${event.side}:${event.provenance || event.source}`;
    const q = queues.get(key) || [];
    if (event.kind === "entry") q.push({ event, remaining: event.quantity });
    else {
      let quantity = event.quantity;
      while (quantity > 1e-8 && q.length) {
        const first = q[0],
          n = Math.min(quantity, first.remaining);
        trades.push({
          symbol: event.symbol,
          side: event.side,
          entry: first.event.t,
          exit: event.t,
          entryPrice: first.event.price,
          exitPrice: event.price,
          quantity: n,
          provenance: event.provenance,
        });
        quantity -= n;
        first.remaining -= n;
        if (first.remaining < 1e-8) q.shift();
      }
    }
    queues.set(key, q);
  }
  for (const q of queues.values())
    for (const { event, remaining } of q)
      trades.push({
        symbol: event.symbol,
        side: event.side,
        entry: event.t,
        entryPrice: event.price,
        quantity: remaining,
        provenance: event.provenance,
      });
  return trades;
}

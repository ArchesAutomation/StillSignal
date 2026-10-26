import type { Session } from "./model";
import { environmentAt } from "./journal-reference";
import { journalDateValue } from "./journal-day";
export type ContextFilter = {
  location?: string;
  country?: string;
  social?: string;
  setup?: string;
  lifestyle?: string;
  answer?: string;
  commitment?: string;
};
export const unknown = "Unknown / not recorded";
export function contextAt(
  s: Session,
  at: number,
  capturedAt = Infinity,
  capture?: import("./model").JournalEntry["capture"],
) {
  const env = s.blueprint?.combine?.environment
    ? capture
      ? capture.environment
      : environmentAt(s, at, capturedAt)
    : undefined;
  const life = s.blueprint?.combine?.environment
    ? (s.blueprint?.lifestyle || []).filter(
        (e) =>
          e.linkedDay === journalDateValue(at) &&
          e.start <= at &&
          (!e.end || e.end >= at),
      )
    : [];
  const upcoming = s.blueprint?.combine?.environment
    ? (s.blueprint?.lifestyle || []).filter(
        (e) =>
          e.category === "Upcoming commitment" &&
          e.linkedDay === journalDateValue(at) &&
          e.start >= at &&
          e.start <= at + 90 * 60000,
      )
    : [];
  return {
    location: env?.location || unknown,
    country: env?.country || unknown,
    social: env?.social || unknown,
    setup: env?.setup || unknown,
    life,
    commitment: upcoming.some((e) => e.answer !== "no")
      ? "yes"
      : upcoming.some((e) => e.answer === "no")
        ? "no"
        : "unknown",
  };
}
export function contextMatches(
  s: Session,
  at: number,
  filter?: ContextFilter,
  capturedAt = Infinity,
  capture?: import("./model").JournalEntry["capture"],
) {
  if (!filter) return true;
  const ctx = contextAt(s, at, capturedAt, capture);
  for (const key of ["location", "country", "social", "setup"] as const)
    if (filter[key] && ctx[key] !== filter[key]) return false;
  if (filter.commitment && ctx.commitment !== filter.commitment) return false;
  if (filter.lifestyle) {
    const records = ctx.life.filter(
      (e) => (e.categoryLabel || e.category) === filter.lifestyle,
    );
    if (filter.answer === "unknown") {
      if (records.some((e) => e.answer)) return false;
    } else if (
      filter.answer &&
      !records.some((e) => e.answer === filter.answer)
    )
      return false;
  }
  return true;
}
export function excludedAt(s: Session, t: number) {
  return !!s.blueprint?.measurementPauses?.some(
    (p) => t >= p.start && t <= (p.end || Infinity),
  );
}

export function comparableSample(s: Session, p: import("./model").Sample) {
  return !excludedAt(s, p.t) && p.quality !== "artifact";
}

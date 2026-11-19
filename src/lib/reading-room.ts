import { emptyModuleLayout, type ModuleLayout } from "./module-layout";
import { freshDashboard, type DashboardLayout } from "./process/dashboard";
import { dateInZone, latest, type ProcessRecord } from "./process/model";
import type { Session } from "./model";
import { arrivalCheckin } from "./process/daily-preparation";
import { journalDateValue } from "./journal-day";
import { isActualExecution } from "./trade-context";

// A validated section ID identifies the presentation without changing saved record schemas.
export const READING_ROOM_SECTION = "reading-room";
export function isReadingRoom(layout?: ModuleLayout) {
  return !!layout?.sections.some((s) => s.id === READING_ROOM_SECTION);
}
export function readingRoomDashboard(): DashboardLayout {
  const workspace = emptyModuleLayout();
  workspace.sections = [
    { id: READING_ROOM_SECTION, title: "Your daily reference", width: 3 },
    { id: "main", title: "Your journal", width: 9 },
    { id: "more", title: "More tools", width: 12 },
  ];
  const hidden = ["dates", "calendar", "journal-heading", "session-controls", "day-summary", "writing", "intentions", "observations", "review-chart", "weekly-reflection", "post-exit-review", "process-context", "linked-preparation", "linked-variables", "linked-quality", "session-context", "execution-grouping", "pnl-timeline", "previous-writing", "label-summary", "stage-labels", "trade-activity"];
  for (const [order, id] of hidden.entries()) workspace.modules[id] = { section: "more", order, width: 12, hidden: true };
  workspace.modules["daily-reference"] = { section: READING_ROOM_SECTION, order: 0, width: 12, hidden: false };
  for (const [order, id] of ["journal-book", "timeline", "moments", "evidence"].entries()) {
    workspace.modules[id] = { section: "main", order, width: 12, hidden: false };
  }
  return { ...freshDashboard(), name: "Reading Room", page: "Journal", isDefault: false, statusWidgets: [], showMarket: false, workspace };
}

type ReferenceActivity = { away?: boolean; prepared?: boolean; started?: boolean; traded?: boolean };
export type ReferenceDayLabel = { short: "Away" | "Prep" | "Session" | "Trade"; detail: string };

/** Record only observed activity. A dated journal or an empty trading-day record is not a session or preparation. */
export function readingRoomDayLabels(records: ProcessRecord[], sessions: Session[], awayDates: string[], startedDates: string[]) {
  const byDate = new Map<string, ReferenceActivity>();
  const activity = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: ReferenceActivity = {};
    byDate.set(date, created);
    return created;
  };
  const days = latest(records, "day");
  const dates = new Map(days.map(day => [day.rootId, day.body.date]));
  for (const { body } of days) {
    if (body.goal.trim() || body.boundary?.trim() || body.stillness?.some(choice => choice.destination === "Preparation")) {
      activity(body.date).prepared = true;
    }
  }
  for (const { body } of latest(records, "checkin")) {
    const date = dates.get(body.dayId);
    if (date && body.phase === "pre-market" && (body.arrival?.length || body.answers.some(answer => answer.value !== null) ||
      body.reflection.trim() || body.physical.trim() || body.circumstances.trim())) {
      activity(date).prepared = true;
    }
  }
  for (const session of sessions) {
    if (session.blueprint?.plan?.intention?.trim()) activity(journalDateValue(session.startedAt)).prepared = true;
    for (const event of session.events) if (isActualExecution(event)) activity(journalDateValue(event.t)).traded = true;
  }
  for (const date of awayDates) activity(date).away = true;
  for (const date of startedDates) activity(date).started = true;

  const result: Record<string, ReferenceDayLabel> = {};
  for (const [date, { away, prepared, started, traded }] of byDate) {
    if (traded) result[date] = { short: "Trade", detail: away ? "Day away from charts · Trade recorded" : prepared ? "Trade recorded · Preparation saved" : "Trade recorded" };
    else if (away) result[date] = { short: "Away", detail: "Day away from charts" };
    else if (started) result[date] = { short: "Session", detail: "Session started · No trade recorded" };
    else if (prepared) result[date] = { short: "Prep", detail: "Preparation saved · No trade recorded" };
  }
  return result;
}

/** Read the selected journal day only. Opening the reference never creates process records. */
export function readingRoomReference(records: ProcessRecord[], session: Session, preparationOnly = false) {
  const date = dateInZone(session.startedAt, session.timezone || "UTC");
  const days = latest(records, "day").filter(d => d.body.date === date);
  const day = days.find(d => d.body.timezone === session.timezone) ?? (days.length === 1 ? days[0] : undefined);
  const checkin = day && latest(records, "checkin")
    .filter(c => c.body.dayId === day.rootId && (!preparationOnly || c.body.phase === "pre-market"))
    .sort((a,b) => b.body.observedAt - a.body.observedAt)[0];
  const arrival = arrivalCheckin(records, day?.rootId)?.body.arrival;
  const intention = day?.body.goal || session.blueprint?.plan?.intention;
  const arrivalText = arrival?.length ? arrival.join(" · ") : checkin &&
    (checkin.body.answers.filter(a => a.value !== null).map(a => `${a.question}: ${a.value}/10`).join(" · ") || checkin.body.reflection);
  return {
    intention: intention || "No intention recorded for this day.",
    arrival: arrivalText || (checkin ? "Check-in saved without ratings" : "No check-in recorded for this day."),
    hasIntention: !!intention?.trim(),
    hasArrival: !!arrivalText?.trim(),
  };
}

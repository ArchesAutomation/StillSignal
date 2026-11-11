import { emptyModuleLayout, type ModuleLayout } from "./module-layout";
import { freshDashboard, type DashboardLayout } from "./process/dashboard";
import { dateInZone, latest, type ProcessRecord } from "./process/model";
import type { Session } from "./model";
import { arrivalCheckin } from "./process/daily-preparation";

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
  for (const [order, id] of ["timeline", "moments", "evidence"].entries()) {
    workspace.modules[id] = { section: "main", order, width: 12, hidden: false };
  }
  return { ...freshDashboard(), name: "Reading Room", page: "Journal", isDefault: false, statusWidgets: [], showMarket: false, workspace };
}

/** Read the selected journal day only. Opening the reference never creates process records. */
export function readingRoomReference(records: ProcessRecord[], session: Session) {
  const date = dateInZone(session.startedAt, session.timezone || "UTC");
  const days = latest(records, "day").filter(d => d.body.date === date);
  const day = days.find(d => d.body.timezone === session.timezone) ?? (days.length === 1 ? days[0] : undefined);
  const checkin = day && latest(records, "checkin").filter(c => c.body.dayId === day.rootId).sort((a,b) => b.body.observedAt - a.body.observedAt)[0];
  const arrival = arrivalCheckin(records, day?.rootId)?.body.arrival;
  return {
    intention: day?.body.goal || session.blueprint?.plan?.intention || "No intention recorded for this day.",
    arrival: arrival?.length ? arrival.join(" · ") :
      checkin
        ? checkin.body.answers.filter(a => a.value !== null).map(a => `${a.question}: ${a.value}/10`).join(" · ") || checkin.body.reflection || "Check-in saved without ratings"
        : "No check-in recorded for this day.",
  };
}

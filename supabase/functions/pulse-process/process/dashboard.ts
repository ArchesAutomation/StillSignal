import { defaultLayout } from "./engine.ts";
import { createRecord, type BodyOf, type RecordOf } from "./model.ts";

export type DashboardLayout = BodyOf<"layout">;
export type CardId = DashboardLayout["panels"][number]["id"];
export const cards: Record<CardId, { title: string; detail: string }> = {
  preparation: {
    title: "Pre-market non-negotiables",
    detail: "Your routine and preparation checklist.",
  },
  thesis: {
    title: "Trading thesis",
    detail: "Your outlook, levels and trade scenarios.",
  },
  process: {
    title: "Trade quality",
    detail: "Preparation, playbook reviews and rule adherence.",
  },
  temperature: {
    title: "Temperature check",
    detail: "Your own focus, energy and physical check-in.",
  },
  missions: {
    title: "Active missions",
    detail: "The habits and process goals you are working on.",
  },
  physiology: {
    title: "Live physiological context",
    detail: "Recorded heart rate and wearable context.",
  },
  variables: {
    title: "Personal variables",
    detail: "Measurements you created, with today's recorded values.",
  },
};
export const statusLabels = {
  session: "Session & instrument",
  preparation: "Preparation",
  readiness: "Readiness",
  thesis: "Trading thesis",
  review: "Journal & review",
  goal: "Daily goal",
};
/** Old six-card dashboards remain unchanged; new cards start hidden. */
export function normalizeLayout(layout: DashboardLayout): DashboardLayout {
  return {
    ...layout,
    panels: [
      ...layout.panels,
      ...Object.keys(cards)
        .filter((id) => !layout.panels.some((p) => p.id === id))
        .map((id) => ({
          id: id as CardId,
          visible: false,
          width: "normal" as const,
        })),
    ],
  };
}
export function freshDashboard(): DashboardLayout {
  return normalizeLayout({ ...defaultLayout().body, name: "My dashboard" });
}
export function moveCard(
  layout: DashboardLayout,
  from: CardId,
  to: CardId,
): DashboardLayout {
  const panels = [...layout.panels];
  const start = panels.findIndex((p) => p.id === from),
    end = panels.findIndex((p) => p.id === to);
  if (start < 0 || end < 0 || start === end) return layout;
  panels.splice(end, 0, panels.splice(start, 1)[0]);
  return { ...layout, panels };
}
/** Save the chosen home dashboard and retire earlier defaults atomically. */
export function dashboardRecords(
  body: DashboardLayout,
  previous: RecordOf<"layout"> | undefined,
  layouts: RecordOf<"layout">[],
) {
  const record = createRecord(
    "layout",
    { ...body, name: body.name.trim() },
    previous,
  );
  const demoted = body.isDefault
    ? layouts
        .filter((row) => row.rootId !== record.rootId && row.body.isDefault)
        .map((row) =>
          createRecord("layout", { ...row.body, isDefault: false }, row),
        )
    : [];
  return { record, batch: [...demoted, record] };
}

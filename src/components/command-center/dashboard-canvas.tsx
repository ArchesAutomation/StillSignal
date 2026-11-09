"use client";
import type { ReactNode } from "react";
import ModuleWorkspace, {
  ModuleScope,
  WorkspaceModule,
} from "../module-workspace";
import { cards, type DashboardLayout } from "@/lib/process/dashboard";
import { dashboardGrid } from "@/lib/process/dashboard-grid";
import { emptyModuleLayout, type ModuleLayout } from "@/lib/module-layout";

type Card = DashboardLayout["panels"][number];

/** Read old dashboard grids once; all subsequent edits use the shared board. */
export function dashboardWorkspace(layout: DashboardLayout): ModuleLayout {
  if (layout.workspace) return layout.workspace;
  const value = emptyModuleLayout();
  value.sections = [
    { id: "top", title: "At a glance", width: 12 },
    { id: "main", title: "My dashboard", width: 12 },
    { id: "bottom", title: "More", width: 12 },
  ];
  const grid = dashboardGrid(layout);
  for (const [order, card] of layout.panels.entries()) {
    const box = grid[card.id];
    value.modules[card.id] = {
      section: "main",
      order,
      width: card.width === "wide" ? 12 : 4,
      hidden: !card.visible,
      ...(box && card.grid
        ? {
            box: {
              x: (box.x * 1216) / 12,
              y: box.y * 40,
              w: (box.w * 1216) / 12 - 16,
              h: box.h * 40 - 16,
            },
            heightMode: card.heightMode,
            sectionRelative: true,
          }
        : {}),
    };
  }
  return value;
}

export default function DashboardCanvas({
  layout,
  editing,
  disabled,
  onChange,
  onInteracting,
  renderContent,
  before,
  after,
  owner = "dashboard",
  page = "Command Center",
  children,
}: {
  layout: DashboardLayout;
  editing: boolean;
  disabled: boolean;
  onChange: (next: DashboardLayout, message?: string) => void;
  onInteracting: (active: boolean) => void;
  renderContent: (card: Card) => ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  owner?: string;
  page?: DashboardLayout["page"];
  children?: ReactNode;
}) {
  const workspace = dashboardWorkspace(layout);
  // Visibility remains compatible with the existing card library and snapshots.
  const value = { ...workspace, modules: { ...workspace.modules } };
  for (const card of page === "Command Center" ? layout.panels : [])
    if (value.modules[card.id])
      value.modules[card.id] = {
        ...value.modules[card.id],
        hidden: !card.visible,
      };
  return (
    <ModuleWorkspace
      owner={owner}
      page={page ?? "Command Center"}
      onInteracting={onInteracting}
      controlled={{
        layout: value,
        editing,
        disabled,
        change: (next, message) => {
          onChange(
            {
              ...layout,
              workspace: next,
              panels: layout.panels.map((card) => ({
                ...card,
                visible: next.modules[card.id]
                  ? !next.modules[card.id].hidden
                  : card.visible,
              })),
            },
            message,
          );
        },
      }}
    >
      {before}
      {children}
      {page === "Command Center" && layout.panels.filter(card => card.id !== "thesis" && card.id !== "missions").map((card, order) => (
        <WorkspaceModule
          key={card.id}
          id={card.id}
          title={cards[card.id].title}
          section="main"
          order={order}
          width={card.width === "wide" ? 12 : 4}
          initiallyHidden={!card.visible}
        >
          <ModuleScope active={false}>
            <div className="cc-card-content">{renderContent(card)}</div>
          </ModuleScope>
        </WorkspaceModule>
      ))}
      {after}
    </ModuleWorkspace>
  );
}

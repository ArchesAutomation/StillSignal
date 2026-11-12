"use client";
import { emptyModuleLayout, type ModuleLayout } from "@/lib/module-layout";
import { type DashboardLayout } from "@/lib/process/dashboard";
import { dashboardGrid } from "@/lib/process/dashboard-grid";
import type { ReactNode } from "react";
import ModuleWorkspace from "../module-workspace";

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
  before,
  owner = "dashboard",
  page = "Journal",
  children,
}: {
  layout: DashboardLayout;
  editing: boolean;
  disabled: boolean;
  onChange: (next: DashboardLayout, message?: string) => void;
  onInteracting: (active: boolean) => void;
  before?: ReactNode;
  owner?: string;
  page?: "Journal" | "Stillness";
  children?: ReactNode;
}) {
  return (
    <ModuleWorkspace
      owner={owner}
      page={page}
      onInteracting={onInteracting}
      controlled={{
        layout: dashboardWorkspace(layout),
        editing,
        disabled,
        change: (workspace, message) =>
          onChange({ ...layout, workspace }, message),
      }}
    >
      {before}
      {children}
    </ModuleWorkspace>
  );
}

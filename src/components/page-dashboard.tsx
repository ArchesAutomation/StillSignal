"use client";
import type { Session } from "@/lib/model";
import { evidenceReadingLayout } from "@/lib/module-board";
import {
  emptyModuleLayout,
  moduleLayoutKey,
  readModuleLayout,
  type ModuleLayout,
} from "@/lib/module-layout";
import { isReadingRoom, readingRoomDashboard } from "@/lib/reading-room";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import DashboardBoard, { useDashboardEditor } from "./process/dashboard-board";
import { useProcess } from "./process/use-process";

/** Reuse the account-scoped cloud records; existing browser-only boards seed the starter. */
export default function PageDashboard({ owner, page, sessions, children, onPresentationChange }: {
  owner: string; page: "Journal" | "Stillness";
  sessions: Session[]; children: ReactNode;
  onPresentationChange?: (readingRoom: boolean) => void;
}) {
  const store = useProcess(owner, sessions);
  const editor = useDashboardEditor();
  const [seed, setSeed] = useState<ModuleLayout>(emptyModuleLayout);
  const [seedReady, setSeedReady] = useState(false);
  const reportWorkspace = useCallback((workspace?: ModuleLayout) => onPresentationChange?.(page === "Journal" && isReadingRoom(workspace)), [page, onPresentationChange]);
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(moduleLayoutKey(owner, page)); } catch {}
    let value = readModuleLayout(raw);
    // Preserve the old evidence preference as the initial dashboard, not a competing view toggle.
    try {
      if (page === "Journal" && JSON.parse(localStorage.getItem(`ss-appearance:${owner}`) || "{}").balance === "evidence") {
        const modules = Object.entries(value.modules).map(([id,p]) => ({ id, section:p.section, order:p.order, width:p.width, initiallyHidden:p.hidden }));
        value = evidenceReadingLayout(value, modules, {});
      }
    } catch {}
    setSeed(value);
    setSeedReady(true);
  }, [owner, page]);

  return <>
    {store.error && <p role="alert">{store.error}</p>}
    <DashboardBoard owner={owner} page={page} seed={seed} starter={page === "Journal" ? readingRoomDashboard() : undefined} onWorkspaceChange={reportWorkspace} store={{ ...store, busy: store.busy || !seedReady || !store.loaded }} editor={editor}>
      {children}
    </DashboardBoard>
  </>;
}

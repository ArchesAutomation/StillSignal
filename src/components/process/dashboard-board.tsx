"use client";
import { Panel } from "@/components/ui/panel";
import {
  dashboardRecords,
  dashboardSnapshot,
  freshDashboard,
  normalizeLayout,
  readDashboardSnapshot,
  type DashboardLayout,
} from "@/lib/process/dashboard";
import { latest, type RecordOf } from "@/lib/process/model";
import { isReadingRoom } from "@/lib/reading-room";
import { Pencil, Plus, RotateCcw, Undo2 } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModuleScope } from "../module-workspace";
import DashboardCanvas from "./dashboard-canvas";
import { Field } from "./shared";
import type { ProcessStore } from "./use-process";

// Owned by the account-keyed workspace so navigation cannot discard a draft.
export function useDashboardEditor() {
  const [draft, setDraft] = useState<DashboardLayout>();
  const [base, setBase] = useState<RecordOf<"layout">>();
  const [undo, setUndo] = useState<DashboardLayout[]>([]);
  return { draft, setDraft, base, setBase, undo, setUndo };
}
export type DashboardEditor = ReturnType<typeof useDashboardEditor>;

export default function DashboardBoard({
  store,
  owner,
  editor,
  before,
  page,
  children,
  seed,
  starter,
  onWorkspaceChange,
}: {
  editor: DashboardEditor;
  page: "Journal" | "Stillness";
  children?: ReactNode;
  seed?: DashboardLayout["workspace"];
  starter?: DashboardLayout;
  onWorkspaceChange?: (workspace?: DashboardLayout["workspace"]) => void;
  before?: ReactNode;
  store: ProcessStore;
  owner: string;
}) {
  const makeInitial = (): DashboardLayout => ({
    ...freshDashboard(),
    page,
    workspace: seed,
    statusWidgets: [],
    showMarket: false,
  });
  const initial = makeInitial();
  const layouts = latest(store.records, "layout").filter(
    (r) => (r.body.page ?? "Command Center") === page,
  );
  const selectionKey = "still-signal-dashboard-v1:" + owner + (":" + page);
  const home = layouts
    .filter((r) => r.body.isDefault)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const [selectedId, setSelectedId] = useState<string>();
  const chosenLayout = layouts.find((r) => r.rootId === selectedId);
  const useClassic = starter
    ? selectedId === "classic"
    : !home && selectedId === "starter";
  const selected = starter
    ? chosenLayout
    : useClassic
      ? undefined
      : (chosenLayout ?? home ?? layouts[0]);
  const builtIn = useClassic ? initial : (starter ?? initial);
  const saved = selected ? normalizeLayout(selected.body) : builtIn;
  const { draft, setDraft, base, setBase, undo, setUndo } = editor;
  const [message, setMessage] = useState("");
  const [showJournalLayouts, setShowJournalLayouts] = useState(false);
  const [snapshots, setSnapshots] = useState(false);
  const [snapshotCode, setSnapshotCode] = useState("");
  const [interacting, setInteracting] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const journalLayoutsButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const editing = !!draft;
  // Stored legacy records remain readable; only current page modules are mounted.
  // Keep stored layouts compatible without mounting the old checklist module.
  const sourceLayout = draft ?? saved;
  useLayoutEffect(() => {
    onWorkspaceChange?.(sourceLayout.workspace);
  }, [sourceLayout.workspace, onWorkspaceChange]);
  const layout: DashboardLayout = {
    ...sourceLayout,
    panels: sourceLayout.panels
      .map((p) =>
        ["thesis", "missions"].includes(p.id) ? { ...p, visible: false } : p,
      )
      .filter((p) => p.id !== "preparation"),
    statusWidgets: sourceLayout.statusWidgets.filter((id) => id !== "thesis"),
    showMarket: false,
  };
  const stale =
    editing &&
    !!base &&
    layouts.some((r) => r.rootId === base.rootId && r.id !== base.id);
  useEffect(() => {
    if (starter) return;
    try {
      const id = localStorage.getItem(selectionKey);
      if (id) setSelectedId(id);
    } catch {
      /* Device storage is optional. */
    }
  }, [selectionKey, starter]);
  useEffect(() => {
    if (editing) nameInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing]);
  const choose = (id: string) => {
    setSelectedId(id);
    if (starter) return;
    try {
      localStorage.setItem(selectionKey, id);
    } catch {
      /* Selection still works without storage. */
    }
  };
  const change = (next: DashboardLayout, announcement = "") => {
    setUndo((rows) => [...rows.slice(-39), layout]);
    setDraft(next);
    setMessage(announcement);
  };
  const start = (copy = false) => {
    setBase(copy ? undefined : selected);
    setDraft({
      ...saved,
      name: copy ? saved.name.slice(0, 155) + " copy" : saved.name,
      isDefault: copy ? false : saved.isDefault,
    });
    setUndo([]);
    setMessage("");
  };
  const finish = () => {
    setDraft(undefined);
    setUndo([]);
  };
  return (
    <ModuleScope active={false}>
      <div className={"cc-dashboard-board" + (draft ? " cc-editing" : "")}>
        <Panel className="cc-dashboard-toolbar">
          {draft ? (
            <>
              <div className="cc-dashboard-editor-title">
                <Pencil size={16} />
                <strong>Make this dashboard yours</strong>
                <span>Drag to move. Resize from any edge or corner.</span>
              </div>
              <div className="cc-actions">
                <button
                  disabled={store.busy || interacting}
                  title="Restore the original dashboard arrangement. You can undo this before saving."
                  onClick={() =>
                    change(
                      {
                        ...(starter && isReadingRoom(sourceLayout.workspace)
                          ? starter
                          : makeInitial()),
                        name: draft.name,
                        isDefault: draft.isDefault,
                      },
                      "Original arrangement restored. Undo to go back.",
                    )
                  }
                >
                  <RotateCcw size={15} /> Reset layout
                </button>
                <button
                  disabled={!undo.length || store.busy || interacting}
                  onClick={() => {
                    setDraft(undo.at(-1));
                    setUndo((rows) => rows.slice(0, -1));
                    setMessage("Change undone.");
                  }}
                >
                  <Undo2 size={15} /> Undo
                </button>
                <button
                  disabled={store.busy}
                  onClick={() => {
                    finish();
                    setMessage("Changes canceled.");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="cc-primary"
                  disabled={
                    store.busy || interacting || stale || !draft.name.trim()
                  }
                  onClick={async () => {
                    const { record, batch } = dashboardRecords(
                      draft,
                      base,
                      layouts,
                    );
                    if (await store.save(batch)) {
                      choose(record.rootId);
                      finish();
                      setMessage("Dashboard saved.");
                    }
                  }}
                >
                  {store.busy ? "Saving…" : "Save dashboard"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="cc-dashboard-current">
                {!starter &&
                (layouts.length > 1 || (layouts.length === 1 && !home)) ? (
                  <Field label="Dashboard">
                    <select
                      disabled={store.busy}
                      value={selected?.rootId ?? "starter"}
                      onChange={(e) => {
                        choose(e.target.value);
                        setMessage("");
                      }}
                    >
                      {!home && (
                        <option value="starter">
                          {initial.name} (starter)
                        </option>
                      )}
                      {layouts.map((r) => (
                        <option key={r.rootId} value={r.rootId}>
                          {r.body.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <strong>
                    {starter && useClassic ? "Classic Journal" : saved.name}
                  </strong>
                )}
              </div>
              <div className="cc-actions">
                {starter && (useClassic || selected) && (
                  <button
                    onClick={() => {
                      choose("reading-room");
                      setMessage("");
                    }}
                  >
                    Back to Reading Room
                  </button>
                )}
                {starter && (
                  <button
                    ref={journalLayoutsButton}
                    disabled={store.busy}
                    aria-expanded={showJournalLayouts}
                    onClick={() => setShowJournalLayouts(!showJournalLayouts)}
                  >
                    Journal layouts
                  </button>
                )}
                <button disabled={store.busy} onClick={() => start(true)}>
                  <Plus size={15} /> New dashboard
                </button>
                <button
                  disabled={store.busy}
                  aria-expanded={snapshots}
                  onClick={() => {
                    setSnapshots(!snapshots);
                    setSnapshotCode("");
                  }}
                >
                  Dashboard snapshots
                </button>
                <button
                  disabled={store.busy}
                  ref={editButton}
                  onClick={() => start()}
                >
                  <Pencil size={15} /> Edit dashboard
                </button>
              </div>
            </>
          )}
        </Panel>
        {starter && showJournalLayouts && !editing && (
          <Panel className="cc-snapshot-tools">
            <Field label="Journal layout">
              <select
                disabled={store.busy}
                value={
                  selected?.rootId ?? (useClassic ? "classic" : "reading-room")
                }
                onChange={(event) => {
                  choose(event.target.value);
                  setShowJournalLayouts(false);
                  journalLayoutsButton.current?.focus();
                  setMessage("");
                }}
              >
                <option value="reading-room">Reading Room</option>
                {layouts
                  .filter((r) => isReadingRoom(r.body.workspace))
                  .map((r) => (
                    <option key={r.rootId} value={r.rootId}>
                      {r.body.name}
                    </option>
                  ))}
                <optgroup label="Archived layouts">
                  <option value="classic">Classic Journal</option>
                  {layouts
                    .filter((r) => !isReadingRoom(r.body.workspace))
                    .map((r) => (
                      <option key={r.rootId} value={r.rootId}>
                        {r.body.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </Field>
          </Panel>
        )}
        {snapshots && !editing && (
          <Panel className="cc-snapshot-tools">
            <p>
              Share your dashboard arrangement or paste a snapshot another
              trader shared.
            </p>
            <button onClick={() => setSnapshotCode(dashboardSnapshot(saved))}>
              Generate share code
            </button>
            <Field label="Dashboard snapshot code">
              <textarea
                value={snapshotCode}
                maxLength={200_000}
                rows={3}
                onChange={(event) => setSnapshotCode(event.target.value)}
              />
            </Field>
            <button
              disabled={!snapshotCode.trim() || store.busy}
              onClick={() => {
                const imported = readDashboardSnapshot(snapshotCode);
                if (!imported || (imported.page ?? "Command Center") !== page) {
                  setMessage(
                    "This snapshot is invalid or belongs to another page.",
                  );
                  return;
                }
                setBase(undefined);
                setUndo([]);
                setDraft(imported);
                setSnapshots(false);
                setSnapshotCode("");
                setMessage(
                  "Preview the imported dashboard, then save it to switch to it.",
                );
              }}
            >
              Preview snapshot
            </button>
          </Panel>
        )}
        <p
          className="cc-dashboard-announcement"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
        {draft && (
          <details className="cc-dashboard-configuration" open>
            <summary>Dashboard settings</summary>
            <fieldset className="cc-dashboard-options" disabled={store.busy}>
              <Field label="Dashboard name">
                <input
                  ref={nameInput}
                  maxLength={160}
                  value={draft.name}
                  onChange={(e) => change({ ...draft, name: e.target.value })}
                />
              </Field>
              {!starter && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.isDefault}
                    onChange={(e) =>
                      change({ ...draft, isDefault: e.target.checked })
                    }
                  />{" "}
                  Open by default
                </label>
              )}
              <p>Hiding a card keeps all its data and recordings.</p>
            </fieldset>
          </details>
        )}
        {stale && (
          <p role="alert" className="cc-error">
            This dashboard changed in another tab. Cancel to load the saved
            version, then edit again.
          </p>
        )}

        <DashboardCanvas
          page={page}
          key={page}
          owner={owner}
          before={before}
          layout={layout}
          editing={editing}
          disabled={store.busy}
          onChange={change}
          onInteracting={setInteracting}
        >
          {children}
        </DashboardCanvas>
      </div>
    </ModuleScope>
  );
}

"use client";
import { GlassPanel } from "../glassyui/glass-panel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, RotateCcw, Undo2 } from "lucide-react";
import DashboardCanvas from "./dashboard-canvas";
import { ModuleScope, WorkspaceModule } from "../module-workspace";
import { latest, type RecordOf } from "@/lib/process/model";
import {
  cards,
  dashboardRecords,
  dashboardSnapshot,
  readDashboardSnapshot,
  freshDashboard,
  normalizeLayout,
  statusLabels,
  type DashboardLayout,
  type CardId,
} from "@/lib/process/dashboard";
import type { ProcessStore } from "./use-process";
import { Field } from "./shared";

// Owned by the account-keyed workspace so navigation cannot discard a draft.
export function useDashboardEditor() {
  const [draft, setDraft] = useState<DashboardLayout>();
  const [base, setBase] = useState<RecordOf<"layout">>();
  const [undo, setUndo] = useState<DashboardLayout[]>([]);
  const [adding, setAdding] = useState(false);
  return { draft, setDraft, base, setBase, undo, setUndo, adding, setAdding };
}
export type DashboardEditor = ReturnType<typeof useDashboardEditor>;

export default function DashboardBoard({
  store,
  owner,
  panels = {},
  market,
  status = {},
  variables = [],
  renderVariables,
  editor,
  before,
  page = "Command Center",
  children,
  seed,
}: {
  editor: DashboardEditor;
  page?: DashboardLayout["page"];
  children?: ReactNode;
  seed?: DashboardLayout["workspace"];
  before?: ReactNode;
  store: ProcessStore;
  owner: string;
  panels?: Partial<Record<CardId, ReactNode>>;
  market?: ReactNode;
  status?: Partial<Record<DashboardLayout["statusWidgets"][number], ReactNode>>;
  variables?: RecordOf<"variable">[];
  renderVariables?: (ids?: string[]) => ReactNode;
}) {
  const makeInitial = (): DashboardLayout => page === "Command Center"
    ? freshDashboard()
    : { ...freshDashboard(), page, workspace: seed, statusWidgets: [], showMarket: false };
  const initial = makeInitial();
  const layouts = latest(store.records, "layout").filter(r => (r.body.page ?? "Command Center") === page);
  const selectionKey = "still-signal-dashboard-v1:" + owner + (page === "Command Center" ? "" : ":" + page);
  const home = layouts
    .filter((r) => r.body.isDefault)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const [selectedId, setSelectedId] = useState<string>();
  const useStarter = !home && selectedId === "starter";
  const selected = useStarter
    ? undefined
    : (layouts.find((r) => r.rootId === selectedId) ?? home ?? layouts[0]);
  const saved = selected ? normalizeLayout(selected.body) : initial;
  const { draft, setDraft, base, setBase, undo, setUndo, adding, setAdding } =
    editor;
  const [message, setMessage] = useState("");
  const [snapshots, setSnapshots] = useState(false);
  const [snapshotCode, setSnapshotCode] = useState("");
  const [interacting, setInteracting] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const editing = !!draft;
  // Preparation is a single entry button in Command Center, not a dashboard card.
  // Keep stored layouts compatible without mounting the old checklist module.
  const sourceLayout = draft ?? saved;
  const layout: DashboardLayout = {
    ...sourceLayout,
    panels: sourceLayout.panels.map(p => ["thesis", "missions"].includes(p.id) ? { ...p, visible: false } : p).filter((p) => p.id !== "preparation"),
    statusWidgets: sourceLayout.statusWidgets.filter(id => id !== "thesis"),
    showMarket: false,
  };
  const visible = layout.panels.filter((p) => p.visible);
  const stale =
    editing &&
    !!base &&
    layouts.some((r) => r.rootId === base.rootId && r.id !== base.id);
  useEffect(() => {
    try {
      const id = localStorage.getItem(selectionKey);
      if (id) setSelectedId(id);
    } catch {
      /* Device storage is optional. */
    }
  }, [owner]);
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
    setAdding(false);
  };
  const finish = () => {
    setDraft(undefined);
    setAdding(false);
    setUndo([]);
  };
  return (
    <ModuleScope active={false}>
      <div className={"cc-dashboard-board" + (draft ? " cc-editing" : "")}>
        <GlassPanel preset="standard" className="cc-dashboard-toolbar">
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
                        ...makeInitial(),
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
                {layouts.length > 1 || (layouts.length === 1 && !home) ? (
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
                  <strong>{saved.name}</strong>
                )}
              </div>
              <div className="cc-actions">
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
                <button disabled={store.busy} ref={editButton} onClick={() => start()}>
                  <Pencil size={15} /> Edit dashboard
                </button>
              </div>
            </>
          )}
        </GlassPanel>
        {snapshots && !editing && (
          <GlassPanel className="cc-snapshot-tools">
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
                setAdding(false);
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
          </GlassPanel>
        )}
        <p
          className="cc-dashboard-announcement"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
        {draft && <details className="cc-dashboard-configuration" open>
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
            <p>Hiding a card keeps all its data and recordings.</p>
          </fieldset>
        </details>}
        {stale && (
          <p role="alert" className="cc-error">
            This dashboard changed in another tab. Cancel to load the saved
            version, then edit again.
          </p>
        )}
        {draft && page === "Command Center" && <details className="cc-dashboard-configuration">
          <summary>At a glance visibility</summary>
          <fieldset className="cc-dashboard-toggles" disabled={store.busy}>
            <legend>At a glance</legend>
            {market && (
              <label>
                <input
                  type="checkbox"
                  checked={layout.showMarket}
                  onChange={(e) =>
                    change({ ...layout, showMarket: e.target.checked })
                  }
                />{" "}
                Market outlook
              </label>
            )}
            {Object.entries(statusLabels).filter(([key]) => key !== "thesis").map(([key, label]) => {
              const id = key as DashboardLayout["statusWidgets"][number];
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={layout.statusWidgets.includes(id)}
                    onChange={(e) =>
                      change({
                        ...layout,
                        statusWidgets: e.target.checked
                          ? [...layout.statusWidgets, id]
                          : layout.statusWidgets.filter((v) => v !== id),
                      })
                    }
                  />
                  {label}
                </label>
              );
            })}
          </fieldset>
        </details>}
        {draft &&
          page === "Command Center" && layout.panels.some((p) => p.id === "variables" && p.visible) && (
            <fieldset className="cc-variable-picker" disabled={store.busy}>
              <legend>Variables on this dashboard</legend>
              <label>
                <input
                  type="checkbox"
                  checked={!draft.variableIds}
                  onChange={(e) =>
                    change({
                      ...draft,
                      variableIds: e.target.checked ? undefined : [],
                    })
                  }
                />{" "}
                All my variables
              </label>
              {draft.variableIds &&
                variables.map((v) => (
                  <label key={v.rootId}>
                    <input
                      type="checkbox"
                      checked={draft.variableIds!.includes(v.rootId)}
                      onChange={(e) =>
                        change({
                          ...draft,
                          variableIds: e.target.checked
                            ? [...draft.variableIds!, v.rootId]
                            : draft.variableIds!.filter(
                                (id) => id !== v.rootId,
                              ),
                        })
                      }
                    />
                    {v.body.name}
                  </label>
                ))}
              {!variables.length && (
                <small>
                  Create personal variables from the Personal variables card
                  after saving.
                </small>
              )}
            </fieldset>
          )}
        <DashboardCanvas
          page={page}
          key={page === "Command Center" ? selected?.rootId ?? "starter" : page}
          owner={owner}
          before={before}
          after={
            <>
              {layout.showMarket && market && (
                <WorkspaceModule
                  id="market-outlook"
                  title="Market outlook"
                  section="bottom"
                  order={0}
                >
                  {market}
                </WorkspaceModule>
              )}
              {!!layout.statusWidgets.length && (
                <WorkspaceModule
                  id="dashboard-status"
                  title="At a glance"
                  section="bottom"
                  order={1}
                >
                  <GlassPanel
                    preset="standard"
                    className="cc-status-grid cc-dashboard-status"
                  >
                    {layout.statusWidgets.map((id) => (
                      <div key={id}>{status[id]}</div>
                    ))}
                  </GlassPanel>
                </WorkspaceModule>
              )}
            </>
          }
          layout={layout}
          editing={editing}
          disabled={store.busy}
          onChange={change}
          onInteracting={setInteracting}
          renderContent={(p) => (
            <>
              <div
                className={draft ? "cc-card-preview" : "cc-card-content"}
                inert={!!draft}
              >
                {p.id === "variables" && renderVariables
                  ? renderVariables(layout.variableIds)
                  : panels[p.id]}
              </div>
            </>
          )}
        >{children}</DashboardCanvas>
        {page === "Command Center" && !visible.length && (
          <div className="cc-dashboard-empty">
            <strong>A little breathing room.</strong>
            <p>Add just the cards that support the way you trade.</p>
            <button
              onClick={() => {
                if (!draft) start();
                setAdding(true);
              }}
            >
              <Plus size={16} /> Add cards
            </button>
          </div>
        )}
        {draft && page === "Command Center" && (
          <>
            <button
              className="cc-add-cards"
              aria-expanded={adding}
              onClick={() => setAdding((v) => !v)}
            >
              <Plus size={16} /> Add cards{" "}
              {layout.panels.some((p) => !p.visible)
                ? `(${layout.panels.filter((p) => !p.visible).length} available)`
                : ""}
            </button>
            {adding && (
              <section className="cc-card-library" aria-label="Available cards">
                <h2>What belongs on your dashboard?</h2>
                <p>Choose a card. You can always hide it again.</p>
                <div className="cc-card-library-grid">
                  {layout.panels.filter(p => p.id !== "thesis" && p.id !== "missions").map((p) => (
                    <article key={p.id}>
                      <h3>{cards[p.id].title}</h3>
                      <p>{cards[p.id].detail}</p>
                      <button
                        disabled={p.visible || store.busy}
                        onClick={() => {
                          change({
                            ...layout,
                            panels: [
                              ...layout.panels.filter((v) => v.id !== p.id),
                              { ...p, visible: true },
                            ],
                          });
                          setMessage(cards[p.id].title + " added.");
                        }}
                      >
                        {p.visible
                          ? "Already on dashboard"
                          : "Add " + cards[p.id].title}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ModuleScope>
  );
}

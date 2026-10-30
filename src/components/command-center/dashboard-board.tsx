"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Undo2,
} from "lucide-react";
import { latest, type RecordOf } from "@/lib/process/model";
import {
  cards,
  dashboardRecords,
  freshDashboard,
  moveCard,
  normalizeLayout,
  statusLabels,
  type CardId,
  type DashboardLayout,
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
  panels,
  market,
  status,
  variables = [],
  renderVariables,
  editor,
}: {
  editor: DashboardEditor;
  store: ProcessStore;
  owner: string;
  panels: Record<CardId, ReactNode>;
  market: ReactNode;
  status: Record<DashboardLayout["statusWidgets"][number], ReactNode>;
  variables?: RecordOf<"variable">[];
  renderVariables?: (ids?: string[]) => ReactNode;
}) {
  const [initial] = useState(freshDashboard);
  const layouts = latest(store.records, "layout");
  const home = layouts
    .filter((r) => r.body.isDefault)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const [selectedId, setSelectedId] = useState<string>();
  const selected =
    layouts.find((r) => r.rootId === selectedId) ?? home ?? layouts[0];
  const saved = selected ? normalizeLayout(selected.body) : initial;
  const { draft, setDraft, base, setBase, undo, setUndo, adding, setAdding } =
    editor;
  const [message, setMessage] = useState("");
  const [dropTarget, setDropTarget] = useState<CardId>();
  const pointer = useRef<{ id: CardId; x: number; y: number; to?: CardId }>(
    null,
  );
  const editButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const editing = !!draft;
  const layout = draft ?? saved;
  const visible = layout.panels.filter((p) => p.visible);
  const stale =
    editing &&
    !!base &&
    layouts.some((r) => r.rootId === base.rootId && r.id !== base.id);
  useEffect(() => {
    try {
      const id = localStorage.getItem("still-signal-dashboard-v1:" + owner);
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
      localStorage.setItem("still-signal-dashboard-v1:" + owner, id);
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
  const move = (id: CardId, to: CardId) =>
    change(moveCard(layout, id, to), cards[id].title + " moved.");
  const updateCard = (
    id: CardId,
    patch: Partial<DashboardLayout["panels"][number]>,
  ) =>
    change({
      ...layout,
      panels: layout.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  return (
    <div className={"cc-dashboard-board" + (draft ? " cc-editing" : "")}>
      <div className="cc-dashboard-toolbar">
        {draft ? (
          <>
            <div className="cc-dashboard-editor-title">
              <Pencil size={16} />
              <strong>Make this dashboard yours</strong>
              <span>Move, resize or hide cards. Save when it feels right.</span>
            </div>
            <div className="cc-actions">
              <button
                disabled={!undo.length || store.busy}
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
                disabled={store.busy || stale || !draft.name.trim()}
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
              {layouts.length > 1 ? (
                <Field label="Dashboard">
                  <select
                    value={selected?.rootId ?? ""}
                    onChange={(e) => {
                      choose(e.target.value);
                      setMessage("");
                    }}
                  >
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
              <small>Your space. Your process.</small>
            </div>
            <div className="cc-actions">
              <button onClick={() => start(true)}>
                <Plus size={15} /> New dashboard
              </button>
              <button ref={editButton} onClick={() => start()}>
                <Pencil size={15} /> Edit dashboard
              </button>
            </div>
          </>
        )}
      </div>
      <p className="cc-dashboard-announcement" role="status" aria-live="polite">
        {message}
      </p>
      {draft && (
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
          <button
            onClick={() =>
              change(
                {
                  ...freshDashboard(),
                  name: draft.name,
                  isDefault: draft.isDefault,
                },
                "Original arrangement restored. Undo to go back.",
              )
            }
          >
            Restore original arrangement
          </button>
          <p>Hiding a card keeps all its data and recordings.</p>
        </fieldset>
      )}
      {stale && (
        <p role="alert" className="cc-error">
          This dashboard changed in another tab. Cancel to load the saved
          version, then edit again.
        </p>
      )}
      {draft && (
        <fieldset className="cc-dashboard-toggles" disabled={store.busy}>
          <legend>At a glance</legend>
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
          {Object.entries(statusLabels).map(([key, label]) => {
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
      )}
      {layout.showMarket && market}
      {!!layout.statusWidgets.length && (
        <div className="cc-status-grid">
          {layout.statusWidgets.map((id) => (
            <div key={id}>{status[id]}</div>
          ))}
        </div>
      )}
      <div className="cc-dashboard-grid" aria-label="Dashboard cards">
        {visible.map((p, i) => (
          <div
            key={p.id}
            data-card={p.id}
            className={`cc-dashboard-card cc-slot-${p.id} ${p.width === "wide" ? "cc-span-all" : ""} ${dropTarget === p.id ? "cc-drop-target" : ""}`}
          >
            {draft && (
              <div
                className="cc-card-controls"
                role="group"
                aria-label={cards[p.id].title + " controls"}
              >
                <button
                  className="cc-drag-handle"
                  disabled={store.busy}
                  aria-label={"Drag " + cards[p.id].title}
                  title="Drag to move, or use the arrows"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    pointer.current = { id: p.id, x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const start = pointer.current;
                    if (
                      !start ||
                      Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6
                    )
                      return;
                    const element = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-card]");
                    const id = element?.dataset.card as CardId | undefined;
                    start.to =
                      id && id in cards && id !== start.id ? id : undefined;
                    setDropTarget(start.to);
                    // Keep long dashboards movable without requiring a mouse wheel.
                    if (e.clientY > window.innerHeight - 70)
                      window.scrollBy(0, 18);
                    else if (e.clientY < 90) window.scrollBy(0, -18);
                  }}
                  onPointerUp={(e) => {
                    const start = pointer.current;
                    if (start?.to) move(start.id, start.to);
                    pointer.current = null;
                    setDropTarget(undefined);
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={() => {
                    pointer.current = null;
                    setDropTarget(undefined);
                  }}
                >
                  <GripVertical size={16} />
                </button>
                <span>{cards[p.id].title}</span>
                <button
                  aria-label={"Move " + cards[p.id].title + " up"}
                  title="Move up"
                  disabled={!i || store.busy}
                  onClick={() => move(p.id, visible[i - 1].id)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label={"Move " + cards[p.id].title + " down"}
                  title="Move down"
                  disabled={i === visible.length - 1 || store.busy}
                  onClick={() => move(p.id, visible[i + 1].id)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  aria-label={
                    "Make " +
                    cards[p.id].title +
                    (p.width === "wide" ? " single column" : " full width")
                  }
                  title={p.width === "wide" ? "Single column" : "Full width"}
                  disabled={store.busy}
                  onClick={() =>
                    updateCard(p.id, {
                      width: p.width === "wide" ? "normal" : "wide",
                    })
                  }
                >
                  {p.width === "wide" ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </button>
                <button
                  aria-label={"Hide " + cards[p.id].title}
                  title="Hide card"
                  disabled={store.busy}
                  onClick={() => {
                    updateCard(p.id, { visible: false });
                    setMessage(
                      cards[p.id].title +
                        " hidden. Use Add cards to bring it back.",
                    );
                  }}
                >
                  <EyeOff size={16} />
                </button>
              </div>
            )}
            <div
              className={draft ? "cc-card-preview" : "cc-card-content"}
              inert={!!draft}
            >
              {p.id === "variables" && renderVariables
                ? renderVariables(layout.variableIds)
                : panels[p.id]}
            </div>
            {draft && p.id === "variables" && (
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
          </div>
        ))}
      </div>
      {!visible.length && (
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
      {draft && (
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
                {layout.panels.map((p) => (
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
  );
}

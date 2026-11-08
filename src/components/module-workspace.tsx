"use client";
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GlassPanel } from "./glassyui/glass-panel";
import { createPortal } from "react-dom";
import {
  resizeModuleBox,
  snapModuleBox,
  canPlaceModule,
  alignModuleSpacing,
  limitModuleResize,
  closeRemovedModuleSpace,
  moveModuleGroup,
  canPlaceModuleGroup,
  type ResizeEdge,
} from "@/lib/module-geometry";
import {
  GripVertical,
  Plus,
  RotateCcw,
  Undo2,
  Redo2,
  Settings2,
  X,
  EyeOff,
} from "lucide-react";
import {
  emptyModuleLayout,
  moduleLayoutKey,
  readModuleLayout,
  boundModuleBox,
  type ModuleLayout,
  type ModulePlacement,
  type ModuleBox,
  type CustomModule,
} from "@/lib/module-layout";

import {
  evidenceReadingLayout,
  moduleBoard,
  modulePlacement,
  materializeBoard,
  placeModule,
  availableModuleBox,
} from "@/lib/module-board";

export type ModulePart = { id: string; title: string; selector: string };
type Definition = {
  id: string;
  title: string;
  section: string;
  order: number;
  width: number;
  initiallyHidden: boolean;
  parts: ModulePart[];
  host: HTMLDivElement;
};
type Registry = {
  createHost: () => HTMLDivElement;
  register: (module: Definition) => () => void;
  editing: boolean;
  placement: (module: Definition) => ModulePlacement;
  change: (id: string, patch: Partial<ModulePlacement>) => void;
  drag: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
  dragging: boolean;
  selected: string[];
  select: (id: string) => void;
  resize: (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    edge?: ResizeEdge,
  ) => void;
  resizeKey: (id: string, key: string, edge?: ResizeEdge) => void;
  moveKey: (id: string, key: string, large: boolean) => void;
  custom?: CustomModule[];
  editCustom: (id: string, patch: Partial<CustomModule>) => void;
};
const Context = createContext<Registry | null>(null);
const noParts: ModulePart[] = [];
export function ModuleScope({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const context = useContext(Context);
  return (
    <Context.Provider value={active ? context : null}>
      {children}
    </Context.Provider>
  );
}

/** Each portal has one stable host. Keeping that host on the board
 * preserves React state, focus, recordings and unsaved writing inside the module. */
export function WorkspaceModule({
  id,
  title,
  section = "main",
  order = 10,
  width = 12,
  initiallyHidden = false,
  parts = noParts,
  children,
}: {
  id: string;
  title: string;
  section?: string;
  order?: number;
  width?: number;
  initiallyHidden?: boolean;
  parts?: ModulePart[];
  children: ReactNode;
}) {
  const inherited = useContext(Context);
  const ctx =
    isValidElement<{ hidden?: boolean }>(children) &&
    children.props.hidden === true
      ? null
      : inherited;
  const [host, setHost] = useState<HTMLDivElement>();
  const [options, setOptions] = useState(false);
  const [activated, setActivated] = useState(!initiallyHidden);
  useEffect(() => {
    if (ctx) setHost(ctx.createHost());
  }, [!!ctx]);
  const register = ctx?.register;
  const signature = JSON.stringify(parts);
  useLayoutEffect(() => {
    if (!host || !register) return;
    return register({
      id,
      title,
      section,
      order,
      width,
      initiallyHidden,
      parts: JSON.parse(signature),
      host,
    });
  }, [
    host,
    register,
    id,
    title,
    section,
    order,
    width,
    initiallyHidden,
    signature,
  ]);
  const definition = host && {
    id,
    title,
    section,
    order,
    width,
    initiallyHidden,
    parts,
    host,
  };
  const placement = ctx && definition ? ctx.placement(definition) : undefined;
  const custom = ctx?.custom?.find((c) => c.id === id);
  useEffect(() => {
    if (placement && !placement.hidden) setActivated(true);
  }, [placement?.hidden]);
  useLayoutEffect(() => {
    if (!host || !placement) return;
    // The parent owns sizing classes; do not erase them on a child layout update.
    host.classList.add("ss-workspace-module");
    host.classList.toggle("ss-module-editing", !!ctx?.editing);
    host.classList.toggle("ss-module-compact", !!placement.compact);
    host.dataset.moduleId = id;
  }, [
    host,
    id,
    ctx?.editing,
    placement?.width,
    placement?.height,
    placement?.compact,
  ]);
  useLayoutEffect(() => {
    if (!host || !placement) return;
    const restores: (() => void)[] = [];
    if (placement.title && placement.title !== title) {
      const heading = host.querySelector<HTMLElement>(
        ".ss-module-content h1,.ss-module-content h2,.ss-module-content h3",
      );
      if (heading) {
        const display = heading.style.display;
        heading.style.display = "none";
        restores.push(() => {
          heading.style.display = display;
        });
      }
    }
    for (const part of parts)
      for (const node of host.querySelectorAll<HTMLElement>(part.selector)) {
        const display = node.style.display;
        if (placement.hiddenParts?.includes(part.id))
          node.style.display = "none";
        restores.push(() => {
          node.style.display = display;
        });
      }
    return () => restores.forEach((fn) => fn());
  }, [
    host,
    activated,
    signature,
    JSON.stringify(placement?.hiddenParts),
    placement?.title,
    title,
    children,
  ]);
  if (!ctx) return initiallyHidden ? null : <>{children}</>;
  if (!host || !placement) return null;
  if (!activated) return null;
  return createPortal(
    <>
      {ctx.editing && (
        <button
          className="ss-module-move-surface"
          aria-label={`Move ${title}`}
          title="Drag to move. Arrow keys move; Shift moves further."
          onPointerDown={(event) => ctx.drag(event, id)}
          onKeyDown={(event) => {
            if (event.key.startsWith("Arrow")) {
              event.preventDefault();
              ctx.moveKey(id, event.key, event.shiftKey);
            }
          }}
        />
      )}
      {ctx.editing && (
        <div className="ss-module-controls-anchor">
          <div
            className="ss-module-controls"
            role="group"
            aria-label={`${title} module controls`}
          >
            <button
              className="ss-module-grip"
              aria-label={`Drag ${title} module`}
              onPointerDown={(event) => ctx.drag(event, id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  ctx.moveKey(id, event.key, event.shiftKey);
                }
              }}
              title="Drag anywhere. Arrow keys move; Shift moves further."
            >
              <GripVertical size={16} />
              <span>{placement.title || title}</span>
            </button>
            <button aria-label={`Select ${title} module`} aria-pressed={ctx.selected.includes(id)} onClick={() => ctx.select(id)}>Select</button>
            <button
              aria-label={`Edit inside ${title}`}
              disabled={ctx.dragging}
              onClick={() => setOptions((v) => !v)}
              aria-expanded={options}
            >
              <Settings2 size={15} />
            </button>
            <button
              aria-label={`Hide ${title} module`}
              disabled={ctx.dragging}
              onClick={() => ctx.change(id, { hidden: true })}
            >
              <EyeOff size={15} />
            </button>
          </div>
        </div>
      )}
      {ctx.editing && options && (
        <fieldset
          className="ss-module-options"
          disabled={ctx.dragging}
          style={{ top: Math.max(0, 80 - host.getBoundingClientRect().top) }}
        >
          <legend>Customize {title}</legend>
          {custom && (
            <>
              <label>
                Notes
                <textarea
                  aria-label={`Content for ${title}`}
                  maxLength={10000}
                  value={custom.text}
                  onChange={(event) =>
                    ctx.editCustom(id, { text: event.target.value })
                  }
                />
              </label>
              <label>
                Text size
                <select
                  value={custom.fontSize ?? 18}
                  onChange={(event) =>
                    ctx.editCustom(id, { fontSize: +event.target.value })
                  }
                >
                  {[14, 18, 22, 28, 36].map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Module title
            <input
              maxLength={80}
              value={placement.title ?? title}
              onChange={(event) =>
                ctx.change(id, { title: event.target.value })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={placement.heightMode === "fixed"}
              onChange={(event) =>
                ctx.change(id, {
                  heightMode: event.target.checked ? "fixed" : "auto",
                })
              }
            />{" "}
            Keep a fixed height (otherwise fit content)
          </label>
          <details>
            <summary>Advanced placement & spacing</summary>
            <label>
              Width
              <input
                aria-label={`Width for ${title}`}
                type="number"
                min={180}
                max={1200}
                value={placement.box?.w ?? placement.width * 100}
                onChange={(event) =>
                  ctx.change(id, {
                    box: boundModuleBox({
                      ...(placement.box ?? { x: 0, y: 0, w: 384, h: 300 }),
                      w: +event.target.value,
                    }),
                  })
                }
              />
            </label>
            <label>
              Horizontal position
              <input
                aria-label={`Horizontal position for ${title}`}
                type="number"
                min={0}
                max={1200}
                value={placement.box?.x ?? 0}
                onChange={(event) =>
                  ctx.change(id, {
                    box: boundModuleBox({
                      ...(placement.box ?? { x: 0, y: 0, w: 384, h: 300 }),
                      x: +event.target.value,
                    }),
                  })
                }
              />
            </label>
            <label>
              Vertical position
              <input
                aria-label={`Vertical position for ${title}`}
                type="number"
                min={0}
                max={50000}
                value={placement.box?.y ?? 0}
                onChange={(event) =>
                  ctx.change(id, {
                    box: boundModuleBox({
                      ...(placement.box ?? { x: 0, y: 0, w: 384, h: 300 }),
                      y: +event.target.value,
                    }),
                  })
                }
              />
            </label>
            <label>
              Height
              <input
                aria-label={`Height for ${title}`}
                type="number"
                min={120}
                max={2400}
                value={placement.height ?? placement.box?.h ?? 300}
                onChange={(event) => {
                  if (event.target.value)
                    ctx.change(id, {
                      heightMode: "fixed",
                      box: boundModuleBox({
                        ...(placement.box ?? { x: 0, y: 0, w: 384, h: 300 }),
                        h: +event.target.value,
                      }),
                    });
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={placement.compact ?? false}
                onChange={(event) =>
                  ctx.change(id, { compact: event.target.checked })
                }
              />{" "}
              Compact spacing
            </label>
          </details>
          {!!parts.length && (
            <div className="ss-module-parts">
              <strong>Inside this module</strong>
              {parts.map((part) => (
                <label key={part.id}>
                  <input
                    type="checkbox"
                    checked={!placement.hiddenParts?.includes(part.id)}
                    onChange={(event) =>
                      ctx.change(id, {
                        hiddenParts: event.target.checked
                          ? placement.hiddenParts?.filter(
                              (value) => value !== part.id,
                            )
                          : [...(placement.hiddenParts || []), part.id],
                      })
                    }
                  />
                  {part.title}
                </label>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOptions(false)}>
            Done
          </button>
        </fieldset>
      )}
      <GlassPanel
        preset="standard"
        lens
        className="ss-module-content ss-module-glass"
        inert={ctx.editing}
      >
        {placement.title && placement.title !== title && (
          <h2 className="ss-module-custom-title">{placement.title}</h2>
        )}
        {children}
      </GlassPanel>
      {ctx.editing &&
        (["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeEdge[]).map(
          (edge) => (
            <button
              key={edge}
              className={`ss-module-resize ss-module-resize-${edge}`}
              aria-label={`Resize ${title}${edge === "se" ? "" : edge === "sw" ? " from left" : ` from ${edge}`}`}
              title="Drag to resize. Arrow keys adjust width and height; Home fits the content."
              onPointerDown={(event) => ctx.resize(event, id, edge)}
              onKeyDown={(event) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                  ].includes(event.key)
                ) {
                  event.preventDefault();
                  ctx.resizeKey(id, event.key, edge);
                }
              }}
            >
              <span aria-hidden />
            </button>
          ),
        )}
    </>,
    host,
    id,
  );
}

export default function ModuleWorkspace({
  owner,
  page,
  enabled = true,
  children,
  editLabel = "Customize workspace",
  workspaceTitle = "Your workspace",
  surfaceWindow,
  onEditingChange,
  controlled,
  onInteracting,
}: {
  owner: string;
  page: string;
  enabled?: boolean;
  children: ReactNode;
  editLabel?: string;
  workspaceTitle?: string;
  surfaceWindow?: Window;
  onEditingChange?: (editing: boolean) => void;
  controlled?: {
    layout: ModuleLayout;
    editing: boolean;
    change: (layout: ModuleLayout, message?: string) => void;
    disabled?: boolean;
  };
  onInteracting?: (active: boolean) => void;
}) {
  const [modules, setModules] = useState<Definition[]>([]);
  const [saved, setSaved] = useState<ModuleLayout>(emptyModuleLayout),
    [draft, setDraft] = useState<ModuleLayout>(emptyModuleLayout);
  const [localEditing, setEditing] = useState(false),
    [library, setLibrary] = useState(false),
    [search, setSearch] = useState("");
  const [undo, setUndo] = useState<ModuleLayout[]>([]),
    [redo, setRedo] = useState<ModuleLayout[]>([]);
  const [message, setMessage] = useState(""),
    [dragging, setDragging] = useState(false),
    [heights, setHeights] = useState<Record<string, number>>({});
  const canvas = useRef<HTMLDivElement>(null),
    parking = useRef<HTMLDivElement>(null),
    libraryPanel = useRef<HTMLElement>(null);
  const pendingCustom = useRef<string | undefined>(undefined);
  const editing = controlled?.editing ?? localEditing;
  const current = controlled?.layout ?? (editing ? draft : saved),
    key = moduleLayoutKey(owner, page);
  const [boardWidth, setBoardWidth] = useState(1200);
  const [guides, setGuides] = useState<ModuleBox>();
  const [lastHidden, setLastHidden] = useState<{ id: string; box: ModuleBox }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<ModuleBox>();
  const marquee = useRef<{ pointer: number; x: number; y: number; base: string[]; next: string[] } | null>(null);
  const boxes = moduleBoard(current, modules, heights, boardWidth);
  const latest = useRef({
    current,
    modules,
    boxes,
    editing,
    key,
    boardWidth,
    controlled,
    onInteracting,
    selected,
  });
  latest.current = {
    current,
    modules,
    boxes,
    editing,
    key,
    boardWidth,
    controlled,
    onInteracting,
    selected,
  };
  type Gesture = {
    mode: "move" | ResizeEdge | "library" | "panel";
    id: string;
    pointer: number;
    handle: HTMLButtonElement;
    host: HTMLElement;
    x: number;
    y: number;
    scroll: number;
    scroller?: HTMLElement;
    width: number;
    start: ModuleBox;
    next: ModuleBox;
    base: ModuleLayout;
    key: string;
    moved: boolean;
    left?: number;
    top?: number;
    boxes: Record<string, ModuleBox>;
    targets?: Record<string, ModuleBox>;
    members?: string[];
  };
  const gesture = useRef<Gesture | null>(null);
  const surface = () =>
    (surfaceWindow ??
      canvas.current?.ownerDocument.defaultView ??
      window) as Window & typeof globalThis;
  useLayoutEffect(() => {
    const board = canvas.current;
    const Observer = surface().ResizeObserver;
    if (!enabled || !board || !Observer) return;
    const measure = () =>
      setBoardWidth(board.getBoundingClientRect().width || 1200);
    measure();
    const observer = new Observer(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [enabled, surfaceWindow]);
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const register = useCallback((module: Definition) => {
    setModules((old) => [...old.filter((m) => m.id !== module.id), module]);
    return () => {
      module.host.remove();
      setModules((old) => old.filter((m) => m.host !== module.host));
    };
  }, []);
  const resolved = () =>
    materializeBoard(
      latest.current.current,
      latest.current.modules,
      latest.current.boxes,
      latest.current.boardWidth,
    );
  const commit = (next: ModuleLayout, announcement = "") => {
    const previous = latest.current.current;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    setUndo((rows) => [...rows.slice(-39), previous]);
    setRedo([]);
    latest.current.current = next;
    setDraft(next);
    setMessage(latest.current.controlled ? "" : announcement);
    latest.current.controlled?.change(next, announcement);
  };
  const cancelGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.members) for (const id of g.members) {
      const host = latest.current.modules.find(m => m.id === id)?.host;
      host?.classList.remove("ss-module-held", "ss-module-invalid");
      if (host) host.style.transform = "";
    }
    if (g) {
      if (g.mode === "library") g.host.remove();
      else if (g.mode !== "panel") {
        g.host.style.transform = "";
        g.host.style.width = g.start.w / 12 + "%";
        g.host.style.left = g.start.x / 12 + "%";
        g.host.style.top = g.start.y + "px";
        const placement = latest.current.current.modules[g.id];
        g.host.style.height =
          placement?.heightMode === "fixed" ? g.start.h + "px" : "";
        g.host.classList.remove("ss-module-held");
        g.host.classList.remove("ss-module-invalid");
        g.host.classList.toggle(
          "ss-module-sized",
          placement?.heightMode === "fixed",
        );
      }
      if (g.handle.hasPointerCapture(g.pointer))
        g.handle.releasePointerCapture(g.pointer);
    }
    setDragging(false);
    setGuides(undefined);
    latest.current.onInteracting?.(false);
  };
  useEffect(() => {
    if (!editing || controlled?.disabled) { cancelGesture(); marquee.current = null; setSelectionRect(undefined); setSelected([]); }
  }, [editing, controlled?.disabled]);
  useEffect(() => {
    cancelGesture();
    let value = emptyModuleLayout();
    try {
      value = readModuleLayout(localStorage.getItem(key));
    } catch {
      /* Optional storage. */
    }
    setSaved(value);
    setDraft(value);
    setEditing(false);
    setLibrary(false);
    setUndo([]);
    setRedo([]);
    setMessage("");
    setLastHidden(undefined);
    setSelected([]);
    setHeights({});
  }, [key]);
  const placement = (module: Definition): ModulePlacement => ({
    ...modulePlacement(current, module),
    box: boxes[module.id] ?? modulePlacement(current, module).box,
  });
  const ordered = modules
    .filter((m) => !modulePlacement(current, m).hidden)
    .sort(
      (a, b) =>
        (boxes[a.id]?.y ?? 0) - (boxes[b.id]?.y ?? 0) ||
        (boxes[a.id]?.x ?? 0) - (boxes[b.id]?.x ?? 0),
    );
  useLayoutEffect(() => {
    const board = canvas.current;
    if (!board || !enabled) return;
    const view = surface(),
      doc = view.document;
    const active = doc.activeElement as HTMLElement | null;
    const field =
      active instanceof view.HTMLInputElement ||
      active instanceof view.HTMLTextAreaElement
        ? active
        : null;
    const selection = field ? [field.selectionStart, field.selectionEnd] : null;
    ordered.forEach((module, index) => {
      if (board.children[index] !== module.host)
        board.insertBefore(module.host, board.children[index] ?? null);
      const box = boxes[module.id],
        raw = modulePlacement(current, module);
      if (!box) return;
      Object.assign(module.host.style, {
        left: box.x / 12 + "%",
        top: box.y + "px",
        width: box.w / 12 + "%",
        height: raw.heightMode === "fixed" ? box.h + "px" : "",
      });
      module.host.classList.toggle("ss-module-selected", editing && selected.includes(module.id));
      module.host.classList.toggle(
        "ss-module-sized",
        raw.heightMode === "fixed",
      );
    });
    for (const module of modules)
      if (
        modulePlacement(current, module).hidden &&
        module.host.parentElement !== parking.current
      )
        parking.current?.appendChild(module.host);
    if (
      active?.isConnected &&
      doc.activeElement !== active &&
      !active.closest("[hidden],[inert]")
    ) {
      active.focus({ preventScroll: true });
      if (field && selection?.[0] != null && selection[1] != null)
        field.setSelectionRange(selection[0], selection[1]);
    }
  }, [current, modules, enabled, editing, JSON.stringify(boxes), selected]);
  useEffect(() => {
    const module = modules.find((m) => m.id === pendingCustom.current);
    if (!module || !editing) return;
    pendingCustom.current = undefined;
    module.host.scrollIntoView?.({ block: "center", behavior: "instant" });
    module.host
      .querySelector<HTMLInputElement | HTMLTextAreaElement>("input,textarea")
      ?.focus({ preventScroll: true });
  }, [modules, editing]);
  useLayoutEffect(() => {
    const Observer = surface().ResizeObserver;
    if (!enabled || !Observer) return;
    const observer = new Observer((entries) => {
      if (gesture.current) return;
      setHeights((old) => {
        const next = { ...old };
        let changed = false;
        for (const entry of entries) {
          const host = entry.target as HTMLElement,
            id = host.dataset.moduleId;
          if (!id) continue;
          const height = host.getBoundingClientRect().height;
          if (
            latest.current.current.modules[id]?.heightMode === "fixed" &&
            height > 0 &&
            old[id] !== 0
          )
            continue;
          if (height >= 0 && next[id] !== height) {
            next[id] = height;
            changed = true;
          }
        }
        return changed ? next : old;
      });
    });
    modules.forEach((m) => observer.observe(m.host));
    return () => observer.disconnect();
  }, [modules, enabled, editing, surfaceWindow]);
  const viewportTop = () =>
    Math.max(0, -(canvas.current?.getBoundingClientRect().top ?? 0) + 40);
  function addModule(id: string, at?: ModuleBox) {
    const value = resolved(),
      module = modules.find((m) => m.id === id);
    if (!module) return;
    const p = modulePlacement(value, module),
      box =
        at ??
        availableModuleBox(
          latest.current.boxes,
          viewportTop(),
          p.box,
          boardWidth,
        );
    value.modules[id] = p;
    commit(
      placeModule(value, id, box),
      "Module added to your board. Drag it anywhere.",
    );
  }
  function change(id: string, patch: Partial<ModulePlacement>) {
    const value = resolved(),
      old = value.modules[id];
    if (!old) return;
    if (
      patch.box &&
      !canPlaceModule(
        patch.box,
        Object.entries(latest.current.boxes)
          .filter(([peer]) => peer !== id)
          .map(([, box]) => box),
        boardWidth,
      )
    ) {
      setMessage("That space is occupied. Other widgets stay in place.");
      return;
    }
    if (patch.hidden && latest.current.boxes[id]) setLastHidden({ id, box: latest.current.boxes[id] });
    value.modules[id] = { ...old, ...patch };
    if (patch.box)
      value.modules[id] = {
        ...value.modules[id],
        box: boundModuleBox(patch.box),
        height: patch.box.h,
      };
    commit(value);
  }
  function moveKey(
    id: string,
    key: string,
    resize = false,
    large = false,
    edge: ResizeEdge = "se",
  ) {
    const value = resolved(),
      start = latest.current.boxes[id];
    if (!start) return;
    if (key === "Home" && resize) {
      const host = modules.find((m) => m.id === id)?.host;
      const content = host?.querySelector<HTMLElement>(".ss-module-content");
      const scrollContent = content?.querySelector<HTMLElement>(
        ":scope > .ss-space-moments-scroll",
      );
      const fitted = placeModule(value, id, {
        ...start,
        h: scrollContent?.scrollHeight ?? content?.scrollHeight ?? 260,
      });
      fitted.modules[id].heightMode = "auto";
      fitted.modules[id].height = undefined;
      commit(fitted, "Module fitted to its content.");
      return;
    }
    const step = large ? 48 : 12;
    const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0,
      dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
    const candidate = resize
      ? resizeModuleBox(start, (dx * 1200) / boardWidth, dy, edge)
      : { ...start, x: start.x + (dx * 1200) / boardWidth, y: start.y + dy };
    if (!resize && latest.current.selected.includes(id) && latest.current.selected.length > 1) {
      const targets = moveModuleGroup(latest.current.boxes, latest.current.selected, dx*1200/boardWidth, dy, boardWidth);
      if (!canPlaceModuleGroup(targets, latest.current.boxes, boardWidth)) { setMessage("That space is occupied. Other widgets stay in place."); return; }
      let next = value;
      for (const [member, box] of Object.entries(targets)) next = placeModule(next, member, box);
      commit(next, "Selected widgets moved.");
      return;
    }
    const next = snapModuleBox(
      candidate,
      Object.entries(latest.current.boxes)
        .filter(([peer]) => peer !== id)
        .map(([, box]) => box),
      canvas.current?.getBoundingClientRect().width || 1200,
      resize ? edge : "move",
    );
    if (
      !canPlaceModule(
        next,
        Object.entries(latest.current.boxes)
          .filter(([peer]) => peer !== id)
          .map(([, box]) => box),
        boardWidth,
      )
    ) {
      setMessage("That space is occupied. Other widgets stay in place.");
      return;
    }
    const placed = placeModule(value, id, next);
    if (resize) placed.modules[id].heightMode = "fixed";
    commit(placed, resize ? "Module resized." : "Module moved.");
  }
  function startGesture(
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    mode: Gesture["mode"],
  ) {
    if (event.button !== 0 || gesture.current || controlled?.disabled) return;
    const board = canvas.current;
    if (!board) return;
    const view = surface(),
      doc = view.document;
    const module = modules.find((m) => m.id === id);
    if (mode !== "panel" && !module) return;
    event.preventDefault();
    if (mode === "move" && (event.shiftKey || event.ctrlKey || event.metaKey)) { setSelected(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]); return; }
    event.currentTarget.focus();
    let host: HTMLElement =
      mode === "panel" ? libraryPanel.current! : module!.host;
    // Freeze the actual visible frames, including fractional browser rounding.
    const boardRect = board.getBoundingClientRect();
    const measured = { ...latest.current.boxes };
    for (const m of modules) {
      if (!measured[m.id]) continue;
      const r = m.host.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) measured[m.id] = { x: (r.left-boardRect.left)*1200/boardRect.width, y: r.top-boardRect.top, w: r.width*1200/boardRect.width, h: r.height };
    }
    const start = measured[id] ??
      latest.current.current.modules[id]?.box ?? { x: 0, y: 0, w: 384, h: 288 };
    if (mode === "library") {
      host = doc.createElement("div");
      host.className = "ss-module-library-ghost";
      host.textContent = module!.title;
      Object.assign(host.style, {
        position: "fixed",
        left: event.clientX + "px",
        top: event.clientY + "px",
        pointerEvents: "none",
      });
      doc.body.appendChild(host);
    }
    let parent = board.parentElement,
      scroller: HTMLElement | undefined;
    while (parent && parent !== doc.body) {
      if (
        parent.scrollHeight > parent.clientHeight &&
        /auto|scroll/.test(view.getComputedStyle(parent).overflowY)
      ) {
        scroller = parent;
        break;
      }
      parent = parent.parentElement;
    }
    const rect = host.getBoundingClientRect();
    gesture.current = {
      mode,
      id,
      host,
      handle: event.currentTarget,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scroll: scroller?.scrollTop ?? view.scrollY,
      scroller,
      width: board.getBoundingClientRect().width || 1200,
      start,
      next: start,
      base: materializeBoard(resolved(), modules, measured, boardRect.width),
      boxes: measured,
      members: mode === "move" ? (selected.includes(id) ? selected.filter(id => measured[id]) : [id]) : undefined,
      key,
      moved: false,
      left: rect.left,
      top: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode !== "panel") {
      host.classList.add("ss-module-held");
      if (mode === "move") {
        const ids = gesture.current.members!;
        setSelected(ids);
        for (const member of ids) modules.find(m => m.id === member)?.host.classList.add("ss-module-held");
      }
      setDragging(true);
      onInteracting?.(true);
    }
  }
  useEffect(() => {
    const view = surface();
    const move = (event: PointerEvent) => {
      const m = marquee.current;
      if (m && event.pointerId === m.pointer) {
        const board = canvas.current!;
        const r = board.getBoundingClientRect();
        const x = (event.clientX-r.left)*1200/r.width, y = event.clientY-r.top;
        const area = { x: Math.min(m.x,x), y: Math.min(m.y,y), w: Math.abs(x-m.x), h: Math.abs(y-m.y) };
        m.next = [...new Set([...m.base, ...Object.entries(latest.current.boxes).filter(([,b]) => b.x >= area.x && b.y >= area.y && b.x+b.w <= area.x+area.w && b.y+b.h <= area.y+area.h).map(([id]) => id)])];
        setSelectionRect(area); setSelected(m.next);
        return;
      }
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointer) return;
      const dx = event.clientX - g.x,
        dy =
          event.clientY -
          g.y +
          (g.scroller?.scrollTop ?? view.scrollY) -
          g.scroll;
      if (Math.hypot(dx, dy) < 4 && !g.moved) return;
      g.moved = true;
      if (g.mode === "panel") {
        const left = Math.max(
            0,
            Math.min(view.innerWidth - g.host.offsetWidth, g.left! + dx),
          ),
          top = Math.max(
            0,
            Math.min(view.innerHeight - 60, g.top! + event.clientY - g.y),
          );
        Object.assign(g.host.style, {
          left: left + "px",
          top: top + "px",
          right: "auto",
          maxHeight: `calc(100dvh - ${top + 12}px)`,
        });
        return;
      }
      const snap = (n: number) => n;
      if (g.mode === "library") {
        g.host.style.transform = `translate(${dx}px,${event.clientY - g.y}px)`;
        const rect = canvas.current!.getBoundingClientRect();
        g.next = boundModuleBox({
          ...g.start,
          x: snap(((event.clientX - rect.left) * 1200) / g.width),
          y: snap(event.clientY - rect.top),
        });
      } else if (g.mode === "move") {
        g.targets = moveModuleGroup(g.boxes, g.members ?? [g.id], dx * 1200 / g.width, dy, g.width);
        g.next = g.targets[g.id];
        for (const [id, box] of Object.entries(g.targets)) {
          const host = latest.current.modules.find(m => m.id === id)?.host;
          if (host) host.style.transform = `translate(${(box.x-g.boxes[id].x)*g.width/1200}px,${box.y-g.boxes[id].y}px)`;
        }
      } else {
        g.host.classList.add("ss-module-sized");
        g.next = snapModuleBox(
          resizeModuleBox(g.start, (dx * 1200) / g.width, dy, g.mode),
          Object.entries(g.boxes)
            .filter(([id]) => id !== g.id)
            .map(([, box]) => box),
          g.width,
          g.mode,
        );
        g.next = limitModuleResize(
          g.start,
          g.next,
          Object.entries(g.boxes)
            .filter(([id]) => id !== g.id)
            .map(([, box]) => box),
          g.width,
        );
        g.host.style.left = g.next.x / 12 + "%";
        g.host.style.top = g.next.y + "px";
        g.host.style.width = g.next.w / 12 + "%";
        g.host.style.height = g.next.h + "px";
      }
      const peers = Object.entries(latest.current.boxes)
        .filter(([id]) => id !== g.id)
        .map(([, box]) => box);
      g.host.classList.toggle(
        "ss-module-invalid",
        g.targets ? !canPlaceModuleGroup(g.targets, g.boxes, g.width) : !canPlaceModule(g.next, peers, g.width),
      );
      setGuides(g.next);
      if (event.clientY > view.innerHeight - 45) {
        if (g.scroller) g.scroller.scrollTop += 16;
        else view.scrollBy(0, 16);
      } else if (event.clientY < 45) {
        if (g.scroller) g.scroller.scrollTop -= 16;
        else view.scrollBy(0, -16);
      }
    };
    const up = (event: PointerEvent) => {
      if (marquee.current?.pointer === event.pointerId) { marquee.current = null; setSelectionRect(undefined); return; }
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointer) return;
      let valid =
        g.moved && g.key === latest.current.key && latest.current.editing;
      if (g.mode === "library") {
        const rect = canvas.current!.getBoundingClientRect();
        valid =
          valid &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
      }
      const available = g.targets ? canPlaceModuleGroup(g.targets, g.boxes, g.width) : canPlaceModule(
        g.next,
        Object.entries(latest.current.boxes)
          .filter(([id]) => id !== g.id)
          .map(([, box]) => box),
        g.width,
      );
      if (g.mode !== "panel" && !available) {
        valid = false;
        setMessage("That space is occupied. Other widgets stay in place.");
      }
      cancelGesture();
      if (valid && g.mode !== "panel") {
        let placed = g.base;
        for (const [id, box] of Object.entries(g.targets ?? { [g.id]: g.next })) placed = placeModule(placed, id, box);
        if (g.mode !== "move" && g.mode !== "library") {
          placed.modules[g.id].heightMode = "fixed";
          placed.modules[g.id].height = g.next.h;
        }
        commit(placed, "Layout changed.");
      }
    };
    const cancel = () => { if (marquee.current) setSelected(marquee.current.base); marquee.current = null; setSelectionRect(undefined); cancelGesture(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && marquee.current) { event.preventDefault(); cancel(); return; }
      if (event.key === "Escape" && !gesture.current) setSelected([]);
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        cancelGesture();
        setMessage("Move canceled.");
      }
    };
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", cancel);
    view.addEventListener("blur", cancel);
    view.addEventListener("keydown", key);
    return () => {
      cancelGesture();
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", cancel);
      view.removeEventListener("blur", cancel);
      view.removeEventListener("keydown", key);
    };
  }, [surfaceWindow]);
  const context: Registry = {
    createHost: () => surface().document.createElement("div"),
    register,
    editing,
    placement,
    change,
    dragging: dragging || !!controlled?.disabled,
    selected,
    select: id => setSelected(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]),
    custom: current.custom,
    editCustom: (id, patch) =>
      commit({
        ...resolved(),
        custom: current.custom?.map((c) =>
          c.id === id ? { ...c, ...patch, id } : c,
        ),
      }),
    drag: (event, id) => startGesture(event, id, "move"),
    resize: (event, id, edge = "se") => startGesture(event, id, edge),
    resizeKey: (id, key, edge) => moveKey(id, key, true, false, edge),
    moveKey: (id, key, large) => moveKey(id, key, false, large),
  };
  const boardHeight = Math.max(
    editing ? 800 : 120,
    ...Object.values(boxes).map((b) => b.y + b.h + (editing ? 600 : 24)),
  );
  function createCustom() {
    const id = "custom-" + crypto.randomUUID(),
      value = resolved(),
      box = availableModuleBox(boxes, viewportTop(), undefined, boardWidth);
    value.custom = [
      ...(value.custom ?? []),
      { id, title: "My module", text: "" },
    ];
    value.modules[id] = {
      section: value.sections[0].id,
      order: 10,
      width: 4,
      hidden: false,
      box,
      height: box.h,
    };
    pendingCustom.current = id;
    commit(
      value,
      "Name your module and add its content below. Placement settings are optional.",
    );
  }
  function closeGap() {
    if (!lastHidden || !latest.current.current.modules[lastHidden.id]?.hidden) return;
    const source = { ...latest.current.boxes, [lastHidden.id]: lastHidden.box };
    const next = closeRemovedModuleSpace(source, lastHidden.id);
    if (!Object.entries(next).every(([id, b]) => canPlaceModule(b, Object.entries(next).filter(([other]) => other !== id).map(([,b]) => b), boardWidth))) { setMessage("This gap cannot close without overlapping another widget."); return; }
    const value = resolved();
    for (const [id, box] of Object.entries(next)) value.modules[id] = { ...value.modules[id], box };
    commit(value, "Gap closed. Undo to restore."); setLastHidden(undefined);
  }
  const selectionTools = <>
    <span className="ss-selection-status" role="status">{selected.length ? selected.length + " selected" : "Drag empty space to select widgets. Shift-click adds to selection."}</span>
    <button disabled={dragging || !selected.length} onClick={() => setSelected([])}>Clear selection</button>
    <button disabled={dragging || !lastHidden || !current.modules[lastHidden.id]?.hidden} onClick={closeGap}>Close gap</button>
    {page === "Journal" && <button disabled={dragging} onClick={() => commit(evidenceReadingLayout(resolved(), modules, heights), "Evidence arrangement applied. Undo to restore.")}>Evidence layout</button>}
  </>;
  function alignSpacing() {
    const value = resolved();
    const aligned = alignModuleSpacing(latest.current.boxes, boardWidth);
    for (const [id, box] of Object.entries(aligned))
      value.modules[id] = { ...value.modules[id], box };
    commit(value, "Nearby widget gaps aligned. Undo to restore.");
  }
  return (
    <Context.Provider value={enabled ? context : null}>
      <div
        className={`ss-module-workspace${enabled ? " ss-module-workspace-active" : ""}${controlled ? " ss-module-controlled" : ""}`}
      >
        {enabled && controlled?.editing && (
          <GlassPanel preset="standard" className="ss-module-toolbar">
            <small>
              Drag anywhere to move. Resize from any edge or corner. Content is
              paused.
            </small>
            <div>
              {selectionTools}
              <button
                disabled={dragging || controlled.disabled}
                onClick={alignSpacing}
              >
                Align spacing
              </button>
              <button
                disabled={dragging || controlled.disabled}
                onClick={() => setLibrary((v) => !v)}
              >
                Add modules
              </button>
            </div>
          </GlassPanel>
        )}
        {enabled && !controlled && (
          <GlassPanel
            preset="standard"
            className={`ss-module-toolbar${editing ? "" : " ss-module-toolbar-idle"}`}
          >
            <div>
              <strong>
                {editing ? "Make this board yours" : workspaceTitle}
              </strong>
              <small hidden={!editing}>
                {editing
                  ? "Drag a widget to move it. Resize from any edge or corner. Content is paused while editing."
                  : "Your board is saved for this page on this browser."}
              </small>
            </div>
            <div>
              {editing ? (
                <>
                  {selectionTools}
                  <button disabled={dragging} onClick={alignSpacing}>
                    Align spacing
                  </button>
                  <button
                    disabled={dragging || !undo.length}
                    onClick={() => {
                      setRedo((rows) => [...rows, current]);
                      setDraft(undo.at(-1)!);
                      setUndo((rows) => rows.slice(0, -1));
                    }}
                  >
                    <Undo2 size={15} /> Undo
                  </button>
                  <button
                    disabled={dragging || !redo.length}
                    onClick={() => {
                      setUndo((rows) => [...rows, current]);
                      setDraft(redo.at(-1)!);
                      setRedo((rows) => rows.slice(0, -1));
                    }}
                  >
                    <Redo2 size={15} /> Redo
                  </button>
                  <button
                    disabled={dragging}
                    onClick={() => setLibrary((v) => !v)}
                  >
                    <Plus size={15} /> Add modules
                  </button>
                  <button
                    disabled={dragging || (current.custom?.length ?? 0) >= 50}
                    onClick={createCustom}
                  >
                    <Plus size={15} /> Create module
                  </button>
                  <button
                    disabled={dragging}
                    onClick={() =>
                      commit(
                        {
                          ...emptyModuleLayout(),
                          custom: current.custom,
                          modules: Object.fromEntries(
                            Object.entries(current.modules)
                              .filter(([id]) => id.startsWith("custom-"))
                              .map(([id, p]) => [id, { ...p, hidden: true }]),
                          ),
                        },
                        "Original arrangement restored. Custom cards are kept in your library.",
                      )
                    }
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                  <button
                    disabled={dragging}
                    onClick={() => {
                      setDraft(saved);
                      setEditing(false);
                      setLibrary(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={dragging}
                    className="ss-module-save"
                    onClick={() => {
                      try {
                        localStorage.setItem(key, JSON.stringify(current));
                        setSaved(current);
                        setEditing(false);
                        setLibrary(false);
                        setUndo([]);
                        setRedo([]);
                        setMessage("Board saved.");
                      } catch {
                        setMessage(
                          "Could not save this board. Your draft is still available.",
                        );
                      }
                    }}
                  >
                    Save layout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    const value = resolved();
                    setDraft(value);
                    setEditing(true);
                    setUndo([]);
                    setRedo([]);
                    setMessage("");
                  }}
                >
                  {editLabel}
                </button>
              )}
            </div>
          </GlassPanel>
        )}
        <p className="ss-module-message" role="status" aria-live="polite">
          {message}
        </p>
        {editing && library && (
          <section
            ref={libraryPanel}
            className="ss-module-library"
            aria-label="Module library"
          >
            <div>
              <button
                className="ss-module-library-handle"
                aria-label="Move module library"
                onPointerDown={(event) => startGesture(event, "", "panel")}
              >
                <GripVertical size={16} /> Add a module
              </button>
              <button
                disabled={dragging}
                aria-label="Close module library"
                onClick={() => setLibrary(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p>Pick up a module and drop it anywhere on your board.</p>
            <input
              aria-label="Search modules"
              placeholder="Find a module…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button disabled={dragging} onClick={createCustom}>
              <Plus size={15} /> Create your own module
            </button>
            <div className="ss-module-library-grid">
              {modules
                .filter((m) =>
                  m.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((m) => (
                  <article key={m.id}>
                    <strong>
                      {modulePlacement(current, m).title || m.title}
                    </strong>
                    <small>
                      {modulePlacement(current, m).hidden
                        ? "Hidden · available to restore"
                        : "On your board"}
                    </small>
                    <button disabled={dragging} onClick={() => addModule(m.id)}>
                      {modulePlacement(current, m).hidden
                        ? "Restore module"
                        : "Place in view"}
                    </button>
                    <button
                      disabled={dragging}
                      className="ss-module-library-grip"
                      aria-label={`Drag ${m.title} from library`}
                      onPointerDown={(event) =>
                        startGesture(event, m.id, "library")
                      }
                    >
                      <GripVertical size={16} /> Pick up
                    </button>
                  </article>
                ))}
            </div>
          </section>
        )}
        <div className="ss-module-sources">
          {children}
          {enabled &&
            current.custom?.map((custom) => (
              <WorkspaceModule
                key={custom.id}
                id={custom.id}
                title={custom.title}
                section={current.sections[0].id}
              >
                <section
                  className="ss-custom-module"
                  style={{ fontSize: custom.fontSize ?? 18 }}
                >
                  <h2>{current.modules[custom.id]?.title || custom.title}</h2>
                  {editing ? (
                    <>
                      <label>
                        Title
                        <input
                          maxLength={80}
                          value={custom.title}
                          onChange={(event) =>
                            commit({
                              ...resolved(),
                              custom: current.custom!.map((c) =>
                                c.id === custom.id
                                  ? { ...c, title: event.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Text size
                        <select
                          value={custom.fontSize ?? 18}
                          onChange={(event) =>
                            commit({
                              ...resolved(),
                              custom: current.custom!.map((c) =>
                                c.id === custom.id
                                  ? { ...c, fontSize: +event.target.value }
                                  : c,
                              ),
                            })
                          }
                        >
                          {[14, 18, 22, 28, 36].map((size) => (
                            <option key={size} value={size}>
                              {size} px
                            </option>
                          ))}
                        </select>
                      </label>
                      <textarea
                        aria-label={`Content for ${current.modules[custom.id]?.title || custom.title}`}
                        placeholder="Your notes, reminders, rules…"
                        maxLength={10000}
                        value={custom.text}
                        onChange={(event) =>
                          commit({
                            ...resolved(),
                            custom: current.custom!.map((c) =>
                              c.id === custom.id
                                ? { ...c, text: event.target.value }
                                : c,
                            ),
                          })
                        }
                      />
                      <p className="ss-custom-preview">
                        {custom.text || "Your reminder preview"}
                      </p>
                    </>
                  ) : (
                    <p>
                      {custom.text ||
                        "Your own space for notes, reminders and rules."}
                    </p>
                  )}
                </section>
              </WorkspaceModule>
            ))}
        </div>
        <div
          ref={canvas}
          hidden={!enabled}
          className={`ss-free-board${editing ? " ss-free-board-editing" : ""}`}
          style={{ minHeight: boardHeight }}
          aria-label="Workspace board"
          onPointerDown={event => {
            if (!editing || controlled?.disabled || event.button !== 0 || event.target !== event.currentTarget || gesture.current || surface().innerWidth <= 660) return;
            event.preventDefault(); const r = event.currentTarget.getBoundingClientRect();
            const base = event.shiftKey || event.ctrlKey || event.metaKey ? selected : [];
            marquee.current = { pointer: event.pointerId, x: (event.clientX-r.left)*1200/r.width, y: event.clientY-r.top, base, next: base };
            setSelected(base); event.currentTarget.setPointerCapture(event.pointerId);
          }}
        >
          {editing && selectionRect && <div className="ss-module-selection-box" style={{ left: selectionRect.x/12+"%", top: selectionRect.y, width: selectionRect.w/12+"%", height: selectionRect.h }} />}
          {editing && guides && (
            <div className="ss-module-alignment-guides" aria-hidden>
              <i style={{ top: guides.y }} />
              <i style={{ top: guides.y + guides.h }} />
              <b style={{ left: guides.x / 12 + "%" }} />
              <b style={{ left: (guides.x + guides.w) / 12 + "%" }} />
            </div>
          )}
        </div>
        <div ref={parking} hidden inert />
      </div>
    </Context.Provider>
  );
}

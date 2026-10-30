"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  GripVertical,
  Maximize2,
  Minimize2,
  MoveDiagonal2,
} from "lucide-react";
import {
  cards,
  moveCard,
  type CardId,
  type DashboardLayout,
} from "@/lib/process/dashboard";
import {
  boundedBox,
  clamp,
  dashboardGrid,
  GRID_GAP,
  GRID_ROW,
  placeCard,
  type Grid,
  type GridBox,
} from "@/lib/process/dashboard-grid";

type Card = DashboardLayout["panels"][number];
type Gesture = {
  id: CardId;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  scrollY: number;
  start: GridBox;
  grid: Grid;
  layout: DashboardLayout;
  width: number;
  height: number;
  displayStart: GridBox;
  column: number;
  mobile: boolean;
  handle: HTMLElement;
  pointerId: number;
  dx: number;
  dy: number;
  preview: DashboardLayout;
  target: GridBox;
  moved: boolean;
};
export default function DashboardCanvas({
  layout,
  editing,
  disabled,
  onChange,
  onInteracting,
  renderContent,
}: {
  layout: DashboardLayout;
  editing: boolean;
  disabled: boolean;
  onChange: (next: DashboardLayout, message?: string) => void;
  onInteracting: (active: boolean) => void;
  renderContent: (card: Card) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef<Gesture | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [mobile, setMobile] = useState(false);
  const [heights, setHeights] = useState<Partial<Record<CardId, number>>>({});
  const previous = useRef(new Map<string, DOMRect>());
  const animations = useRef(new Map<string, Animation>());
  const activeLayout = gesture?.preview ?? layout;
  const grid = dashboardGrid(activeLayout, heights);
  const stack = (value: DashboardLayout, boxes: Grid): Grid => {
    let y = 0;
    const result: Grid = {};
    for (const p of value.panels.filter((p) => p.visible)) {
      const b = boxes[p.id]!;
      result[p.id] = { x: 0, y, w: 12, h: b.h };
      y += b.h;
    }
    return result;
  };
  const stacked = mobile ? stack(activeLayout, grid) : grid;
  // Keep DOM nodes in draft order during a gesture so pointer capture is never lost.
  const visible = layout.panels.filter((p) => p.visible);
  const reduceMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      if (live.current) return;
      const next: Partial<Record<CardId, number>> = {};
      for (const entry of entries) {
        if (entry.target === host) {
          setMobile(host.clientWidth < 660);
          continue;
        }
        const node = entry.target as HTMLElement;
        const id = node.closest<HTMLElement>("[data-card]")?.dataset
          .card as CardId;
        if (id)
          next[id] =
            Math.ceil(node.getBoundingClientRect().height) + (editing ? 64 : 0);
      }
      setHeights((old) =>
        Object.entries(next).every(([id, h]) => old[id as CardId] === h)
          ? old
          : { ...old, ...next },
      );
    });
    observer.observe(host);
    host
      .querySelectorAll(".cc-tile-content-inner")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [editing, layout.panels.map((p) => (p.visible ? p.id : "")).join(",")]);
  const signature = JSON.stringify(grid) + mobile + editing;
  useLayoutEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>("[data-card]");
    if (!nodes) return;
    for (const node of nodes) {
      const id = node.dataset.card!;
      const before = previous.current.get(id);
      animations.current.get(id)?.cancel();
      const after = node.getBoundingClientRect();
      if (
        before &&
        id !== live.current?.id &&
        !reduceMotion() &&
        typeof node.animate === "function"
      ) {
        const x = before.left - after.left,
          y = before.top - after.top;
        if (
          Math.abs(x) > 1 ||
          Math.abs(y) > 1 ||
          Math.abs(before.width - after.width) > 1 ||
          Math.abs(before.height - after.height) > 1
        )
          animations.current.set(
            id,
            node.animate(
              [
                {
                  transform: `translate(${x}px, ${y}px)`,
                  width: before.width + "px",
                  height: before.height + "px",
                },
                {
                  transform: "translate(0, 0)",
                  width: after.width + "px",
                  height: after.height + "px",
                },
              ],
              { duration: 240, easing: "cubic-bezier(.22,1,.36,1)" },
            ),
          );
      }
      previous.current.set(id, after);
    }
  }, [signature, !!gesture]);
  const cleanup = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    const g = live.current;
    live.current = null;
    if (g?.handle.hasPointerCapture(g.pointerId))
      g.handle.releasePointerCapture(g.pointerId);
    setGesture(null);
    onInteracting(false);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape" && live.current) {
        event.preventDefault();
        cleanup();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("keydown", cancel);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    if (!editing || disabled) cleanup();
  }, [editing, disabled]);
  const calculate = (g: Gesture) => {
    const dx = g.clientX - g.startX,
      dy = g.clientY - g.startY + window.scrollY - g.scrollY;
    if (!g.moved && Math.hypot(dx, dy) < 5) return g;
    let target: GridBox;
    if (g.mode === "resize")
      target = boundedBox({
        ...g.start,
        w: g.mobile
          ? g.start.w
          : Math.round((g.width + dx + GRID_GAP) / g.column),
        h: Math.round((g.height + dy + GRID_GAP) / (GRID_ROW + GRID_GAP)),
      });
    else
      target = boundedBox({
        ...g.start,
        x: g.start.x + Math.round(dx / g.column),
        y: g.start.y + Math.round(dy / (GRID_ROW + GRID_GAP)),
      });
    let preview: DashboardLayout;
    if (g.mobile && g.mode === "move") {
      // A phone remains one column; moving there changes the shared reading order.
      const hit = document
        .elementsFromPoint(g.clientX, g.clientY)
        .map((el) => el.closest<HTMLElement>("[data-card]"))
        .find((el) => el?.dataset.card !== g.id && el?.dataset.card);
      const to = hit?.dataset.card as CardId | undefined;
      preview = to ? moveCard(g.layout, g.id, to) : g.preview;
      target = dashboardGrid(preview, heights)[g.id]!;
    } else preview = placeCard(g.layout, g.grid, g.id, target);
    return {
      ...g,
      // The held tile follows the pointer; only its landing position is bounded.
      dx,
      dy,
      preview,
      target,
      moved: true,
    };
  };
  const tick = () => {
    frame.current = undefined;
    const current = live.current;
    if (!current) return;
    const g = calculate(current);
    live.current = g;
    setGesture({ ...g });
    if (g.moved) {
      const before = window.scrollY;
      if (g.clientY > innerHeight - 60) window.scrollBy(0, 14);
      else if (g.clientY < 100) window.scrollBy(0, -14);
      if (before !== window.scrollY)
        frame.current = requestAnimationFrame(tick);
    }
  };
  const start = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: CardId,
    mode: Gesture["mode"],
  ) => {
    if (disabled || !editing || event.button !== 0 || !root.current || live.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    const node = event.currentTarget.closest<HTMLElement>("[data-card]")!;
    const rect = node.getBoundingClientRect();
    const base = dashboardGrid(layout, heights);
    live.current = {
      id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollY: window.scrollY,
      start: base[id]!,
      grid: base,
      layout,
      width: rect.width,
      height: rect.height,
      displayStart: mobile ? stack(layout, base)[id]! : base[id]!,
      column: (root.current.clientWidth + GRID_GAP) / 12,
      mobile,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      dx: 0,
      dy: 0,
      preview: layout,
      target: base[id]!,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Lift immediately on grab, without committing a move until the threshold is crossed.
    if (mode === "move") setGesture({ ...live.current });
    onInteracting(true);
  };
  const handlers = (id: CardId, mode: Gesture["mode"]) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) =>
      start(e, id, mode),
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const g = live.current;
      if (!g || g.pointerId !== e.pointerId) return;
      g.clientX = e.clientX;
      g.clientY = e.clientY;
      if (frame.current === undefined)
        frame.current = requestAnimationFrame(tick);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const g = live.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const result = calculate({
        ...g,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      // Capture the floating card so dropping animates back into its snapped location.
      root.current
        ?.querySelectorAll<HTMLElement>("[data-card]")
        .forEach((node) =>
          previous.current.set(
            node.dataset.card!,
            node.getBoundingClientRect(),
          ),
        );
      cleanup();
      if (result.moved)
        onChange(
          result.preview,
          cards[id].title + (mode === "resize" ? " resized." : " moved."),
        );
    },
    onPointerCancel: () => cleanup(),
    onLostPointerCapture: () => {
      if (live.current) cleanup();
    },
  });
  const resize = (id: CardId, box: GridBox) =>
    onChange(
      placeCard(layout, dashboardGrid(layout, heights), id, box),
      cards[id].title + " resized.",
    );
  const move = (id: CardId, to: CardId) => {
    const base = dashboardGrid(layout, heights);
    const reordered = moveCard(layout, id, to);
    onChange(
      layout.panels.some((p) => p.grid)
        ? placeCard(reordered, base, id, {
            ...base[id]!,
            x: base[to]!.x,
            y: base[to]!.y,
          })
        : reordered,
      cards[id].title + " moved.",
    );
  };
  const boxStyle = (box: GridBox): CSSProperties => ({
    gridColumn: mobile ? "1 / -1" : `${box.x + 1} / span ${box.w}`,
    gridRow: `${box.y + 1} / span ${box.h}`,
  });
  return (
    <div
      ref={root}
      className={`cc-dashboard-grid cc-canvas ${editing ? "cc-canvas-editing" : ""} ${mobile ? "cc-canvas-mobile" : ""} ${gesture ? "cc-canvas-interacting" : ""}`}
      aria-label="Dashboard cards"
    >
      {gesture && (
        <div
          className="cc-landing-zone"
          aria-hidden
          style={boxStyle(gesture.target)}
        >
          <span>
            {gesture.mode === "resize"
              ? `${gesture.target.w} × ${gesture.target.h}`
              : "Drop here"}
          </span>
        </div>
      )}
      {visible.map((card, index) => {
        const id = card.id,
          box = grid[id]!;
        const active = gesture?.id === id;
        const placement = active ? gesture.displayStart : stacked[id]!;
        const style: CSSProperties = { ...boxStyle(placement) };
        if (active) {
          if (gesture.mode === "move")
            style.transform = `translate3d(${gesture.dx}px,${gesture.dy}px,0) scale(${reduceMotion() ? 1 : 1.035})`;
          else {
            style.width = mobile
              ? "100%"
              : clamp(
                  gesture.width + gesture.dx,
                  3 * gesture.column - GRID_GAP,
                  (12 - gesture.start.x) * gesture.column - GRID_GAP,
                );
            style.height = clamp(
              gesture.height + gesture.dy,
              5 * (GRID_ROW + GRID_GAP) - GRID_GAP,
              60 * (GRID_ROW + GRID_GAP) - GRID_GAP,
            );
          }
        }
        return (
          <div
            key={id}
            data-card={id}
            data-grid={JSON.stringify(box)}
            style={style}
            className={`cc-dashboard-card cc-slot-${id} ${box.w === 12 ? "cc-span-all" : ""} ${active ? "cc-tile-active cc-tile-" + gesture.mode : ""}`}
          >
            {editing && (
              <div
                className="cc-card-controls"
                role="group"
                aria-label={cards[id].title + " controls"}
              >
                <button
                  className="cc-drag-handle"
                  aria-label={"Drag " + cards[id].title}
                  title="Drag this card anywhere"
                  disabled={disabled}
                  {...handlers(id, "move")}
                >
                  <GripVertical size={16} />
                </button>
                <span>{cards[id].title}</span>
                <button
                  title="Move up"
                  aria-label={"Move " + cards[id].title + " up"}
                  disabled={disabled || index === 0}
                  onClick={() => move(id, visible[index - 1].id)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  title="Move down"
                  aria-label={"Move " + cards[id].title + " down"}
                  disabled={disabled || index === visible.length - 1}
                  onClick={() => move(id, visible[index + 1].id)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  title={box.w === 12 ? "Single column" : "Full width"}
                  aria-label={
                    "Make " +
                    cards[id].title +
                    (box.w === 12 ? " single column" : " full width")
                  }
                  disabled={disabled}
                  onClick={() =>
                    resize(id, { ...box, x: 0, w: box.w === 12 ? 4 : 12 })
                  }
                >
                  {box.w === 12 ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </button>
                <button
                  title="Hide card"
                  aria-label={"Hide " + cards[id].title}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      {
                        ...layout,
                        panels: layout.panels.map((p) =>
                          p.id === id ? { ...p, visible: false } : p,
                        ),
                      },
                      cards[id].title +
                        " hidden. Use Add cards to bring it back.",
                    )
                  }
                >
                  <EyeOff size={16} />
                </button>
              </div>
            )}
            <div className="cc-tile-scroll">
              <div className="cc-tile-content-inner">{renderContent(card)}</div>
            </div>
            {editing && (
              <button
                className="cc-resize-handle"
                aria-label={"Resize " + cards[id].title}
                title="Drag the corner to resize. Arrow keys resize; Shift makes larger changes."
                disabled={disabled}
                {...handlers(id, "resize")}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 3 : 1,
                    key = e.key;
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(key)
                  )
                    return;
                  e.preventDefault();
                  if (mobile && ["ArrowLeft", "ArrowRight"].includes(key))
                    return;
                  resize(id, {
                    ...box,
                    w: clamp(
                      box.w +
                        (key === "ArrowRight"
                          ? step
                          : key === "ArrowLeft"
                            ? -step
                            : 0),
                      3,
                      12 - box.x,
                    ),
                    h: clamp(
                      box.h +
                        (key === "ArrowDown"
                          ? step
                          : key === "ArrowUp"
                            ? -step
                            : 0),
                      5,
                      60,
                    ),
                  });
                }}
              >
                <MoveDiagonal2 size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { boundModuleBox, type ModuleBox } from "./module-layout";

export const MODULE_GAP = 16;
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type GeometryMode = "move" | "resize" | "resize-left" | ResizeEdge;
const edgeOf = (mode: GeometryMode | boolean): ResizeEdge =>
  mode === true || mode === "resize-left"
    ? "sw"
    : mode === false || mode === "resize" || mode === "move"
      ? "se"
      : mode;

export function canPlaceModule(
  box: ModuleBox,
  peers: ModuleBox[],
  boardWidth: number,
) {
  const gap = (MODULE_GAP * 1200) / Math.max(1, boardWidth);
  return !peers.some(
    (p) =>
      box.x < p.x + p.w + gap - 0.01 &&
      box.x + box.w + gap - 0.01 > p.x &&
      box.y < p.y + p.h + MODULE_GAP - 0.01 &&
      box.y + box.h + MODULE_GAP - 0.01 > p.y,
  );
}

/** Stop a resize at the first occupied boundary; never move another widget. */
export function limitModuleResize(
  start: ModuleBox,
  target: ModuleBox,
  peers: ModuleBox[],
  boardWidth: number,
) {
  if (canPlaceModule(target, peers, boardWidth)) return target;
  if (!canPlaceModule(start, peers, boardWidth)) return start;
  let low = 0,
    high = 1;
  const at = (t: number) => ({
    x: start.x + (target.x - start.x) * t,
    y: start.y + (target.y - start.y) * t,
    w: start.w + (target.w - start.w) * t,
    h: start.h + (target.h - start.h) * t,
  });
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (canPlaceModule(at(mid), peers, boardWidth)) low = mid;
    else high = mid;
  }
  return at(low);
}

/** Board x coordinates scale with its width; y coordinates are CSS pixels. */
export function snapModuleBox(
  box: ModuleBox,
  peers: ModuleBox[],
  boardWidth: number,
  mode: GeometryMode,
  tolerance = 8,
): ModuleBox {
  const scale = 1200 / Math.max(1, boardWidth);
  const gapX = MODULE_GAP * scale;
  const closest = (value: number, targets: number[], tolerance: number) => {
    const target = targets.reduce(
      (best, n) => (Math.abs(n - value) < Math.abs(best - value) ? n : best),
      Infinity,
    );
    return Math.abs(target - value) <= tolerance ? target : value;
  };
  // Adjacent gutters win over alignment to distant cards. Only consider peers
  // sharing this row/column for gutter targets.
  const rows = peers.filter((p) => box.y < p.y + p.h && box.y + box.h > p.y);
  const columns = peers.filter((p) => box.x < p.x + p.w && box.x + box.w > p.x);
  const prefer = (
    value: number,
    gutters: number[],
    align: number[],
    range: number,
  ) => {
    const near = gutters.some((n) => Math.abs(n - value) <= range);
    return closest(value, near ? gutters : align, range);
  };
  const leftTargets = rows.map((p) => p.x + p.w + gapX);
  const rightTargets = rows.map((p) => p.x - gapX);
  const topTargets = columns.map((p) => p.y + p.h + MODULE_GAP);
  const bottomTargets = columns.map((p) => p.y - MODULE_GAP);
  const xs = [0, ...peers.map((p) => p.x)],
    rights = [1200, ...peers.map((p) => p.x + p.w)];
  const ys = [0, ...peers.map((p) => p.y)],
    bottoms = peers.map((p) => p.y + p.h);
  if (mode === "move") {
    const x = prefer(
      box.x,
      [...leftTargets, ...rightTargets.map((n) => n - box.w)],
      [...xs, ...rights.map((n) => n - box.w)],
      tolerance * scale,
    );
    const y = prefer(
      box.y,
      [...topTargets, ...bottomTargets.map((n) => n - box.h)],
      [...ys, ...bottoms.map((n) => n - box.h)],
      tolerance,
    );
    return {
      ...boundModuleBox({ ...box, x, y }, Math.min(180, box.w)),
      h: box.h,
    };
  }
  const edge = edgeOf(mode),
    right = box.x + box.w,
    bottom = box.y + box.h;
  const x = edge.includes("w")
    ? Math.min(right - 180, prefer(box.x, leftTargets, xs, tolerance * scale))
    : box.x;
  const y = edge.includes("n")
    ? Math.min(bottom - 120, prefer(box.y, topTargets, ys, tolerance))
    : box.y;
  const result = boundModuleBox(
    {
      x,
      y,
      w: edge.includes("w")
        ? right - x
        : edge.includes("e")
          ? prefer(right, rightTargets, rights, tolerance * scale) - x
          : box.w,
      h: edge.includes("n")
        ? bottom - y
        : edge.includes("s")
          ? prefer(bottom, bottomTargets, bottoms, tolerance) - y
          : box.h,
    },
    edge.includes("e") || edge.includes("w") ? 180 : Math.min(180, box.w),
  );
  return edge.includes("n") || edge.includes("s")
    ? result
    : { ...result, h: box.h };
}

export function resizeModuleBox(
  start: ModuleBox,
  dx: number,
  dy: number,
  direction: boolean | ResizeEdge = false,
): ModuleBox {
  const edge = edgeOf(direction),
    left = edge.includes("w"),
    top = edge.includes("n");
  const right = start.x + start.w;
  const x = left ? Math.max(0, Math.min(right - 180, start.x + dx)) : start.x;
  const bottom = start.y + start.h;
  const y = top
    ? Math.max(0, bottom - 2400, Math.min(bottom - 120, start.y + dy))
    : start.y;
  const result = boundModuleBox(
    {
      ...start,
      x,
      y,
      w: left ? right - x : edge.includes("e") ? start.w + dx : start.w,
      h: top ? bottom - y : edge.includes("s") ? start.h + dy : start.h,
    },
    left || edge.includes("e") ? 180 : Math.min(180, start.w),
  );
  return top || edge.includes("s") ? result : { ...result, h: start.h };
}

/** Repair nearby uneven gutters without packing intentional empty areas. */
export function alignModuleSpacing(
  boxes: Record<string, ModuleBox>,
  boardWidth: number,
) {
  const result: Record<string, ModuleBox> = {};
  for (const [id, box] of Object.entries(boxes).sort(
    (a, b) => a[1].y - b[1].y || a[1].x - b[1].x,
  )) {
    const next = snapModuleBox(
      box,
      Object.values(result),
      boardWidth,
      "move",
      64,
    );
    result[id] = canPlaceModule(next, Object.values(result), boardWidth)
      ? next
      : { ...box };
  }
  // Repair the whole nearby cluster together, then validate the final result.
  // Checking against not-yet-repaired peers would trap a run of narrow gaps.
  return Object.entries(result).every(([id, box]) =>
    canPlaceModule(
      box,
      Object.entries(result)
        .filter(([peer]) => peer !== id)
        .map(([, peer]) => peer),
      boardWidth,
    ),
  )
    ? result
    : Object.fromEntries(
        Object.entries(boxes).map(([id, box]) => [id, { ...box }]),
      );
}

/** Close only the removed card's vertical space, without packing unrelated columns. */
export function closeRemovedModuleSpace(
  boxes: Record<string, ModuleBox>,
  removedId: string,
) {
  const result = Object.fromEntries(
    Object.entries(boxes).map(([id, box]) => [id, { ...box }]),
  );
  const removed = result[removedId];
  if (!removed) return result;
  delete result[removedId];
  const overlapsX = (a: ModuleBox, b: ModuleBox) =>
    a.x < b.x + b.w && a.x + a.w > b.x;
  for (const box of Object.values(result).sort((a, b) => a.y - b.y)) {
    if (box.y < removed.y + removed.h || !overlapsX(box, removed)) continue;
    const floor = Math.max(
      0,
      ...Object.values(result)
        .filter(
          (other) => other !== box && other.y < box.y && overlapsX(box, other),
        )
        .map((other) => other.y + other.h + MODULE_GAP),
    );
    box.y = Math.max(floor, box.y - removed.h - MODULE_GAP);
  }
  return result;
}

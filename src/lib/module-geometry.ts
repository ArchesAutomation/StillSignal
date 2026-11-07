import { boundModuleBox, type ModuleBox } from "./module-layout";

export const MODULE_GAP = 16;

/** Board x coordinates scale with its width; y coordinates are CSS pixels. */
export function snapModuleBox(
  box: ModuleBox,
  peers: ModuleBox[],
  boardWidth: number,
  mode: "move" | "resize" | "resize-left",
): ModuleBox {
  const scale = 1200 / Math.max(1, boardWidth);
  const gapX = MODULE_GAP * scale;
  const closest = (value: number, targets: number[], tolerance: number) => {
    const target = targets.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, Infinity);
    return Math.abs(target - value) <= tolerance ? target : value;
  };
  const leftTargets = [0, ...peers.flatMap(p => [p.x, p.x + p.w + gapX])];
  const rightTargets = [1200, ...peers.flatMap(p => [p.x + p.w, p.x - gapX])];
  const topTargets = [0, ...peers.flatMap(p => [p.y, p.y + p.h + MODULE_GAP])];
  const bottomTargets = peers.flatMap(p => [p.y + p.h, p.y - MODULE_GAP]);
  if (mode === "move") {
    const x = closest(box.x, [...leftTargets, ...rightTargets.map(n => n - box.w)], 8 * scale);
    const y = closest(box.y, [...topTargets, ...bottomTargets.map(n => n - box.h)], 8);
    return boundModuleBox({ ...box, x, y });
  }
  const right = box.x + box.w;
  const x = mode === "resize-left" ? closest(box.x, leftTargets, 8 * scale) : box.x;
  const w = mode === "resize-left" ? right - x : closest(right, rightTargets, 8 * scale) - x;
  const h = closest(box.y + box.h, bottomTargets, 8) - box.y;
  // Respect the opposite edge when the minimum width is reached.
  return boundModuleBox({ ...box, x: mode === "resize-left" ? Math.min(x, right - 180) : x, w: Math.max(180, w), h });
}

export function resizeModuleBox(start: ModuleBox, dx: number, dy: number, left = false): ModuleBox {
  const right = start.x + start.w;
  const x = left ? Math.max(0, Math.min(right - 180, start.x + dx)) : start.x;
  return boundModuleBox({ ...start, x, w: left ? right - x : start.w + dx, h: start.h + dy });
}

/** Close only the removed card's vertical space, without packing unrelated columns. */
export function closeRemovedModuleSpace(boxes: Record<string, ModuleBox>, removedId: string) {
  const result = Object.fromEntries(Object.entries(boxes).map(([id, box]) => [id, { ...box }]));
  const removed = result[removedId];
  if (!removed) return result;
  delete result[removedId];
  const overlapsX = (a: ModuleBox, b: ModuleBox) => a.x < b.x + b.w && a.x + a.w > b.x;
  for (const box of Object.values(result).sort((a, b) => a.y - b.y)) {
    if (box.y < removed.y + removed.h || !overlapsX(box, removed)) continue;
    const floor = Math.max(0, ...Object.values(result)
      .filter(other => other !== box && other.y < box.y && overlapsX(box, other))
      .map(other => other.y + other.h + MODULE_GAP));
    box.y = Math.max(floor, box.y - removed.h - MODULE_GAP);
  }
  return result;
}

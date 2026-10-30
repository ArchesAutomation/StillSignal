import type { CardId, DashboardLayout } from "./dashboard.ts";

export type GridBox = { x: number; y: number; w: number; h: number };
export type Grid = Partial<Record<CardId, GridBox>>;
export const GRID_COLUMNS = 12,
  GRID_ROW = 24,
  GRID_GAP = 12;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const rowsForHeight = (height: number) =>
  clamp(Math.ceil((height + GRID_GAP) / (GRID_ROW + GRID_GAP)), 5, 60);
export const overlaps = (a: GridBox, b: GridBox) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function boundedBox(box: GridBox): GridBox {
  const w = clamp(Math.round(box.w), 3, 12);
  return {
    x: clamp(Math.round(box.x), 0, 12 - w),
    y: clamp(Math.round(box.y), 0, 600),
    w,
    h: clamp(Math.round(box.h), 5, 60),
  };
}
/** The active card wins its location. Only colliding neighbors move down. */
export function settleGrid(grid: Grid, active?: CardId): Grid {
  const placed: Grid = {};
  if (active && grid[active]) placed[active] = boundedBox(grid[active]!);
  const order = (Object.keys(grid) as CardId[])
    .filter((id) => id !== active)
    .sort((a, b) => grid[a]!.y - grid[b]!.y || grid[a]!.x - grid[b]!.x);
  for (const id of order) {
    const box = boundedBox(grid[id]!);
    let collision: GridBox | undefined;
    while (
      (collision = Object.values(placed).find((other) => overlaps(box, other)))
    )
      box.y = collision.y + collision.h;
    placed[id] = box;
  }
  return placed;
}
/** Legacy layouts pack in saved order using measured content heights. */
export function dashboardGrid(
  layout: DashboardLayout,
  heights: Partial<Record<CardId, number>> = {},
): Grid {
  const grid: Grid = {};
  const visible = layout.panels.filter((p) => p.visible);
  for (const p of visible.filter((p) => p.grid)) grid[p.id] = { ...p.grid! };
  const settled = settleGrid(grid);
  for (const p of visible.filter((p) => !p.grid)) {
    const box = {
      x: 0,
      y: 0,
      w: p.width === "wide" ? 12 : 4,
      h: rowsForHeight(heights[p.id] ?? 300),
    };
    let found = false;
    for (let y = 0; y < 1000 && !found; y++)
      for (let x = 0; x <= 12 - box.w; x++) {
        box.x = x;
        box.y = y;
        if (!Object.values(settled).some((other) => overlaps(box, other))) {
          found = true;
          break;
        }
      }
    settled[p.id] = { ...box };
  }
  return settled;
}
export function placeCard(
  layout: DashboardLayout,
  grid: Grid,
  id: CardId,
  target: GridBox,
): DashboardLayout {
  const settled = settleGrid({ ...grid, [id]: boundedBox(target) }, id);
  const panels = layout.panels.map((p) =>
    settled[p.id]
      ? {
          ...p,
          width:
            settled[p.id]!.w === 12 ? ("wide" as const) : ("normal" as const),
          grid: settled[p.id],
        }
      : p,
  );
  // Keep reading/tab order consistent with the visual order, including on phones.
  const ordered = panels
    .filter((p) => p.visible)
    .sort((a, b) => a.grid!.y - b.grid!.y || a.grid!.x - b.grid!.x);
  return {
    ...layout,
    panels: [...ordered, ...panels.filter((p) => !p.visible)],
  };
}

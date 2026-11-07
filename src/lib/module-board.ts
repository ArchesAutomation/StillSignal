import {
  boundModuleBox,
  type ModuleBox,
  type ModuleLayout,
  type ModulePlacement,
} from "./module-layout";
import { MODULE_GAP } from "./module-geometry";

export type BoardModule = {
  id: string;
  section: string;
  order: number;
  width: number;
  initiallyHidden: boolean;
};
export function modulePlacement(
  layout: ModuleLayout,
  module: BoardModule,
): ModulePlacement {
  return (
    layout.modules[module.id] ?? {
      section: layout.sections.some((s) => s.id === module.section)
        ? module.section
        : layout.sections[0].id,
      order: module.order,
      width: module.width,
      hidden: module.initiallyHidden,
    }
  );
}

/** Read old sections once as starting positions; saved board coordinates are never packed. */
export function moduleBoard(
  layout: ModuleLayout,
  modules: BoardModule[],
  heights: Record<string, number> = {},
  boardWidth = 1200,
): Record<string, ModuleBox> {
  const gapX = (MODULE_GAP * 1200) / Math.max(1, boardWidth);
  const result: Record<string, ModuleBox> = {};
  let rowX = 0,
    rowY = 0,
    rowHeight = 0;
  for (const section of layout.sections) {
    const sectionWidth = section.width * 100;
    if (rowX + sectionWidth > 1200) {
      rowX = 0;
      rowY += rowHeight + MODULE_GAP;
      rowHeight = 0;
    }
    let x = 0,
      y = 0,
      height = 0;
    const members = modules
      .filter((m) => {
        const p = modulePlacement(layout, m);
        return !p.hidden && p.section === section.id;
      })
      .sort(
        (a, b) =>
          modulePlacement(layout, a).order - modulePlacement(layout, b).order,
      );
    for (const module of members) {
      const p = modulePlacement(layout, module);
      if (p.box) {
        const reference = layout.boardWidth ?? 1200;
        // Scale the tracks, not the gutter: x' = x * factor,
        // w' = (w + gutter) * factor - gutter. Adjacent frames stay 16px apart.
        const factor = (boardWidth + MODULE_GAP) / (reference + MODULE_GAP);
        result[module.id] = {
          ...boundModuleBox(p.box, 1),
          x: ((p.box.x * reference) / boardWidth) * factor,
          y: p.box.y + (p.sectionRelative ? rowY : 0),
          w:
            ((((p.box.w * reference) / 1200 + MODULE_GAP) * factor -
              MODULE_GAP) *
              1200) /
            boardWidth,
          h:
            heights[module.id] === 0
              ? 0
              : p.heightMode === "fixed"
                ? (p.height ?? p.box.h)
                : (heights[module.id] ?? p.box.h),
        };
        height = Math.max(
          height,
          result[module.id].y - rowY + result[module.id].h,
        );
        continue;
      }
      if (heights[module.id] === 0) continue;
      const w = Math.max(180, (sectionWidth * p.width) / 12 - gapX),
        h = p.height ?? heights[module.id] ?? 300;
      if (x + w > sectionWidth && x) {
        x = 0;
        y += height + MODULE_GAP;
        height = 0;
      }
      result[module.id] = boundModuleBox({ x: rowX + x, y: rowY + y, w, h });
      // Saved geometry is bounded, but live forms can legitimately exceed that
      // height. Reserve their full rendered extent when reflowing neighbors.
      if (p.heightMode !== "fixed") result[module.id].h = Math.max(1, h);
      x += w + gapX;
      height = Math.max(height, h);
    }
    rowHeight = Math.max(rowHeight, y + height);
    rowX += sectionWidth;
  }
  // Preserve explicit vertical adjacency when auto content grows OR shrinks.
  for (const id of Object.keys(result).sort(
    (a, b) => result[a].y - result[b].y,
  )) {
    const saved = layout.modules[id]?.box;
    if (!saved) continue;
    const above = Object.entries(result).filter(([peer, box]) => {
      const original = layout.modules[peer]?.box;
      return (
        original &&
        Math.abs(saved.y - original.y - original.h - MODULE_GAP) < 1 &&
        box.x < result[id].x + result[id].w &&
        box.x + box.w > result[id].x
      );
    });
    if (above.length)
      result[id].y = Math.max(
        ...above.map(
          ([, box]) => box.y + box.h + (result[id].h === 0 ? 0 : MODULE_GAP),
        ),
      );
  }
  for (const id of Object.keys(result))
    if (result[id].h === 0) delete result[id];
  // Legacy/content-growth safety only. Editing rejects occupied placements
  // before committing, so a gesture never uses this pass to push neighbors.
  const placed: ModuleBox[] = [];
  for (const id of Object.keys(result).sort(
    (a, b) => result[a].y - result[b].y || result[a].x - result[b].x,
  )) {
    const box = result[id];
    let collision: ModuleBox | undefined;
    while (
      (collision = placed.find(
        (other) =>
          box.x < other.x + other.w &&
          box.x + box.w > other.x &&
          box.y < other.y + other.h + MODULE_GAP &&
          box.y + box.h + MODULE_GAP > other.y,
      ))
    )
      box.y = collision.y + collision.h + MODULE_GAP;
    placed.push(box);
  }
  return result;
}

export function materializeBoard(
  layout: ModuleLayout,
  modules: BoardModule[],
  boxes: Record<string, ModuleBox>,
  boardWidth = layout.boardWidth ?? 1200,
): ModuleLayout {
  return {
    ...layout,
    boardWidth,
    modules: {
      ...layout.modules,
      ...Object.fromEntries(
        modules.map((m) => [
          m.id,
          {
            ...modulePlacement(layout, m),
            sectionRelative: false,
            ...(boxes[m.id] ? { box: boxes[m.id] } : {}),
          },
        ]),
      ),
    },
  };
}

/** A reading preset projects the saved template without replacing its geometry. */
export function evidenceReadingLayout(
  layout: ModuleLayout,
  modules: BoardModule[],
  heights: Record<string, number>,
) {
  const boxes = moduleBoard(layout, modules, heights);
  const list = modules.find((m) => m.id === "moments"),
    detail = modules.find((m) => m.id === "evidence");
  if (!list || !detail || !boxes.moments || !boxes.evidence) return layout;
  const y = Math.max(boxes.moments.y, boxes.evidence.y);
  return {
    ...layout,
    modules: {
      ...layout.modules,
      moments: {
        ...modulePlacement(layout, list),
        width: 5,
        box: { ...boxes.moments, x: 0, y, w: 456 },
      },
      evidence: {
        ...modulePlacement(layout, detail),
        width: 7,
        box: { ...boxes.evidence, x: 480, y, w: 720 },
      },
    },
  };
}

/** Empty space is intentional. Moving one card never pushes another card into a section. */
export function placeModule(
  layout: ModuleLayout,
  id: string,
  box: ModuleBox,
): ModuleLayout {
  const old = layout.modules[id];
  if (!old) return layout;
  const next = boundModuleBox(box, Math.min(180, box.w));
  if (old.heightMode !== "fixed") next.h = Math.max(1, box.h);
  return {
    ...layout,
    modules: {
      ...layout.modules,
      [id]: {
        ...old,
        box: next,
        width: Math.max(3, Math.min(12, Math.round(next.w / 100))),
        height: next.h,
        hidden: false,
      },
    },
  };
}

export function availableModuleBox(
  boxes: Record<string, ModuleBox>,
  top = 0,
  size = { w: 384, h: 288 },
  boardWidth = 1200,
): ModuleBox {
  const gapX = (MODULE_GAP * 1200) / Math.max(1, boardWidth);
  const candidate = boundModuleBox({
    x: 0,
    y: Math.max(0, Math.round(top / 12) * 12),
    w: size.w,
    h: size.h,
  });
  const overlaps = (b: ModuleBox) =>
    candidate.x < b.x + b.w + gapX &&
    candidate.x + candidate.w + gapX > b.x &&
    candidate.y < b.y + b.h + MODULE_GAP &&
    candidate.y + candidate.h + MODULE_GAP > b.y;
  for (let y = candidate.y; y <= 50000; y += 24) {
    candidate.y = y;
    for (let x = 0; x <= 1200 - candidate.w; x += 24) {
      candidate.x = x;
      if (!Object.values(boxes).some(overlaps)) return { ...candidate };
    }
  }
  return boundModuleBox(candidate);
}

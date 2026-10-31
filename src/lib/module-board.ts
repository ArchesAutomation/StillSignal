import { boundModuleBox, type ModuleBox, type ModuleLayout, type ModulePlacement } from "./module-layout";

export type BoardModule = { id: string; section: string; order: number; width: number; initiallyHidden: boolean };
export function modulePlacement(layout: ModuleLayout, module: BoardModule): ModulePlacement {
  return layout.modules[module.id] ?? { section: layout.sections.some(s => s.id === module.section) ? module.section : layout.sections[0].id, order: module.order, width: module.width, hidden: module.initiallyHidden };
}

/** Read old sections once as starting positions; saved board coordinates are never packed. */
export function moduleBoard(layout: ModuleLayout, modules: BoardModule[], heights: Record<string, number> = {}): Record<string, ModuleBox> {
  const result: Record<string, ModuleBox> = {};
  let rowX = 0, rowY = 0, rowHeight = 0;
  for (const section of layout.sections) {
    const sectionWidth = section.width * 100;
    if (rowX + sectionWidth > 1200) { rowX = 0; rowY += rowHeight + 24; rowHeight = 0; }
    let x = 0, y = 0, height = 0;
    const members = modules.filter(m => { const p = modulePlacement(layout, m); return !p.hidden && p.section === section.id; }).sort((a, b) => modulePlacement(layout, a).order - modulePlacement(layout, b).order);
    for (const module of members) {
      const p = modulePlacement(layout, module);
      if (p.box) { result[module.id] = boundModuleBox({ ...p.box, h: p.height ?? p.box.h }); continue; }
      const w = Math.max(180, sectionWidth * p.width / 12 - 16), h = p.height ?? heights[module.id] ?? 300;
      if (x + w > sectionWidth && x) { x = 0; y += height + 16; height = 0; }
      result[module.id] = boundModuleBox({ x: rowX + x, y: rowY + y, w, h });
      x += w + 16; height = Math.max(height, h);
    }
    rowHeight = Math.max(rowHeight, y + height); rowX += sectionWidth;
  }
  return result;
}

export function materializeBoard(layout: ModuleLayout, modules: BoardModule[], boxes: Record<string, ModuleBox>): ModuleLayout {
  return { ...layout, modules: { ...layout.modules, ...Object.fromEntries(modules.map(m => [m.id, { ...modulePlacement(layout, m), ...(boxes[m.id] ? { box: boxes[m.id] } : {}) }])) } };
}

/** Empty space is intentional. Moving one card never pushes another card into a section. */
export function placeModule(layout: ModuleLayout, id: string, box: ModuleBox): ModuleLayout {
  const old = layout.modules[id]; if (!old) return layout;
  const next = boundModuleBox(box);
  return { ...layout, modules: { ...layout.modules, [id]: { ...old, box: next, width: Math.max(3, Math.min(12, Math.round(next.w / 100))), height: next.h, hidden: false } } };
}

export function availableModuleBox(boxes: Record<string, ModuleBox>, top = 0, size = { w: 384, h: 288 }): ModuleBox {
  const candidate = boundModuleBox({ x: 0, y: Math.max(0, Math.round(top / 12) * 12), ...size });
  const overlaps = (b: ModuleBox) => candidate.x < b.x + b.w + 12 && candidate.x + candidate.w + 12 > b.x && candidate.y < b.y + b.h + 12 && candidate.y + candidate.h + 12 > b.y;
  for (let y = candidate.y; y <= 50000; y += 24) {
    candidate.y = y;
    for (let x = 0; x <= 1200 - candidate.w; x += 24) { candidate.x = x; if (!Object.values(boxes).some(overlaps)) return { ...candidate }; }
  }
  return boundModuleBox(candidate);
}

export type ModuleSection = { id: string; title: string; width: number; height?: number };
export type ModulePlacement = { section: string; order: number; width: number; hidden: boolean; title?: string; height?: number; compact?: boolean; hiddenParts?: string[] };
export type ModuleLayout = { sections: ModuleSection[]; modules: Record<string, ModulePlacement> };
export const defaultSections: ModuleSection[] = [
  { id: "top", title: "At a glance", width: 12 },
  { id: "main", title: "My workspace", width: 9 },
  { id: "side", title: "Alongside", width: 3 },
  { id: "bottom", title: "More to explore", width: 12 },
];
export const moduleLayoutKey = (owner: string, page: string) => `still-signal-modules-v2:${encodeURIComponent(owner)}:${encodeURIComponent(page)}`;
export const emptyModuleLayout = (): ModuleLayout => ({ sections: defaultSections.map(s => ({ ...s })), modules: {} });
export function readModuleLayout(value: string | null): ModuleLayout {
  try {
    const raw = JSON.parse(value || "null");
    if (!raw || !Array.isArray(raw.sections) || !raw.modules || typeof raw.modules !== "object") return emptyModuleLayout();
    const ids = new Set<string>();
    const sections: ModuleSection[] = raw.sections.slice(0, 12).filter((s: ModuleSection) => {
      if (!s || typeof s.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id) || typeof s.title !== "string" || !s.title.trim() || !Number.isInteger(s.width) || s.width < 3 || s.width > 12) return false;
      ids.add(s.id); return true;
    }).map((s: ModuleSection) => ({ id: s.id, width: s.width, title: s.title.slice(0, 60), ...(Number.isFinite(s.height) ? { height: Math.max(120, Math.min(1600, s.height!)) } : {}) }));
    if (!sections.length) return emptyModuleLayout();
    const modules: Record<string, ModulePlacement> = {};
    for (const [id, value] of Object.entries(raw.modules).slice(0, 150)) {
      const p = value as ModulePlacement;
      if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id) || !p || !ids.has(p.section) || !Number.isInteger(p.order) || p.order < 0 || p.order > 200 || !Number.isInteger(p.width) || p.width < 3 || p.width > 12) continue;
      modules[id] = { section: p.section, order: p.order, width: p.width, hidden: p.hidden === true,
        title: typeof p.title === "string" ? p.title.slice(0, 80) : undefined,
        height: Number.isFinite(p.height) ? Math.max(120, Math.min(1600, p.height!)) : undefined,
        compact: p.compact === true,
        hiddenParts: Array.isArray(p.hiddenParts) ? p.hiddenParts.filter((s): s is string => typeof s === "string" && s.length < 100).slice(0, 30) : [],
      };
    }
    return { sections, modules };
  } catch { return emptyModuleLayout(); }
}

/** Shared by pointer and keyboard resizing; dimensions stay on the section grid. */
export function resizeModule(width: number, height: number, dx: number, dy: number, gridWidth: number, gap: number) {
  const column = (gridWidth + gap) / 12;
  return {
    width: Math.max(3, Math.min(12, width + Math.round(dx / Math.max(1, column)))),
    height: Math.max(120, Math.min(1600, Math.round(height + dy))),
  };
}
export function moveModule(layout: ModuleLayout, id: string, placement: ModulePlacement, section: string, before?: string): ModuleLayout {
  if (!layout.sections.some(s => s.id === section) || id === before) return layout;
  const next = { ...layout, modules: { ...layout.modules, [id]: { ...placement, section, hidden: false } } };
  const peers = Object.entries(next.modules).filter(([key, p]) => key !== id && p.section === section && !p.hidden).sort((a, b) => a[1].order - b[1].order);
  const at = before ? peers.findIndex(([key]) => key === before) : -1;
  peers.splice(at < 0 ? peers.length : at, 0, [id, next.modules[id]]);
  peers.forEach(([key, p], order) => { next.modules[key] = { ...p, order }; });
  return next;
}

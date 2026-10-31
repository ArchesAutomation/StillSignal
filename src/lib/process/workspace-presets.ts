import type { ModuleLayout } from "../module-layout";
export const workspacePresets = {
  "Pre-Market": [
    "preparation",
    "thesis",
    "temperature",
    "variables",
    "missions",
  ],
  "Live Session": ["thesis", "quality", "journal", "physiolog", "timeline"],
  "Post-Session": [
    "replay",
    "quality",
    "audit",
    "patterns",
    "reflection",
    "missions",
  ],
  "Minimalist Trader": ["preparation", "thesis", "journal"],
  "Price Action Trader": ["thesis", "chart", "quality"],
  "Rules & Discipline": ["preparation", "quality", "violations", "missions"],
  "Physiological Research": [
    "physiolog",
    "temperature",
    "patterns",
    "variables",
  ],
  "Data-Driven Trader": ["patterns", "variables", "audit", "quality"],
  "Blank Workspace": [],
} as const;
/** A preset only changes visibility of registered modules; it never deletes content. */
export function presetWorkspace(
  layout: ModuleLayout,
  name: keyof typeof workspacePresets,
): ModuleLayout {
  const tokens: readonly string[] = workspacePresets[name];
  return {
    ...layout,
    modules: Object.fromEntries(
      Object.entries(layout.modules).map(([id, p]) => [
        id,
        { ...p, hidden: !tokens.some((t) => id.includes(t)) },
      ]),
    ),
  };
}

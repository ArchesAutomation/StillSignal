// Phase colours follow the active theme (see src/lib/theme.ts). Values are CSS colours, so use them in
// `style` (not SVG presentation attributes) and blend with phaseTint() rather than appending hex alpha.
export const phaseColors: Record<string, string> = {
  before: "var(--theme-done-ink)",
  entry: "var(--theme-journal-ink)",
  management: "var(--theme-warning)",
  exit: "var(--theme-danger)",
  after: "var(--theme-link)",
  reflection: "var(--theme-muted)",
};

export const phaseTint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

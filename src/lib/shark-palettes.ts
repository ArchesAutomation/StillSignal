import type { SharkKind } from "./ascii-sharks/world";

export const SHARK_SPECIES = [
  { id: "classic", name: "Classic" },
  { id: "hammerhead", name: "Hammerhead" },
  { id: "greathammer", name: "Great hammerhead" },
  { id: "tiger", name: "Tiger" },
  { id: "zebra", name: "Zebra" },
  { id: "mako", name: "Mako" },
  { id: "thresher", name: "Thresher" },
  { id: "nurse", name: "Nurse" },
] as const satisfies readonly { id: SharkKind; name: string }[];

export const SHARK_PALETTES = [
  { id: "steel", name: "Silver Steel", color: "#b0b8c2" },
  { id: "sand", name: "Sandstone", color: "#b7a184" },
  { id: "slate", name: "Blue Slate", color: "#7185a5" },
  { id: "reef", name: "Reef Sage", color: "#85a58b" },
  { id: "graphite", name: "Graphite", color: "#77808a" },
  { id: "rose", name: "Rose", color: "#bd849f" },
  { id: "purple", name: "Purple", color: "#9c7fc7" },
  { id: "red", name: "Red", color: "#bd6e6b" },
  { id: "gold", name: "Gold", color: "#c6af76" },
  { id: "teal", name: "Teal", color: "#6caeb0" },
] as const;
export type SharkPalette = typeof SHARK_PALETTES[number]["id"];
export const SHARK_SIZE_OPTIONS = [
  { name: "Petite", value: .7 }, { name: "Small", value: .77 },
  { name: "Medium", value: .84 }, { name: "Large", value: 1 },
] as const;
export const MAX_OCEAN_SHARKS = 6;
export type OceanShark = { id: string; kind: SharkKind; palette: SharkPalette; size: number };
export const DEFAULT_OCEAN_SHARKS: OceanShark[] = [
  { id: "ocean-1", kind: "classic", palette: "steel", size: 1 },
  { id: "ocean-2", kind: "classic", palette: "sand", size: .7 },
  { id: "ocean-3", kind: "classic", palette: "slate", size: .84 },
  { id: "ocean-4", kind: "classic", palette: "reef", size: .77 },
];
const MERGED_PALETTES: Record<string, SharkPalette> = { pearl: "steel", bronze: "sand", copper: "sand", glacier: "teal", blush: "rose", maroon: "rose", lilac: "purple", coral: "red", olive: "reef", navy: "slate" };
export function sharkPalette(id: string) {
  return SHARK_PALETTES.find(palette => palette.id === (MERGED_PALETTES[id] ?? id)) ?? SHARK_PALETTES[0];
}
export function parseOceanSharks(value: unknown): OceanShark[] {
  if (!Array.isArray(value)) return DEFAULT_OCEAN_SHARKS.map(shark => ({ ...shark }));
  const used = new Set<string>();
  return value.slice(0, MAX_OCEAN_SHARKS).map((raw, index) => {
    const entry = raw && typeof raw === "object" ? raw : {};
    let id = typeof entry.id === "string" && /^[a-z0-9_-]{1,64}$/i.test(entry.id) ? entry.id : "shark-" + (index + 1);
    while (used.has(id)) id += "-" + index;
    used.add(id);
    const size = typeof entry.size === "number" && Number.isFinite(entry.size) ? entry.size : .84;
    return { id, kind: SHARK_SPECIES.find(species => species.id === entry.kind)?.id ?? "classic", palette: sharkPalette(entry.palette).id, size: SHARK_SIZE_OPTIONS.reduce((best, option) => Math.abs(option.value - size) < Math.abs(best - size) ? option.value : best, .84 as number) };
  });
}
export function sameOceanSharks(a: OceanShark[], b: OceanShark[]) {
  return a.length === b.length && a.every((shark, i) => shark.id === b[i].id && shark.kind === b[i].kind && shark.palette === b[i].palette && shark.size === b[i].size);
}

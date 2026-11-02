export type ReadingArea = { left: number; top: number; right: number; bottom: number };

/** Nearest way out of a reading area, including the shark's fin clearance. */
export function escapeReadingArea(x: number, y: number, area: ReadingArea, margin: number) {
  const left = area.left - margin, right = area.right + margin;
  const top = area.top - margin, bottom = area.bottom + margin;
  if (x <= left || x >= right || y <= top || y >= bottom) return null;
  const exits = [
    { x: left - x, y: 0 }, { x: right - x, y: 0 },
    { x: 0, y: top - y }, { x: 0, y: bottom - y },
  ];
  return exits.reduce((a, b) => Math.hypot(a.x, a.y) < Math.hypot(b.x, b.y) ? a : b);
}

export function overlapsReadingArea(nodes: Float32Array, length: number, areas: ReadingArea[]) {
  // Conservative clearance includes fins, tail motion, and the ASCII cell edge.
  const margin = length * .3 + 12;
  return areas.some(area => {
    for (let i = 0; i < nodes.length; i += 2) {
      if (escapeReadingArea(nodes[i], nodes[i + 1], area, margin)) return true;
    }
    return false;
  });
}

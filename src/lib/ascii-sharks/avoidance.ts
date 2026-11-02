export type ReadingArea = { left: number; top: number; right: number; bottom: number };

/** Distance a head can travel before reaching text or the edge of the water. */
export function swimClearance(x: number, y: number, heading: number, limit: number,
  areas: ReadingArea[], margin: number, width: number, height: number) {
  const dx = Math.cos(heading), dy = Math.sin(heading);
  let clear = limit;
  for (const [p, v, bound] of [[x, dx, width], [y, dy, height]]) {
    if (v > 1e-6) clear = Math.min(clear, Math.max(0, (bound - 8 - p) / v));
    if (v < -1e-6) clear = Math.min(clear, Math.max(0, (8 - p) / v));
  }
  for (const area of areas) {
    let near = 0, far = clear;
    for (const [p, v, lo, hi] of [
      [x, dx, area.left - margin, area.right + margin],
      [y, dy, area.top - margin, area.bottom + margin],
    ]) {
      if (Math.abs(v) < 1e-6) { if (p < lo || p > hi) far = -1; }
      else {
        const a = (lo - p) / v, b = (hi - p) / v;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
    }
    if (far > near && far > 1e-5) clear = Math.min(clear, Math.max(0, near - 1));
  }
  return clear;
}

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

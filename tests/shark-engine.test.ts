import test from "node:test";
import assert from "node:assert/strict";
import { OceanEngine } from "../src/lib/ascii-sharks/engine";
import { AsciiRenderer } from "../src/lib/ascii-sharks/renderer";
import { World } from "../src/lib/ascii-sharks/world";

test("ocean preserves upstream 60 Hz swimming and coalesces color changes into animation frames", (t) => {
  let now = 0, sequence = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const steps: number[] = [], paints: number[] = [];
  let appearanceRefreshes = 0;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const noop = () => {};
  const windowListeners: string[] = [];
  class Observer { observe = noop; disconnect = noop; }
  const motion = { matches: false, addEventListener: noop, removeEventListener: noop };
  install("window", { devicePixelRatio: 2, matchMedia: () => motion, addEventListener: (type: string) => windowListeners.push(type), removeEventListener: noop });
  install("document", { hidden: false, createElement: () => ({}), addEventListener: noop, removeEventListener: noop, documentElement: { addEventListener: noop, removeEventListener: noop } });
  install("getComputedStyle", () => ({ fontFamily: "monospace" }));
  install("ResizeObserver", Observer);
  install("IntersectionObserver", Observer);
  install("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
  install("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  t.mock.method(performance, "now", () => now);
  t.mock.method(AsciiRenderer.prototype, "resize", noop);
  t.mock.method(AsciiRenderer.prototype, "render", () => paints.push(now));
  t.mock.method(AsciiRenderer.prototype, "refreshAppearance", () => appearanceRefreshes++);
  const step = World.prototype.step;
  t.mock.method(World.prototype, "step", function(this: World, dt: number) { steps.push(dt); step.call(this, dt); });
  let engine: OceanEngine | undefined;
  try {
    engine = new OceanEngine({ getContext: () => ({}), getBoundingClientRect: () => ({ width: 1440, height: 1000 }) } as unknown as HTMLCanvasElement);
    assert.ok(!windowListeners.includes("pointerdown"), "clicks cannot trigger a splash or glow");
    for (let i = 1; i <= 120; i++) {
      now = i * 1000 / 60;
      const scheduled = [...callbacks.values()]; callbacks.clear();
      scheduled.forEach(callback => callback(now));
    }
    assert.ok(steps.length >= 119 && steps.length <= 120);
    assert.ok(steps.every(dt => dt === 1 / 60), "body following must use upstream's fixed timestep");
    assert.equal(paints.length, 120, "painting follows upstream's 60 FPS on a capable device");
    assert.ok(paints.slice(1).every((time, i) => Math.abs(time - paints[i] - 1000 / 60) < 1), "steady frame spacing without timer drift");
    const beforePaints = paints.length, beforeSteps = steps.length, beforeRefreshes = appearanceRefreshes;
    for (let i = 0; i < 100; i++) engine.refreshAppearance();
    assert.equal(paints.length, beforePaints, "picker events never force synchronous renders");
    assert.equal(steps.length, beforeSteps, "color changes do not alter the simulation");
    assert.equal(appearanceRefreshes, beforeRefreshes);
    now += 1000 / 60;
    const scheduled = [...callbacks.values()]; callbacks.clear(); scheduled.forEach(callback => callback(now));
    assert.equal(appearanceRefreshes, beforeRefreshes + 1, "100 picker events become one tint update");
    assert.equal(paints.length, beforePaints + 1);
    engine.destroy();
    assert.equal(callbacks.size, 0, "destroy cancels the loop");
  } finally {
    engine?.destroy();
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

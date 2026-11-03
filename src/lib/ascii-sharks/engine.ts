import { AsciiRenderer } from "./renderer";
import { World, type SharkSpec } from "./world";
import type { ReadingArea } from "./avoidance";

// Spine following and wander were tuned upstream for 60 Hz. Rendering may skip
// frames; changing this step changes the way the animal bends and steers.
const STEP = 1 / 60;
const MAX_STEPS = 6;
const FRAME_MS = 1000 / 60;
const MAX_PIXELS = 1_500_000;

/**
 * Wires World + AsciiRenderer to a canvas: fixed-timestep loop, resize,
 * pointer input, pausing off-screen, and prefers-reduced-motion.
 */
export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;
  private frameMs = FRAME_MS;
  private nextPaint = 0;
  private paintDelta = 0;
  private sized = false;
  private appearanceDirty = true;
  private appearanceRaf = 0;

  setSharks(specs: SharkSpec[]) {
    this.world.setSharks(specs);
    if (this.reducedMotion.matches) this.refreshAppearance();
  }

  refreshAppearance() {
    // Tint events never step, reseed, or synchronously redraw the ecosystem.
    this.appearanceDirty = true;
    if (this.reducedMotion.matches && !this.appearanceRaf && this.sized && this.visible && !document.hidden) {
      this.appearanceRaf = requestAnimationFrame(() => {
        this.appearanceRaf = 0;
        if (!this.disposed && this.sized && this.visible && !document.hidden) this.drawStill();
      });
    }
  }

  setReadingAreas(areas: ReadingArea[]) {
    this.world.readingAreas = areas;
    this.world.placeSharks();
    if (this.reducedMotion.matches) this.drawStill();
  }

  constructor(private canvas: HTMLCanvasElement, sharks?: SharkSpec[]) {
    // A decorative background needs a small school, not hundreds of boids.
    this.world = new World(sharks, 96, true);
    this.renderer = new AsciiRenderer(canvas);
    // Workspace modules can initialize while detached or hidden.
    const fontFamily = getComputedStyle(canvas).fontFamily || "ui-monospace, monospace";
    this.renderer.setFontFamily(fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    document.addEventListener("visibilitychange", this.schedule);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.appearanceRaf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    document.removeEventListener("visibilitychange", this.schedule);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.sized = rect.width >= 1 && rect.height >= 1;
    if (!this.sized) { this.schedule(); return; }
    // ASCII does not need a Retina-sized full-screen backing store. Bound 4K too.
    const dpr = Math.min(window.devicePixelRatio || 1, 1,
      Math.sqrt(MAX_PIXELS / (rect.width * rect.height)));
    this.renderer.resize(rect.width, rect.height, dpr);
    this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
    if (this.reducedMotion.matches) this.drawStill();
    this.schedule();
  }

  private schedule = () => {
    cancelAnimationFrame(this.raf);
    this.acc = 0;
    this.paintDelta = 0;
    this.nextPaint = 0;
    if (this.disposed || !this.sized || !this.visible || document.hidden) return;
    if (this.reducedMotion.matches) {
      if (this.appearanceDirty) this.refreshAppearance();
      return;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    if (this.disposed || !this.visible || document.hidden || this.reducedMotion.matches) return;
    const start = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.paintDelta += dt;
    if (now + .5 >= this.nextPaint) {
      if (this.appearanceDirty) {
        this.renderer.refreshAppearance();
        this.appearanceDirty = false;
      }
      this.renderer.render(this.world, this.paintDelta);
      this.paintDelta = 0;
      const cost = performance.now() - start;
      // Only fall back on genuinely slow frames. The old 12% budget throttled
      // healthy 8ms frames to ~14 FPS and introduced uneven timer/RAF pacing.
      this.frameMs = Math.min(100, Math.max(FRAME_MS, this.frameMs * .9 + cost * 2 * .1));
      this.nextPaint = this.nextPaint
        ? Math.max(this.nextPaint + this.frameMs, now + 1)
        : now + this.frameMs;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.appearanceDirty) {
      this.renderer.refreshAppearance();
      this.appearanceDirty = false;
    }
    // Tolerate floating-point drift so font/resize callbacks cannot settle twice.
    for (let i = 0; i < 240 && this.world.time + STEP / 2 < 4; i++) this.world.step(STEP);
    this.renderer.render(this.world, STEP);
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
  };
}

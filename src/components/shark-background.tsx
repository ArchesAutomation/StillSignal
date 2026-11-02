"use client";

import { useEffect, useRef } from "react";
import { OceanEngine } from "@/lib/ascii-sharks/engine";

/** Decorative ocean; the engine pauses offscreen and respects reduced motion. */
export default function SharkBackground({ quiet = false }: { quiet?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Keep the page usable in environments without canvas or observer APIs.
    if (!canvas || typeof ResizeObserver === "undefined" ||
        typeof IntersectionObserver === "undefined" || !canvas.getContext("2d")) return;
    const engine = new OceanEngine(canvas);
    return () => engine.destroy();
  }, []);

  return (
    <div className={`shark-background${quiet ? " shark-background-quiet" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

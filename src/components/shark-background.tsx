"use client";

import { useEffect, useRef } from "react";
import { OceanEngine } from "@/lib/ascii-sharks/engine";

/** Separate water lanes keep every shark outside the reading area. */
export default function SharkBackground({ quiet = false }: { quiet?: boolean }) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const bottomRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined" ||
        typeof IntersectionObserver === "undefined") return;
    const engines = [topRef.current, bottomRef.current].flatMap((canvas) =>
      canvas?.getContext("2d")
        ? [new OceanEngine(canvas, [{ kind: "classic", size: 0.65 }])]
        : [],
    );
    return () => engines.forEach((engine) => engine.destroy());
  }, []);

  return (
    <div className={`shark-background${quiet ? " shark-background-quiet" : ""}`} aria-hidden="true">
      <canvas ref={topRef} className="shark-lane shark-lane-top" />
      <canvas ref={bottomRef} className="shark-lane shark-lane-bottom" />
    </div>
  );
}

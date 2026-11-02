"use client";

import { useEffect, useRef } from "react";
import { OceanEngine } from "@/lib/ascii-sharks/engine";

/** One continuous ocean, with invisible reading areas used only for steering. */
export default function SharkBackground({ quiet = false }: { quiet?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined" ||
        typeof IntersectionObserver === "undefined" || !canvas.getContext("2d")) return;
    const host = canvas.parentElement?.parentElement;
    if (!host) return;
    const engine = new OceanEngine(canvas, [
      { kind: "classic", size: .48 }, { kind: "classic", size: .4 },
    ]);
    const targets = [...host.querySelectorAll<HTMLElement>(
      '.auth-brand, .auth-card, .auth-story h1, .auth-story p, .auth-story .eyebrow, .auth-features span, .breathing-orb, .stillness-heading, .notice-card h3, .notice-card p, .notice-card .eyebrow, .notice-prompt, .inline-actions, .return-card h3, .return-card .eyebrow, .practice-step, .practice-steps, progress, .return-controls, .topic-orbit, .topic-response, .stillness-footnote',
    )];
    const update = () => {
      const origin = canvas.getBoundingClientRect();
      if (!origin.width || !origin.height) return;
      engine.setReadingAreas(targets.flatMap(target => {
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return [];
        const rects: DOMRect[] = [];
        if (target.matches('.auth-card, .auth-brand, .breathing-orb, .inline-actions, progress, .practice-steps, .return-controls, .topic-orbit')) {
          rects.push(rect);
        } else {
          // Protect the visible lines, not the entire width of their containers.
          const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            rects.push(...range.getClientRects());
          }
        }
        return rects.map(line => ({
          left: line.left - origin.left - 10, top: line.top - origin.top - 10,
          right: line.right - origin.left + 10, bottom: line.bottom - origin.top + 10,
        }));
      }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    targets.forEach(target => observer.observe(target));
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      engine.destroy();
    };
  }, []);

  return (
    <div className={`shark-background${quiet ? " shark-background-quiet" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

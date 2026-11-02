# ASCII shark background

Based on https://github.com/stackedlol/ascii-sharks at a0074c16a106f0abc665fe9712ca445f8f98ad8e.
The original MIT license is preserved in LICENSE.

StillSignal changes add DOM reading-area steering, safe initial placement, and rendering clearance in avoidance.ts, world.ts, renderer.ts and engine.ts. Text is displayed directly over one continuous canvas, without background panels or separate swimming lanes. The wrapper measures individual text lines again on resize.

The engine handles resizing, reduced motion, offscreen pausing, and disposal.

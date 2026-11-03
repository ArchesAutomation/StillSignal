/** Progressive browser API used by Glassy UI's optional scroll refraction.
 * TypeScript 5's DOM library does not declare it yet. Runtime use is feature-tested. */
declare class ViewTimeline extends AnimationTimeline {
  constructor(options?: { subject?: Element; axis?: "block" | "inline" | "x" | "y" });
  readonly source: Element | null;
  readonly startOffset: CSSNumericValue;
  readonly endOffset: CSSNumericValue;
}

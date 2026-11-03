'use client';

import clsx from 'clsx';
import { forwardRef, useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { mergeRefs } from './lib/merge-refs';

export interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows with its text instead of scrolling, up to `maxRows`. */
  autoResize?: boolean;
  hint?: string;
  label?: string;
  /** The most rows an auto-resizing textarea grows to. Defaults to 8. */
  maxRows?: number;
}

const pixels = (value: string) => Number.parseFloat(value) || 0;

/**
 * A recessed glass field for longer text, with an optional label and hint. With `autoResize`
 * it grows as you type and scrolls once it reaches `maxRows`.
 */
export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  (
    {
      autoResize = false,
      className,
      hint,
      id,
      label,
      maxRows = 8,
      onInput,
      rows = 3,
      'aria-describedby': describedBy,
      ...props
    },
    forwardedRef,
  ) => {
    const generatedId = useId();
    const textareaId = id ?? `lg-textarea-${generatedId}`;
    const hintId = `${textareaId}-hint`;
    const descriptionIds = [describedBy, hint ? hintId : null].filter(Boolean).join(' ');
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const ref = useMemo(() => mergeRefs(innerRef, forwardedRef), [forwardedRef]);

    const fit = useCallback(() => {
      const element = innerRef.current;

      if (!element || !autoResize) return;

      const style = getComputedStyle(element);
      const border = pixels(style.borderTopWidth) + pixels(style.borderBottomWidth);
      const padding = pixels(style.paddingTop) + pixels(style.paddingBottom);
      const line = pixels(style.lineHeight) || pixels(style.fontSize) * 1.4;
      const limit = line * maxRows + padding + border;

      element.style.height = 'auto';

      const wanted = element.scrollHeight + border;

      element.style.height = `${Math.min(wanted, limit)}px`;
      element.style.overflowY = wanted > limit ? 'auto' : 'hidden';
    }, [autoResize, maxRows]);

    // Resize once the text is in the DOM, and again when the width rewraps it.
    useLayoutEffect(() => {
      const element = innerRef.current;

      fit();

      if (!element || !autoResize) return;

      let width = element.clientWidth;

      const observer = new ResizeObserver(() => {
        if (element.clientWidth === width) return;

        width = element.clientWidth;
        fit();
      });

      observer.observe(element);

      return () => observer.disconnect();
    }, [autoResize, fit, props.value]);

    return (
      <div className="flex w-full flex-col gap-2 text-sm text-[var(--lg-muted-foreground)]">
        {label ? (
          <label
            htmlFor={textareaId}
            className="font-medium text-[var(--lg-muted-foreground)] select-none"
          >
            {label}
          </label>
        ) : null}
        <textarea
          {...props}
          id={textareaId}
          ref={ref}
          rows={rows}
          aria-describedby={descriptionIds || undefined}
          data-lg-refraction="none"
          data-resize={autoResize ? 'auto' : undefined}
          className={clsx('lg-input lg-textarea', className)}
          onInput={(event) => {
            fit();
            onInput?.(event);
          }}
        />
        {hint ? (
          <span id={hintId} className="text-xs text-[var(--lg-muted-foreground)]">
            {hint}
          </span>
        ) : null}
      </div>
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';

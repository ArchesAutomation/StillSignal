'use client';

import clsx from 'clsx';
import { Children, forwardRef, useMemo, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { mergeRefs } from './lib/merge-refs';
import { useNordify } from './lib/use-nordify';

export type SurfaceRefraction = 'none' | 'soft' | 'strong';

export type RefractionBackgroundSpace = 'local' | 'viewport';

export type SurfacePreset = 'subtle' | 'standard' | 'prominent' | 'control' | 'showcase';

export type GlassSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  /** Brightens the surface a touch on hover. */
  interactive?: boolean;
  /** Chromium edge lens over the frost. On by default for control and showcase presets. */
  lens?: boolean;
  preset?: SurfacePreset;
  refraction?: SurfaceRefraction;
  refractionBackground?: ReactNode;
  refractionBackgroundSpace?: RefractionBackgroundSpace;
  refractionDisplacement?: number;
  /**
   * How thick this glass is, as a multiple of regular. A thicker slab has a
   * wider rim that bends the backdrop further and splits more colour. Defaults
   * to the site's thickness preference. Works with a supplied backdrop in every
   * browser, or with the Chromium lens over live content.
   */
  thickness?: number;
};

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  (
    {
      className,
      children,
      interactive = false,
      preset = 'standard',
      lens = true,
      refraction = preset === 'showcase' ? 'strong' : 'none',
      refractionBackground,
      refractionBackgroundSpace = 'local',
      refractionDisplacement,
      style,
      thickness,
      ...rest
    },
    forwardedRef,
  ) => {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const ref = useMemo(() => mergeRefs(surfaceRef, forwardedRef), [forwardedRef]);
    // Compact shared surfaces opt in; analytical panels keep the static material.
    useNordify(surfaceRef, lens || refraction !== 'none');
    // Preserve the public props; live DOM is now the optical backdrop.
    void refractionBackground; void refractionBackgroundSpace; void refractionDisplacement;

    return (
      <div
        ref={ref}
        data-glass-surface="panel"
        data-lg-interactive={interactive ? 'true' : 'false'}
        data-lg-preset={preset}
        data-lg-refraction={refraction}
        data-lg-refraction-background-space={refractionBackgroundSpace}
        className={clsx('lg-glass-surface', className)}
        style={thickness !== undefined ? ({ ...style, '--lg-glass-thickness': thickness } as CSSProperties) : style}
        {...rest}
      >
        {Children.map(children, (child) =>
          // Children.map yields null, elements, portals or text; wrap only the text.
          child === null || child instanceof Object ? (
            child
          ) : (
            <span className="lg-glass-text">{child}</span>
          ),
        )}
      </div>
    );
  },
);

GlassSurface.displayName = 'GlassSurface';

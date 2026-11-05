'use client';

import clsx from 'clsx';
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { GlassSurface } from './glass-surface';

export type CardElevation = 'base' | 'raised';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card elevation level. */
  elevation?: CardElevation;
  /** Whether the card is interactive (brightens on hover). */
  interactive?: boolean;
  /** Glass surface preset. Defaults to 'standard' for cards. */
  preset?: 'subtle' | 'standard' | 'prominent' | 'control' | 'showcase';
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      children,
      elevation = 'base',
      interactive = false,
      preset = 'standard',
      ...rest
    },
    forwardedRef,
  ) => {
    return (
      <GlassSurface
        ref={forwardedRef}
        preset={preset}
        interactive={interactive}
        lens={elevation === 'raised'}
        className={clsx('lg-card', `lg-card--${elevation}`, className)}
        {...rest}
      >
        {children}
      </GlassSurface>
    );
  },
);

GlassCard.displayName = 'GlassCard';

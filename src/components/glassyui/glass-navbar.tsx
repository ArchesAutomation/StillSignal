'use client';

import clsx from 'clsx';
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { GlassSurface } from './glass-surface';

export type NavbarPlacement = 'top' | 'bottom';

export interface GlassNavbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Where the navbar sits in the layout. Defaults to top. */
  placement?: NavbarPlacement;
  /** Whether the navbar content stays fixed during scroll. */
  fixed?: boolean;
  /** Glass surface preset. Defaults to 'control' for a distinct nav bar. */
  preset?: 'subtle' | 'standard' | 'prominent' | 'control' | 'showcase';
  /** Whether the navbar is interactive (brightens on hover). */
  interactive?: boolean;
}

export const GlassNavbar = forwardRef<HTMLDivElement, GlassNavbarProps>(
  (
    {
      className,
      children,
      placement = 'top',
      fixed = true,
      preset = 'control',
      interactive = true,
      ...rest
    },
    forwardedRef,
  ) => {
    const positionStyle = fixed
      ? { position: 'fixed', inset: placement === 'top' ? { top: 0, left: 0, right: 0 } : { bottom: 0, left: 0, right: 0 }, zIndex: 50 }
      : undefined;

    return (
      <GlassSurface
        ref={forwardedRef}
        preset={preset}
        interactive={interactive}
        lens
        className={clsx('lg-navbar', `lg-navbar--${placement}`, className)}
        style={positionStyle}
        {...rest}
      >
        {children}
      </GlassSurface>
    );
  },
);

GlassNavbar.displayName = 'GlassNavbar';

'use client';

import clsx from 'clsx';
import { forwardRef, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { GlassSurface } from './glass-surface';

export interface GlassModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Callback when the modal is dismissed (overlay click or escape). */
  onClose: () => void;
  /** Optional title rendered at the top of the modal. */
  title?: ReactNode;
  /** Glass surface preset. Defaults to 'showcase' for a prominent modal. */
  preset?: 'subtle' | 'standard' | 'prominent' | 'control' | 'showcase';
  /** Whether the modal is interactive (brightens on hover). */
  interactive?: boolean;
  /** Additional className. */
  className?: string;
}

export const GlassModal = forwardRef<HTMLDivElement, GlassModalProps>(
  (
    { open, onClose, title, preset = 'showcase', interactive = true, className, children, ...rest },
    forwardedRef,
  ) => {
    const overlayRef = useRef<HTMLDivElement>(null);

    const handleOverlayClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      },
      [onClose],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
          onClose();
        }
      },
      [onClose],
    );

    useEffect(() => {
      if (open) {
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
      <div
        ref={overlayRef}
        className={clsx('lg-modal-overlay', className)}
        onClick={handleOverlayClick}
        {...rest}
      >
        <GlassSurface
          ref={forwardedRef as React.Ref<HTMLDivElement>}
          preset={preset}
          interactive={interactive}
          lens
          className='lg-modal'
          role='dialog'
          aria-modal='true'
          aria-labelledby={title ? 'glass-modal-title' : undefined}
        >
          {title && (
            <div className='lg-modal-header'>
              <h2 id='glass-modal-title' className='lg-modal-title'>
                {title}
              </h2>
              <button
                type='button'
                className='lg-modal-close'
                onClick={onClose}
                aria-label='Close'
              >
                ✕
              </button>
            </div>
          )}
          <div className='lg-modal-body'>{children}</div>
        </GlassSurface>
      </div>
    );
  },
);

GlassModal.displayName = 'GlassModal';

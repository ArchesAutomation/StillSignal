'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * CustomWallpaper renders a wallpaper image behind the app content.
 * It is controlled by the --lg-wallpaper CSS custom property set by
 * GlassProvider from user preferences. When no wallpaper is configured,
 * nothing is rendered.
 */
export function CustomWallpaper({ children }: { children?: ReactNode }) {
  const wallpaperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wallpaperRef.current;
    if (!el) return;

    const update = () => {
      const wallpaper = getComputedStyle(document.documentElement)
        .getPropertyValue('--lg-wallpaper')
        .trim();
      el.style.backgroundImage = wallpaper ? `url("${wallpaper}")` : 'none';
      el.style.display = wallpaper ? 'block' : 'none';
    };

    update();

    // React to preference changes applied to the document element.
    const observer = new MutationObserver(() => {
      const wallpaper = getComputedStyle(document.documentElement)
        .getPropertyValue('--lg-wallpaper')
        .trim();
      if (wallpaper !== el.dataset.lastWallpaper) {
        el.dataset.lastWallpaper = wallpaper;
        el.style.backgroundImage = wallpaper ? `url("${wallpaper}")` : 'none';
        el.style.display = wallpaper ? 'block' : 'none';
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wallpaperRef}
      className='custom-wallpaper'
      aria-hidden='true'
      style={
        {
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          width: '100vw',
          height: '100vh',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          display: 'none',
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

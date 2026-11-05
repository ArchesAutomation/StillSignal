'use client';

import { useState, type ReactNode } from 'react';
import { GlassButton } from './glass-button';
import { GlassPanel } from './glass-panel';
import { usePreferences } from './glass-provider';
import { Settings } from 'lucide-react';

export type GlassyUiRefraction = 'none' | 'soft' | 'strong';

const REFLECTIONS: { value: GlassyUiRefraction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft' },
  { value: 'strong', label: 'Strong' },
];

interface GlassySettingsProps {
  className?: string;
}

export function GlassySettings({ className }: GlassySettingsProps) {
  const { preferences, setPreferences } = usePreferences();
  const [wallpaperInput, setWallpaperInput] = useState(preferences.wallpaper ?? '');

  const WALLPAPER_PRESETS: { label: string; url: string }[] = [
    { label: 'None', url: '' },
    { label: 'Ocean drift', url: 'https://images.unsplash.com/photo-1505128778775-255f46868f4b?q=80&w=1920&auto=format&fit=crop' },
    { label: 'Moonlit tide', url: 'https://images.unsplash.com/photo-1470225620777-d4b923e0c32e?q=80&w=1920&auto=format&fit=crop' },
    { label: 'Deep sea', url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=1920&auto=format&fit=crop' },
  ];

  return (
    <GlassPanel
      preset='standard'
      interactive
      className={className}
      style={{ padding: 24 }}
    >
      <div className='glassy-settings'>
        <h2 className='glassy-settings-heading'>
          <Settings size={20} /> Glassy UI
        </h2>
        <p className='glassy-settings-description'>
          Customise the frost, thickness, and wallpaper behind every glass surface.
        </p>

        {/* Blur */}
        <div className='glassy-setting'>
          <label className='glassy-setting-label'>
            Backdrop blur
            <span className='glassy-setting-value'>{preferences.blur}px</span>
          </label>
          <input
            type='range'
            min='0'
            max='40'
            step='1'
            value={preferences.blur}
            onChange={(e) => setPreferences({ blur: Number(e.target.value) })}
            className='glassy-range'
          />
        </div>

        {/* Thickness */}
        <div className='glassy-setting'>
          <label className='glassy-setting-label'>
            Glass thickness
            <span className='glassy-setting-value'>{preferences.thickness.toFixed(2)}×</span>
          </label>
          <input
            type='range'
            min='0.25'
            max='2'
            step='0.25'
            value={preferences.thickness}
            onChange={(e) => setPreferences({ thickness: Number(e.target.value) })}
            className='glassy-range'
          />
        </div>

        {/* Refraction */}
        <div className='glassy-setting'>
          <label className='glassy-setting-label'>Refraction</label>
          <div className='glassy-segmented'>
            {REFLECTIONS.map((r) => (
              <GlassButton
                key={r.value}
                size='sm'
                variant={preferences.refraction === r.value ? 'prominent' : 'ghost'}
                preset='control'
                lens={false}
                onClick={() => setPreferences({ refraction: r.value })}
              >
                {r.label}
              </GlassButton>
            ))}
          </div>
        </div>

        {/* Wallpaper */}
        <div className='glassy-setting'>
          <label className='glassy-setting-label'>Custom wallpaper</label>
          <div className='glassy-wallpaper'>
            <input
              type='text'
              placeholder='Image URL'
              value={wallpaperInput}
              onChange={(e) => setWallpaperInput(e.target.value)}
              className='glassy-wallpaper-input'
            />
            <GlassButton
              size='sm'
              variant='soft'
              preset='control'
              lens={false}
              onClick={() => setPreferences({ wallpaper: wallpaperInput || null })}
            >
              Apply
            </GlassButton>
          </div>
          <div className='glassy-wallpaper-presets'>
            {WALLPAPER_PRESETS.map((p) => (
              <GlassButton
                key={p.url}
                size='sm'
                variant={preferences.wallpaper === p.url ? 'prominent' : 'ghost'}
                preset='control'
                lens={false}
                onClick={() => {
                  setWallpaperInput(p.url);
                  setPreferences({ wallpaper: p.url || null });
                }}
              >
                {p.label}
              </GlassButton>
            ))}
          </div>
          {preferences.wallpaper && (
            <p className='glassy-wallpaper-hint'>
              Wallpaper applied. Reduce opacity or increase blur for subtler effect.
            </p>
          )}
        </div>

        {/* Accessibility toggles */}
        <div className='glassy-setting glassy-toggle-row'>
          <label className='glassy-toggle'>
            <input
              type='checkbox'
              checked={preferences.reduceTransparency}
              onChange={(e) => setPreferences({ reduceTransparency: e.target.checked })}
            />
            Reduce transparency
          </label>
          <label className='glassy-toggle'>
            <input
              type='checkbox'
              checked={preferences.reduceMotion}
              onChange={(e) => setPreferences({ reduceMotion: e.target.checked })}
            />
            Reduce motion
          </label>
        </div>
      </div>
    </GlassPanel>
  );
}

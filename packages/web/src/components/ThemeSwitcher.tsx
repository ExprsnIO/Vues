'use client';

import { useTheme } from '../stores/settings-store';
import { themeMetas, type ThemeId } from '@exprsn/shared';

export function ThemeSwitcher() {
  const { themeId, colorMode, setTheme, setColorMode } = useTheme();

  return (
    <div className="p-4 bg-surface rounded-lg border border-border space-y-4">
      <div>
        <h3 className="text-text-primary font-semibold mb-2">Theme</h3>
        <div className="flex flex-wrap gap-2">
          {themeMetas.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id as ThemeId)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                themeId === theme.id
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
              title={theme.description}
            >
              {theme.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-text-primary font-semibold mb-2">Color Mode</h3>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${
                colorMode === mode
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <p className="text-text-muted text-xs">
          Current: <span className="text-text-secondary">{themeId}</span> / <span className="text-text-secondary">{colorMode}</span>
        </p>
      </div>
    </div>
  );
}

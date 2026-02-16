'use client';

import { useEffect, useCallback, type FC, type PropsWithChildren } from 'react';
import { useSettingsStore, useTheme } from '../stores/settings-store';
import { themes, themeToCSSVariables, type ThemeColors } from '@exprsn/shared';

export const ThemeProvider: FC<PropsWithChildren> = ({ children }) => {
  const { themeId, colorMode, resolvedColorMode, setColorMode } = useTheme();
  const setSystemColorMode = useSettingsStore((state) => state.setSystemColorMode);
  const loadFromServer = useSettingsStore((state) => state.loadFromServer);
  const accessibility = useSettingsStore((state) => state.settings.accessibility);

  // Detect system color scheme
  const handleSystemColorSchemeChange = useCallback(
    (e: MediaQueryListEvent | MediaQueryList) => {
      const mode = e.matches ? 'dark' : 'light';
      setSystemColorMode(mode);
    },
    [setSystemColorMode]
  );

  // Initialize system color scheme detection
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    handleSystemColorSchemeChange(mediaQuery);
    mediaQuery.addEventListener('change', handleSystemColorSchemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemColorSchemeChange);
    };
  }, [handleSystemColorSchemeChange]);

  // Load settings from server on mount
  useEffect(() => {
    loadFromServer();
  }, [loadFromServer]);

  // Apply theme CSS variables
  useEffect(() => {
    const theme = themes[themeId];
    if (!theme) return;

    const colors: ThemeColors = theme[resolvedColorMode];
    const cssVars = themeToCSSVariables(colors);

    // Apply CSS variables to document root
    const root = document.documentElement;
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }

    // Set data attributes for Tailwind dark mode and theme identification
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-color-mode', resolvedColorMode);

    // Set dark class for Tailwind
    if (resolvedColorMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Clean up on unmount
    return () => {
      for (const key of Object.keys(cssVars)) {
        root.style.removeProperty(key);
      }
    };
  }, [themeId, resolvedColorMode]);

  // Apply accessibility settings
  useEffect(() => {
    const root = document.documentElement;

    // Reduced motion
    if (accessibility.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // High contrast
    if (accessibility.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Large text
    if (accessibility.largeText) {
      root.classList.add('large-text');
    } else {
      root.classList.remove('large-text');
    }

    // Screen reader optimized
    if (accessibility.screenReaderOptimized) {
      root.classList.add('sr-optimized');
    } else {
      root.classList.remove('sr-optimized');
    }
  }, [accessibility]);

  return <>{children}</>;
}

// Hook to get current theme colors
export function useThemeColors(): ThemeColors {
  const { themeId, resolvedColorMode } = useTheme();
  const theme = themes[themeId];
  return theme[resolvedColorMode];
}

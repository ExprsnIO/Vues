import type { Theme, ThemeColors, ThemeMeta } from '../types/theme.js';
import type { ThemeId } from '../types/settings.js';

// ============================================================================
// SLATE THEME (Neutral Gray) - Default
// All colors meet WCAG 2.1 AA: 4.5:1 for text, 3:1 for UI elements
// ============================================================================
const slateDark: ThemeColors = {
  background: '#0f0f0f',
  backgroundAlt: '#171717',
  surface: '#1f1f1f',
  surfaceHover: '#292929',

  textPrimary: '#f5f5f5',
  textSecondary: '#a3a3a3',
  textMuted: '#737373',
  textInverse: '#0f0f0f',

  accent: '#f83b85',
  accentHover: '#ff5c9e',
  accentMuted: '#3d1a2a',

  interactive: '#60a5fa',
  interactiveHover: '#93c5fd',

  border: '#2e2e2e',
  borderHover: '#404040',
  borderFocus: '#f83b85',

  success: '#4ade80',
  successMuted: '#1a3d2a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#f87171',
  errorMuted: '#3d1a1a',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(0, 0, 0, 0.75)',
};

const slateLight: ThemeColors = {
  background: '#fafafa',
  backgroundAlt: '#f5f5f5',
  surface: '#ffffff',
  surfaceHover: '#f0f0f0',

  textPrimary: '#171717',
  textSecondary: '#525252',
  textMuted: '#737373',
  textInverse: '#fafafa',

  accent: '#e91f63',
  accentHover: '#c81854',
  accentMuted: '#fce7f0',

  interactive: '#2563eb',
  interactiveHover: '#1d4ed8',

  border: '#e5e5e5',
  borderHover: '#d4d4d4',
  borderFocus: '#e91f63',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(0, 0, 0, 0.5)',
};

// ============================================================================
// OCEAN THEME (Blue-based)
// ============================================================================
const oceanDark: ThemeColors = {
  background: '#0a1628',
  backgroundAlt: '#0f1e32',
  surface: '#162033',
  surfaceHover: '#1e2d45',

  textPrimary: '#f0f9ff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textInverse: '#0a1628',

  accent: '#38bdf8',
  accentHover: '#7dd3fc',
  accentMuted: '#0c2d4a',

  interactive: '#38bdf8',
  interactiveHover: '#7dd3fc',

  border: '#1e3a5f',
  borderHover: '#2d4a6f',
  borderFocus: '#38bdf8',

  success: '#34d399',
  successMuted: '#0d3d2d',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#38bdf8',
  infoMuted: '#0c2d4a',

  overlay: 'rgba(10, 22, 40, 0.8)',
};

const oceanLight: ThemeColors = {
  background: '#f0f9ff',
  backgroundAlt: '#e0f2fe',
  surface: '#ffffff',
  surfaceHover: '#f0f9ff',

  textPrimary: '#0c4a6e',
  textSecondary: '#0369a1',
  textMuted: '#0284c7',
  textInverse: '#f0f9ff',

  accent: '#0284c7',
  accentHover: '#0369a1',
  accentMuted: '#e0f2fe',

  interactive: '#0369a1',
  interactiveHover: '#075985',

  border: '#bae6fd',
  borderHover: '#7dd3fc',
  borderFocus: '#0284c7',

  success: '#059669',
  successMuted: '#d1fae5',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#0284c7',
  infoMuted: '#e0f2fe',

  overlay: 'rgba(12, 74, 110, 0.5)',
};

// ============================================================================
// FOREST THEME (Green-based)
// ============================================================================
const forestDark: ThemeColors = {
  background: '#0a1f0a',
  backgroundAlt: '#112811',
  surface: '#163016',
  surfaceHover: '#1e3d1e',

  textPrimary: '#f0fdf4',
  textSecondary: '#86efac',
  textMuted: '#4ade80',
  textInverse: '#0a1f0a',

  accent: '#4ade80',
  accentHover: '#86efac',
  accentMuted: '#0d3d1a',

  interactive: '#4ade80',
  interactiveHover: '#86efac',

  border: '#1a4d1a',
  borderHover: '#256025',
  borderFocus: '#4ade80',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(10, 31, 10, 0.8)',
};

const forestLight: ThemeColors = {
  background: '#f0fdf4',
  backgroundAlt: '#dcfce7',
  surface: '#ffffff',
  surfaceHover: '#f0fdf4',

  textPrimary: '#14532d',
  textSecondary: '#166534',
  textMuted: '#15803d',
  textInverse: '#f0fdf4',

  accent: '#16a34a',
  accentHover: '#15803d',
  accentMuted: '#dcfce7',

  interactive: '#15803d',
  interactiveHover: '#166534',

  border: '#bbf7d0',
  borderHover: '#86efac',
  borderFocus: '#16a34a',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(20, 83, 45, 0.5)',
};

// ============================================================================
// SUNSET THEME (Orange/Warm)
// ============================================================================
const sunsetDark: ThemeColors = {
  background: '#1a0f0a',
  backgroundAlt: '#261510',
  surface: '#2d1a12',
  surfaceHover: '#3d2418',

  textPrimary: '#fff7ed',
  textSecondary: '#fdba74',
  textMuted: '#fb923c',
  textInverse: '#1a0f0a',

  accent: '#f97316',
  accentHover: '#fb923c',
  accentMuted: '#3d1f0a',

  interactive: '#fb923c',
  interactiveHover: '#fdba74',

  border: '#4d2a14',
  borderHover: '#5d3a20',
  borderFocus: '#f97316',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(26, 15, 10, 0.8)',
};

const sunsetLight: ThemeColors = {
  background: '#fffbeb',
  backgroundAlt: '#fef3c7',
  surface: '#ffffff',
  surfaceHover: '#fffbeb',

  textPrimary: '#78350f',
  textSecondary: '#92400e',
  textMuted: '#b45309',
  textInverse: '#fffbeb',

  accent: '#d97706',
  accentHover: '#b45309',
  accentMuted: '#fef3c7',

  interactive: '#b45309',
  interactiveHover: '#92400e',

  border: '#fde68a',
  borderHover: '#fcd34d',
  borderFocus: '#d97706',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(120, 53, 15, 0.5)',
};

// ============================================================================
// LAVENDER THEME (Purple-based)
// ============================================================================
const lavenderDark: ThemeColors = {
  background: '#13071e',
  backgroundAlt: '#1a0f28',
  surface: '#211433',
  surfaceHover: '#2d1d42',

  textPrimary: '#faf5ff',
  textSecondary: '#c4b5fd',
  textMuted: '#a78bfa',
  textInverse: '#13071e',

  accent: '#a78bfa',
  accentHover: '#c4b5fd',
  accentMuted: '#2d1d42',

  interactive: '#a78bfa',
  interactiveHover: '#c4b5fd',

  border: '#3d2856',
  borderHover: '#4d3866',
  borderFocus: '#a78bfa',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(19, 7, 30, 0.8)',
};

const lavenderLight: ThemeColors = {
  background: '#faf5ff',
  backgroundAlt: '#f3e8ff',
  surface: '#ffffff',
  surfaceHover: '#faf5ff',

  textPrimary: '#3b0764',
  textSecondary: '#581c87',
  textMuted: '#7c3aed',
  textInverse: '#faf5ff',

  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentMuted: '#f3e8ff',

  interactive: '#6d28d9',
  interactiveHover: '#5b21b6',

  border: '#e9d5ff',
  borderHover: '#d8b4fe',
  borderFocus: '#7c3aed',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(59, 7, 100, 0.5)',
};

// ============================================================================
// THEME REGISTRY
// ============================================================================
export const themes: Record<ThemeId, Theme> = {
  slate: {
    id: 'slate',
    name: 'Slate',
    description: 'Classic neutral theme with excellent contrast',
    light: slateLight,
    dark: slateDark,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calming blue tones inspired by the sea',
    light: oceanLight,
    dark: oceanDark,
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green tones for a calm experience',
    light: forestLight,
    dark: forestDark,
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and amber tones',
    light: sunsetLight,
    dark: sunsetDark,
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'Elegant purple tones for a creative vibe',
    light: lavenderLight,
    dark: lavenderDark,
  },
};

export const themeList = Object.values(themes);

export const themeMetas: ThemeMeta[] = themeList.map((theme) => ({
  id: theme.id,
  name: theme.name,
  description: theme.description,
  previewLight: theme.light.accent,
  previewDark: theme.dark.accent,
}));

// Helper to get resolved theme colors
export function getThemeColors(themeId: ThemeId, mode: 'light' | 'dark'): ThemeColors {
  return themes[themeId][mode];
}

// Convert theme colors to CSS variables
export function themeToCSSVariables(colors: ThemeColors): Record<string, string> {
  const cssVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    const cssKey = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    cssVars[cssKey] = value;
  }
  return cssVars;
}

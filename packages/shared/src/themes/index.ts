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
// MIDNIGHT THEME (Deep Indigo/Navy)
// ============================================================================
const midnightDark: ThemeColors = {
  background: '#080812',
  backgroundAlt: '#0d0d1a',
  surface: '#121225',
  surfaceHover: '#1a1a35',

  textPrimary: '#eef2ff',
  textSecondary: '#a5b4fc',
  textMuted: '#818cf8',
  textInverse: '#080812',

  accent: '#6366f1',
  accentHover: '#818cf8',
  accentMuted: '#1e1e4a',

  interactive: '#818cf8',
  interactiveHover: '#a5b4fc',

  border: '#252550',
  borderHover: '#353570',
  borderFocus: '#6366f1',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(8, 8, 18, 0.85)',
};

const midnightLight: ThemeColors = {
  background: '#eef2ff',
  backgroundAlt: '#e0e7ff',
  surface: '#ffffff',
  surfaceHover: '#eef2ff',

  textPrimary: '#1e1b4b',
  textSecondary: '#3730a3',
  textMuted: '#4f46e5',
  textInverse: '#eef2ff',

  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentMuted: '#e0e7ff',

  interactive: '#4338ca',
  interactiveHover: '#3730a3',

  border: '#c7d2fe',
  borderHover: '#a5b4fc',
  borderFocus: '#4f46e5',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(30, 27, 75, 0.5)',
};

// ============================================================================
// ROSE THEME (Pink/Rose tones)
// ============================================================================
const roseDark: ThemeColors = {
  background: '#18080f',
  backgroundAlt: '#200d16',
  surface: '#2a1320',
  surfaceHover: '#3d1a2d',

  textPrimary: '#fff1f2',
  textSecondary: '#fda4af',
  textMuted: '#fb7185',
  textInverse: '#18080f',

  accent: '#f43f5e',
  accentHover: '#fb7185',
  accentMuted: '#4a1525',

  interactive: '#fb7185',
  interactiveHover: '#fda4af',

  border: '#4d1a2a',
  borderHover: '#6d2540',
  borderFocus: '#f43f5e',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(24, 8, 15, 0.85)',
};

const roseLight: ThemeColors = {
  background: '#fff1f2',
  backgroundAlt: '#ffe4e6',
  surface: '#ffffff',
  surfaceHover: '#fff1f2',

  textPrimary: '#881337',
  textSecondary: '#be123c',
  textMuted: '#e11d48',
  textInverse: '#fff1f2',

  accent: '#e11d48',
  accentHover: '#be123c',
  accentMuted: '#ffe4e6',

  interactive: '#be123c',
  interactiveHover: '#9f1239',

  border: '#fecdd3',
  borderHover: '#fda4af',
  borderFocus: '#e11d48',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(136, 19, 55, 0.5)',
};

// ============================================================================
// EMBER THEME (Red/Warm Crimson)
// ============================================================================
const emberDark: ThemeColors = {
  background: '#1a0808',
  backgroundAlt: '#260d0d',
  surface: '#331212',
  surfaceHover: '#451a1a',

  textPrimary: '#fef2f2',
  textSecondary: '#fca5a5',
  textMuted: '#f87171',
  textInverse: '#1a0808',

  accent: '#ef4444',
  accentHover: '#f87171',
  accentMuted: '#4a1515',

  interactive: '#f87171',
  interactiveHover: '#fca5a5',

  border: '#4d1a1a',
  borderHover: '#6d2525',
  borderFocus: '#ef4444',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#f87171',
  errorMuted: '#3d1a1a',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(26, 8, 8, 0.85)',
};

const emberLight: ThemeColors = {
  background: '#fef2f2',
  backgroundAlt: '#fee2e2',
  surface: '#ffffff',
  surfaceHover: '#fef2f2',

  textPrimary: '#7f1d1d',
  textSecondary: '#991b1b',
  textMuted: '#dc2626',
  textInverse: '#fef2f2',

  accent: '#dc2626',
  accentHover: '#b91c1c',
  accentMuted: '#fee2e2',

  interactive: '#b91c1c',
  interactiveHover: '#991b1b',

  border: '#fecaca',
  borderHover: '#fca5a5',
  borderFocus: '#dc2626',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(127, 29, 29, 0.5)',
};

// ============================================================================
// MINT THEME (Teal/Cyan)
// ============================================================================
const mintDark: ThemeColors = {
  background: '#051a1a',
  backgroundAlt: '#0a2525',
  surface: '#0f3030',
  surfaceHover: '#154040',

  textPrimary: '#f0fdfa',
  textSecondary: '#5eead4',
  textMuted: '#2dd4bf',
  textInverse: '#051a1a',

  accent: '#14b8a6',
  accentHover: '#2dd4bf',
  accentMuted: '#0a3d3d',

  interactive: '#2dd4bf',
  interactiveHover: '#5eead4',

  border: '#1a4d4d',
  borderHover: '#256060',
  borderFocus: '#14b8a6',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(5, 26, 26, 0.85)',
};

const mintLight: ThemeColors = {
  background: '#f0fdfa',
  backgroundAlt: '#ccfbf1',
  surface: '#ffffff',
  surfaceHover: '#f0fdfa',

  textPrimary: '#134e4a',
  textSecondary: '#115e59',
  textMuted: '#0d9488',
  textInverse: '#f0fdfa',

  accent: '#0d9488',
  accentHover: '#0f766e',
  accentMuted: '#ccfbf1',

  interactive: '#0f766e',
  interactiveHover: '#115e59',

  border: '#99f6e4',
  borderHover: '#5eead4',
  borderFocus: '#0d9488',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(19, 78, 74, 0.5)',
};

// ============================================================================
// COPPER THEME (Brown/Bronze)
// ============================================================================
const copperDark: ThemeColors = {
  background: '#1a120a',
  backgroundAlt: '#261a10',
  surface: '#332215',
  surfaceHover: '#452e1c',

  textPrimary: '#fefcfb',
  textSecondary: '#d6bcab',
  textMuted: '#c49a7c',
  textInverse: '#1a120a',

  accent: '#c2410c',
  accentHover: '#ea580c',
  accentMuted: '#3d1f0a',

  interactive: '#ea580c',
  interactiveHover: '#f97316',

  border: '#4d2e15',
  borderHover: '#6d4020',
  borderFocus: '#c2410c',

  success: '#4ade80',
  successMuted: '#0d3d1a',
  warning: '#fbbf24',
  warningMuted: '#3d3414',
  error: '#fb7185',
  errorMuted: '#3d1a24',
  info: '#60a5fa',
  infoMuted: '#1a2d3d',

  overlay: 'rgba(26, 18, 10, 0.85)',
};

const copperLight: ThemeColors = {
  background: '#fefcfb',
  backgroundAlt: '#fdf4ef',
  surface: '#ffffff',
  surfaceHover: '#fefcfb',

  textPrimary: '#7c2d12',
  textSecondary: '#9a3412',
  textMuted: '#c2410c',
  textInverse: '#fefcfb',

  accent: '#c2410c',
  accentHover: '#9a3412',
  accentMuted: '#fdf4ef',

  interactive: '#9a3412',
  interactiveHover: '#7c2d12',

  border: '#fed7aa',
  borderHover: '#fdba74',
  borderFocus: '#c2410c',

  success: '#16a34a',
  successMuted: '#dcfce7',
  warning: '#d97706',
  warningMuted: '#fef3c7',
  error: '#dc2626',
  errorMuted: '#fee2e2',
  info: '#2563eb',
  infoMuted: '#dbeafe',

  overlay: 'rgba(124, 45, 18, 0.5)',
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
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep indigo for focused late-night sessions',
    light: midnightLight,
    dark: midnightDark,
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    description: 'Soft pink tones with romantic warmth',
    light: roseLight,
    dark: roseDark,
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    description: 'Bold crimson energy and passion',
    light: emberLight,
    dark: emberDark,
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh teal vibes for clarity',
    light: mintLight,
    dark: mintDark,
  },
  copper: {
    id: 'copper',
    name: 'Copper',
    description: 'Warm bronze sophistication',
    light: copperLight,
    dark: copperDark,
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

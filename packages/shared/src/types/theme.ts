import type { ThemeId } from './settings.js';

// Semantic color tokens for themes
export interface ThemeColors {
  // Backgrounds (avoid pure black #000 and pure white #fff)
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceHover: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Brand/accent colors
  accent: string;
  accentHover: string;
  accentMuted: string;

  // Interactive states
  interactive: string;
  interactiveHover: string;

  // Borders
  border: string;
  borderHover: string;
  borderFocus: string;

  // Semantic colors
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  error: string;
  errorMuted: string;
  info: string;
  infoMuted: string;

  // Overlay
  overlay: string;
}

// Complete theme definition with light and dark modes
export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  light: ThemeColors;
  dark: ThemeColors;
}

// Resolved theme (single mode after system preference is applied)
export interface ResolvedTheme {
  id: ThemeId;
  mode: 'light' | 'dark';
  colors: ThemeColors;
}

// Theme metadata for UI display
export interface ThemeMeta {
  id: ThemeId;
  name: string;
  description: string;
  previewLight: string; // Preview color for light mode
  previewDark: string; // Preview color for dark mode
}

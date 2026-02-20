/**
 * Color utilities for expressions
 * Supports RGB, HSL, HSV, and hex conversions
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

// Clamp value between 0 and 1
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Parse hex color to RGB
function parseHex(hex: string): RGB {
  hex = hex.replace(/^#/, '');

  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const num = parseInt(hex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

// Color creation
export function rgb(r: number, g: number, b: number): RGB {
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

export function rgba(r: number, g: number, b: number, a: number): RGBA {
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

export function rgb255(r: number, g: number, b: number): RGB {
  return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255) };
}

export function hex(color: string): RGB {
  return parseHex(color);
}

export function hsl(h: number, s: number, l: number): HSL {
  // Normalize hue to 0-360
  h = ((h % 360) + 360) % 360;
  return { h, s: clamp01(s), l: clamp01(l) };
}

export function hsv(h: number, s: number, v: number): HSV {
  h = ((h % 360) + 360) % 360;
  return { h, s: clamp01(s), v: clamp01(v) };
}

// Color conversions
export function hslToRgb(color: HSL): RGB {
  const { h, s, l } = color;
  const hNorm = h / 360;

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hue2rgb(p, q, hNorm + 1 / 3),
    g: hue2rgb(p, q, hNorm),
    b: hue2rgb(p, q, hNorm - 1 / 3),
  };
}

export function rgbToHsl(color: RGB): HSL {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s, l };
}

export function hsvToRgb(color: HSV): RGB {
  const { h, s, v } = color;
  const hNorm = h / 60;
  const i = Math.floor(hNorm);
  const f = hNorm - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  let r: number, g: number, b: number;

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }

  return { r, g, b };
}

export function rgbToHsv(color: RGB): HSV {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;

  if (max === min) {
    return { h: 0, s, v };
  }

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s, v };
}

export function rgbToHex(color: RGB): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

// Color operations
export function lerpColor(a: RGB | string, b: RGB | string, t: number): RGB {
  const colorA = typeof a === 'string' ? parseHex(a) : a;
  const colorB = typeof b === 'string' ? parseHex(b) : b;

  return {
    r: colorA.r + (colorB.r - colorA.r) * t,
    g: colorA.g + (colorB.g - colorA.g) * t,
    b: colorA.b + (colorB.b - colorA.b) * t,
  };
}

export function lerpColorHsl(a: RGB | HSL | string, b: RGB | HSL | string, t: number): RGB {
  let hslA: HSL;
  let hslB: HSL;

  if (typeof a === 'string') {
    hslA = rgbToHsl(parseHex(a));
  } else if ('r' in a) {
    hslA = rgbToHsl(a);
  } else {
    hslA = a;
  }

  if (typeof b === 'string') {
    hslB = rgbToHsl(parseHex(b));
  } else if ('r' in b) {
    hslB = rgbToHsl(b);
  } else {
    hslB = b;
  }

  // Handle hue interpolation (shortest path)
  let hDiff = hslB.h - hslA.h;
  if (Math.abs(hDiff) > 180) {
    if (hDiff > 0) {
      hDiff -= 360;
    } else {
      hDiff += 360;
    }
  }

  const h = ((hslA.h + hDiff * t) % 360 + 360) % 360;
  const s = hslA.s + (hslB.s - hslA.s) * t;
  const l = hslA.l + (hslB.l - hslA.l) * t;

  return hslToRgb({ h, s, l });
}

export function brighten(color: RGB | string, amount: number): RGB {
  const c = typeof color === 'string' ? parseHex(color) : color;
  const hsl = rgbToHsl(c);
  hsl.l = clamp01(hsl.l + amount);
  return hslToRgb(hsl);
}

export function darken(color: RGB | string, amount: number): RGB {
  return brighten(color, -amount);
}

export function saturate(color: RGB | string, amount: number): RGB {
  const c = typeof color === 'string' ? parseHex(color) : color;
  const hsl = rgbToHsl(c);
  hsl.s = clamp01(hsl.s + amount);
  return hslToRgb(hsl);
}

export function desaturate(color: RGB | string, amount: number): RGB {
  return saturate(color, -amount);
}

export function rotateHue(color: RGB | string, degrees: number): RGB {
  const c = typeof color === 'string' ? parseHex(color) : color;
  const hsl = rgbToHsl(c);
  hsl.h = ((hsl.h + degrees) % 360 + 360) % 360;
  return hslToRgb(hsl);
}

export function invert(color: RGB | string): RGB {
  const c = typeof color === 'string' ? parseHex(color) : color;
  return {
    r: 1 - c.r,
    g: 1 - c.g,
    b: 1 - c.b,
  };
}

export function grayscale(color: RGB | string): RGB {
  const c = typeof color === 'string' ? parseHex(color) : color;
  // Using luminosity method
  const gray = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return { r: gray, g: gray, b: gray };
}

export function complement(color: RGB | string): RGB {
  return rotateHue(color, 180);
}

export function mix(a: RGB | string, b: RGB | string, weight: number = 0.5): RGB {
  return lerpColor(a, b, weight);
}

export function tint(color: RGB | string, amount: number): RGB {
  return mix(color, { r: 1, g: 1, b: 1 }, amount);
}

export function shade(color: RGB | string, amount: number): RGB {
  return mix(color, { r: 0, g: 0, b: 0 }, amount);
}

export function luminance(color: RGB | string): number {
  const c = typeof color === 'string' ? parseHex(color) : color;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function contrast(a: RGB | string, b: RGB | string): number {
  const lumA = luminance(a);
  const lumB = luminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// Color blending modes
export function multiply(a: RGB | string, b: RGB | string): RGB {
  const colorA = typeof a === 'string' ? parseHex(a) : a;
  const colorB = typeof b === 'string' ? parseHex(b) : b;
  return {
    r: colorA.r * colorB.r,
    g: colorA.g * colorB.g,
    b: colorA.b * colorB.b,
  };
}

export function screen(a: RGB | string, b: RGB | string): RGB {
  const colorA = typeof a === 'string' ? parseHex(a) : a;
  const colorB = typeof b === 'string' ? parseHex(b) : b;
  return {
    r: 1 - (1 - colorA.r) * (1 - colorB.r),
    g: 1 - (1 - colorA.g) * (1 - colorB.g),
    b: 1 - (1 - colorA.b) * (1 - colorB.b),
  };
}

export function overlay(a: RGB | string, b: RGB | string): RGB {
  const colorA = typeof a === 'string' ? parseHex(a) : a;
  const colorB = typeof b === 'string' ? parseHex(b) : b;

  const overlayChannel = (base: number, blend: number): number => {
    return base < 0.5
      ? 2 * base * blend
      : 1 - 2 * (1 - base) * (1 - blend);
  };

  return {
    r: overlayChannel(colorA.r, colorB.r),
    g: overlayChannel(colorA.g, colorB.g),
    b: overlayChannel(colorA.b, colorB.b),
  };
}

export const colorFunctions = {
  // Creation
  rgb,
  rgba,
  rgb255,
  hex,
  hsl,
  hsv,
  // Conversions
  hslToRgb,
  rgbToHsl,
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  // Interpolation
  lerpColor,
  lerpColorHsl,
  // Adjustments
  brighten,
  darken,
  saturate,
  desaturate,
  rotateHue,
  invert,
  grayscale,
  complement,
  mix,
  tint,
  shade,
  // Analysis
  luminance,
  contrast,
  // Blending
  multiply,
  screen,
  overlay,
};

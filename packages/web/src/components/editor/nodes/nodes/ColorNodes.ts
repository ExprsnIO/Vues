/**
 * Color Nodes
 * Color manipulation and conversion for node graphs
 */

import type { NodeTypeDefinition } from '../engine/NodeTypes';

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };
type HSV = { h: number; s: number; v: number };

/**
 * RGB to HSL conversion
 */
function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * HSL to RGB conversion
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
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

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * RGB to HSV conversion
 */
function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, v: v * 100 };
}

/**
 * HSV to RGB conversion
 */
function hsvToRgb(h: number, s: number, v: number): RGB {
  h /= 360;
  s /= 100;
  v /= 100;

  let r = 0, g = 0, b = 0;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v; g = t; b = p;
      break;
    case 1:
      r = q; g = v; b = p;
      break;
    case 2:
      r = p; g = v; b = t;
      break;
    case 3:
      r = p; g = q; b = v;
      break;
    case 4:
      r = t; g = p; b = v;
      break;
    case 5:
      r = v; g = p; b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Color Constant Node
 */
export const ColorNode: NodeTypeDefinition = {
  type: 'color.color',
  name: 'Color',
  category: 'input',
  description: 'A constant color value',
  inputs: [],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
    { id: 'r', name: 'R', dataType: 'number', direction: 'output' },
    { id: 'g', name: 'G', dataType: 'number', direction: 'output' },
    { id: 'b', name: 'B', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    {
      id: 'color',
      name: 'Color',
      type: 'color',
      defaultValue: '#ffffff',
    },
  ],
  execute: (_, parameters) => {
    const hex = parameters.color as string;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return {
      color: { r, g, b },
      r: r / 255,
      g: g / 255,
      b: b / 255,
    };
  },
};

/**
 * RGB Combine Node
 */
export const RGBCombineNode: NodeTypeDefinition = {
  type: 'color.rgbCombine',
  name: 'RGB Combine',
  category: 'color',
  description: 'Creates a color from RGB components',
  inputs: [
    { id: 'r', name: 'R', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'g', name: 'G', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    color: {
      r: Math.round((inputs.r as number) * 255),
      g: Math.round((inputs.g as number) * 255),
      b: Math.round((inputs.b as number) * 255),
    },
  }),
};

/**
 * RGB Split Node
 */
export const RGBSplitNode: NodeTypeDefinition = {
  type: 'color.rgbSplit',
  name: 'RGB Split',
  category: 'color',
  description: 'Splits a color into RGB components',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 255, b: 255 } },
  ],
  outputs: [
    { id: 'r', name: 'R', dataType: 'number', direction: 'output' },
    { id: 'g', name: 'G', dataType: 'number', direction: 'output' },
    { id: 'b', name: 'B', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    return {
      r: color.r / 255,
      g: color.g / 255,
      b: color.b / 255,
    };
  },
};

/**
 * HSL Combine Node
 */
export const HSLCombineNode: NodeTypeDefinition = {
  type: 'color.hslCombine',
  name: 'HSL Combine',
  category: 'color',
  description: 'Creates a color from HSL components',
  inputs: [
    { id: 'h', name: 'H', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 's', name: 'S', dataType: 'number', direction: 'input', defaultValue: 100 },
    { id: 'l', name: 'L', dataType: 'number', direction: 'input', defaultValue: 50 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const h = inputs.h as number;
    const s = inputs.s as number;
    const l = inputs.l as number;
    return { color: hslToRgb(h, s, l) };
  },
};

/**
 * HSL Split Node
 */
export const HSLSplitNode: NodeTypeDefinition = {
  type: 'color.hslSplit',
  name: 'HSL Split',
  category: 'color',
  description: 'Splits a color into HSL components',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 255, b: 255 } },
  ],
  outputs: [
    { id: 'h', name: 'H', dataType: 'number', direction: 'output' },
    { id: 's', name: 'S', dataType: 'number', direction: 'output' },
    { id: 'l', name: 'L', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    const hsl = rgbToHsl(color.r, color.g, color.b);
    return { h: hsl.h, s: hsl.s, l: hsl.l };
  },
};

/**
 * HSV Combine Node
 */
export const HSVCombineNode: NodeTypeDefinition = {
  type: 'color.hsvCombine',
  name: 'HSV Combine',
  category: 'color',
  description: 'Creates a color from HSV components',
  inputs: [
    { id: 'h', name: 'H', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 's', name: 'S', dataType: 'number', direction: 'input', defaultValue: 100 },
    { id: 'v', name: 'V', dataType: 'number', direction: 'input', defaultValue: 100 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const h = inputs.h as number;
    const s = inputs.s as number;
    const v = inputs.v as number;
    return { color: hsvToRgb(h, s, v) };
  },
};

/**
 * HSV Split Node
 */
export const HSVSplitNode: NodeTypeDefinition = {
  type: 'color.hsvSplit',
  name: 'HSV Split',
  category: 'color',
  description: 'Splits a color into HSV components',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 255, b: 255 } },
  ],
  outputs: [
    { id: 'h', name: 'H', dataType: 'number', direction: 'output' },
    { id: 's', name: 'S', dataType: 'number', direction: 'output' },
    { id: 'v', name: 'V', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    const hsv = rgbToHsv(color.r, color.g, color.b);
    return { h: hsv.h, s: hsv.s, v: hsv.v };
  },
};

/**
 * Color Mix Node
 */
export const ColorMixNode: NodeTypeDefinition = {
  type: 'color.mix',
  name: 'Color Mix',
  category: 'color',
  description: 'Mixes two colors together',
  inputs: [
    { id: 'colorA', name: 'Color A', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 0, b: 0 } },
    { id: 'colorB', name: 'Color B', dataType: 'color', direction: 'input', defaultValue: { r: 0, g: 0, b: 255 } },
    { id: 'factor', name: 'Factor', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [
    {
      id: 'mode',
      name: 'Mode',
      type: 'select',
      defaultValue: 'rgb',
      options: [
        { label: 'RGB', value: 'rgb' },
        { label: 'HSL', value: 'hsl' },
        { label: 'HSV', value: 'hsv' },
      ],
    },
  ],
  execute: (inputs, parameters) => {
    const colorA = inputs.colorA as RGB;
    const colorB = inputs.colorB as RGB;
    const factor = Math.max(0, Math.min(1, inputs.factor as number));
    const mode = parameters.mode as string;

    if (mode === 'rgb') {
      return {
        color: {
          r: Math.round(colorA.r + (colorB.r - colorA.r) * factor),
          g: Math.round(colorA.g + (colorB.g - colorA.g) * factor),
          b: Math.round(colorA.b + (colorB.b - colorA.b) * factor),
        },
      };
    } else if (mode === 'hsl') {
      const hslA = rgbToHsl(colorA.r, colorA.g, colorA.b);
      const hslB = rgbToHsl(colorB.r, colorB.g, colorB.b);
      const h = hslA.h + (hslB.h - hslA.h) * factor;
      const s = hslA.s + (hslB.s - hslA.s) * factor;
      const l = hslA.l + (hslB.l - hslA.l) * factor;
      return { color: hslToRgb(h, s, l) };
    } else {
      const hsvA = rgbToHsv(colorA.r, colorA.g, colorA.b);
      const hsvB = rgbToHsv(colorB.r, colorB.g, colorB.b);
      const h = hsvA.h + (hsvB.h - hsvA.h) * factor;
      const s = hsvA.s + (hsvB.s - hsvA.s) * factor;
      const v = hsvA.v + (hsvB.v - hsvA.v) * factor;
      return { color: hsvToRgb(h, s, v) };
    }
  },
};

/**
 * Brightness/Contrast Node
 */
export const BrightnessContrastNode: NodeTypeDefinition = {
  type: 'color.brightnessContrast',
  name: 'Brightness/Contrast',
  category: 'color',
  description: 'Adjusts brightness and contrast',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 128, g: 128, b: 128 } },
    { id: 'brightness', name: 'Brightness', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'contrast', name: 'Contrast', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    const brightness = inputs.brightness as number;
    const contrast = inputs.contrast as number;

    const adjust = (c: number): number => {
      let v = c / 255;
      v = (v - 0.5) * contrast + 0.5 + brightness;
      return Math.round(Math.max(0, Math.min(1, v)) * 255);
    };

    return {
      color: {
        r: adjust(color.r),
        g: adjust(color.g),
        b: adjust(color.b),
      },
    };
  },
};

/**
 * Hue Shift Node
 */
export const HueShiftNode: NodeTypeDefinition = {
  type: 'color.hueShift',
  name: 'Hue Shift',
  category: 'color',
  description: 'Shifts the hue of a color',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 0, b: 0 } },
    { id: 'shift', name: 'Shift', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    const shift = inputs.shift as number;

    const hsl = rgbToHsl(color.r, color.g, color.b);
    hsl.h = ((hsl.h + shift) % 360 + 360) % 360;

    return { color: hslToRgb(hsl.h, hsl.s, hsl.l) };
  },
};

/**
 * Saturation Node
 */
export const SaturationNode: NodeTypeDefinition = {
  type: 'color.saturation',
  name: 'Saturation',
  category: 'color',
  description: 'Adjusts color saturation',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 128, b: 0 } },
    { id: 'saturation', name: 'Saturation', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    const saturation = inputs.saturation as number;

    const hsl = rgbToHsl(color.r, color.g, color.b);
    hsl.s = Math.max(0, Math.min(100, hsl.s * saturation));

    return { color: hslToRgb(hsl.h, hsl.s, hsl.l) };
  },
};

/**
 * Invert Node
 */
export const InvertNode: NodeTypeDefinition = {
  type: 'color.invert',
  name: 'Invert',
  category: 'color',
  description: 'Inverts a color',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 0, g: 0, b: 0 } },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const color = inputs.color as RGB;
    return {
      color: {
        r: 255 - color.r,
        g: 255 - color.g,
        b: 255 - color.b,
      },
    };
  },
};

/**
 * Grayscale Node
 */
export const GrayscaleNode: NodeTypeDefinition = {
  type: 'color.grayscale',
  name: 'Grayscale',
  category: 'color',
  description: 'Converts to grayscale',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 128, b: 0 } },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
    { id: 'luminance', name: 'Luminance', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    {
      id: 'method',
      name: 'Method',
      type: 'select',
      defaultValue: 'luminosity',
      options: [
        { label: 'Luminosity', value: 'luminosity' },
        { label: 'Average', value: 'average' },
        { label: 'Lightness', value: 'lightness' },
      ],
    },
  ],
  execute: (inputs, parameters) => {
    const color = inputs.color as RGB;
    const method = parameters.method as string;

    let gray: number;
    if (method === 'luminosity') {
      gray = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    } else if (method === 'average') {
      gray = (color.r + color.g + color.b) / 3;
    } else {
      gray = (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 2;
    }

    gray = Math.round(gray);

    return {
      color: { r: gray, g: gray, b: gray },
      luminance: gray / 255,
    };
  },
};

/**
 * Gradient Node
 */
export const GradientNode: NodeTypeDefinition = {
  type: 'color.gradient',
  name: 'Gradient',
  category: 'color',
  description: 'Samples a gradient at a position',
  inputs: [
    { id: 'position', name: 'Position', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'colorA', name: 'Color A', dataType: 'color', direction: 'input', defaultValue: { r: 0, g: 0, b: 0 } },
    { id: 'colorB', name: 'Color B', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 255, b: 255 } },
  ],
  outputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const position = Math.max(0, Math.min(1, inputs.position as number));
    const colorA = inputs.colorA as RGB;
    const colorB = inputs.colorB as RGB;

    return {
      color: {
        r: Math.round(colorA.r + (colorB.r - colorA.r) * position),
        g: Math.round(colorA.g + (colorB.g - colorA.g) * position),
        b: Math.round(colorA.b + (colorB.b - colorA.b) * position),
      },
    };
  },
};

/**
 * All color nodes
 */
export const colorNodes: NodeTypeDefinition[] = [
  ColorNode,
  RGBCombineNode,
  RGBSplitNode,
  HSLCombineNode,
  HSLSplitNode,
  HSVCombineNode,
  HSVSplitNode,
  ColorMixNode,
  BrightnessContrastNode,
  HueShiftNode,
  SaturationNode,
  InvertNode,
  GrayscaleNode,
  GradientNode,
];

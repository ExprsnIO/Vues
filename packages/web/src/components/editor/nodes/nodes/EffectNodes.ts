/**
 * Effect Nodes
 * Visual effects and image processing nodes
 */

import type { NodeTypeDefinition } from '../engine/NodeTypes';

type RGB = { r: number; g: number; b: number };

/**
 * Output Node - Final output of the graph
 */
export const OutputNode: NodeTypeDefinition = {
  type: 'effect.output',
  name: 'Output',
  category: 'output',
  description: 'Final output of the effect graph',
  inputs: [
    { id: 'color', name: 'Color', dataType: 'color', direction: 'input', defaultValue: { r: 0, g: 0, b: 0 } },
    { id: 'opacity', name: 'Opacity', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: {
      color: inputs.color,
      opacity: Math.max(0, Math.min(1, inputs.opacity as number)),
    },
  }),
};

/**
 * Blend Node
 */
export const BlendNode: NodeTypeDefinition = {
  type: 'effect.blend',
  name: 'Blend',
  category: 'effect',
  description: 'Blends two colors using various blend modes',
  inputs: [
    { id: 'base', name: 'Base', dataType: 'color', direction: 'input', defaultValue: { r: 0, g: 0, b: 0 } },
    { id: 'blend', name: 'Blend', dataType: 'color', direction: 'input', defaultValue: { r: 255, g: 255, b: 255 } },
    { id: 'opacity', name: 'Opacity', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'color', direction: 'output' },
  ],
  parameters: [
    {
      id: 'mode',
      name: 'Mode',
      type: 'select',
      defaultValue: 'normal',
      options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Multiply', value: 'multiply' },
        { label: 'Screen', value: 'screen' },
        { label: 'Overlay', value: 'overlay' },
        { label: 'Darken', value: 'darken' },
        { label: 'Lighten', value: 'lighten' },
        { label: 'Color Dodge', value: 'colorDodge' },
        { label: 'Color Burn', value: 'colorBurn' },
        { label: 'Hard Light', value: 'hardLight' },
        { label: 'Soft Light', value: 'softLight' },
        { label: 'Difference', value: 'difference' },
        { label: 'Exclusion', value: 'exclusion' },
      ],
    },
  ],
  execute: (inputs, parameters) => {
    const base = inputs.base as RGB;
    const blend = inputs.blend as RGB;
    const opacity = Math.max(0, Math.min(1, inputs.opacity as number));
    const mode = parameters.mode as string;

    const blendChannel = (b: number, l: number): number => {
      b /= 255;
      l /= 255;

      let result: number;
      switch (mode) {
        case 'multiply':
          result = b * l;
          break;
        case 'screen':
          result = 1 - (1 - b) * (1 - l);
          break;
        case 'overlay':
          result = b < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l);
          break;
        case 'darken':
          result = Math.min(b, l);
          break;
        case 'lighten':
          result = Math.max(b, l);
          break;
        case 'colorDodge':
          result = l === 1 ? 1 : Math.min(1, b / (1 - l));
          break;
        case 'colorBurn':
          result = l === 0 ? 0 : Math.max(0, 1 - (1 - b) / l);
          break;
        case 'hardLight':
          result = l < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l);
          break;
        case 'softLight':
          result = l < 0.5
            ? b - (1 - 2 * l) * b * (1 - b)
            : b + (2 * l - 1) * (b < 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b) - b);
          break;
        case 'difference':
          result = Math.abs(b - l);
          break;
        case 'exclusion':
          result = b + l - 2 * b * l;
          break;
        default: // normal
          result = l;
      }

      // Apply opacity
      result = b * (1 - opacity) + result * opacity;
      return Math.round(result * 255);
    };

    return {
      result: {
        r: blendChannel(base.r, blend.r),
        g: blendChannel(base.g, blend.g),
        b: blendChannel(base.b, blend.b),
      },
    };
  },
};

/**
 * Glitch Effect Node
 */
export const GlitchEffectNode: NodeTypeDefinition = {
  type: 'effect.glitch',
  name: 'Glitch',
  category: 'effect',
  description: 'Glitch effect parameters',
  inputs: [
    { id: 'intensity', name: 'Intensity', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'rgbShift', name: 'RGB Shift', dataType: 'number', direction: 'input', defaultValue: 0.02 },
    { id: 'scanlines', name: 'Scanlines', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [
    {
      id: 'animated',
      name: 'Animated',
      type: 'boolean',
      defaultValue: true,
    },
  ],
  execute: (inputs, parameters, context) => {
    const intensity = inputs.intensity as number;
    const rgbShift = inputs.rgbShift as number;
    const scanlines = inputs.scanlines as number;
    const animated = parameters.animated as boolean;

    return {
      effect: {
        type: 'glitch',
        uniforms: {
          intensity,
          rgbShift,
          scanlines,
          time: animated ? context.time : 0,
        },
      },
    };
  },
};

/**
 * VHS Effect Node
 */
export const VHSEffectNode: NodeTypeDefinition = {
  type: 'effect.vhs',
  name: 'VHS',
  category: 'effect',
  description: 'VHS tape effect parameters',
  inputs: [
    { id: 'trackingError', name: 'Tracking', dataType: 'number', direction: 'input', defaultValue: 0.3 },
    { id: 'colorBleed', name: 'Color Bleed', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'noise', name: 'Noise', dataType: 'number', direction: 'input', defaultValue: 0.2 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs, _, context) => ({
    effect: {
      type: 'vhs',
      uniforms: {
        trackingError: inputs.trackingError,
        colorBleed: inputs.colorBleed,
        noise: inputs.noise,
        time: context.time,
      },
    },
  }),
};

/**
 * Film Grain Node
 */
export const FilmGrainNode: NodeTypeDefinition = {
  type: 'effect.filmGrain',
  name: 'Film Grain',
  category: 'effect',
  description: 'Film grain effect parameters',
  inputs: [
    { id: 'intensity', name: 'Intensity', dataType: 'number', direction: 'input', defaultValue: 0.3 },
    { id: 'size', name: 'Size', dataType: 'number', direction: 'input', defaultValue: 1.5 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [
    {
      id: 'colored',
      name: 'Colored',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  execute: (inputs, parameters, context) => ({
    effect: {
      type: 'filmGrain',
      uniforms: {
        intensity: inputs.intensity,
        size: inputs.size,
        colored: parameters.colored,
        time: context.time,
      },
    },
  }),
};

/**
 * Chromatic Aberration Node
 */
export const ChromaticAberrationNode: NodeTypeDefinition = {
  type: 'effect.chromaticAberration',
  name: 'Chromatic Aberration',
  category: 'effect',
  description: 'Lens chromatic aberration effect',
  inputs: [
    { id: 'amount', name: 'Amount', dataType: 'number', direction: 'input', defaultValue: 0.01 },
    { id: 'angle', name: 'Angle', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [
    {
      id: 'radial',
      name: 'Radial',
      type: 'boolean',
      defaultValue: true,
    },
  ],
  execute: (inputs, parameters) => ({
    effect: {
      type: 'chromaticAberration',
      uniforms: {
        amount: inputs.amount,
        angle: inputs.angle,
        radial: parameters.radial,
      },
    },
  }),
};

/**
 * Bloom Node
 */
export const BloomNode: NodeTypeDefinition = {
  type: 'effect.bloom',
  name: 'Bloom',
  category: 'effect',
  description: 'Bloom/glow effect',
  inputs: [
    { id: 'threshold', name: 'Threshold', dataType: 'number', direction: 'input', defaultValue: 0.8 },
    { id: 'intensity', name: 'Intensity', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'radius', name: 'Radius', dataType: 'number', direction: 'input', defaultValue: 5 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    effect: {
      type: 'bloom',
      uniforms: {
        threshold: inputs.threshold,
        intensity: inputs.intensity,
        radius: inputs.radius,
      },
    },
  }),
};

/**
 * CRT Effect Node
 */
export const CRTEffectNode: NodeTypeDefinition = {
  type: 'effect.crt',
  name: 'CRT',
  category: 'effect',
  description: 'CRT monitor effect',
  inputs: [
    { id: 'curvature', name: 'Curvature', dataType: 'number', direction: 'input', defaultValue: 0.1 },
    { id: 'scanlineIntensity', name: 'Scanlines', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'vignette', name: 'Vignette', dataType: 'number', direction: 'input', defaultValue: 0.3 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    effect: {
      type: 'crt',
      uniforms: {
        curvature: inputs.curvature,
        scanlineIntensity: inputs.scanlineIntensity,
        vignette: inputs.vignette,
      },
    },
  }),
};

/**
 * Blur Node
 */
export const BlurNode: NodeTypeDefinition = {
  type: 'effect.blur',
  name: 'Blur',
  category: 'effect',
  description: 'Blur effect',
  inputs: [
    { id: 'radius', name: 'Radius', dataType: 'number', direction: 'input', defaultValue: 5 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      defaultValue: 'gaussian',
      options: [
        { label: 'Gaussian', value: 'gaussian' },
        { label: 'Box', value: 'box' },
        { label: 'Radial', value: 'radial' },
        { label: 'Motion', value: 'motion' },
      ],
    },
    {
      id: 'angle',
      name: 'Angle',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: 360,
    },
  ],
  execute: (inputs, parameters) => ({
    effect: {
      type: 'blur',
      uniforms: {
        radius: inputs.radius,
        blurType: parameters.type,
        angle: parameters.angle,
      },
    },
  }),
};

/**
 * Sharpen Node
 */
export const SharpenNode: NodeTypeDefinition = {
  type: 'effect.sharpen',
  name: 'Sharpen',
  category: 'effect',
  description: 'Sharpening effect',
  inputs: [
    { id: 'amount', name: 'Amount', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    effect: {
      type: 'sharpen',
      uniforms: {
        amount: inputs.amount,
      },
    },
  }),
};

/**
 * Vignette Node
 */
export const VignetteNode: NodeTypeDefinition = {
  type: 'effect.vignette',
  name: 'Vignette',
  category: 'effect',
  description: 'Vignette effect',
  inputs: [
    { id: 'intensity', name: 'Intensity', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'radius', name: 'Radius', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'softness', name: 'Softness', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    effect: {
      type: 'vignette',
      uniforms: {
        intensity: inputs.intensity,
        radius: inputs.radius,
        softness: inputs.softness,
      },
    },
  }),
};

/**
 * Pixelate Node
 */
export const PixelateNode: NodeTypeDefinition = {
  type: 'effect.pixelate',
  name: 'Pixelate',
  category: 'effect',
  description: 'Pixelation effect',
  inputs: [
    { id: 'size', name: 'Size', dataType: 'number', direction: 'input', defaultValue: 8 },
  ],
  outputs: [
    { id: 'effect', name: 'Effect', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    effect: {
      type: 'pixelate',
      uniforms: {
        pixelSize: inputs.size,
      },
    },
  }),
};

/**
 * Noise Node
 */
export const NoiseNode: NodeTypeDefinition = {
  type: 'effect.noise',
  name: 'Noise',
  category: 'effect',
  description: 'Generates noise pattern',
  inputs: [
    { id: 'scale', name: 'Scale', dataType: 'number', direction: 'input', defaultValue: 10 },
    { id: 'octaves', name: 'Octaves', dataType: 'number', direction: 'input', defaultValue: 4 },
    { id: 'persistence', name: 'Persistence', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'output' },
    { id: 'color', name: 'Color', dataType: 'color', direction: 'output' },
  ],
  parameters: [
    {
      id: 'type',
      name: 'Type',
      type: 'select',
      defaultValue: 'perlin',
      options: [
        { label: 'Perlin', value: 'perlin' },
        { label: 'Simplex', value: 'simplex' },
        { label: 'Worley', value: 'worley' },
        { label: 'Value', value: 'value' },
      ],
    },
    {
      id: 'animated',
      name: 'Animated',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  execute: (inputs, parameters, context) => {
    const scale = inputs.scale as number;
    const time = (parameters.animated as boolean) ? context.time : 0;

    // Simple noise approximation for preview
    const noise = Math.sin(scale * 12.9898 + time) * 43758.5453;
    const value = (noise - Math.floor(noise));
    const gray = Math.round(value * 255);

    return {
      value,
      color: { r: gray, g: gray, b: gray },
    };
  },
};

/**
 * Effect Chain Node
 */
export const EffectChainNode: NodeTypeDefinition = {
  type: 'effect.chain',
  name: 'Effect Chain',
  category: 'effect',
  description: 'Chains multiple effects together',
  inputs: [
    { id: 'effect1', name: 'Effect 1', dataType: 'any', direction: 'input' },
    { id: 'effect2', name: 'Effect 2', dataType: 'any', direction: 'input' },
    { id: 'effect3', name: 'Effect 3', dataType: 'any', direction: 'input' },
    { id: 'effect4', name: 'Effect 4', dataType: 'any', direction: 'input' },
  ],
  outputs: [
    { id: 'chain', name: 'Chain', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const effects = [
      inputs.effect1,
      inputs.effect2,
      inputs.effect3,
      inputs.effect4,
    ].filter(Boolean);

    return {
      chain: {
        type: 'effectChain',
        effects,
      },
    };
  },
};

/**
 * All effect nodes
 */
export const effectNodes: NodeTypeDefinition[] = [
  OutputNode,
  BlendNode,
  GlitchEffectNode,
  VHSEffectNode,
  FilmGrainNode,
  ChromaticAberrationNode,
  BloomNode,
  CRTEffectNode,
  BlurNode,
  SharpenNode,
  VignetteNode,
  PixelateNode,
  NoiseNode,
  EffectChainNode,
];

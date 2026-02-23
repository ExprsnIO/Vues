/**
 * Effects Service
 * Video effects, filters, and color grading definitions
 * Generates FFmpeg filter strings for rendering
 */

// =============================================================================
// Effect Types
// =============================================================================

export interface EffectDefinition {
  type: string;
  name: string;
  category: EffectCategory;
  description: string;
  params: EffectParam[];
  ffmpegFilter: (params: Record<string, number | string | boolean>) => string;
}

export interface EffectParam {
  name: string;
  label: string;
  type: 'number' | 'color' | 'select' | 'boolean' | 'range';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
}

export type EffectCategory =
  | 'color'
  | 'blur'
  | 'stylize'
  | 'distort'
  | 'keying'
  | 'transform'
  | 'time'
  | 'generate';

// =============================================================================
// Effect Definitions
// =============================================================================

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  // =========================================================================
  // COLOR EFFECTS
  // =========================================================================
  {
    type: 'brightness',
    name: 'Brightness',
    category: 'color',
    description: 'Adjust overall brightness',
    params: [
      { name: 'value', label: 'Brightness', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `eq=brightness=${p.value}`,
  },
  {
    type: 'contrast',
    name: 'Contrast',
    category: 'color',
    description: 'Adjust contrast level',
    params: [
      { name: 'value', label: 'Contrast', type: 'range', default: 1, min: 0, max: 3, step: 0.01 },
    ],
    ffmpegFilter: (p) => `eq=contrast=${p.value}`,
  },
  {
    type: 'saturation',
    name: 'Saturation',
    category: 'color',
    description: 'Adjust color saturation',
    params: [
      { name: 'value', label: 'Saturation', type: 'range', default: 1, min: 0, max: 3, step: 0.01 },
    ],
    ffmpegFilter: (p) => `eq=saturation=${p.value}`,
  },
  {
    type: 'hue',
    name: 'Hue Shift',
    category: 'color',
    description: 'Rotate hue values',
    params: [
      { name: 'value', label: 'Hue', type: 'range', default: 0, min: -180, max: 180, step: 1 },
    ],
    ffmpegFilter: (p) => `hue=h=${p.value}`,
  },
  {
    type: 'exposure',
    name: 'Exposure',
    category: 'color',
    description: 'Adjust exposure (stops)',
    params: [
      { name: 'value', label: 'Exposure', type: 'range', default: 0, min: -3, max: 3, step: 0.1 },
    ],
    ffmpegFilter: (p) => {
      const multiplier = Math.pow(2, Number(p.value));
      return `colorlevels=rimin=0:rimax=${1/multiplier}:gimin=0:gimax=${1/multiplier}:bimin=0:bimax=${1/multiplier}`;
    },
  },
  {
    type: 'gamma',
    name: 'Gamma',
    category: 'color',
    description: 'Adjust gamma for RGB channels',
    params: [
      { name: 'red', label: 'Red', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01 },
      { name: 'green', label: 'Green', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01 },
      { name: 'blue', label: 'Blue', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01 },
    ],
    ffmpegFilter: (p) => `eq=gamma_r=${p.red}:gamma_g=${p.green}:gamma_b=${p.blue}`,
  },
  {
    type: 'vibrance',
    name: 'Vibrance',
    category: 'color',
    description: 'Boost saturation of less saturated colors',
    params: [
      { name: 'value', label: 'Vibrance', type: 'range', default: 0, min: -2, max: 2, step: 0.1 },
    ],
    ffmpegFilter: (p) => `vibrance=intensity=${p.value}`,
  },
  {
    type: 'temperature',
    name: 'Color Temperature',
    category: 'color',
    description: 'Adjust warm/cool color balance',
    params: [
      { name: 'value', label: 'Temperature', type: 'range', default: 6500, min: 2000, max: 12000, step: 100 },
    ],
    ffmpegFilter: (p) => {
      // Approximate temperature adjustment
      const temp = Number(p.value);
      const warmth = (temp - 6500) / 5500; // -1 to 1
      const r = warmth > 0 ? 1 + warmth * 0.3 : 1;
      const b = warmth < 0 ? 1 + Math.abs(warmth) * 0.3 : 1;
      return `colorbalance=rs=${(r-1)*0.5}:gs=0:bs=${(b-1)*0.5}`;
    },
  },
  {
    type: 'colorBalance',
    name: 'Color Balance',
    category: 'color',
    description: 'Adjust color balance for shadows, midtones, highlights',
    params: [
      { name: 'shadowsRed', label: 'Shadows Red', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'shadowsGreen', label: 'Shadows Green', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'shadowsBlue', label: 'Shadows Blue', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'midtonesRed', label: 'Midtones Red', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'midtonesGreen', label: 'Midtones Green', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'midtonesBlue', label: 'Midtones Blue', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'highlightsRed', label: 'Highlights Red', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'highlightsGreen', label: 'Highlights Green', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
      { name: 'highlightsBlue', label: 'Highlights Blue', type: 'range', default: 0, min: -1, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) =>
      `colorbalance=rs=${p.shadowsRed}:gs=${p.shadowsGreen}:bs=${p.shadowsBlue}:` +
      `rm=${p.midtonesRed}:gm=${p.midtonesGreen}:bm=${p.midtonesBlue}:` +
      `rh=${p.highlightsRed}:gh=${p.highlightsGreen}:bh=${p.highlightsBlue}`,
  },
  {
    type: 'levels',
    name: 'Levels',
    category: 'color',
    description: 'Adjust input/output levels',
    params: [
      { name: 'inputBlack', label: 'Input Black', type: 'range', default: 0, min: 0, max: 1, step: 0.01 },
      { name: 'inputWhite', label: 'Input White', type: 'range', default: 1, min: 0, max: 1, step: 0.01 },
      { name: 'outputBlack', label: 'Output Black', type: 'range', default: 0, min: 0, max: 1, step: 0.01 },
      { name: 'outputWhite', label: 'Output White', type: 'range', default: 1, min: 0, max: 1, step: 0.01 },
      { name: 'gamma', label: 'Gamma', type: 'range', default: 1, min: 0.1, max: 3, step: 0.01 },
    ],
    ffmpegFilter: (p) =>
      `colorlevels=rimin=${p.inputBlack}:rimax=${p.inputWhite}:romin=${p.outputBlack}:romax=${p.outputWhite}:` +
      `gimin=${p.inputBlack}:gimax=${p.inputWhite}:gomin=${p.outputBlack}:gomax=${p.outputWhite}:` +
      `bimin=${p.inputBlack}:bimax=${p.inputWhite}:bomin=${p.outputBlack}:bomax=${p.outputWhite}`,
  },
  {
    type: 'curves',
    name: 'Curves',
    category: 'color',
    description: 'Apply preset curve adjustments',
    params: [
      {
        name: 'preset',
        label: 'Preset',
        type: 'select',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'color_negative', label: 'Color Negative' },
          { value: 'cross_process', label: 'Cross Process' },
          { value: 'darker', label: 'Darker' },
          { value: 'lighter', label: 'Lighter' },
          { value: 'increase_contrast', label: 'Increase Contrast' },
          { value: 'linear_contrast', label: 'Linear Contrast' },
          { value: 'medium_contrast', label: 'Medium Contrast' },
          { value: 'strong_contrast', label: 'Strong Contrast' },
          { value: 'negative', label: 'Negative' },
          { value: 'vintage', label: 'Vintage' },
        ],
      },
    ],
    ffmpegFilter: (p) => (p.preset === 'none' ? 'null' : `curves=preset=${p.preset}`),
  },
  {
    type: 'colorGrade',
    name: 'Color Grade (LUT)',
    category: 'color',
    description: 'Apply 3D LUT color grading',
    params: [
      {
        name: 'lut',
        label: 'LUT',
        type: 'select',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'cinematic', label: 'Cinematic' },
          { value: 'vintage', label: 'Vintage' },
          { value: 'teal_orange', label: 'Teal & Orange' },
          { value: 'noir', label: 'Film Noir' },
          { value: 'golden_hour', label: 'Golden Hour' },
        ],
      },
    ],
    ffmpegFilter: (p) => {
      // In production, would reference actual LUT files
      // For now, simulate with color adjustments
      const luts: Record<string, string> = {
        none: 'null',
        cinematic: 'colorbalance=rs=0.1:bs=-0.1:rm=0.05:bm=-0.05,eq=contrast=1.1:saturation=0.9',
        vintage: 'colorbalance=rs=0.2:gs=0.1:rm=0.1:gm=0.05,eq=contrast=0.9:saturation=0.7',
        teal_orange: 'colorbalance=rs=0.3:bm=-0.2:bs=-0.3:rh=0.2,eq=contrast=1.1',
        noir: 'eq=saturation=0:contrast=1.3:gamma=0.9',
        golden_hour: 'colorbalance=rs=0.3:gs=0.15:rh=0.2:gh=0.1,eq=brightness=0.05:saturation=1.1',
      };
      return luts[p.lut as string] || 'null';
    },
  },

  // =========================================================================
  // BLUR EFFECTS
  // =========================================================================
  {
    type: 'blur',
    name: 'Gaussian Blur',
    category: 'blur',
    description: 'Apply gaussian blur',
    params: [
      { name: 'radius', label: 'Radius', type: 'range', default: 10, min: 0, max: 100, step: 1 },
    ],
    ffmpegFilter: (p) => `boxblur=${p.radius}:${p.radius}`,
  },
  {
    type: 'motionBlur',
    name: 'Motion Blur',
    category: 'blur',
    description: 'Apply directional motion blur',
    params: [
      { name: 'angle', label: 'Angle', type: 'range', default: 0, min: 0, max: 360, step: 1 },
      { name: 'distance', label: 'Distance', type: 'range', default: 10, min: 0, max: 100, step: 1 },
    ],
    ffmpegFilter: (p) => {
      // FFmpeg doesn't have native motion blur, simulate with multiple blended frames
      // In practice, would use minterpolate or tblend
      return `tblend=all_mode=average`;
    },
  },
  {
    type: 'radialBlur',
    name: 'Radial Blur',
    category: 'blur',
    description: 'Apply circular blur from center point',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 10, min: 0, max: 100, step: 1 },
      { name: 'centerX', label: 'Center X', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'centerY', label: 'Center Y', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `boxblur=${Number(p.amount) / 10}:${Number(p.amount) / 10}`,
  },
  {
    type: 'defocus',
    name: 'Defocus / Bokeh',
    category: 'blur',
    description: 'Simulate camera defocus',
    params: [
      { name: 'radius', label: 'Radius', type: 'range', default: 10, min: 0, max: 50, step: 1 },
      { name: 'angle', label: 'Angle', type: 'range', default: 0, min: 0, max: 360, step: 1 },
    ],
    ffmpegFilter: (p) => `gblur=sigma=${p.radius}`,
  },

  // =========================================================================
  // STYLIZE EFFECTS
  // =========================================================================
  {
    type: 'sharpen',
    name: 'Sharpen',
    category: 'stylize',
    description: 'Sharpen image details',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 1, min: 0, max: 5, step: 0.1 },
    ],
    ffmpegFilter: (p) => `unsharp=5:5:${p.amount}:5:5:0`,
  },
  {
    type: 'vignette',
    name: 'Vignette',
    category: 'stylize',
    description: 'Add vignette darkening at edges',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'softness', label: 'Softness', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `vignette=angle=PI/${2 + Number(p.softness) * 3}:x0=0.5:y0=0.5`,
  },
  {
    type: 'grain',
    name: 'Film Grain',
    category: 'stylize',
    description: 'Add film grain noise',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 25, min: 0, max: 100, step: 1 },
      { name: 'size', label: 'Size', type: 'range', default: 1, min: 0.5, max: 3, step: 0.1 },
    ],
    ffmpegFilter: (p) => `noise=alls=${p.amount}:allf=t`,
  },
  {
    type: 'chromaAberration',
    name: 'Chromatic Aberration',
    category: 'stylize',
    description: 'Add RGB color fringing',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 5, min: 0, max: 50, step: 1 },
    ],
    ffmpegFilter: (p) => {
      const px = Number(p.amount);
      return `split=3[r][g][b];` +
        `[r]lutrgb=g=0:b=0,scroll=horizontal=${px}/W[r1];` +
        `[g]lutrgb=r=0:b=0[g1];` +
        `[b]lutrgb=r=0:g=0,scroll=horizontal=-${px}/W[b1];` +
        `[r1][g1]blend=all_mode=addition[rg];` +
        `[rg][b1]blend=all_mode=addition`;
    },
  },
  {
    type: 'glitch',
    name: 'Glitch',
    category: 'stylize',
    description: 'Digital glitch effect',
    params: [
      { name: 'intensity', label: 'Intensity', type: 'range', default: 50, min: 0, max: 100, step: 1 },
      { name: 'frequency', label: 'Frequency', type: 'range', default: 50, min: 0, max: 100, step: 1 },
    ],
    ffmpegFilter: (p) => {
      const intensity = Number(p.intensity) / 100;
      return `noise=alls=${intensity * 30}:allf=t,` +
        `rgbashift=rh=${Math.round(intensity * 10)}:gh=-${Math.round(intensity * 5)}`;
    },
  },
  {
    type: 'pixelate',
    name: 'Pixelate',
    category: 'stylize',
    description: 'Pixelate/mosaic effect',
    params: [
      { name: 'size', label: 'Pixel Size', type: 'range', default: 10, min: 2, max: 100, step: 1 },
    ],
    ffmpegFilter: (p) => {
      const size = Number(p.size);
      return `scale=iw/${size}:ih/${size},scale=iw*${size}:ih*${size}:flags=neighbor`;
    },
  },
  {
    type: 'posterize',
    name: 'Posterize',
    category: 'stylize',
    description: 'Reduce color levels',
    params: [
      { name: 'levels', label: 'Levels', type: 'range', default: 4, min: 2, max: 32, step: 1 },
    ],
    ffmpegFilter: (p) => `format=rgb24,split[a][b];[a]palettegen=max_colors=${Math.pow(Number(p.levels), 3)}[p];[b][p]paletteuse`,
  },
  {
    type: 'emboss',
    name: 'Emboss',
    category: 'stylize',
    description: 'Emboss/relief effect',
    params: [
      { name: 'strength', label: 'Strength', type: 'range', default: 1, min: 0, max: 3, step: 0.1 },
    ],
    ffmpegFilter: (p) => `convolution="-2 -1 0 -1 1 1 0 1 2:1 1 1 1 1 1 1 1 1:1 1 1 1 1 1 1 1 1:1 1 1 1 1 1 1 1 1"`,
  },
  {
    type: 'edgeDetect',
    name: 'Edge Detection',
    category: 'stylize',
    description: 'Highlight edges',
    params: [
      { name: 'mode', label: 'Mode', type: 'select', default: 'wires', options: [
        { value: 'wires', label: 'Wires' },
        { value: 'colormix', label: 'Color Mix' },
        { value: 'canny', label: 'Canny' },
      ]},
    ],
    ffmpegFilter: (p) => `edgedetect=mode=${p.mode}`,
  },

  // =========================================================================
  // DISTORT EFFECTS
  // =========================================================================
  {
    type: 'wave',
    name: 'Wave Distortion',
    category: 'distort',
    description: 'Apply wave distortion',
    params: [
      { name: 'amplitude', label: 'Amplitude', type: 'range', default: 10, min: 0, max: 100, step: 1 },
      { name: 'frequency', label: 'Frequency', type: 'range', default: 5, min: 1, max: 50, step: 1 },
      { name: 'speed', label: 'Speed', type: 'range', default: 1, min: 0, max: 10, step: 0.1 },
    ],
    ffmpegFilter: (p) =>
      `geq=lum='p(X+${p.amplitude}*sin(2*PI*Y/${Number(p.frequency) * 10}+T*${p.speed}),Y)'`,
  },
  {
    type: 'bulge',
    name: 'Bulge',
    category: 'distort',
    description: 'Bulge/pinch distortion',
    params: [
      { name: 'amount', label: 'Amount', type: 'range', default: 0.5, min: -1, max: 1, step: 0.01 },
      { name: 'centerX', label: 'Center X', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'centerY', label: 'Center Y', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'radius', label: 'Radius', type: 'range', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `lenscorrection=cx=${p.centerX}:cy=${p.centerY}:k1=${Number(p.amount) * 0.5}:k2=${Number(p.amount) * 0.2}`,
  },
  {
    type: 'mirror',
    name: 'Mirror',
    category: 'distort',
    description: 'Mirror/flip sections',
    params: [
      { name: 'direction', label: 'Direction', type: 'select', default: 'horizontal', options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
        { value: 'both', label: 'Both' },
      ]},
    ],
    ffmpegFilter: (p) => {
      switch (p.direction) {
        case 'horizontal': return 'hflip';
        case 'vertical': return 'vflip';
        case 'both': return 'hflip,vflip';
        default: return 'null';
      }
    },
  },
  {
    type: 'rotate',
    name: 'Rotate',
    category: 'distort',
    description: 'Rotate video',
    params: [
      { name: 'angle', label: 'Angle', type: 'range', default: 0, min: -180, max: 180, step: 1 },
      { name: 'fillColor', label: 'Fill Color', type: 'color', default: '#000000' },
    ],
    ffmpegFilter: (p) => `rotate=${Number(p.angle) * Math.PI / 180}:c=${p.fillColor}:ow=rotw(${Number(p.angle) * Math.PI / 180}):oh=roth(${Number(p.angle) * Math.PI / 180})`,
  },

  // =========================================================================
  // KEYING EFFECTS
  // =========================================================================
  {
    type: 'chromaKey',
    name: 'Chroma Key (Green Screen)',
    category: 'keying',
    description: 'Remove green/blue screen background',
    params: [
      { name: 'color', label: 'Key Color', type: 'color', default: '#00ff00' },
      { name: 'similarity', label: 'Similarity', type: 'range', default: 0.3, min: 0, max: 1, step: 0.01 },
      { name: 'blend', label: 'Blend', type: 'range', default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `chromakey=${p.color}:${p.similarity}:${p.blend}`,
  },
  {
    type: 'lumaKey',
    name: 'Luma Key',
    category: 'keying',
    description: 'Key based on luminance',
    params: [
      { name: 'threshold', label: 'Threshold', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
      { name: 'tolerance', label: 'Tolerance', type: 'range', default: 0.1, min: 0, max: 0.5, step: 0.01 },
      { name: 'invert', label: 'Invert', type: 'boolean', default: false },
    ],
    ffmpegFilter: (p) => {
      const thresh = Number(p.threshold) * 255;
      const tol = Number(p.tolerance) * 255;
      const expr = p.invert
        ? `if(lt(lum(X\\,Y),${thresh - tol}),255,if(gt(lum(X\\,Y),${thresh + tol}),0,255*(${thresh + tol}-lum(X\\,Y))/${tol * 2}))`
        : `if(gt(lum(X\\,Y),${thresh + tol}),255,if(lt(lum(X\\,Y),${thresh - tol}),0,255*(lum(X\\,Y)-${thresh - tol})/${tol * 2}))`;
      return `geq=a='${expr}'`;
    },
  },
  {
    type: 'colorKey',
    name: 'Color Key',
    category: 'keying',
    description: 'Key out a specific color',
    params: [
      { name: 'color', label: 'Key Color', type: 'color', default: '#ffffff' },
      { name: 'similarity', label: 'Similarity', type: 'range', default: 0.1, min: 0, max: 1, step: 0.01 },
      { name: 'blend', label: 'Blend', type: 'range', default: 0.1, min: 0, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `colorkey=${p.color}:${p.similarity}:${p.blend}`,
  },

  // =========================================================================
  // TIME EFFECTS
  // =========================================================================
  {
    type: 'echo',
    name: 'Echo / Trail',
    category: 'time',
    description: 'Frame echo effect',
    params: [
      { name: 'delay', label: 'Delay (frames)', type: 'range', default: 5, min: 1, max: 30, step: 1 },
      { name: 'decay', label: 'Decay', type: 'range', default: 0.5, min: 0, max: 1, step: 0.01 },
    ],
    ffmpegFilter: (p) => `tblend=all_mode=average,tmix=frames=${p.delay}:weights='1 ${Number(p.decay)}'`,
  },
  {
    type: 'strobe',
    name: 'Strobe',
    category: 'time',
    description: 'Strobe/flash effect',
    params: [
      { name: 'frequency', label: 'Frequency (Hz)', type: 'range', default: 10, min: 1, max: 30, step: 1 },
      { name: 'color', label: 'Flash Color', type: 'color', default: '#ffffff' },
    ],
    ffmpegFilter: (p) => `tblend=all_mode=screen:all_expr='if(mod(N,${Math.round(30 / Number(p.frequency))}),A,B)'`,
  },

  // =========================================================================
  // GENERATE EFFECTS
  // =========================================================================
  {
    type: 'solidColor',
    name: 'Solid Color',
    category: 'generate',
    description: 'Generate solid color',
    params: [
      { name: 'color', label: 'Color', type: 'color', default: '#000000' },
    ],
    ffmpegFilter: (p) => `color=${p.color}:s=1920x1080`,
  },
  {
    type: 'gradient',
    name: 'Gradient',
    category: 'generate',
    description: 'Generate color gradient',
    params: [
      { name: 'startColor', label: 'Start Color', type: 'color', default: '#000000' },
      { name: 'endColor', label: 'End Color', type: 'color', default: '#ffffff' },
      { name: 'direction', label: 'Direction', type: 'select', default: 'vertical', options: [
        { value: 'vertical', label: 'Vertical' },
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'radial', label: 'Radial' },
      ]},
    ],
    ffmpegFilter: (p) => {
      // Generate gradient using geq
      const hexToRgb = (hex: string) => {
        const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex as string);
        return match ? {
          r: parseInt(match[1]!, 16),
          g: parseInt(match[2]!, 16),
          b: parseInt(match[3]!, 16),
        } : { r: 0, g: 0, b: 0 };
      };
      const start = hexToRgb(p.startColor as string);
      const end = hexToRgb(p.endColor as string);

      if (p.direction === 'horizontal') {
        return `geq=r='${start.r}+(${end.r}-${start.r})*X/W':g='${start.g}+(${end.g}-${start.g})*X/W':b='${start.b}+(${end.b}-${start.b})*X/W'`;
      } else {
        return `geq=r='${start.r}+(${end.r}-${start.r})*Y/H':g='${start.g}+(${end.g}-${start.g})*Y/H':b='${start.b}+(${end.b}-${start.b})*Y/H'`;
      }
    },
  },
];

// =============================================================================
// Effects Service
// =============================================================================

export class EffectsService {
  private effectsMap: Map<string, EffectDefinition>;

  constructor() {
    this.effectsMap = new Map(EFFECT_DEFINITIONS.map((e) => [e.type, e]));
  }

  /**
   * Get all effect definitions
   */
  getAllEffects(): EffectDefinition[] {
    return EFFECT_DEFINITIONS;
  }

  /**
   * Get effects by category
   */
  getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
    return EFFECT_DEFINITIONS.filter((e) => e.category === category);
  }

  /**
   * Get effect definition by type
   */
  getEffect(type: string): EffectDefinition | undefined {
    return this.effectsMap.get(type);
  }

  /**
   * Generate FFmpeg filter string for an effect
   */
  generateFilter(
    type: string,
    params: Record<string, number | string | boolean>
  ): string {
    const effect = this.effectsMap.get(type);
    if (!effect) {
      console.warn(`Unknown effect type: ${type}`);
      return 'null';
    }

    // Merge with defaults
    const mergedParams: Record<string, number | string | boolean> = {};
    for (const param of effect.params) {
      mergedParams[param.name] = params[param.name] ?? param.default;
    }

    try {
      return effect.ffmpegFilter(mergedParams);
    } catch (error) {
      console.error(`Error generating filter for ${type}:`, error);
      return 'null';
    }
  }

  /**
   * Generate combined FFmpeg filter string for multiple effects
   */
  generateFilterChain(
    effects: Array<{ type: string; params: Record<string, number | string | boolean>; enabled: boolean }>
  ): string {
    const filters = effects
      .filter((e) => e.enabled)
      .map((e) => this.generateFilter(e.type, e.params))
      .filter((f) => f !== 'null');

    return filters.length > 0 ? filters.join(',') : 'null';
  }

  /**
   * Get available categories
   */
  getCategories(): Array<{ id: EffectCategory; name: string; description: string }> {
    return [
      { id: 'color', name: 'Color', description: 'Color correction and grading' },
      { id: 'blur', name: 'Blur', description: 'Blur and defocus effects' },
      { id: 'stylize', name: 'Stylize', description: 'Artistic and stylized effects' },
      { id: 'distort', name: 'Distort', description: 'Geometric distortion effects' },
      { id: 'keying', name: 'Keying', description: 'Chroma and luma keying' },
      { id: 'time', name: 'Time', description: 'Temporal effects' },
      { id: 'generate', name: 'Generate', description: 'Generated content' },
    ];
  }
}

// Singleton
let effectsService: EffectsService | null = null;

export function getEffectsService(): EffectsService {
  if (!effectsService) {
    effectsService = new EffectsService();
  }
  return effectsService;
}

export default EffectsService;

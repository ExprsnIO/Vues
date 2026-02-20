/**
 * Glitch Filter
 * Digital glitch effect with RGB shift, block displacement, and noise
 */

import type { EffectDefinition } from '../EffectEngine';

export const GlitchFilter: EffectDefinition = {
  id: 'glitch',
  name: 'Glitch',
  category: 'distortion',
  description: 'Digital glitch effect with RGB splitting and block displacement',
  parameters: [
    {
      name: 'amount',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      description: 'Overall glitch intensity',
    },
    {
      name: 'rgbShift',
      type: 'number',
      default: 0.02,
      min: 0,
      max: 0.1,
      step: 0.001,
      label: 'RGB Shift',
      description: 'Amount of RGB channel separation',
    },
    {
      name: 'blockSize',
      type: 'number',
      default: 0.05,
      min: 0.01,
      max: 0.2,
      step: 0.01,
      label: 'Block Size',
      description: 'Size of glitch blocks',
    },
    {
      name: 'speed',
      type: 'number',
      default: 1,
      min: 0.1,
      max: 5,
      step: 0.1,
      label: 'Speed',
      description: 'Animation speed',
    },
    {
      name: 'scanlines',
      type: 'boolean',
      default: true,
      label: 'Scanlines',
      description: 'Enable scanline effect',
    },
    {
      name: 'noiseAmount',
      type: 'number',
      default: 0.1,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'Noise',
      description: 'Amount of digital noise',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_amount;
    uniform float u_rgbShift;
    uniform float u_blockSize;
    uniform float u_speed;
    uniform bool u_scanlines;
    uniform float u_noiseAmount;

    // Pseudo-random function
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Noise function
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = rand(i);
      float b = rand(i + vec2(1.0, 0.0));
      float c = rand(i + vec2(0.0, 1.0));
      float d = rand(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      vec2 uv = v_texCoord;
      float time = u_time * u_speed;

      // Create glitch blocks
      float blockY = floor(uv.y / u_blockSize) * u_blockSize;
      float glitchStrength = step(0.8 - u_amount * 0.3, rand(vec2(blockY, floor(time * 10.0))));

      // Horizontal displacement
      float displacement = (rand(vec2(blockY, floor(time * 20.0))) - 0.5) * 0.1 * u_amount * glitchStrength;
      uv.x += displacement;

      // RGB shift
      float shift = u_rgbShift * u_amount * (1.0 + glitchStrength * 2.0);
      float r = texture2D(u_texture, vec2(uv.x + shift, uv.y)).r;
      float g = texture2D(u_texture, uv).g;
      float b = texture2D(u_texture, vec2(uv.x - shift, uv.y)).b;

      vec4 color = vec4(r, g, b, 1.0);

      // Add noise
      float noiseVal = noise(uv * u_resolution * 0.5 + time * 100.0) * u_noiseAmount * u_amount;
      color.rgb += noiseVal;

      // Scanlines
      if (u_scanlines) {
        float scanline = sin(uv.y * u_resolution.y * 2.0) * 0.02 * u_amount;
        color.rgb -= scanline;
      }

      // Random color offset on glitch
      if (glitchStrength > 0.5) {
        float colorShift = rand(vec2(floor(time * 30.0), blockY));
        if (colorShift > 0.9) {
          color.rgb = vec3(1.0) - color.rgb;
        }
      }

      gl_FragColor = color;
    }
  `,
};

export default GlitchFilter;

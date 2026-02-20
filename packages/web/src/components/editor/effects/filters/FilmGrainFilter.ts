/**
 * Film Grain Filter
 * Realistic film grain effect for cinematic look
 */

import type { EffectDefinition } from '../EffectEngine';

export const FilmGrainFilter: EffectDefinition = {
  id: 'film-grain',
  name: 'Film Grain',
  category: 'stylize',
  description: 'Realistic film grain for cinematic look',
  parameters: [
    {
      name: 'amount',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      description: 'Grain intensity',
    },
    {
      name: 'size',
      type: 'number',
      default: 1.5,
      min: 0.5,
      max: 4,
      step: 0.1,
      label: 'Size',
      description: 'Grain particle size',
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
      name: 'luminanceResponse',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Luminance Response',
      description: 'More grain in shadows/highlights',
    },
    {
      name: 'colored',
      type: 'boolean',
      default: false,
      label: 'Colored Grain',
      description: 'Use colored grain instead of monochrome',
    },
    {
      name: 'softness',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Softness',
      description: 'Grain softness/blur',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_amount;
    uniform float u_size;
    uniform float u_speed;
    uniform float u_luminanceResponse;
    uniform bool u_colored;
    uniform float u_softness;

    // High quality noise function
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Perlin-style noise
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

    // Fractal brownian motion for more organic grain
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;

      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }

      return value;
    }

    float luminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 uv = v_texCoord;
      vec4 color = texture2D(u_texture, uv);

      // Calculate grain coordinates
      float time = u_time * u_speed;
      vec2 grainCoord = uv * u_resolution / u_size;

      // Generate grain pattern
      float grain;
      if (u_softness > 0.5) {
        // Softer grain using fbm
        grain = fbm(grainCoord + time * 100.0);
      } else {
        // Sharper grain
        grain = noise(grainCoord + time * 100.0);
      }

      // Additional variation
      grain += noise(grainCoord * 2.0 + time * 150.0) * 0.5;
      grain /= 1.5;

      // Center around 0
      grain = (grain - 0.5) * 2.0;

      // Apply softness
      grain = mix(grain, sign(grain) * pow(abs(grain), 2.0), 1.0 - u_softness);

      // Luminance-based grain response
      float lum = luminance(color.rgb);

      // More grain in midtones, less in pure black/white
      float lumResponse = 1.0 - abs(lum - 0.5) * 2.0 * u_luminanceResponse;

      // Also add some in shadows
      lumResponse += (1.0 - lum) * 0.3 * u_luminanceResponse;

      grain *= lumResponse;

      // Scale by amount
      grain *= u_amount * 0.2;

      // Apply grain
      if (u_colored) {
        // Colored grain - different noise for each channel
        float grainR = noise(grainCoord + time * 100.0 + vec2(100.0, 0.0));
        float grainG = noise(grainCoord + time * 100.0 + vec2(0.0, 100.0));
        float grainB = noise(grainCoord + time * 100.0 + vec2(100.0, 100.0));

        grainR = (grainR - 0.5) * 2.0 * u_amount * 0.15 * lumResponse;
        grainG = (grainG - 0.5) * 2.0 * u_amount * 0.15 * lumResponse;
        grainB = (grainB - 0.5) * 2.0 * u_amount * 0.15 * lumResponse;

        color.r += grainR;
        color.g += grainG;
        color.b += grainB;
      } else {
        // Monochrome grain
        color.rgb += grain;
      }

      // Clamp to valid range
      color.rgb = clamp(color.rgb, 0.0, 1.0);

      gl_FragColor = color;
    }
  `,
};

export default FilmGrainFilter;

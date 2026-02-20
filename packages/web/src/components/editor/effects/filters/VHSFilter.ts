/**
 * VHS Filter
 * Retro VHS tape effect with tracking errors, noise, and color bleeding
 */

import type { EffectDefinition } from '../EffectEngine';

export const VHSFilter: EffectDefinition = {
  id: 'vhs',
  name: 'VHS',
  category: 'stylize',
  description: 'Retro VHS tape effect with tracking errors and analog distortion',
  parameters: [
    {
      name: 'amount',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Amount',
      description: 'Overall effect intensity',
    },
    {
      name: 'trackingError',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Tracking Error',
      description: 'Horizontal tracking distortion',
    },
    {
      name: 'noiseIntensity',
      type: 'number',
      default: 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Noise',
      description: 'Static noise intensity',
    },
    {
      name: 'colorBleed',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Color Bleed',
      description: 'Horizontal color bleeding',
    },
    {
      name: 'scanlineIntensity',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Scanlines',
      description: 'Scanline visibility',
    },
    {
      name: 'vignette',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Vignette',
      description: 'Edge darkening',
    },
    {
      name: 'saturation',
      type: 'number',
      default: 0.8,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: 'Saturation',
      description: 'Color saturation',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_amount;
    uniform float u_trackingError;
    uniform float u_noiseIntensity;
    uniform float u_colorBleed;
    uniform float u_scanlineIntensity;
    uniform float u_vignette;
    uniform float u_saturation;

    // Pseudo-random
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Noise
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

    // Color to grayscale
    float luminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 uv = v_texCoord;

      // Tracking error - horizontal wobble
      float trackingNoise = noise(vec2(uv.y * 10.0, u_time * 5.0));
      float trackingOffset = (trackingNoise - 0.5) * 0.02 * u_trackingError * u_amount;

      // Add occasional larger tracking jumps
      float bigJump = step(0.98, rand(vec2(floor(u_time * 3.0), floor(uv.y * 5.0))));
      trackingOffset += bigJump * (rand(vec2(u_time, uv.y)) - 0.5) * 0.1 * u_trackingError * u_amount;

      uv.x += trackingOffset;

      // Color bleed (horizontal smearing)
      float bleedAmount = u_colorBleed * u_amount * 0.01;
      vec4 color = texture2D(u_texture, uv);
      color.r = texture2D(u_texture, vec2(uv.x + bleedAmount, uv.y)).r;
      color.b = texture2D(u_texture, vec2(uv.x - bleedAmount, uv.y)).b;

      // Static noise
      float staticNoise = rand(uv * u_resolution + u_time * 1000.0);
      float noiseStrength = u_noiseIntensity * u_amount * (0.5 + 0.5 * noise(vec2(uv.y * 50.0, u_time * 10.0)));
      color.rgb = mix(color.rgb, vec3(staticNoise), noiseStrength);

      // Horizontal noise bands
      float bandNoise = step(0.95, rand(vec2(floor(uv.y * 100.0), floor(u_time * 20.0))));
      color.rgb = mix(color.rgb, vec3(rand(vec2(uv.x, floor(u_time * 30.0)))), bandNoise * 0.3 * u_amount);

      // Scanlines
      float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5);
      color.rgb *= 1.0 - scanline * u_scanlineIntensity * u_amount * 0.3;

      // Interlace effect
      float interlace = mod(floor(uv.y * u_resolution.y), 2.0);
      color.rgb *= 1.0 - interlace * 0.05 * u_amount;

      // Saturation adjustment
      float lum = luminance(color.rgb);
      color.rgb = mix(vec3(lum), color.rgb, u_saturation);

      // Slight color shift to warmer tones
      color.r *= 1.0 + 0.1 * u_amount;
      color.b *= 1.0 - 0.05 * u_amount;

      // Vignette
      vec2 vignetteUV = uv * (1.0 - uv);
      float vig = vignetteUV.x * vignetteUV.y * 15.0;
      vig = pow(vig, 0.25 + u_vignette * 0.5);
      color.rgb *= vig;

      // Bottom tracking bar
      float bottomBar = smoothstep(0.98, 1.0, uv.y);
      float barNoise = noise(vec2(uv.x * 100.0, u_time * 20.0));
      color.rgb = mix(color.rgb, vec3(barNoise * 0.3), bottomBar * u_amount);

      gl_FragColor = color;
    }
  `,
};

export default VHSFilter;

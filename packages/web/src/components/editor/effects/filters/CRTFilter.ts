/**
 * CRT Filter
 * Simulates old CRT monitor/TV display
 */

import type { EffectDefinition } from '../EffectEngine';

export const CRTFilter: EffectDefinition = {
  id: 'crt',
  name: 'CRT',
  category: 'stylize',
  description: 'Simulates old CRT monitor display',
  parameters: [
    {
      name: 'curvature',
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Curvature',
      description: 'Screen curvature amount',
    },
    {
      name: 'scanlineIntensity',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Scanlines',
      description: 'Scanline darkness',
    },
    {
      name: 'scanlineCount',
      type: 'number',
      default: 300,
      min: 100,
      max: 1000,
      step: 10,
      label: 'Scanline Count',
      description: 'Number of scanlines',
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
      name: 'brightness',
      type: 'number',
      default: 1.2,
      min: 0.5,
      max: 2,
      step: 0.01,
      label: 'Brightness',
      description: 'Overall brightness boost',
    },
    {
      name: 'rgbPixels',
      type: 'boolean',
      default: true,
      label: 'RGB Pixels',
      description: 'Show RGB pixel pattern',
    },
    {
      name: 'pixelSize',
      type: 'number',
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      label: 'Pixel Size',
      description: 'Size of RGB pixel pattern',
    },
    {
      name: 'flickering',
      type: 'number',
      default: 0.05,
      min: 0,
      max: 0.2,
      step: 0.01,
      label: 'Flickering',
      description: 'Screen flicker amount',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_curvature;
    uniform float u_scanlineIntensity;
    uniform float u_scanlineCount;
    uniform float u_vignette;
    uniform float u_brightness;
    uniform bool u_rgbPixels;
    uniform float u_pixelSize;
    uniform float u_flickering;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Apply CRT curvature
    vec2 curveCoords(vec2 uv) {
      uv = uv * 2.0 - 1.0;

      vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
      offset *= offset;
      offset *= u_curvature;

      uv = uv + uv * offset;
      uv = uv * 0.5 + 0.5;

      return uv;
    }

    void main() {
      vec2 uv = v_texCoord;

      // Apply curvature
      if (u_curvature > 0.0) {
        uv = curveCoords(uv);

        // Check if we're outside the curved screen
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
      }

      vec4 color = texture2D(u_texture, uv);

      // RGB pixel pattern
      if (u_rgbPixels) {
        vec2 pixelCoord = floor(uv * u_resolution / u_pixelSize);
        float subpixel = mod(pixelCoord.x, 3.0);

        vec3 mask = vec3(1.0);
        if (subpixel < 1.0) {
          mask = vec3(1.0, 0.7, 0.7);
        } else if (subpixel < 2.0) {
          mask = vec3(0.7, 1.0, 0.7);
        } else {
          mask = vec3(0.7, 0.7, 1.0);
        }

        color.rgb *= mask;
      }

      // Scanlines
      float scanline = sin(uv.y * u_scanlineCount * 3.14159) * 0.5 + 0.5;
      scanline = pow(scanline, 0.5);
      color.rgb *= 1.0 - scanline * u_scanlineIntensity;

      // Interlacing effect
      float interlace = mod(floor(uv.y * u_resolution.y + u_time * 60.0), 2.0);
      color.rgb *= 1.0 - interlace * 0.03;

      // Brightness boost (CRTs were bright)
      color.rgb *= u_brightness;

      // Vignette
      vec2 vignetteCoord = uv * (1.0 - uv);
      float vig = vignetteCoord.x * vignetteCoord.y * 15.0;
      vig = pow(vig, 0.2 + u_vignette * 0.3);
      color.rgb *= vig;

      // Corner darkening
      float cornerDist = length(uv - 0.5) * 1.41421;
      float cornerDark = 1.0 - pow(cornerDist, 3.0) * u_curvature;
      color.rgb *= cornerDark;

      // Screen flicker
      float flicker = 1.0 + (rand(vec2(floor(u_time * 20.0), 0.0)) - 0.5) * u_flickering;
      color.rgb *= flicker;

      // Slight green/blue tint (CRT phosphors)
      color.g *= 1.02;
      color.b *= 1.01;

      // Clamp
      color.rgb = clamp(color.rgb, 0.0, 1.0);

      gl_FragColor = color;
    }
  `,
};

export default CRTFilter;

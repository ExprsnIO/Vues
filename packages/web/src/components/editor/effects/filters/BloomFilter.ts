/**
 * Bloom Filter
 * Glow effect for bright areas
 */

import type { EffectDefinition } from '../EffectEngine';

export const BloomFilter: EffectDefinition = {
  id: 'bloom',
  name: 'Bloom',
  category: 'stylize',
  description: 'Glow effect for bright areas',
  parameters: [
    {
      name: 'intensity',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'Intensity',
      description: 'Bloom brightness',
    },
    {
      name: 'threshold',
      type: 'number',
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Threshold',
      description: 'Brightness threshold for bloom',
    },
    {
      name: 'radius',
      type: 'number',
      default: 10,
      min: 1,
      max: 50,
      step: 1,
      label: 'Radius',
      description: 'Blur radius',
    },
    {
      name: 'softness',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Softness',
      description: 'Bloom softness',
    },
    {
      name: 'color',
      type: 'color',
      default: '#ffffff',
      label: 'Tint Color',
      description: 'Color tint for bloom',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_intensity;
    uniform float u_threshold;
    uniform float u_radius;
    uniform float u_softness;
    uniform vec3 u_color;

    float luminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    // Gaussian blur approximation
    vec4 blur(sampler2D tex, vec2 uv, vec2 resolution, float radius) {
      vec4 color = vec4(0.0);
      float total = 0.0;

      // Use fixed number of samples for consistency
      const int samples = 9;
      float sigma = radius * 0.5;

      for (int x = -4; x <= 4; x++) {
        for (int y = -4; y <= 4; y++) {
          vec2 offset = vec2(float(x), float(y)) * radius / float(samples);
          vec2 sampleUV = uv + offset / resolution;

          float dist = length(vec2(float(x), float(y)));
          float weight = exp(-dist * dist / (2.0 * sigma * sigma));

          color += texture2D(tex, sampleUV) * weight;
          total += weight;
        }
      }

      return color / total;
    }

    void main() {
      vec2 uv = v_texCoord;

      // Original color
      vec4 original = texture2D(u_texture, uv);

      // Get blurred version for bloom
      vec4 blurred = blur(u_texture, uv, u_resolution, u_radius);

      // Extract bright parts
      float brightness = luminance(blurred.rgb);
      float bloomMask = smoothstep(u_threshold, u_threshold + u_softness * 0.5, brightness);

      // Create bloom color
      vec3 bloomColor = blurred.rgb * bloomMask;

      // Apply color tint
      bloomColor *= u_color;

      // Blend bloom with original
      vec3 finalColor = original.rgb + bloomColor * u_intensity;

      // Tone mapping to prevent overexposure
      finalColor = finalColor / (1.0 + finalColor * 0.2);

      gl_FragColor = vec4(finalColor, original.a);
    }
  `,
};

export default BloomFilter;

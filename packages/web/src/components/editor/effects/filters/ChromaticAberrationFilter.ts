/**
 * Chromatic Aberration Filter
 * Simulates lens chromatic aberration (color fringing)
 */

import type { EffectDefinition } from '../EffectEngine';

export const ChromaticAberrationFilter: EffectDefinition = {
  id: 'chromatic-aberration',
  name: 'Chromatic Aberration',
  category: 'distortion',
  description: 'Simulates lens color fringing effect',
  parameters: [
    {
      name: 'amount',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'Amount',
      description: 'Aberration intensity',
    },
    {
      name: 'angle',
      type: 'number',
      default: 0,
      min: 0,
      max: 360,
      step: 1,
      label: 'Angle',
      description: 'Direction of aberration (degrees)',
    },
    {
      name: 'radial',
      type: 'boolean',
      default: true,
      label: 'Radial',
      description: 'Use radial (lens-like) aberration',
    },
    {
      name: 'centerX',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Center X',
      description: 'Horizontal center point',
    },
    {
      name: 'centerY',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Center Y',
      description: 'Vertical center point',
    },
    {
      name: 'falloff',
      type: 'number',
      default: 1,
      min: 0.1,
      max: 3,
      step: 0.1,
      label: 'Falloff',
      description: 'Edge falloff power (radial mode)',
    },
  ],
  fragmentShader: `
    precision mediump float;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform float u_amount;
    uniform float u_angle;
    uniform bool u_radial;
    uniform float u_centerX;
    uniform float u_centerY;
    uniform float u_falloff;

    void main() {
      vec2 uv = v_texCoord;
      vec2 center = vec2(u_centerX, u_centerY);

      float aberrationAmount = u_amount * 0.01;
      vec2 direction;

      if (u_radial) {
        // Radial aberration - direction from center
        vec2 toCenter = uv - center;
        float dist = length(toCenter);

        // Apply falloff - more aberration at edges
        float falloffStrength = pow(dist * 2.0, u_falloff);

        direction = normalize(toCenter) * falloffStrength;
      } else {
        // Linear aberration in specified direction
        float angleRad = u_angle * 3.14159 / 180.0;
        direction = vec2(cos(angleRad), sin(angleRad));
      }

      // Sample each channel with offset
      vec2 redOffset = direction * aberrationAmount;
      vec2 greenOffset = vec2(0.0);
      vec2 blueOffset = -direction * aberrationAmount;

      float r = texture2D(u_texture, uv + redOffset).r;
      float g = texture2D(u_texture, uv + greenOffset).g;
      float b = texture2D(u_texture, uv + blueOffset).b;

      // Get alpha from center sample
      float a = texture2D(u_texture, uv).a;

      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};

export default ChromaticAberrationFilter;

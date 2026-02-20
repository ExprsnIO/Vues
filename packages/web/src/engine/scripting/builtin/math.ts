/**
 * Math utilities for expressions
 * All angles in degrees for animation-friendly usage
 */

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

// Standard math functions
export const abs = Math.abs;
export const floor = Math.floor;
export const ceil = Math.ceil;
export const round = Math.round;
export const sqrt = Math.sqrt;
export const pow = Math.pow;
export const exp = Math.exp;
export const log = Math.log;
export const log10 = Math.log10;
export const log2 = Math.log2;
export const min = Math.min;
export const max = Math.max;
export const sign = Math.sign;
export const trunc = Math.trunc;

// Trigonometry (degrees-based)
export const sin = (deg: number) => Math.sin(toRadians(deg));
export const cos = (deg: number) => Math.cos(toRadians(deg));
export const tan = (deg: number) => Math.tan(toRadians(deg));
export const asin = (val: number) => toDegrees(Math.asin(val));
export const acos = (val: number) => toDegrees(Math.acos(val));
export const atan = (val: number) => toDegrees(Math.atan(val));
export const atan2 = (y: number, x: number) => toDegrees(Math.atan2(y, x));

// Constants
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const E = Math.E;
export const SQRT2 = Math.SQRT2;
export const SQRT1_2 = Math.SQRT1_2;
export const LN2 = Math.LN2;
export const LN10 = Math.LN10;

// Conversion
export const radians = toRadians;
export const degrees = toDegrees;

// Utility functions
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  return (value - a) / (b - a);
}

export function remap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const t = inverseLerp(fromMin, fromMax, value);
  return lerp(toMin, toMax, t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function fract(x: number): number {
  return x - Math.floor(x);
}

export function mod(x: number, y: number): number {
  return ((x % y) + y) % y;
}

export const mathFunctions = {
  // Standard
  abs, floor, ceil, round, sqrt, pow, exp, log, log10, log2,
  min, max, sign, trunc,
  // Trig
  sin, cos, tan, asin, acos, atan, atan2,
  // Constants
  PI, TAU, E, SQRT2, SQRT1_2, LN2, LN10,
  // Conversion
  radians, degrees,
  // Utility
  clamp, lerp, inverseLerp, remap, smoothstep, smootherstep, fract, mod,
};

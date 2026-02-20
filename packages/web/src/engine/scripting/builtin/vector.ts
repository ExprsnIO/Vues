/**
 * Vector utilities for expressions
 * Supports 2D, 3D, and 4D vectors
 */

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

type Vector = Vector2 | Vector3 | Vector4 | number[];

// Helper to convert array to vector
function toVec2(v: Vector): Vector2 {
  if (Array.isArray(v)) {
    return { x: v[0] || 0, y: v[1] || 0 };
  }
  return { x: v.x, y: v.y };
}

function toVec3(v: Vector): Vector3 {
  if (Array.isArray(v)) {
    return { x: v[0] || 0, y: v[1] || 0, z: v[2] || 0 };
  }
  return { x: v.x, y: v.y, z: 'z' in v ? v.z : 0 };
}

// Vector creation
export function vec2(x: number, y: number): Vector2 {
  return { x, y };
}

export function vec3(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

export function vec4(x: number, y: number, z: number, w: number): Vector4 {
  return { x, y, z, w };
}

// Vector operations
export function add(a: Vector, b: Vector): Vector2 | Vector3 {
  const va = Array.isArray(a) ? a : [a.x, a.y, 'z' in a ? a.z : undefined];
  const vb = Array.isArray(b) ? b : [b.x, b.y, 'z' in b ? b.z : undefined];

  if (va[2] !== undefined || vb[2] !== undefined) {
    return {
      x: (va[0] || 0) + (vb[0] || 0),
      y: (va[1] || 0) + (vb[1] || 0),
      z: (va[2] || 0) + (vb[2] || 0),
    };
  }

  return {
    x: (va[0] || 0) + (vb[0] || 0),
    y: (va[1] || 0) + (vb[1] || 0),
  };
}

export function sub(a: Vector, b: Vector): Vector2 | Vector3 {
  const va = Array.isArray(a) ? a : [a.x, a.y, 'z' in a ? a.z : undefined];
  const vb = Array.isArray(b) ? b : [b.x, b.y, 'z' in b ? b.z : undefined];

  if (va[2] !== undefined || vb[2] !== undefined) {
    return {
      x: (va[0] || 0) - (vb[0] || 0),
      y: (va[1] || 0) - (vb[1] || 0),
      z: (va[2] || 0) - (vb[2] || 0),
    };
  }

  return {
    x: (va[0] || 0) - (vb[0] || 0),
    y: (va[1] || 0) - (vb[1] || 0),
  };
}

export function mul(v: Vector, scalar: number): Vector2 | Vector3 {
  if (Array.isArray(v)) {
    if (v.length >= 3) {
      return { x: v[0] * scalar, y: v[1] * scalar, z: v[2] * scalar };
    }
    return { x: v[0] * scalar, y: v[1] * scalar };
  }

  if ('z' in v) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
  }

  return { x: v.x * scalar, y: v.y * scalar };
}

export function div(v: Vector, scalar: number): Vector2 | Vector3 {
  if (scalar === 0) {
    throw new Error('Division by zero');
  }
  return mul(v, 1 / scalar);
}

export function dot(a: Vector, b: Vector): number {
  const va = toVec3(a);
  const vb = toVec3(b);
  return va.x * vb.x + va.y * vb.y + va.z * vb.z;
}

export function cross(a: Vector, b: Vector): Vector3 {
  const va = toVec3(a);
  const vb = toVec3(b);
  return {
    x: va.y * vb.z - va.z * vb.y,
    y: va.z * vb.x - va.x * vb.z,
    z: va.x * vb.y - va.y * vb.x,
  };
}

export function length(v: Vector): number {
  const vec = toVec3(v);
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

export function lengthSquared(v: Vector): number {
  const vec = toVec3(v);
  return vec.x * vec.x + vec.y * vec.y + vec.z * vec.z;
}

export function normalize(v: Vector): Vector2 | Vector3 {
  const len = length(v);
  if (len === 0) {
    if (Array.isArray(v) || !('z' in v)) {
      return { x: 0, y: 0 };
    }
    return { x: 0, y: 0, z: 0 };
  }
  return div(v, len);
}

export function distance(a: Vector, b: Vector): number {
  return length(sub(a, b));
}

export function angle(a: Vector, b: Vector): number {
  const dotProduct = dot(a, b);
  const lenA = length(a);
  const lenB = length(b);
  if (lenA === 0 || lenB === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (lenA * lenB)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

export function reflect(v: Vector, normal: Vector): Vector2 | Vector3 {
  const d = dot(v, normal) * 2;
  return sub(v, mul(normal, d));
}

export function lerpVec(a: Vector, b: Vector, t: number): Vector2 | Vector3 {
  const va = toVec3(a);
  const vb = toVec3(b);

  const is3D = (Array.isArray(a) && a.length >= 3) ||
               (Array.isArray(b) && b.length >= 3) ||
               (!Array.isArray(a) && 'z' in a) ||
               (!Array.isArray(b) && 'z' in b);

  if (is3D) {
    return {
      x: va.x + (vb.x - va.x) * t,
      y: va.y + (vb.y - va.y) * t,
      z: va.z + (vb.z - va.z) * t,
    };
  }

  return {
    x: va.x + (vb.x - va.x) * t,
    y: va.y + (vb.y - va.y) * t,
  };
}

export function clampVec(v: Vector, minVal: number, maxVal: number): Vector2 | Vector3 {
  const vec = toVec3(v);
  const is3D = (Array.isArray(v) && v.length >= 3) || (!Array.isArray(v) && 'z' in v);

  const clamp = (n: number) => Math.max(minVal, Math.min(maxVal, n));

  if (is3D) {
    return {
      x: clamp(vec.x),
      y: clamp(vec.y),
      z: clamp(vec.z),
    };
  }

  return {
    x: clamp(vec.x),
    y: clamp(vec.y),
  };
}

export function rotate2D(v: Vector, degrees: number): Vector2 {
  const vec = toVec2(v);
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x * cos - vec.y * sin,
    y: vec.x * sin + vec.y * cos,
  };
}

export function rotateX(v: Vector, degrees: number): Vector3 {
  const vec = toVec3(v);
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x,
    y: vec.y * cos - vec.z * sin,
    z: vec.y * sin + vec.z * cos,
  };
}

export function rotateY(v: Vector, degrees: number): Vector3 {
  const vec = toVec3(v);
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x * cos + vec.z * sin,
    y: vec.y,
    z: -vec.x * sin + vec.z * cos,
  };
}

export function rotateZ(v: Vector, degrees: number): Vector3 {
  const vec = toVec3(v);
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x * cos - vec.y * sin,
    y: vec.x * sin + vec.y * cos,
    z: vec.z,
  };
}

export function project(v: Vector, onto: Vector): Vector2 | Vector3 {
  const ontoNorm = normalize(onto);
  const d = dot(v, ontoNorm);
  return mul(ontoNorm, d);
}

export function perpendicular2D(v: Vector): Vector2 {
  const vec = toVec2(v);
  return { x: -vec.y, y: vec.x };
}

export function midpoint(a: Vector, b: Vector): Vector2 | Vector3 {
  return lerpVec(a, b, 0.5);
}

export const vectorFunctions = {
  // Creation
  vec2,
  vec3,
  vec4,
  // Operations
  add,
  sub,
  mul,
  div,
  dot,
  cross,
  // Properties
  length,
  lengthSquared,
  normalize,
  distance,
  angle,
  // Transformations
  reflect,
  lerpVec,
  clampVec,
  rotate2D,
  rotateX,
  rotateY,
  rotateZ,
  project,
  perpendicular2D,
  midpoint,
};

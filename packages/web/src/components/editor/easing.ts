// Easing Functions - Based on exprsn-studio
import type { EasingType, EasingFunction, BezierHandle } from './types';

// Basic easing functions
const easingFunctions: Record<string, EasingFunction> = {
  // Linear
  'linear': (t) => t,

  // Standard ease
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Quadratic
  'ease-in-quad': (t) => t * t,
  'ease-out-quad': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out-quad': (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

  // Cubic
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out-cubic': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Quartic
  'ease-in-quart': (t) => t * t * t * t,
  'ease-out-quart': (t) => 1 - Math.pow(1 - t, 4),
  'ease-in-out-quart': (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

  // Quintic
  'ease-in-quint': (t) => t * t * t * t * t,
  'ease-out-quint': (t) => 1 - Math.pow(1 - t, 5),
  'ease-in-out-quint': (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,

  // Exponential
  'ease-in-expo': (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  'ease-out-expo': (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  'ease-in-out-expo': (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // Sine
  'ease-in-sine': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'ease-out-sine': (t) => Math.sin((t * Math.PI) / 2),
  'ease-in-out-sine': (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Circular
  'ease-in-circ': (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  'ease-out-circ': (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  'ease-in-out-circ': (t) => {
    return t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  },

  // Back (with overshoot)
  'ease-in-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  'ease-out-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  'ease-in-out-back': (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // Elastic
  'ease-in-elastic': (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  'ease-out-elastic': (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  'ease-in-out-elastic': (t) => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // Bounce
  'ease-in-bounce': (t) => 1 - bounceOut(1 - t),
  'ease-out-bounce': bounceOut,
  'ease-in-out-bounce': (t) => {
    return t < 0.5
      ? (1 - bounceOut(1 - 2 * t)) / 2
      : (1 + bounceOut(2 * t - 1)) / 2;
  },
};

// Bounce helper function
function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

// Get easing function by name
export function getEasingFunction(easing?: EasingType): EasingFunction {
  if (!easing) return easingFunctions['linear'];
  return easingFunctions[easing] || easingFunctions['linear'];
}

// Create cubic bezier easing function
export function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): EasingFunction {
  // Newton-Raphson iteration to solve for t given x
  const NEWTON_ITERATIONS = 4;
  const NEWTON_MIN_SLOPE = 0.001;
  const SUBDIVISION_PRECISION = 0.0000001;
  const SUBDIVISION_MAX_ITERATIONS = 10;

  const kSplineTableSize = 11;
  const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

  const sampleValues = new Float32Array(kSplineTableSize);
  for (let i = 0; i < kSplineTableSize; ++i) {
    sampleValues[i] = calcBezier(i * kSampleStepSize, p1x, p2x);
  }

  function calcBezier(t: number, a1: number, a2: number): number {
    return ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t + 3 * a1 * t;
  }

  function getSlope(t: number, a1: number, a2: number): number {
    return 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
  }

  function binarySubdivide(x: number, a: number, b: number): number {
    let currentX: number;
    let currentT: number;
    let i = 0;
    do {
      currentT = a + (b - a) / 2;
      currentX = calcBezier(currentT, p1x, p2x) - x;
      if (currentX > 0) {
        b = currentT;
      } else {
        a = currentT;
      }
    } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
    return currentT;
  }

  function newtonRaphsonIterate(x: number, guessT: number): number {
    for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
      const currentSlope = getSlope(guessT, p1x, p2x);
      if (currentSlope === 0) return guessT;
      const currentX = calcBezier(guessT, p1x, p2x) - x;
      guessT -= currentX / currentSlope;
    }
    return guessT;
  }

  function getTForX(x: number): number {
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= x; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    const dist =
      (x - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * kSampleStepSize;

    const initialSlope = getSlope(guessForT, p1x, p2x);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(x, guessForT);
    } else if (initialSlope === 0) {
      return guessForT;
    } else {
      return binarySubdivide(x, intervalStart, intervalStart + kSampleStepSize);
    }
  }

  return function (x: number): number {
    if (x === 0 || x === 1) return x;
    return calcBezier(getTForX(x), p1y, p2y);
  };
}

// Create bezier easing from handles
export function createBezierEasing(handleOut: BezierHandle, handleIn: BezierHandle): EasingFunction {
  return cubicBezier(handleOut.x, handleOut.y, 1 - handleIn.x, 1 - handleIn.y);
}

// Spring physics easing
export function spring(
  mass = 1,
  stiffness = 100,
  damping = 10,
  velocity = 0
): EasingFunction {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  return (t: number): number => {
    if (zeta < 1) {
      // Underdamped
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (
        1 -
        Math.exp(-zeta * w0 * t) *
          ((velocity + zeta * w0) / wd * Math.sin(wd * t) + Math.cos(wd * t))
      );
    } else if (zeta === 1) {
      // Critically damped
      return 1 - Math.exp(-w0 * t) * (1 + (velocity + w0) * t);
    } else {
      // Overdamped
      const s1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
      const s2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
      return (
        1 +
        (s1 * Math.exp(s2 * t) - s2 * Math.exp(s1 * t)) / (s2 - s1)
      );
    }
  };
}

// Linear interpolation
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Vector2 interpolation
export function lerpVector2(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

// Color interpolation (hex colors)
export function lerpColor(a: string, b: string, t: number): string {
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };

  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

  const colorA = parseHex(a);
  const colorB = parseHex(b);

  return `#${toHex(lerp(colorA.r, colorB.r, t))}${toHex(lerp(colorA.g, colorB.g, t))}${toHex(lerp(colorA.b, colorB.b, t))}`;
}

// Get all available easing names
export function getEasingNames(): EasingType[] {
  return Object.keys(easingFunctions) as EasingType[];
}

// Easing category groups for UI
export const EASING_CATEGORIES = {
  basic: ['linear', 'ease-in', 'ease-out', 'ease-in-out'],
  quad: ['ease-in-quad', 'ease-out-quad', 'ease-in-out-quad'],
  cubic: ['ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic'],
  quart: ['ease-in-quart', 'ease-out-quart', 'ease-in-out-quart'],
  quint: ['ease-in-quint', 'ease-out-quint', 'ease-in-out-quint'],
  expo: ['ease-in-expo', 'ease-out-expo', 'ease-in-out-expo'],
  sine: ['ease-in-sine', 'ease-out-sine', 'ease-in-out-sine'],
  circ: ['ease-in-circ', 'ease-out-circ', 'ease-in-out-circ'],
  back: ['ease-in-back', 'ease-out-back', 'ease-in-out-back'],
  elastic: ['ease-in-elastic', 'ease-out-elastic', 'ease-in-out-elastic'],
  bounce: ['ease-in-bounce', 'ease-out-bounce', 'ease-in-out-bounce'],
} as const;

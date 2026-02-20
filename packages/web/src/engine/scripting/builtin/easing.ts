/**
 * Easing utilities for expressions
 * Wraps the existing Vues easing library for expression context
 */

import {
  getEasingFunction,
  cubicBezier,
  spring as springEasing,
  lerp as lerpValue,
  getEasingNames,
  EASING_CATEGORIES,
} from '../../../components/editor/easing';

// Re-export easing categories for reference
export { EASING_CATEGORIES };

/**
 * Get an easing function by name
 */
export function ease(t: number, type: string = 'ease-in-out'): number {
  const fn = getEasingFunction(type as Parameters<typeof getEasingFunction>[0]);
  return fn(Math.max(0, Math.min(1, t)));
}

/**
 * Linear interpolation with optional easing
 */
export function linear(t: number): number {
  return Math.max(0, Math.min(1, t));
}

// Standard easing functions
export function easeIn(t: number): number {
  return ease(t, 'ease-in');
}

export function easeOut(t: number): number {
  return ease(t, 'ease-out');
}

export function easeInOut(t: number): number {
  return ease(t, 'ease-in-out');
}

// Quad
export function easeInQuad(t: number): number {
  return ease(t, 'ease-in-quad');
}

export function easeOutQuad(t: number): number {
  return ease(t, 'ease-out-quad');
}

export function easeInOutQuad(t: number): number {
  return ease(t, 'ease-in-out-quad');
}

// Cubic
export function easeInCubic(t: number): number {
  return ease(t, 'ease-in-cubic');
}

export function easeOutCubic(t: number): number {
  return ease(t, 'ease-out-cubic');
}

export function easeInOutCubic(t: number): number {
  return ease(t, 'ease-in-out-cubic');
}

// Quart
export function easeInQuart(t: number): number {
  return ease(t, 'ease-in-quart');
}

export function easeOutQuart(t: number): number {
  return ease(t, 'ease-out-quart');
}

export function easeInOutQuart(t: number): number {
  return ease(t, 'ease-in-out-quart');
}

// Quint
export function easeInQuint(t: number): number {
  return ease(t, 'ease-in-quint');
}

export function easeOutQuint(t: number): number {
  return ease(t, 'ease-out-quint');
}

export function easeInOutQuint(t: number): number {
  return ease(t, 'ease-in-out-quint');
}

// Sine
export function easeInSine(t: number): number {
  return ease(t, 'ease-in-sine');
}

export function easeOutSine(t: number): number {
  return ease(t, 'ease-out-sine');
}

export function easeInOutSine(t: number): number {
  return ease(t, 'ease-in-out-sine');
}

// Expo
export function easeInExpo(t: number): number {
  return ease(t, 'ease-in-expo');
}

export function easeOutExpo(t: number): number {
  return ease(t, 'ease-out-expo');
}

export function easeInOutExpo(t: number): number {
  return ease(t, 'ease-in-out-expo');
}

// Circ
export function easeInCirc(t: number): number {
  return ease(t, 'ease-in-circ');
}

export function easeOutCirc(t: number): number {
  return ease(t, 'ease-out-circ');
}

export function easeInOutCirc(t: number): number {
  return ease(t, 'ease-in-out-circ');
}

// Back
export function easeInBack(t: number): number {
  return ease(t, 'ease-in-back');
}

export function easeOutBack(t: number): number {
  return ease(t, 'ease-out-back');
}

export function easeInOutBack(t: number): number {
  return ease(t, 'ease-in-out-back');
}

// Elastic
export function easeInElastic(t: number): number {
  return ease(t, 'ease-in-elastic');
}

export function easeOutElastic(t: number): number {
  return ease(t, 'ease-out-elastic');
}

export function easeInOutElastic(t: number): number {
  return ease(t, 'ease-in-out-elastic');
}

// Bounce
export function easeInBounce(t: number): number {
  return ease(t, 'ease-in-bounce');
}

export function easeOutBounce(t: number): number {
  return ease(t, 'ease-out-bounce');
}

export function easeInOutBounce(t: number): number {
  return ease(t, 'ease-in-out-bounce');
}

/**
 * Custom cubic bezier easing
 */
export function bezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const fn = cubicBezier(x1, y1, x2, y2);
  return fn(Math.max(0, Math.min(1, t)));
}

/**
 * Spring physics easing
 */
export function spring(
  t: number,
  mass: number = 1,
  stiffness: number = 100,
  damping: number = 10,
  velocity: number = 0
): number {
  const fn = springEasing({ mass, stiffness, damping, velocity });
  return fn(Math.max(0, Math.min(1, t)));
}

/**
 * Get list of available easing names
 */
export function getAvailableEasings(): string[] {
  return getEasingNames();
}

/**
 * Step function - instant transition at threshold
 */
export function step(t: number, threshold: number = 0.5): number {
  return t >= threshold ? 1 : 0;
}

/**
 * Stepped interpolation - discrete steps
 */
export function steps(t: number, numSteps: number): number {
  return Math.floor(t * numSteps) / numSteps;
}

/**
 * Interpolate a value using easing
 */
export function interpolate(
  t: number,
  from: number,
  to: number,
  easingType: string = 'linear'
): number {
  const easedT = ease(t, easingType);
  return lerpValue(from, to, easedT);
}

export const easingFunctions = {
  // Core
  ease,
  linear,
  bezier,
  spring,
  step,
  steps,
  interpolate,
  getAvailableEasings,
  // Standard
  easeIn,
  easeOut,
  easeInOut,
  // Quad
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  // Cubic
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  // Quart
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  // Quint
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  // Sine
  easeInSine,
  easeOutSine,
  easeInOutSine,
  // Expo
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  // Circ
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  // Back
  easeInBack,
  easeOutBack,
  easeInOutBack,
  // Elastic
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  // Bounce
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
};

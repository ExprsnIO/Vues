/**
 * Builtin functions for expression scripting
 * Aggregates all builtin modules into a single context
 */

import { mathFunctions } from './math';
import { animationFunctions } from './animation';
import { vectorFunctions, type Vector2, type Vector3, type Vector4 } from './vector';
import { colorFunctions, type RGB, type RGBA, type HSL, type HSV } from './color';
import { easingFunctions, EASING_CATEGORIES } from './easing';

// Re-export individual modules
export * from './math';
export * from './animation';
export * from './vector';
export * from './color';
export * from './easing';

// Re-export types
export type { Vector2, Vector3, Vector4, RGB, RGBA, HSL, HSV };

/**
 * All builtin functions combined into a single context
 * This provides the global namespace for expression evaluation
 */
export const builtinFunctions = {
  // Math
  ...mathFunctions,
  // Animation
  ...animationFunctions,
  // Vectors
  ...vectorFunctions,
  // Colors
  ...colorFunctions,
  // Easing
  ...easingFunctions,
  // Easing categories for reference
  EASING_CATEGORIES,
};

/**
 * Get a readonly copy of all builtin functions
 * Used by the sandbox to create safe contexts
 */
export function getBuiltinContext(): Readonly<typeof builtinFunctions> {
  return Object.freeze({ ...builtinFunctions });
}

/**
 * List all available builtin function names
 */
export function getBuiltinFunctionNames(): string[] {
  return Object.keys(builtinFunctions);
}

/**
 * Check if a function name is a builtin
 */
export function isBuiltinFunction(name: string): boolean {
  return name in builtinFunctions;
}

// Default export
export default builtinFunctions;
